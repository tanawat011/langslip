import { LAYOUT_DATA } from "./generated/layout-data.js";

/**
 * The Thai layouts kedfix knows.
 *
 * - `kedmanee`        Thai Kedmanee as Windows ships it (TIS 820-2538). Also the default.
 * - `kedmanee-mac`    macOS "Thai". Differs from Windows on two keys: ` types "-" (Windows "_")
 *                     and 3 types "_" (Windows "-").
 * - `pattachote`      Thai Pattachote as Windows ships it.
 * - `pattachote-mac`  macOS "Thai - PattaChote". Differs from Windows on ` (฿ vs _), ~ and 1 / !
 *                     (nothing vs ฿, =, +), \ and | (ฃ ฅ vs nothing and ํ).
 *
 * Shift: the Thai shifted characters are taken from the shift layer on Windows and from the
 * LEFT shift on macOS (macOS types plain ASCII with the right shift — see README).
 */
export type LayoutName = keyof typeof LAYOUT_DATA;

export const LAYOUT_NAMES = Object.keys(LAYOUT_DATA) as LayoutName[];

export interface Layout {
  readonly name: LayoutName;
  /** US key character → what this layout types on that key. */
  readonly toThai: ReadonlyMap<string, string>;
  /**
   * Character this layout types → the US key character. Where a layout types one character on
   * two keys (Pattachote's ั on g and B; Windows Pattachote's _ on ` and &), the unshifted key wins.
   */
  readonly toEnglish: ReadonlyMap<string, string>;
}

const cache = new Map<LayoutName, Layout>();

export function isLayoutName(name: string): name is LayoutName {
  return Object.prototype.hasOwnProperty.call(LAYOUT_DATA, name);
}

export function getLayout(name: LayoutName = "kedmanee"): Layout {
  const hit = cache.get(name);
  if (hit) return hit;
  if (!isLayoutName(name)) {
    throw new RangeError(`Unknown layout "${String(name)}". Known: ${LAYOUT_NAMES.join(", ")}`);
  }
  const { keys, chars } = LAYOUT_DATA[name];
  const toThai = new Map<string, string>();
  const toEnglish = new Map<string, string>();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const c = chars[i]!;
    toThai.set(k, c);
    const prev = toEnglish.get(c);
    // keys are listed unshifted-then-shifted per key, so the first one seen is preferred,
    // except that an unshifted key later in the table still beats a shifted one.
    if (prev === undefined || (isShifted(prev) && !isShifted(k))) toEnglish.set(c, k);
  }
  const layout: Layout = { name, toThai, toEnglish };
  cache.set(name, layout);
  return layout;
}

const SHIFTED = new Set('~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:"ZXCVBNM<>?');
function isShifted(k: string): boolean {
  return SHIFTED.has(k);
}
