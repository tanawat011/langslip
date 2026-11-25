import { getLayout, type LayoutName } from "./layouts.js";

/**
 * - `"en-th"`: the text was typed on the English (US) layout but meant to be Thai.
 * - `"th-en"`: the text was typed on the Thai layout but meant to be English.
 *
 * `"th"` and `"en"` are accepted as short forms naming the target ("to Thai", "to English").
 */
export type Direction = "en-th" | "th-en";
export type DirectionInput = Direction | "th" | "en";

export function toDirection(dir: DirectionInput): Direction {
  switch (dir) {
    case "en-th":
    case "th":
      return "en-th";
    case "th-en":
    case "en":
      return "th-en";
    default:
      throw new RangeError(`Unknown direction "${String(dir)}". Use "en-th" (or "th") or "th-en" (or "en").`);
  }
}

/**
 * Re-types `text` on the other layout, key for key. Characters the layout has no key for are
 * kept as they are. Pure and reversible: for any string made only of characters the layout
 * types, `convert(convert(s, "en-th"), "th-en") === s` (except where a layout types one character
 * on two keys — see `Layout.toEnglish`).
 *
 * This does no detection and no clean-up; use `fix()` for that.
 */
export function convert(text: string, dir: DirectionInput, layout: LayoutName = "kedmanee"): string {
  const map = toDirection(dir) === "en-th" ? getLayout(layout).toThai : getLayout(layout).toEnglish;
  let out = "";
  for (const ch of text) out += map.get(ch) ?? ch;
  return out;
}
