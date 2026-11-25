import { THAI_ALPHABET, THAI_WORDS } from "./generated/thai-words.js";
import { ENGLISH_ALPHABET, ENGLISH_WORDS } from "./generated/english-words.js";

/** Decodes a list written by scripts/build-data.ts (front-coded, one ASCII symbol per letter). */
function decode(alphabet: string, data: string): Set<string> {
  const safe: string[] = [];
  for (let c = 0x21; c < 0x7f; c++) {
    const ch = String.fromCharCode(c);
    if (!"\\`$\"'".includes(ch)) safe.push(ch);
  }
  const letters = [...alphabet];
  const letterOf = new Map<string, string>();
  const prefixOf = new Map<string, number>();
  safe.forEach((s, i) => {
    if (i < letters.length) letterOf.set(s, letters[i]!);
    else prefixOf.set(s, i - letters.length);
  });
  const words = new Set<string>();
  let cur = "";
  let started = false;
  for (const s of data) {
    const p = prefixOf.get(s);
    if (p !== undefined) {
      if (started) words.add(cur);
      cur = cur.slice(0, p);
      started = true;
    } else {
      cur += letterOf.get(s) ?? "";
    }
  }
  if (started) words.add(cur);
  return words;
}

let thai: Set<string> | undefined;
let thaiMax = 0;
let english: Set<string> | undefined;

export function thaiWords(): Set<string> {
  if (!thai) {
    thai = decode(THAI_ALPHABET, THAI_WORDS);
    for (const w of thai) if (w.length > thaiMax) thaiMax = w.length;
  }
  return thai;
}

/** Longest Thai word, in UTF-16 units (Thai is all in the BMP). */
export function thaiMaxLength(): number {
  thaiWords();
  return thaiMax;
}

export function englishWords(): Set<string> {
  if (!english) english = decode(ENGLISH_ALPHABET, ENGLISH_WORDS);
  return english;
}

const CONTRACTIONS = /^(.+?)(?:n't|'s|'re|'ve|'ll|'d|'m|s')$/;

/**
 * True when `word` (any case) is an English word of the list, directly or through a regular
 * ending: -s, -es, -ies, -ed, -d, -ied, -ing, -er, -est, -ly, -'s, n't …
 */
export function isEnglishWord(word: string): boolean {
  const set = englishWords();
  const w = word.toLowerCase().replace(/\u2019/g, "'");
  if (set.has(w)) return true;
  if (w === "i" || w === "a") return true;
  const c = CONTRACTIONS.exec(w);
  if (c?.[1] && set.has(c[1])) return true;
  if (w === "can't" || w === "won't" || w === "shan't") return true;
  const stems: string[] = [];
  const add = (s: string) => {
    if (s.length >= 2) stems.push(s);
  };
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s")) add(w.slice(0, -1));
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) add(w.slice(0, -3)); // stopped
  }
  if (w.endsWith("ing")) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + "e");
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) add(w.slice(0, -4)); // running
  }
  if (w.endsWith("er") || w.endsWith("ly")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  if (w.endsWith("est")) {
    add(w.slice(0, -3));
    add(w.slice(0, -2));
  }
  if (w.endsWith("ily")) add(w.slice(0, -3) + "y");
  if (stems.some((s) => set.has(s))) return true;
  // restart, unlock, preview, redo: a known word of four letters or more after the prefix
  const pre = /^(re|un|pre|dis|non|over|sub|auto|multi)(.{4,})$/.exec(w);
  return pre?.[2] !== undefined && isEnglishWord(pre[2]);
}
