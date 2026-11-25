import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { convert, getLayout, LAYOUT_NAMES, toDirection } from "../src/index.js";

describe("convert — Kedmanee (Windows, the default)", () => {
  it("re-types Thai typed on the English layout", () => {
    expect(convert("l;ylfu", "en-th")).toBe("สวัสดี");
    expect(convert("8iy[", "en-th")).toBe("ครับ");
    expect(convert("wx.shvk", "th")).toBe("ไปให้อา");
    expect(convert("c]h;", "en-th")).toBe("แล้ว");
  });

  it("re-types English typed on the Thai layout", () => {
    expect(convert("ฟหกด", "th-en")).toBe("asdf");
    expect(convert("้ำสสน ไนพสก", "en")).toBe("hello world");
  });

  it("uses the shift layer for capitals and shifted keys", () => {
    expect(convert("gxHo", "en-th")).toBe("เป็น"); // H = ็
    expect(convert("Tanawat", "en-th")).toBe("ธฟืฟไฟะ");
    expect(convert("ฤฆฏโฌ", "th-en")).toBe("ASDFG");
    expect(convert("@#$%", "en-th")).toBe("๑๒๓๔"); // shifted digits are Thai digits
    expect(convert("&", "en-th")).toBe("฿");
  });

  it("covers every printable ASCII key", () => {
    const keys = [...Array(94)].map((_, i) => String.fromCharCode(33 + i)).join("");
    const thai = convert(keys, "en-th");
    expect(convert(thai, "th-en")).toBe(keys);
    expect(getLayout("kedmanee").toThai.size).toBe(94);
  });

  it("keeps characters the layout has no key for", () => {
    expect(convert("l;ylfu 😀 é", "en-th")).toBe("สวัสดี 😀 é");
    expect(convert("ฟหกด 😀 ๆ", "th-en")).toBe("asdf 😀 q");
  });

  it("can type every character of the ICU Thai word list", () => {
    const chars = new Set(readFileSync("data/sources/icu-thaidict.txt", "utf8").replace(/[^฀-๿]/g, ""));
    const { toEnglish } = getLayout("kedmanee");
    for (const c of chars) expect(toEnglish.has(c), c).toBe(true);
  });
});

describe("convert — the four layouts", () => {
  it("knows exactly these layouts", () => {
    expect(LAYOUT_NAMES).toEqual(["kedmanee", "kedmanee-mac", "pattachote", "pattachote-mac"]);
  });

  it("Kedmanee on macOS differs from Windows on exactly two keys", () => {
    const win = getLayout("kedmanee").toThai;
    const mac = getLayout("kedmanee-mac").toThai;
    const diff = [...win.keys()].filter((k) => win.get(k) !== mac.get(k));
    expect(diff.sort()).toEqual(["3", "`"]);
    expect(convert("`3", "en-th", "kedmanee")).toBe("_-");
    expect(convert("`3", "en-th", "kedmanee-mac")).toBe("-_");
  });

  it("Pattachote types its own arrangement", () => {
    // spot checks against the CLDR / macOS tables
    expect(convert("mogmuh", "en-th", "pattachote")).toBe("สวัสดี");
    expect(convert("สวัสดีครับ", "th-en", "pattachote")).toBe("mogmuhntgz");
    expect(convert("dk", "en-th", "pattachote")).toBe("งน");
  });

  it("Pattachote on macOS and Windows differ where the tables say", () => {
    const win = getLayout("pattachote").toThai;
    const mac = getLayout("pattachote-mac").toThai;
    expect(win.get("`")).toBe("_");
    expect(mac.get("`")).toBe("฿");
    expect(win.get("1")).toBe("=");
    expect(mac.has("1")).toBe(false); // macOS types nothing on 1 with this layout
    expect(win.get("}")).toBe("ฦ");
    expect(mac.get("}")).toBe("ฦ"); // CLDR's old file said ภ; macOS 27 types ฦ
    expect(mac.get("\\")).toBe("ฃ");
    expect(win.has("\\")).toBe(false); // Windows types a private-use character there
  });

  it("prefers the unshifted key when a layout types one character on two keys", () => {
    expect(getLayout("pattachote").toEnglish.get("ั")).toBe("g"); // ั is on g and B
  });
});

describe("convert — round trips (property tests)", () => {
  for (const name of LAYOUT_NAMES) {
    const layout = getLayout(name);
    const outputs = new Map<string, number>();
    for (const c of layout.toThai.values()) outputs.set(c, (outputs.get(c) ?? 0) + 1);
    // keys whose character no other key types: the reversible alphabet
    const keys = [...layout.toThai.keys()].filter((k) => outputs.get(layout.toThai.get(k)!) === 1);
    const chars = keys.map((k) => layout.toThai.get(k)!);

    it(`${name}: th-en(en-th(keys)) === keys`, () => {
      fc.assert(
        fc.property(fc.array(fc.constantFrom(...keys, " "), { maxLength: 60 }), (xs) => {
          const s = xs.join("");
          expect(convert(convert(s, "en-th", name), "th-en", name)).toBe(s);
        }),
        { numRuns: 500 },
      );
    });

    it(`${name}: en-th(th-en(thai)) === thai`, () => {
      fc.assert(
        fc.property(fc.array(fc.constantFrom(...chars, " "), { maxLength: 60 }), (xs) => {
          const s = xs.join("");
          expect(convert(convert(s, "th-en", name), "en-th", name)).toBe(s);
        }),
        { numRuns: 500 },
      );
    });
  }
});

describe("convert — arguments", () => {
  it("accepts short directions", () => {
    expect(toDirection("th")).toBe("en-th");
    expect(toDirection("en")).toBe("th-en");
  });

  it("refuses unknown directions and layouts", () => {
    // @ts-expect-error testing a bad value
    expect(() => convert("x", "up")).toThrow(RangeError);
    // @ts-expect-error testing a bad value
    expect(() => convert("x", "th", "dvorak")).toThrow(/Unknown layout/);
  });
});
