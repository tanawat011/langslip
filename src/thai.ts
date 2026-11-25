/**
 * Thai script helpers: character classes, mark ordering and an orthography check.
 *
 * The check is deliberately about SPELLING SHAPE, not about words: a vowel or tone mark needs a
 * consonant to sit on, a leading vowel needs a consonant after it, ั / ึ / ื need a final
 * consonant, and so on. Text that was typed on the wrong layout breaks these rules all the time;
 * real Thai almost never does.
 */

export const isThaiChar = (c: string): boolean => c >= "\u0E00" && c <= "\u0E7F";
export const isThaiConsonant = (c: string): boolean => c >= "\u0E01" && c <= "\u0E2E";
export const isThaiDigit = (c: string): boolean => c >= "\u0E50" && c <= "\u0E59";
/** เ แ โ ใ ไ — written before the consonant they follow in speech. */
export const isLeadingVowel = (c: string): boolean => c >= "\u0E40" && c <= "\u0E44";

const ABOVE_VOWELS = new Set(["\u0E31", "\u0E34", "\u0E35", "\u0E36", "\u0E37"]); // ั ิ ี ึ ื
const BELOW_VOWELS = new Set(["\u0E38", "\u0E39", "\u0E3A"]); // ุ ู ฺ
const MAITAIKHU = "\u0E47"; // ็
const TONES = new Set(["\u0E48", "\u0E49", "\u0E4A", "\u0E4B"]); // ่ ้ ๊ ๋
const THANTHAKHAT = "\u0E4C"; // ์
const NIKHAHIT = "\u0E4D"; // ํ
const YAMAKKAN = "\u0E4E"; // ๎
const SARA_A = "\u0E30"; // ะ
const SARA_AA = "\u0E32"; // า
const SARA_AM = "\u0E33"; // ำ
const LAKKHANGYAO = "\u0E45"; // ๅ
const MAI_YAMOK = "\u0E46"; // ๆ
const PAIYANNOI = "\u0E2F"; // ฯ
const RU = "\u0E24"; // ฤ
const LU = "\u0E26"; // ฦ

export const isTone = (c: string): boolean => TONES.has(c);
export const isAboveOrBelowVowel = (c: string): boolean => ABOVE_VOWELS.has(c) || BELOW_VOWELS.has(c);

/** A mark that sits on the character before it. */
export function isCombining(c: string): boolean {
  return ABOVE_VOWELS.has(c) || BELOW_VOWELS.has(c) || TONES.has(c) || c === MAITAIKHU || c === THANTHAKHAT || c === NIKHAHIT || c === YAMAKKAN;
}

function markRank(c: string): number {
  if (ABOVE_VOWELS.has(c) || BELOW_VOWELS.has(c) || c === MAITAIKHU) return 0;
  if (TONES.has(c)) return 1;
  return 2; // ์ ํ ๎
}

/**
 * Puts Thai marks in the order Unicode (and every font) expects, the order they are typed on a
 * correctly working Thai keyboard:
 *
 * - vowel mark before tone mark: `ก่ิ` → `กิ่`, `กุ้` → `กุ้`
 * - tone mark before sara am: `นำ้` → `น้ำ`
 * - nikhahit + sara aa is sara am: `ํา` → `ำ`
 * - a mark typed twice in a row is kept once: `ก่่` → `ก่`
 *
 * Nothing else is changed (no spelling correction).
 */
export function normalizeThai(text: string): string {
  if (!/[\u0E00-\u0E7F]/.test(text)) return text;
  let s = text.replace(/\u0E4D\u0E32/g, SARA_AM);
  // tone (or several marks) typed after sara am → before it
  s = s.replace(/\u0E33([\u0E48-\u0E4B]+)/g, (_, tones: string) => tones + SARA_AM);
  const chars = [...s];
  const out: string[] = [];
  for (let i = 0; i < chars.length; ) {
    const c = chars[i]!;
    if (!isCombining(c)) {
      out.push(c);
      i++;
      continue;
    }
    let j = i;
    const run: string[] = [];
    while (j < chars.length && isCombining(chars[j]!)) run.push(chars[j++]!);
    const sorted = run
      .map((m, k) => ({ m, k }))
      .sort((a, b) => markRank(a.m) - markRank(b.m) || a.k - b.k)
      .map((x) => x.m);
    for (const m of sorted) if (out[out.length - 1] !== m) out.push(m);
    i = j;
  }
  return out.join("");
}

/**
 * Counts spelling-shape violations in (normalized) Thai text. Non-Thai characters split the
 * text; each Thai run is checked on its own.
 */
export function thaiViolations(text: string): number {
  const chars = [...text];
  let v = 0;
  const at = (i: number): string => (i >= 0 && i < chars.length ? chars[i]! : "");
  const thaiAt = (i: number): string => {
    const c = at(i);
    return c && isThaiChar(c) ? c : "";
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (!isThaiChar(c)) continue;
    const p = thaiAt(i - 1);
    const pp = thaiAt(i - 2);
    const n = thaiAt(i + 1);
    const nn = thaiAt(i + 2);

    if (ABOVE_VOWELS.has(c) || BELOW_VOWELS.has(c) || c === MAITAIKHU || c === YAMAKKAN) {
      if (!isThaiConsonant(p)) v++;
    } else if (TONES.has(c)) {
      const onConsonant = isThaiConsonant(p);
      const onVowel = (ABOVE_VOWELS.has(p) || BELOW_VOWELS.has(p)) && isThaiConsonant(pp);
      if (!onConsonant && !onVowel) v++;
    } else if (c === THANTHAKHAT) {
      const onVowel = (p === "\u0E34" || p === "\u0E38") && isThaiConsonant(pp);
      if (!isThaiConsonant(p) && !onVowel) v++;
    } else if (c === NIKHAHIT) {
      if (!isThaiConsonant(p)) v++;
    } else if (c === SARA_A) {
      const ok = isThaiConsonant(p) || (TONES.has(p) && isThaiConsonant(pp)) || p === SARA_AA;
      if (!ok) v++;
    } else if (c === SARA_AA || c === SARA_AM) {
      const ok = isThaiConsonant(p) || (TONES.has(p) && isThaiConsonant(pp));
      if (!ok) v++;
    } else if (c === LAKKHANGYAO) {
      if (p !== RU && p !== LU) v++;
    } else if (c === MAI_YAMOK) {
      if (!p || isLeadingVowel(p)) v++;
    } else if (c === PAIYANNOI) {
      if (!p && !(n === "\u0E25" && nn === PAIYANNOI)) v++; // ฯลฯ
    }

    if (isLeadingVowel(c) && !isThaiConsonant(n)) v++;
    if (c === "\u0E31" || c === "\u0E36" || c === "\u0E37") {
      // ั ึ ื need a consonant after them (one tone mark may sit between)
      const next = TONES.has(n) ? nn : n;
      if (!isThaiConsonant(next)) v++;
    }
  }
  return v;
}

/** Number of Thai letters and marks in text. */
export function thaiLength(text: string): number {
  let n = 0;
  for (const c of text) if (isThaiChar(c)) n++;
  return n;
}
