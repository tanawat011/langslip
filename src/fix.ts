import { convert, type Direction } from "./convert.js";
import { LAYOUT_NAMES, getLayout, type LayoutName } from "./layouts.js";
import { isProtectedSegment, protectedRanges, type Range } from "./protect.js";
import { features, logOdds, sigmoid, type Features } from "./score.js";
import { isThaiChar, isThaiDigit, normalizeThai } from "./thai.js";
import { isEnglishWord } from "./wordlist.js";

export interface FixOptions {
  /**
   * Layout the keystrokes are read with. `"auto"` tries all four and keeps the one that explains
   * the text best. Default `"kedmanee"`.
   */
  layout?: LayoutName | "auto";
  /** Only look for one kind of mistake. Default `"both"`. */
  direction?: Direction | "both";
  /** Spans at or above this confidence are changed. Default 0.8. */
  threshold?: number;
  /** Spans at or above this (and below `threshold`) are only reported, in `suggestions`. Default 0.5. */
  suggestAbove?: number;
  /** Put Thai marks in the right order in fixed spans (see `normalizeThai`). Default true. */
  normalize?: boolean;
  /** Extra words or patterns never to touch, e.g. product names. */
  keep?: ReadonlyArray<string | RegExp>;
}

export interface Span {
  /** Start in the input, in UTF-16 units (like String.prototype.slice). */
  from: number;
  /** End (exclusive) in the input. */
  to: number;
  original: string;
  fixed: string;
  /** `"en-th"`: typed on the English layout, meant Thai. `"th-en"`: the other way. */
  dir: Direction;
  /** 0–1: how sure langslip is that `fixed` is what was meant. */
  confidence: number;
  layout: LayoutName;
}

export interface FixResult {
  /** The input with every applied span replaced. */
  text: string;
  /** Spans that were changed (confidence ≥ threshold), in text order. */
  spans: Span[];
  /** Spans that look mistyped but were left alone (suggestAbove ≤ confidence < threshold). */
  suggestions: Span[];
  layout: LayoutName;
}

/** Log-odds added before the context step: most text is typed right. */
const PRIOR: Record<Direction, number> = { "en-th": -1.0, "th-en": -1.0 };
/** Neighbour already being fixed the same way. */
const CONTEXT_SAME = 1.8;
/** Thai neighbour for an en-th candidate, English word neighbour for a th-en candidate. */
const CONTEXT_TARGET = 0.6;
/**
 * English word neighbour for an en-th candidate. Small on purpose: the most common slip is
 * forgetting to switch BACK after an English word ("ลอง restart server f^sinvpy'").
 */
const CONTEXT_AGAINST = 0.3;
/** The line has Thai text somewhere: a little more likely that Latin garble meant Thai. */
const CONTEXT_LINE_THAI = 0.4;
/** A one-character token is only changed when its neighbours are being changed too. */
const SINGLE = 0.5;
/** A neighbour this sure counts as "being fixed" for the context step. */
const LIKELY = 0.6;

interface Segment {
  from: number;
  to: number;
  text: string;
  kind: "latin" | "thai";
}

interface Candidate {
  seg: Segment;
  /**
   * Never changed on its own, only next to a confident change of the same kind: one character,
   * or both readings are real words (ทำ / me, นา / ok).
   */
  single: boolean;
  dir: Direction;
  from: number;
  to: number;
  original: string;
  fixed: string;
  z: number;
}

type Role = "fix-en-th" | "fix-th-en" | "thai" | "english" | "latin" | "none";

const SPACE = /\s|\u200B|\u200C|\u200D|\uFEFF/;
const isAsciiLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isAsciiOther = (c: string) => c > " " && c <= "~" && !isAsciiLetter(c);

function keepRanges(text: string, keep: ReadonlyArray<string | RegExp> | undefined): Range[] {
  const out: Range[] = [];
  for (const k of keep ?? []) {
    if (typeof k === "string") {
      if (!k) continue;
      for (let i = text.indexOf(k); i >= 0; i = text.indexOf(k, i + k.length)) out.push({ from: i, to: i + k.length });
    } else {
      const re = new RegExp(k.source, k.flags.includes("g") ? k.flags : k.flags + "g");
      for (const m of text.matchAll(re)) if (m[0]) out.push({ from: m.index, to: m.index + m[0].length });
    }
  }
  return out;
}

