/**
 * Held-out evaluation on the hand-written sentences in test/fixtures (never used for fitting).
 *
 *   npx tsx scripts/eval.ts [--verbose]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { convert } from "../src/convert.js";
import { fix } from "../src/fix.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");
const lines = (p: string) =>
  readFileSync(join(root, p), "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));

const thai = lines("test/fixtures/thai-sentences.txt");
const english = lines("test/fixtures/english-sentences.txt");
const mixed = lines("test/fixtures/mixed-sentences.txt");

/** Re-types only the Thai parts of a sentence on the English layout. */
const mistypeThai = (s: string) => s.replace(/[\u0E00-\u0E7F]+/g, (m) => convert(m, "th-en"));
/** Re-types the whole sentence on the Thai layout, punctuation keys included (what really happens). */
const mistypeEnglish = (s: string) => convert(s, "en-th");
/** Re-types only the English words of a mixed sentence on the Thai layout. */
const mistypeEnglishWords = (s: string) => s.replace(/\S*[A-Za-z]\S*/g, (m) => convert(m, "en-th"));

function check(name: string, inputs: string[], expected: string[]) {
  let ok = 0;
  const bad: string[] = [];
  inputs.forEach((input, i) => {
    const r = fix(input);
    if (r.text === expected[i]) ok++;
    else bad.push(`  ${JSON.stringify(input)}\n   → ${JSON.stringify(r.text)}\n   ≠ ${JSON.stringify(expected[i])}  ${[...r.spans, ...r.suggestions].map((s) => `${s.original}→${s.fixed}@${s.confidence}`).join(" ")}`);
  });
  console.log(`${name}: ${ok}/${inputs.length}`);
  if (verbose && bad.length) console.log(bad.join("\n"));
}

check("thai unchanged", thai, thai);
check("english unchanged", english, english);
check("mixed unchanged", mixed, mixed);
check("thai typed on EN restored", thai.map(mistypeThai), thai);
check("mixed with Thai typed on EN restored", mixed.map(mistypeThai), mixed);
check("english typed on TH restored", english.map(mistypeEnglish), english);
check("mixed with English typed on TH restored", mixed.map(mistypeEnglishWords), mixed);

// how close clean text comes to being changed
const margin = (xs: string[]) => {
  const all = xs.flatMap((x) => {
    const r = fix(x);
    return [...r.spans, ...r.suggestions].map((s) => ({ x, s }));
  });
  all.sort((a, b) => b.s.confidence - a.s.confidence);
  return all.slice(0, 8).map(({ x, s }) => `${s.original}→${s.fixed}@${s.confidence} (${x.slice(0, 30)})`);
};
console.log("closest calls on clean sentences:\n  " + margin([...thai, ...english, ...mixed]).join("\n  "));

// single words
const dict = lines("data/sources/icu-thaidict.txt");
const esl = lines("data/sources/12dicts-3esl.txt").filter((w) => /^[a-z]+$/.test(w));
const common = lines("data/common-thai.txt");
const changed = (xs: string[]) => xs.filter((w) => fix(w).text !== w);
const t1 = changed(dict);
console.log("closest calls on ICU words:\n  " + margin(dict).join("\n  "));
console.log("closest calls on 3esl words:\n  " + margin(esl).join("\n  "));
console.log(`ICU Thai words changed: ${t1.length}/${dict.length}`, verbose ? t1.slice(0, 40).join(" ") : "");
const e1 = changed(esl);
console.log(`3esl English words changed: ${e1.length}/${esl.length}`, verbose ? e1.slice(0, 60).join(" ") : "");
const missed = common.filter((w) => fix(convert(w, "th-en")).text !== w);
console.log(`common Thai words typed on EN not restored: ${missed.length}/${common.length}`, verbose ? missed.map((w) => `${w}(${convert(w, "th-en")})`).join(" ") : "");
