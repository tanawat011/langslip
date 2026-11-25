import { describe, expect, it } from "vitest";
import { convert, detect, fix } from "../src/index.js";
import { englishOnThaiLayout, latinWordsOnThaiLayout, lines, thaiOnEnglishLayout } from "./helpers.js";

const thai = lines("test/fixtures/thai-sentences.txt");
const english = lines("test/fixtures/english-sentences.txt");
const mixed = lines("test/fixtures/mixed-sentences.txt");

describe("fix — the examples from the brief", () => {
  it("fixes only the mistyped span inside Thai text", () => {
    const r = fix("ไปกิน l;ylfu กัน");
    expect(r.text).toBe("ไปกิน สวัสดี กัน");
    expect(r.spans).toHaveLength(1);
    const s = r.spans[0]!;
    expect(s).toMatchObject({ from: 6, to: 12, original: "l;ylfu", fixed: "สวัสดี", dir: "en-th", layout: "kedmanee" });
    expect(s.confidence).toBeGreaterThan(0.95);
    expect(r.suggestions).toEqual([]);
  });

  it("fixes English typed on the Thai layout", () => {
    expect(fix("ฟหกด").text).toBe("asdf");
    expect(fix("้ำสสน ไนพสก").text).toBe("hello world");
  });

  it("spans point into the input", () => {
    const text = "😀 ไปกิน l;ylfu กัน wx.shvk";
    for (const s of fix(text).spans) expect(text.slice(s.from, s.to)).toBe(s.original);
  });
});

describe("fix — whole sentences typed on the wrong layout (held-out fixtures)", () => {
  it("restores every Thai sentence typed on the English layout", () => {
    const missed = thai.filter((t) => fix(thaiOnEnglishLayout(t)).text !== t);
    expect(missed).toEqual([]);
  });

  it("restores Thai sentences without spaces, glued to Thai, with shifted keys", () => {
    expect(fix("wx.shvk").text).toBe("ไปให้อา");
    expect(fix("ไปกินl;ylfuกัน").text).toBe("ไปกินสวัสดีกัน");
    expect(fix("gxHo").text).toBe("เป็น"); // H is ็ (shift)
    expect(fix(convert("ไม่ควรเล่นกันแบบนี้", "th-en")).text).toBe("ไม่ควรเล่นกันแบบนี้");
  });

  it("restores English typed on the Thai layout (≥ 95 % of sentences, the rest are known limits)", () => {
    const missed = english.filter((t) => fix(englishOnThaiLayout(t)).text !== t);
    // known: "Version 2.0" (digits on the Thai layout), "Chiang Mai" (? + ai)
    expect(missed.length).toBeLessThanOrEqual(3);
  });

  it("restores the Thai parts of mixed Thai / English sentences", () => {
    const missed = mixed.filter((t) => fix(thaiOnEnglishLayout(t)).text !== t);
    expect(missed).toEqual([]);
  });

  it("restores English words forgotten on the Thai layout inside Thai sentences", () => {
    const missed = mixed.filter((t) => fix(latinWordsOnThaiLayout(t)).text !== t);
    // "ok" typed on Thai is นา, a real Thai word — left alone on purpose
    expect(missed.length).toBeLessThanOrEqual(2);
    expect(fix("ลอง พำหะฟพะ server ดูหรือยัง").text).toBe("ลอง restart server ดูหรือยัง");
  });

  it("restores Thai forgotten on the English layout after an English word", () => {
    expect(fix("ลอง restart server f^sinvpy'").text).toBe("ลอง restart server ดูหรือยัง");
    expect(fix(`วันนี้ต้อง deploy ${convert("ระบบใหม่", "th-en")}`).text).toBe("วันนี้ต้อง deploy ระบบใหม่");
  });
});