/** Splits text into Thai-script and Latin-script segments, skipping spaces and protected ranges. */
export function segments(text: string, keep?: ReadonlyArray<string | RegExp>): Segment[] {
  const blocked = new Uint8Array(text.length);
  for (const r of [...protectedRanges(text), ...keepRanges(text, keep)]) blocked.fill(1, r.from, r.to);

  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    if (blocked[i] || SPACE.test(text[i]!)) {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && !blocked[j] && !SPACE.test(text[j]!)) j++;
    splitPiece(text, i, j, out);
    i = j;
  }
  return out;
}

function splitPiece(text: string, from: number, to: number, out: Segment[]): void {
  // runs: thai (Thai block), latin (printable ASCII), other (emoji, other scripts: dropped)
  type Run = { from: number; to: number; kind: "thai" | "latin" | "other"; letters: boolean };
  const runs: Run[] = [];
  for (let k = from; k < to; ) {
    const cp = text.codePointAt(k)!;
    const ch = String.fromCodePoint(cp);
    const kind = isThaiChar(ch) ? "thai" : isAsciiLetter(ch) || isAsciiOther(ch) ? "latin" : "other";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.to = k + ch.length;
      last.letters ||= isAsciiLetter(ch);
    } else {
      runs.push({ from: k, to: k + ch.length, kind, letters: isAsciiLetter(ch) });
    }
    k += ch.length;
  }
  // Latin runs without letters that touch Thai belong to the Thai text: "พ.ศ.", "ราคา100บาท".
  const merged: Run[] = [];
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k]!;
    const prev = merged[merged.length - 1];
    const next = runs[k + 1];
    if (r.kind === "latin" && !r.letters && (prev?.kind === "thai" || next?.kind === "thai")) {
      if (prev?.kind === "thai" && prev.to === r.from) {
        prev.to = r.to;
        continue;
      }
      if (next?.kind === "thai") {
        next.from = r.from;
        continue;
      }
    }
    if (r.kind === "thai" && prev?.kind === "thai" && prev.to === r.from) {
      prev.to = r.to;
      continue;
    }
    merged.push({ ...r });
  }
  for (const r of merged) {
    if (r.kind === "other") continue;
    out.push({ from: r.from, to: r.to, text: text.slice(r.from, r.to), kind: r.kind });
  }
}

/** Both readings are real words: a Thai dictionary word spelt right, and an English word. */
function bothReal(f: Features): boolean {
  return f.thaiCoverage === 1 && f.thaiAnyViolation === 0 && f.englishKnown === 1 && f.englishOdd === 0;
}

