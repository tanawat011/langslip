import { readFileSync } from "node:fs";
import { convert } from "../src/index.js";

export const lines = (p: string): string[] =>
  readFileSync(p, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));

/** What a Thai sentence looks like when typed on the English layout (spaces stay spaces). */
export const thaiOnEnglishLayout = (s: string, layout: Parameters<typeof convert>[2] = "kedmanee"): string =>
  s.replace(/[\u0E00-\u0E7F]+/g, (m) => convert(m, "th-en", layout));

/** What an English sentence looks like when typed on the Thai layout — every key, punctuation too. */
export const englishOnThaiLayout = (s: string, layout: Parameters<typeof convert>[2] = "kedmanee"): string =>
  convert(s, "en-th", layout);

/** Only the words that hold Latin letters re-typed on the Thai layout (for mixed sentences). */
export const latinWordsOnThaiLayout = (s: string): string => s.replace(/\S*[A-Za-z]\S*/g, (m) => convert(m, "en-th"));