describe("fix — leaves correct text alone", () => {
  it("every held-out Thai, English and mixed sentence", () => {
    for (const t of [...thai, ...english, ...mixed]) {
      const r = fix(t);
      expect(r.text, t).toBe(t);
      expect(r.spans, t).toEqual([]);
    }
  });

  it("chat Thai, slang and loanwords that are in no dictionary", () => {
    for (const t of ["555", "55555 ตลกมาก", "ฮ่าๆๆๆ", "จ้าาาา", "มากกกกก", "อิอิ", "คิคิ", "ป่ะ", "อ่ะ", "เด้อ", "อืม", "ค่าาา", "ไลก์", "ฟีด", "ครับๆ", "งับบบ", "แงงง", "ชิมิ", "มั้ย", "เหรอ", "จุ๊บๆ", "กรี๊ดดด", "อุ๊ย", "เวิร์ค", "ชิล", "เฟล", "สตอรี่"]) {
      expect(fix(t).text, t).toBe(t);
    }
  });

  it("English chat words, names and tech words", () => {
    for (const t of ["ok", "OK", "lol", "haha", "hmm", "pls", "idk", "btw", "asap", "xoxo", "Tanawat", "Somchai", "Bangkok", "Chulalongkorn", "Nguyen", "kubernetes", "vitest", "README", "macOS", "iOS", "OAuth2", "i18n", "k8s", "gpt-4", "iphone15", "covid19", "10am", "4gb", "2nd", "e.g.", "Mr.", "U.S.A."]) {
      expect(fix(t).text, t).toBe(t);
    }
  });

  it("links, e-mail, paths, code, numbers, mentions, emoticons", () => {
    for (const t of [
      "https://example.com/a?b=c",
      "www.example.co.th",
      "github.com/tanawat011",
      "me@example.com",
      "/usr/local/bin",
      "./src/index.ts",
      "~/.ssh/config",
      "C:\\Users\\me",
      "src/index.ts",
      "README.md",
      "getUserName()",
      "console.log(x)",
      "user_id",
      "MAX_RETRIES",
      "a[i]",
      "rows[0].id",
      "x => x + 1",
      "a === b",
      "0x1F",
      "<div>",
      "--force",
      "npm i -D vitest",
      "`l;ylfu`",
      "${name}",
      "C#",
      "C++",
      ".NET",
      "Node.js",
      "@tanawat",
      "#1234",
      "#hashtag",
      "1,250",
      "10:30",
      "25/11/2569",
      "2026-11-25",
      "081-234-5678",
      "v1.2.3",
      "99%",
      "555+",
      "๒๕๖๙",
      ":)",
      ":D",
      "<3",
      "^^",
      "T_T",
      "...",
      "!!!",
      "พ.ศ. 2569",
      "ดร. สมชาย",
      "กทม.",
    ]) {
      expect(fix(t).text, t).toBe(t);
    }
  });

  it("does not touch a link or a path glued to mistyped text", () => {
    expect(fix("ดู https://github.com/foo/bar ก่อน").text).toBe("ดู https://github.com/foo/bar ก่อน");
    expect(fix("l;ylfu https://l;ylfu.com").text).toBe("สวัสดี https://l;ylfu.com");
  });

  it("leaves a token alone when both readings are real words, unless its neighbours say otherwise", () => {
    expect(fix("me").text).toBe("me"); // = ทำ
    expect(fix("ok").text).toBe("ok"); // = นา
    expect(fix("ทำ").text).toBe("ทำ"); // = me
    expect(fix("I am ok").text).toBe("I am ok");
    expect(fix("ok ครับ").text).toBe("ok ครับ");
  });

  it("a one-character token is only fixed next to other fixes", () => {
    expect(fix("ณ").text).toBe("ณ");
    expect(fix("ดี ๆ").text).toBe("ดี ๆ");
    expect(fix("ะ้รห รห ฟ ะำหะ").text).toBe("this is a test");
    expect(fix("x => x + 1").text).toBe("x => x + 1"); // two lone letters do not lift each other
  });
});

describe("fix — shift, Caps Lock and mark order", () => {
  it("reads shifted keys as Thai shifted characters", () => {
    expect(fix("gxHo").text).toBe("เป็น");
    expect(fix("4kKk").text).toBe("ภาษา"); // K = ษ
  });

  it("recognises Thai typed with Caps Lock on", () => {
    expect(fix("L;YLFU").text).toBe("สวัสดี");
    expect(fix("L;YLFU8IY[").text).toBe("สวัสดีครับ");
  });

  it("puts tone and vowel marks in the right order in what it fixes", () => {
    expect(fix("ljb'").text).toBe("สิ่ง"); // ส ่ ิ ง typed → สิ่ง
    expect(fix("oeh").text).toBe("น้ำ"); // น ำ ้ typed → น้ำ
    expect(fix("oeh", { normalize: false }).text).toBe("นำ\u0E49");
  });
});

