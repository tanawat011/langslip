/**
 * Text langslip never touches: links, e-mail addresses, paths, code, mentions, numbers, emoticons.
 *
 * Every rule here was checked against the keystrokes of common Thai words, because on Kedmanee
 * many punctuation keys are Thai letters (; = ว, ' = ง, , = ม, . = ใ, / = ฝ, - = ข, [ = บ, ] = ล).
 * So a lone "-v" (ขอ), "/kd" (ฝาก) or "wx/kd" (ไปฝาก) is NOT treated as a flag or a path.
 */

export interface Range {
  from: number;
  to: number;
}

const TLDS =
  "com|net|org|io|dev|app|co|th|ai|info|biz|xyz|gov|edu|gg|tv|cloud|tech|site|online|store|blog|page|uk|us|jp|cn|de|fr|sg|my|vn|au|ca|in";

// No "sh": ".sh" is the keystrokes of ให้, one of the most common Thai words.
const EXT =
  "js|mjs|cjs|ts|tsx|jsx|json|md|mdx|txt|html|htm|css|scss|py|go|rs|java|kt|swift|rb|php|c|h|cpp|hpp|cs|zsh|bash|ps1|yml|yaml|toml|xml|csv|tsv|sql|png|jpe?g|gif|svg|webp|pdf|docx?|xlsx?|pptx?|zip|gz|tar|lock|env|log|ini|conf|cfg|vue|svelte|dart|lua|ipynb|wasm|mp3|mp4|mov";
/** ends at a space, the end, or a closing mark / sentence punctuation before a space or the end */
const END = String.raw`(?=$|[\s)\]"]|[.,;:!?](?:\s|$))`;

const PATTERNS: RegExp[] = [
  /`[^`\n]+`/g, // inline code
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, // scheme://…
  /\bwww\.[^\s<>"']+/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, // e-mail
  new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})\\b(?:[/?#][^\\s]*)?`, "gi"), // example.com/x
  /\b[A-Za-z]:\\[^\s]*/g, // C:\Users\…
  new RegExp(String.raw`(?<![^\s(["'])(?:~|\.{1,2})?\/[\w.@+-]+(?:\/[\w.@+-]*)+` + END, "g"), // /usr/bin, ./src/a, ~/x/y
  new RegExp(String.raw`(?<![^\s(["'])(?:~|\.{1,2})?\/[\w-]+\.(?:${EXT})` + END, "gi"), // /index.html
  new RegExp(String.raw`\b[\w.-]+\/[\w./-]*\.(?:${EXT})` + END, "gi"), // src/index.ts
  new RegExp(String.raw`\b[\w-]+\.(?:${EXT})` + END, "gi"), // README.md, index.ts
  /(?<![^\s(["'])[@#][A-Za-z0-9_][\w.-]*/g, // @mention, #tag, #123
  /\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/g, // snake_case, SCREAMING_CASE
  /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\([^\s)]*\)/g, // call(), obj.fn(x)
  /\b0x[0-9a-f]+\b/gi, // hex
  /<\/?[A-Za-z][^<>\n]*>/g, // <tag>
  /(?<!\S)--[A-Za-z][\w-]*(?:=\S*)?/g, // --long-flag (a single "-x" is too often ข + a letter)
  /\S*(?:=>|->|===|!==|==|!=|&&|\|\||<=|>=|\+\+)\S*/g, // code with operators (not "::" — that is ซซ as in พิซซ่า)
  /\$\{[^}\n]*\}|\{\{[^}\n]*\}\}/g, // template placeholders
  /(?<![\w#+])(?:[CF]#|C\+\+|\.NET|Node\.js|Vue\.js|Next\.js|Nuxt\.js|Three\.js|D3\.js)(?![\w#+])/g, // C# C++ .NET Node.js
];

const EMOTICONS = new Set([
  ":)", ":(", ":D", ":P", ":p", ":o", ":O", ";)", ";(", ":/", ":|", ":3", "<3", "</3", "xD", "XD",
  "^^", "^_^", "^-^", "T_T", "T^T", ":-)", ":-(", ":-D", ";-)", "-_-", "o_O", "O_o", ":')", "=)", "=(",
]);

/** Ranges of text that must not be changed, sorted and merged. */
export function protectedRanges(text: string): Range[] {
  const found: Range[] = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const from = m.index;
      found.push({ from, to: from + m[0].length });
    }
  }
  found.sort((a, b) => a.from - b.from || b.to - a.to);
  const merged: Range[] = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  return merged;
}

const SENTENCE_PUNCT = /^[.,!?…:;"'()[\]{}\-–—*~^_=+/\\|<>]+$/;
const NUMBER = /^[-+±]?[$฿€£¥]?(?:[\d\u0E50-\u0E59]+(?:[.,:/-][\d\u0E50-\u0E59]+)*)(?:%|฿|\$|\+|[.,!?:]+)?$/; // 1,250  10:30  25/11/2026  555+  ๒๕๖๙

/** A whole segment that is a number, an emoticon or only punctuation. */
export function isProtectedSegment(segment: string): boolean {
  if (EMOTICONS.has(segment)) return true;
  if (/^-[A-Z]$/.test(segment)) return true; // -D, -R flags (a lowercase "-v" is ขอ)
  if (/^[A-Za-z_$][\w$]*\[[\w$.'"-]*\](?:\.\w+)*[;,.)]*$/.test(segment)) return true; // a[i], rows[0].id
  if (/^v?\d+(?:\.\d+)+(?:[-+][\w.]+)?[.,!?:]*$/i.test(segment)) return true; // v1.2.3, 2.0, 1.0.0-beta.1
  if (NUMBER.test(segment)) return true;
  if (/^[^A-Za-z]$/.test(segment)) return true;
  // runs of the same punctuation, or plain sentence punctuation with no letters at all
  if (/^(.)\1+$/u.test(segment) && !/[A-Za-z\u0E00-\u0E7F]/.test(segment)) return true;
  if (SENTENCE_PUNCT.test(segment) && /^[.,!?…:"()\-–—*]+$/.test(segment)) return true;
  return false;
}
