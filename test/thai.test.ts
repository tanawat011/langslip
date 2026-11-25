import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeThai, thaiViolations } from "../src/index.js";

describe("normalizeThai", () => {
  it("puts the vowel mark before the tone mark", () => {
    expect(normalizeThai("ส่ิง")).toBe("สิ่ง"); // typed ่ then ิ
    expect(normalizeThai("กุ้")).toBe("กุ้");
  });

  it("puts the tone mark before sara am", () => {
    expect(normalizeThai("นำ้")).toBe("น้ำ");
  });

  it("joins nikhahit + sara aa into sara am", () => {
    expect(normalizeThai("ทํา")).toBe("ทำ");
  });

  it("drops a mark typed twice", () => {
    expect(normalizeThai("ก่่")).toBe("ก่");
  });

  it("leaves correct text and non-Thai text alone", () => {
    for (const s of ["สวัสดีครับ", "น้ำ", "เป็น", "ก็", "hello", "ฤๅษี"]) expect(normalizeThai(s)).toBe(s);
  });
});

describe("thaiViolations", () => {
  it("finds no violation in (nearly) every ICU dictionary word", () => {
    const words = readFileSync("data/sources/icu-thaidict.txt", "utf8").split(/\r?\n/).filter((w) => /^[฀-๿]+$/.test(w));
    const bad = words.filter((w) => thaiViolations(w) > 0);
    // a handful of archaic spellings break the shape rules; real typing almost never does
    expect(bad.length / words.length).toBeLessThan(0.002);
  });

  it("flags shapes that only wrong-layout typing makes", () => {
    expect(thaiViolations("้ำสสน")).toBeGreaterThan(0); // tone mark first ("hello")
    expect(thaiViolations("เ")).toBe(1); // leading vowel with nothing after it
    expect(thaiViolations("กั")).toBe(1); // ั needs a final consonant
    expect(thaiViolations("กาะ")).toBe(0); // (เ-าะ pattern piece) is fine
    expect(thaiViolations("ะก")).toBe(1); // sara a with nothing before it
    expect(thaiViolations("ๅ")).toBe(1); // lakkhangyao only after ฤ / ฦ
  });
});