describe("fix — layouts", () => {
  const sentence = "สวัสดีครับ วันนี้อากาศดีมาก";

  it("Pattachote with layout: 'pattachote'", () => {
    const typed = convert(sentence, "th-en", "pattachote");
    expect(fix(typed, { layout: "pattachote" }).text).toBe(sentence);
  });

  it("finds the layout itself with layout: 'auto'", () => {
    for (const layout of ["kedmanee", "pattachote"] as const) {
      const r = fix(convert(sentence, "th-en", layout), { layout: "auto" });
      expect(r.text).toBe(sentence);
      expect(r.layout).toBe(layout);
    }
  });

  it("macOS Kedmanee: the keys that differ from Windows", () => {
    const t = "ราคา_ลด"; // _ is on 3 on macOS, on ` on Windows
    expect(fix(thaiOnEnglishLayout(t, "kedmanee-mac").replace("_", convert("_", "th-en", "kedmanee-mac")), { layout: "kedmanee-mac" }).text).toBe(t);
  });
});

describe("fix — options", () => {
  it("threshold / suggestAbove: low-confidence spans become suggestions", () => {
    const r = fix("djb"); // ก่ิ → กิ่: valid Thai shape but not a word
    expect(r.text).toBe("djb");
    expect(r.suggestions.map((s) => s.fixed)).toEqual(["กิ่"]);
    expect(fix("djb", { threshold: 0.5 }).text).toBe("กิ่");
    expect(fix("djb", { suggestAbove: 0.9 }).suggestions).toEqual([]);
  });

  it("direction limits the kind of fix", () => {
    const text = "l;ylfu ้ำสสน";
    expect(fix(text).text).toBe("สวัสดี hello");
    expect(fix(text, { direction: "en-th" }).text).toBe("สวัสดี ้ำสสน");
    expect(fix(text, { direction: "th-en" }).text).toBe("l;ylfu hello");
  });

  it("keep: words and patterns never touched", () => {
    expect(fix("l;ylfu", { keep: ["l;ylfu"] }).text).toBe("l;ylfu");
    expect(fix("l;ylfu 8iy[", { keep: [/8\w+\[/] }).text).toBe("สวัสดี 8iy[");
  });
});

describe("detect", () => {
  it("names the direction and the layout", () => {
    expect(detect("l;ylfu8iy[")).toMatchObject({ dir: "en-th", layout: "kedmanee" });
    expect(detect("้ำสสน ไนพสก")).toMatchObject({ dir: "th-en" });
    expect(detect(convert("สวัสดีครับ วันนี้อากาศดีมาก", "th-en", "pattachote"))).toMatchObject({ dir: "en-th", layout: "pattachote" });
    expect(detect("l;ylfu ้ำสสน").dir).toBe("mixed");
  });

  it("says nothing for correct text", () => {
    const r = detect("สวัสดีครับ hello world");
    expect(r.dir).toBeNull();
    expect(r.spans).toEqual([]);
  });

  it("does not change the text", () => {
    const r = detect("l;ylfu");
    expect(r.spans[0]).toMatchObject({ original: "l;ylfu", fixed: "สวัสดี" });
  });
});

describe("fix — single words", () => {
  it("never changes a word of the ICU Thai dictionary or of the 12dicts English list", () => {
    const thaiWords = lines("data/sources/icu-thaidict.txt");
    const englishWords = lines("data/sources/12dicts-3esl.txt").filter((w) => /^[a-z]+$/.test(w));
    expect(thaiWords.filter((w) => fix(w).text !== w)).toEqual([]);
    expect(englishWords.filter((w) => fix(w).text !== w)).toEqual([]);
  });

  it("restores common Thai words typed alone on the English layout (≥ 98 %)", () => {
    const common = lines("data/common-thai.txt");
    const missed = common.filter((w) => fix(convert(w, "th-en")).text !== w);
    // known: ทำ (= me, a real English word)
    expect(missed.length / common.length).toBeLessThan(0.02);
  });
});
