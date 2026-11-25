import {
  ENGLISH_BIGRAM_ALPHABET,
  ENGLISH_BIGRAMS,
  THAI_BIGRAM_ALPHABET,
  THAI_BIGRAMS,
} from "./generated/bigrams.js";
import { WEIGHTS } from "./generated/weights.js";
import { isThaiChar, thaiViolations } from "./thai.js";
import { isEnglishWord, thaiMaxLength, thaiWords } from "./wordlist.js";

/**
 * Scoring: given the same keystrokes read both ways — the Thai side and the English side — how
 * likely is it that the Thai side is what the person meant?
 *
 * One logistic model over the features below, fitted by scripts/fit-weights.ts on synthetic,
 * seeded data: Thai words, phrases and chat words typed on the English layout against English
 * words, names, identifiers and made-up words typed on the Thai layout. Pairs where BOTH readings
 * are real words (ทำ / me, นา / ok) are in the data with both labels, so the model puts them near
 * even and the text is left as typed.
 */

const B62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface Bigram {
  index: Map<string, number>;
  n: number;
  /** bits for (prev, next), row-major; index 0 = word boundary */
  bits: Float32Array;
}

function bigram(alphabet: string, table: string): Bigram {
  const index = new Map<string, number>();
  [...alphabet].forEach((c, i) => index.set(c, i + 1));
  const bits = new Float32Array(table.length);
  for (let i = 0; i < table.length; i++) bits[i] = B62.indexOf(table[i]!) / 4;
  return { index, n: alphabet.length + 1, bits };
}

let thaiBigram: Bigram | undefined;
let englishBigram: Bigram | undefined;

/** Mean bits per transition (lower = more typical), over the runs of characters the model knows. */
function bigramBits(model: Bigram, text: string): { bits: number; count: number } {
  let bits = 0;
  let count = 0;
  let prev = -1;
  const cost = (i: number, j: number) => model.bits[i * model.n + j]!;
  for (const ch of text) {
    const j = model.index.get(ch);
    if (j === undefined) {
      if (prev > 0) {
        bits += cost(prev, 0);
        count++;
      }
      prev = -1;
      continue;
    }
    bits += cost(prev < 0 ? 0 : prev, j);
    count++;
    prev = j;
  }
  if (prev > 0) {
    bits += cost(prev, 0);
    count++;
  }
  return { bits, count };
}

/** Dictionary coverage of the Thai runs in `text`: most letters inside known words, fewest words. */
export function thaiCoverage(text: string): { covered: number; words: number; length: number } {
  const words = thaiWords();
  const maxLen = thaiMaxLength();
  let covered = 0;
  let count = 0;
  let length = 0;
  for (const run of text.match(/[\u0E00-\u0E7F]+/g) ?? []) {
    const n = run.length;
    length += n;
    // best[i] = [covered letters, -words] for run[0..i)
    const cov = new Array<number>(n + 1).fill(-1);
    const seg = new Array<number>(n + 1).fill(0);
    cov[0] = 0;
    for (let i = 0; i < n; i++) {
      const c = cov[i]!;
      if (c < 0) continue;
      const better = (j: number, nc: number, ns: number) => {
        if (nc > cov[j]! || (nc === cov[j]! && ns < seg[j]!)) {
          cov[j] = nc;
          seg[j] = ns;
        }
      };
      better(i + 1, c, seg[i]!);
      for (let k = 2; k <= maxLen && i + k <= n; k++) {
        if (words.has(run.slice(i, i + k))) better(i + k, c + k, seg[i]! + 1);
      }
    }
    covered += cov[n]!;
    count += seg[n]!;
  }
  return { covered, words: count, length };
}

export interface Features {
  /** Thai side: spelling-shape violations per Thai character. */
  thaiViolationRate: number;
  /** Thai side: 1 when there is at least one violation. */
  thaiAnyViolation: number;
  /** Thai side: share of Thai characters inside dictionary words. */
  thaiCoverage: number;
  /** Thai side: average length of the dictionary words found, / 6, capped at 1. */
  thaiWordLength: number;
  /** Thai side: mean bigram bits per character, / 10. */
  thaiBigram: number;
  /** Thai side: non-Thai characters between Thai ones, per character. */
  thaiInnerOther: number;
  /** English side: a known word (or known parts). */
  englishKnown: number;
  /** English side: mean bigram bits per letter, / 10. */
  englishBigram: number;
  /** English side: odd characters between letters (; [ ] … ), per character. */
  englishOdd: number;
  /** English side: letter case no English word has (gxHo, lU'g). */
  englishCaseOdd: number;
  /** English side: no letters at all. */
  englishNoLetters: number;
  /** Thai side: Thai digits, ฿ or ASCII symbols right next to Thai letters (๒ห, ฟ฿). */
  thaiSymbolMix: number;
  /** Thai side: 1 / number of Thai characters. */
  thaiShortness: number;
  /** English side: has letters but none of a e i o u y. */
  englishNoVowel: number;
  /** English side: digits between letters (8b8b, 0hk). */
  englishDigitMix: number;
  /** English side: 1 / number of characters. */
  englishShortness: number;
}

export const FEATURE_NAMES: readonly (keyof Features)[] = [
  "thaiViolationRate",
  "thaiAnyViolation",
  "thaiCoverage",
  "thaiWordLength",
  "thaiBigram",
  "thaiInnerOther",
  "thaiSymbolMix",
  "thaiShortness",
  "englishKnown",
  "englishBigram",
  "englishOdd",
  "englishCaseOdd",
  "englishNoLetters",
  "englishNoVowel",
  "englishDigitMix",
  "englishShortness",
];

