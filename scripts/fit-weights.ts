/**
 * Fits the logistic model in src/score.ts and writes src/generated/weights.ts.
 *
 *   npm run fit
 *
 * Training pairs are synthetic and deterministic (seeded):
 *   label 1 (Thai meant): Thai words and phrases, read back as the keys that type them.
 *   label 0 (English meant): English words, names, identifiers, codes, typed on the Thai layout.
 * The held-out check is scripts/eval.ts (sentences written by hand, never seen here).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { convert } from "../src/convert.js";
import { LAYOUT_NAMES, type LayoutName } from "../src/layouts.js";
import { FEATURE_NAMES, featureVector, features, type Features } from "../src/score.js";
import { isEnglishWord } from "../src/wordlist.js";
import { normalizeThai } from "../src/thai.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lines = (p: string) =>
  readFileSync(join(root, p), "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));

let seed = 20261125;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const layout = (): LayoutName => (rand() < 0.85 ? "kedmanee" : pick(LAYOUT_NAMES));

const thaiDict = lines("data/sources/icu-thaidict.txt");
const thaiCommon = lines("data/common-thai.txt");
const english = lines("data/sources/12dicts-3esl.txt").filter((w) => /^[a-z]+$/.test(w));
const extra = lines("data/extra-english.txt");
const names = lines("data/names.txt");

/** y = 1: the Thai reading was meant. */
type Row = { f: Features; y: number };
const rows: Row[] = [];
const addThai = (thai: string) => {
  const keys = convert(thai, "th-en", layout());
  rows.push({ f: features(normalizeThai(thai), keys), y: 1 });
};
const addEnglish = (word: string) => {
  const t = normalizeThai(convert(word, "en-th", layout()));
  rows.push({ f: features(t, word), y: 0 });
};

// Thai that is NOT in the dictionary — chat words, interjections, loanwords, names — so the
// model does not learn "not a dictionary word ⇒ English". Syllables are built from the spelling
// rules (initial + vowel pattern + tone + final), then reduplicated or stretched like in chats.
const INITIALS = [..."กขคงจฉชซดตถทนบปผพฟมยรลวสหอฮ", "กร", "กล", "กว", "คร", "คล", "คว", "ปร", "ปล", "พร", "พล", "ตร", "หน", "หม", "หล", "หว", "หย", "อย"];
const FINALS = ["", "", "", "ก", "ด", "บ", "น", "ม", "ง", "ย", "ว"];
const TONE = ["", "", "\u0E48", "\u0E49", "\u0E4A", "\u0E4B"];
// C = initial, T = tone, F = final
const PATTERNS = ["CTะ", "CTา", "CิTF", "CีTF", "CึTก", "CืTอ", "CุTF", "CูTF", "เCTะ", "เCTF", "แCTะ", "แCTF", "โCTะ", "โCTF", "เCTาะ", "CTอF", "เCีTยF", "เCืTอF", "CัTวF", "CTำ", "ใCT", "ไCT", "เCTา", "CัTน", "CัTก", "CัTง", "เC็น", "Cิ", "Cะ"];
function syllable(): string {
  const p = pick(PATTERNS);
  let out = p.replace("C", pick(INITIALS)).replace("T", pick(TONE));
  out = out.replace("F", p.includes("ะ") || p.includes("ำ") ? "" : pick(FINALS));
  return out;
}
function chatThai(): string {
  const r = rand();
  if (r < 0.35) return syllable() + syllable();
  if (r < 0.55) { const x = syllable(); return x + x; } // อิอิ, คิคิ
  if (r < 0.7) { const w = pick(thaiCommon); return w + w.slice(-1).repeat(1 + Math.floor(rand() * 4)); } // มากกก, จ้าาา
  if (r < 0.85) return syllable() + "\u0E46"; // ๆ
  return syllable() + syllable() + syllable();
}
for (let i = 0; i < 5000; i++) addThai(chatThai());
for (let i = 0; i < 5000; i++) addThai(pick(thaiDict));
for (let i = 0; i < 2000; i++) addThai(pick(thaiCommon));
for (let i = 0; i < 5000; i++) {
  const n = 2 + Math.floor(rand() * 4);
  let s = "";
  for (let k = 0; k < n; k++) s += rand() < 0.65 ? pick(thaiCommon) : pick(thaiDict);
  addThai(s);
}