function scoreLatin(seg: Segment, layout: LayoutName, normalize: boolean): Candidate | undefined {
  const s = seg.text;
  if (isProtectedSegment(s)) return undefined;
  const variants: Array<{ start: number; end: number; core: string; penalty: number }> = [
    { start: 0, end: s.length, core: s, penalty: 0 },
  ];
  const lead = /^[("“‘]+/.exec(s)?.[0].length ?? 0;
  const trail = /[.,!?:)"”’]+$/.exec(s)?.[0].length ?? 0;
  if ((lead || trail) && s.length - lead - trail >= 2) {
    variants.push({ start: lead, end: s.length - trail, core: s.slice(lead, s.length - trail), penalty: 0.3 });
  }
  let best: Candidate | undefined;
  for (const v of variants) {
    for (const caps of [false, true]) {
      let keys = v.core;
      let penalty = v.penalty;
      if (caps) {
        // Caps Lock left on: every letter came out upper case.
        const letters = keys.replace(/[^A-Za-z]/g, "");
        if (letters.length < 3 || letters !== letters.toUpperCase()) continue;
        keys = keys.toLowerCase();
        penalty += 1;
      }
      const raw = convert(keys, "en-th", layout);
      const thai = normalize ? normalizeThai(raw) : raw;
      if ([...v.core].length < 2) penalty += SINGLE;
      const f = features(normalizeThai(raw), v.core);
      const z = logOdds(f) + PRIOR["en-th"] - penalty;
      if (!best || z > best.z) {
        best = {
          seg,
          single: [...v.core].length < 2 || bothReal(f),
          dir: "en-th",
          from: seg.from + v.start,
          to: seg.from + v.end,
          original: v.core,
          fixed: thai,
          z,
        };
      }
    }
  }
  return best;
}

function scoreThai(seg: Segment, layout: LayoutName): Candidate | undefined {
  // ASCII characters at the edges of a Thai run were either typed as punctuation or are keys of
  // the English word (W types " and M types ? on Kedmanee). Both readings are scored.
  // Thai abbreviations: พ.ศ. ค.ศ. ก.ค. ดร. กทม. ส.ส.
  if (/^(?:[\u0E01-\u0E2E][\u0E31-\u0E3A\u0E47-\u0E4E\u0E01-\u0E2E]{0,3}\.)+(?:[\u0E01-\u0E2E]{1,3})?$/.test(seg.text)) return undefined;
  const lead = /^[^\u0E00-\u0E7F]+/.exec(seg.text)?.[0].length ?? 0;
  const trail = /[^\u0E00-\u0E7F]+$/.exec(seg.text)?.[0].length ?? 0;
  // In a run typed on the wrong layout every key went through that layout, so converting the
  // edges too is the first reading; keeping them is the second (it must score clearly better).
  const variants = [{ start: 0, end: seg.text.length, penalty: 0 }];
  if (lead || trail) variants.push({ start: lead, end: seg.text.length - trail, penalty: 0.3 });
  let best: Candidate | undefined;
  for (const v of variants) {
    const s = seg.text.slice(v.start, v.end);
    if (!s || [...s].every((c) => isThaiDigit(c) || !isThaiChar(c))) continue;
    const english = convert(s, "th-en", layout);
    if (!/[A-Za-z]/.test(english)) continue;
    const thaiLetters = [...s].filter(isThaiChar).length;
    const single = thaiLetters < 2 ? SINGLE : 0;
    const f = features(normalizeThai(s), english);
    const z = -logOdds(f) + PRIOR["th-en"] - single - v.penalty;
    if (!best || z > best.z) {
      best = { seg, single: thaiLetters < 2 || bothReal(f), dir: "th-en", from: seg.from + v.start, to: seg.from + v.end, original: s, fixed: english, z };
    }
  }
  return best;
}

function roleOf(seg: Segment, cand: Candidate | undefined, z: number | undefined, threshold: number): Role {
  if (cand && z !== undefined && sigmoid(z) >= threshold) return cand.dir === "en-th" ? "fix-en-th" : "fix-th-en";
  if (seg.kind === "thai") return "thai";
  const core = seg.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
  return /^[A-Za-z]+(?:'[a-z]+)?$/.test(core) && isEnglishWord(core) ? "english" : "latin";
}

function run(text: string, layout: LayoutName, opts: FixOptions): FixResult {
  const threshold = opts.threshold ?? 0.8;
  const suggestAbove = opts.suggestAbove ?? 0.5;
  const normalize = opts.normalize ?? true;
  const direction = opts.direction ?? "both";
  getLayout(layout); // validates the name

  const segs = segments(text, opts.keep);
  const cands = segs.map((seg) => {
    if (seg.kind === "latin") return direction === "th-en" ? undefined : scoreLatin(seg, layout, normalize);
    return direction === "en-th" ? undefined : scoreThai(seg, layout);
  });
  // Neighbours on the same line.
  const sameLine = (a: Segment, b: Segment) => !text.slice(Math.min(a.to, b.to), Math.max(a.from, b.from)).includes("\n");
  const withContext = (roles: Role[]) =>
    cands.map((c, k) => {
      if (!c) return undefined;
      let z = c.z;
      if (c.dir === "en-th" && lineHasThai(c.seg)) z += CONTEXT_LINE_THAI;
      for (const n of [k - 1, k + 1]) {
        const seg = segs[n];
        const role = roles[n];
        if (!seg || !role || !sameLine(seg, c.seg)) continue;
        if (c.dir === "en-th") {
          if (role === "fix-en-th") z += CONTEXT_SAME;
          else if (role === "thai") z += CONTEXT_TARGET;
          else if (role === "english") z -= CONTEXT_AGAINST;
        } else {
          if (role === "fix-th-en") z += CONTEXT_SAME;
          else if (role === "english") z += CONTEXT_TARGET;
        }
      }
      // one character, or both readings real words: only ever changed next to a confident change of the same kind
      if (c.single && !sameNeighbour(k, c.dir, roles)) return -Infinity;
      return z;
    });
  const lineHasThai = (seg: Segment) => {
    const start = text.lastIndexOf("\n", seg.from) + 1;
    const end = text.indexOf("\n", seg.to);
    const line = text.slice(start, end < 0 ? text.length : end);
    return /[\u0E01-\u0E2E]/.test(line);
  };
  const sameNeighbour = (k: number, dir: Direction, roles: Role[]) =>
    [k - 1, k + 1].some((n) => {
      const seg = segs[n];
      const c = cands[k];
      return seg && c && sameLine(seg, c.seg) && roles[n] === (dir === "en-th" ? "fix-en-th" : "fix-th-en");
    });
  // Two rounds, so that a run of short mistyped words can lift each other.
  const bar = Math.min(threshold, LIKELY);
  // Round 0: tokens that need context (one character, both readings real) cannot give it yet,
  // so two of them cannot lift each other ("x => x + 1").
  let roles = segs.map((seg, k) => roleOf(seg, cands[k], cands[k]?.single ? undefined : cands[k]?.z, bar));
  let zs: Array<number | undefined> = [];
  for (let round = 0; round < 2; round++) {
    zs = withContext(roles);
    roles = segs.map((seg, k) => roleOf(seg, cands[k], zs[k], bar));
  }

  const spans: Span[] = [];
  const suggestions: Span[] = [];
  cands.forEach((c, k) => {
    const z = zs[k];
    if (!c || z === undefined) return;
    const confidence = Math.round(sigmoid(z) * 1000) / 1000;
    if (confidence < suggestAbove || c.fixed === c.original) return;
    const span: Span = { from: c.from, to: c.to, original: c.original, fixed: c.fixed, dir: c.dir, confidence, layout };
    (confidence >= threshold ? spans : suggestions).push(span);
  });

  let out = "";
  let at = 0;
  for (const s of spans) {
    out += text.slice(at, s.from) + s.fixed;
    at = s.to;
  }
  out += text.slice(at);
  return { text: out, spans, suggestions, layout };
}

/**
 * Finds the parts of `text` that were typed on the wrong keyboard layout and fixes them.
 *
 * ```ts
 * fix("ไปกิน l;ylfu กัน").text  // "ไปกิน สวัสดี กัน"
 * fix("ฟหกด").text               // "asdf"
 * ```
 *
 * Everything else — correct Thai, English words, links, e-mail addresses, paths, code, numbers —
 * comes back exactly as it was.
 */
export function fix(text: string, opts: FixOptions = {}): FixResult {
  if (opts.layout !== "auto") return run(text, opts.layout ?? "kedmanee", opts);
  let best: FixResult | undefined;
  let bestScore = -1;
  for (const name of LAYOUT_NAMES) {
    const r = run(text, name, opts);
    const score = r.spans.reduce((a, s) => a + s.confidence * s.original.length, 0);
    if (score > bestScore + 1e-9) {
      best = r;
      bestScore = score;
    }
  }
  return best!;
}

export interface DetectResult {
  /**
   * `"en-th"` / `"th-en"`: what the mistyped spans have in common; `"mixed"`: both kinds;
   * `null`: nothing looks mistyped.
   */
  dir: Direction | "mixed" | null;
  /** The highest span confidence, or 0. */
  confidence: number;
  /** The layout that explains the text best (only meaningful when `dir` is not null). */
  layout: LayoutName;
  /** Every span that looks mistyped, applied-level or suggestion-level, in text order. */
  spans: Span[];
}

/** Says whether (and how) `text` looks mistyped, without changing it. */
export function detect(text: string, opts: Omit<FixOptions, "normalize"> = {}): DetectResult {
  const r = fix(text, { layout: "auto", ...opts });
  const spans = [...r.spans, ...r.suggestions].sort((a, b) => a.from - b.from);
  const dirs = new Set(r.spans.map((s) => s.dir));
  const dir = dirs.size === 0 ? null : dirs.size === 2 ? "mixed" : [...dirs][0]!;
  const confidence = spans.reduce((m, s) => Math.max(m, s.confidence), 0);
  return { dir, confidence, layout: r.layout, spans };
}