const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
/** Punctuation an English word can carry at its edges. Not [ ] { } \ = - which are Thai letters typed. */
const ENGLISH_EDGE = /^[("'“‘]+|[.,!?:;"')”’…]+$/g;

function englishKnown(core: string): boolean {
  if (!/[A-Za-z]/.test(core)) return false;
  if (isEnglishWord(core)) return true;
  // well-known, part/whole: every part a word of three letters or more
  const parts = core.split(/[-/']/).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => /^[A-Za-z]{3,}$/.test(p) && isEnglishWord(p))) return true;
  // camelCase / PascalCase: at least half of the humps are words of three letters or more
  const humps = core.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g);
  if (humps && humps.length > 1 && humps.join("") === core) {
    const words = humps.filter((h) => !/\d/.test(h));
    const known = words.filter((h) => h.length >= 3 && isEnglishWord(h)).length;
    if (words.length > 1 && known >= 1 && known / words.length >= 0.5 && /[a-z]/.test(core)) return true;
  }
  // iphone15, covid19, gpt-4, es2020 (the word part must be a word of three letters or more)
  const wd = /^([a-z]{3,})-?\d+$/i.exec(core);
  if (wd?.[1] && isEnglishWord(wd[1])) return true;
  // 50k, 10am, 2nd, 4gb. One digit + one letter (5k, 9k, 8v) is too often a Thai syllable typed:
  // 5k = ถา, 9k = ตา.
  if (/^\d{2,}(?:k|m|b|g|x|d|p|s|v)$/i.test(core)) return true;
  if (/^\d+(?:st|nd|rd|th|am|pm|gb|mb|kb|tb|px|ms|fps|hz)$/i.test(core)) return true;
  return false;
}

function caseOdd(core: string): boolean {
  const letters = core.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  if (letters === letters.toLowerCase() || letters === letters.toUpperCase()) return false;
  if (/^[A-Z][a-z]+$/.test(letters)) return false;
  // camelCase / PascalCase whose humps are mostly words is fine
  const humps = core.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) ?? [];
  const known = humps.filter((h) => h.length >= 3 && isEnglishWord(h)).length;
  return !(humps.length > 1 && known / humps.length >= 0.5);
}

/** Features of one reading pair. `thai` should already be normalized (normalizeThai). */
export function features(thai: string, english: string): Features {
  thaiBigram ??= bigram(THAI_BIGRAM_ALPHABET, THAI_BIGRAMS);
  englishBigram ??= bigram(ENGLISH_BIGRAM_ALPHABET, ENGLISH_BIGRAMS);

  const tLen = Math.max(1, [...thai].filter(isThaiChar).length);
  const v = thaiViolations(thai);
  const cov = thaiCoverage(thai);
  const tb = bigramBits(thaiBigram, thai);
  const thaiTrim = thai.replace(EDGE, "");
  let inner = 0;
  for (const ch of thaiTrim) if (!isThaiChar(ch) && !/\s/.test(ch)) inner++;

  const core = english.replace(ENGLISH_EDGE, "");
  const eb = bigramBits(englishBigram, core.toLowerCase());
  let odd = 0;
  const coreChars = [...core];
  coreChars.forEach((ch, i) => {
    if (/[A-Za-z0-9]/.test(ch)) return;
    const between = /[A-Za-z]/.test(coreChars[i - 1] ?? "") && /[A-Za-z]/.test(coreChars[i + 1] ?? "");
    if ((ch === "'" || ch === "-" || ch === "." || ch === "/") && between) return;
    odd++;
  });
  const hasLetters = /[A-Za-z]/.test(core);

  return {
    thaiViolationRate: v / tLen,
    thaiAnyViolation: v > 0 ? 1 : 0,
    thaiCoverage: cov.length ? cov.covered / cov.length : 0,
    thaiWordLength: cov.words ? Math.min(1, cov.covered / cov.words / 6) : 0,
    thaiBigram: tb.count ? tb.bits / tb.count / 10 : 1,
    thaiInnerOther: inner / tLen,
    englishKnown: englishKnown(core) ? 1 : 0,
    englishBigram: hasLetters && eb.count ? eb.bits / eb.count / 10 : 1,
    englishOdd: odd / Math.max(1, coreChars.length),
    englishCaseOdd: caseOdd(core) ? 1 : 0,
    englishNoLetters: hasLetters ? 0 : 1,
    thaiSymbolMix: /[\u0E01-\u0E4E][\u0E3F\u0E50-\u0E59!-/:-@[-`{-~]|[\u0E3F\u0E50-\u0E59!-/:-@[-`{-~][\u0E01-\u0E4E]/.test(thaiTrim) ? 1 : 0,
    thaiShortness: 1 / tLen,
    englishNoVowel: hasLetters && !/[aeiouy]/i.test(core) ? 1 : 0,
    englishDigitMix: /[A-Za-z]\d+[A-Za-z]|\d[A-Za-z]+\d/.test(core) ? 1 : 0,
    englishShortness: 1 / Math.max(1, [...core].length),
  };
}

export function featureVector(f: Features): number[] {
  return FEATURE_NAMES.map((k) => f[k]);
}

/** Log-odds that the Thai reading is the one that was meant. */
export function logOdds(f: Features): number {
  let z = WEIGHTS.bias;
  for (const k of FEATURE_NAMES) z += (WEIGHTS[k] ?? 0) * f[k];
  return z;
}

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