const casing = (w: string) => {
  const r = rand();
  if (r < 0.75) return w;
  if (r < 0.9) return w[0]!.toUpperCase() + w.slice(1);
  if (r < 0.95 && w.length <= 5) return w.toUpperCase();
  return w + pick([".", ",", "!", "?", ":"]);
};
for (let i = 0; i < 6000; i++) addEnglish(casing(pick(english)));
for (let r = 0; r < 3; r++) for (const w of extra) addEnglish(casing(w));
for (let r = 0; r < 4; r++) for (const w of names) addEnglish(w);
// English-looking words that are in no list (new names, brands, made-up words): letter chains
// from the English word list, cut and joined at a shared letter.
for (let i = 0; i < 3000; i++) {
  const a = pick(english);
  const b = pick(english);
  const cut = a.length > 3 ? 2 + Math.floor(rand() * (a.length - 2)) : a.length;
  const joined = a.slice(0, cut) + b.slice(Math.floor(rand() * Math.max(1, b.length - 2)));
  addEnglish(rand() < 0.3 ? joined[0]!.toUpperCase() + joined.slice(1) : joined);
}
for (let i = 0; i < 800; i++) {
  const parts = [pick(english), pick(english), ...(rand() < 0.3 ? [pick(english)] : [])];
  const pascal = rand() < 0.3;
  addEnglish(parts.map((p, k) => (k === 0 && !pascal ? p : p[0]!.toUpperCase() + p.slice(1))).join(""));
}
for (let i = 0; i < 400; i++) {
  const r = rand();
  if (r < 0.4) addEnglish(pick(english) + Math.floor(rand() * 100));
  else if (r < 0.7) addEnglish(String(1 + Math.floor(rand() * 99)) + pick(["k", "g", "am", "pm", "px", "gb", "mb", "st", "th", "x"]));
  else addEnglish(pick(english) + "-" + pick(english));
}

// ---- Newton / IRLS with L2, one model per side ----
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Balanced, L2-regularised logistic regression; returns [bias, ...weights] and accuracy. */
function fit(X: number[][], y: number[], lambda = 1): { w: number[]; accuracy: number } {
  const d = X[0]!.length + 1;
  const Xb = X.map((x) => [1, ...x]);
  const pos = y.filter((v) => v === 1).length;
  const wt = y.map((v) => (v === 1 ? y.length / (2 * pos) : y.length / (2 * (y.length - pos))));
  let w = new Array<number>(d).fill(0);
  for (let iter = 0; iter < 40; iter++) {
    const g = new Array<number>(d).fill(0);
    const H = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    Xb.forEach((x, i) => {
      const z = x.reduce((a, v, k) => a + v * w[k]!, 0);
      const p = 1 / (1 + Math.exp(-z));
      const e = (p - y[i]!) * wt[i]!;
      const s = p * (1 - p) * wt[i]!;
      for (let a = 0; a < d; a++) {
        g[a]! += e * x[a]!;
        for (let b = 0; b < d; b++) H[a]![b]! += s * x[a]! * x[b]!;
      }
    });
    for (let a = 1; a < d; a++) {
      g[a]! += lambda * w[a]!;
      H[a]![a]! += lambda;
    }
    const step = solve(H, g);
    w = w.map((v, k) => v - step[k]!);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  let correct = 0;
  Xb.forEach((x, i) => {
    const z = x.reduce((a, v, k) => a + v * w[k]!, 0);
    if ((z > 0 ? 1 : 0) === y[i]) correct++;
  });
  return { w, accuracy: correct / Xb.length };
}

// Pairs where both readings are real words (ทำ / me, นา / ok, แนะ / cot): in the data with both
// labels, so the model learns to sit near even on them — the prior then keeps what was typed.
let collisions = 0;
for (const w of thaiDict) {
  const keys = convert(w, "th-en", "kedmanee");
  if (/^[a-z]{2,}$/.test(keys) && isEnglishWord(keys)) {
    const f = features(normalizeThai(w), keys);
    for (let r = 0; r < 20; r++) rows.push({ f, y: 1 }, { f, y: 0 });
    collisions++;
  }
}
console.log(`collision pairs: ${collisions}`);

const { w, accuracy } = fit(rows.map((r) => featureVector(r.f)), rows.map((r) => r.y));
const pos = rows.filter((r) => r.y === 1).length;
console.log(`rows ${rows.length} (Thai ${pos}, English ${rows.length - pos}); training accuracy ${accuracy.toFixed(4)}`);

const round = (v: number) => Math.round(v * 1000) / 1000;
let out = "// GENERATED by scripts/fit-weights.ts — do not edit by hand.\n";
out += `// ${rows.length} synthetic pairs (${collisions} word/word collisions with both labels), training accuracy ${accuracy.toFixed(4)}.\n`;
out += "export const WEIGHTS: Record<string, number> & { bias: number } = {\n";
out += `  bias: ${round(w[0]!)},\n`;
FEATURE_NAMES.forEach((k, i) => (out += `  ${k}: ${round(w[i + 1]!)},\n`));
out += "};\n";
writeFileSync(join(root, "src/generated/weights.ts"), out);
console.log(out);
