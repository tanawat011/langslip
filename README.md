# langslip

**Fix text typed on the wrong keyboard layout, Thai ⇄ English — only the parts that are wrong.**

```ts
import { fix } from "langslip";

fix("ไปกิน l;ylfu กัน").text;      // "ไปกิน สวัสดี กัน"
fix("้ำสสน ไนพสก").text;           // "hello world"
fix("ลอง restart server f^sinvpy'").text; // "ลอง restart server ดูหรือยัง"
fix("ok ครับ ดู https://example.com/l;ylfu").text; // unchanged
```

[ภาษาไทยอยู่ด้านล่าง ↓](#ภาษาไทย)

## Why another one

Re-typing keys from one layout to the other is easy and has been done before: PyThaiNLP has
`eng_to_thai` / `thai_to_eng`, and npm has small packages such as `thai-keyboard-corrector` and
`key-correction`. They convert a whole string, or swap it when most of it is one script. That
breaks the common real cases: one wrong word inside a correct Thai sentence, an English word
that must stay English, a link, a file name, a name.

langslip decides **span by span**:

- It finds which spans were typed on the wrong layout inside mixed text and leaves the spans that
  are already right untouched — with their offsets, so you can show or undo each change.
- It never breaks intended English: links, e-mail addresses, paths, file names, code
  (`snake_case`, `call()`, `a[i]`, `=>` …), numbers, dates, times, versions, mentions, hashtags,
  emoticons, known English words, chat words and names.
- Every span gets a **confidence** from a model that weighs how Thai the Thai reading is (spelling
  shape, a dictionary, letter pairs) against how English the English reading is. Below the
  threshold it is not changed but reported as a **suggestion**.
- Both directions: Thai typed on the English layout, English typed on the Thai layout.
- Four layouts, checked against real tables: Kedmanee and Pattachote, each as Windows and as
  macOS type them (they differ on a few keys).
- Shift and Caps Lock, and Thai vowel / tone marks put back in the order Unicode wants.
- No runtime dependencies, ESM + CJS + types, runs in browsers (the core uses no Node API).

## Install

```sh
npm install langslip
```

A `<script>` build is in the package too: `dist/langslip.global.js` (global `langslip`).

## API

### `fix(text, options?) → FixResult`

```ts
const r = fix("ไปกิน l;ylfu กัน");
r.text;        // "ไปกิน สวัสดี กัน"
r.spans;       // [{ from: 6, to: 12, original: "l;ylfu", fixed: "สวัสดี", dir: "en-th", confidence: 0.999, layout: "kedmanee" }]
r.suggestions; // spans that look mistyped but were below the threshold (same shape), not applied
r.layout;      // the layout used ("auto" picks one)
```

`from` / `to` are offsets into the input in UTF-16 units, like `String.prototype.slice`.
`dir` is `"en-th"` (typed on the English layout, meant Thai) or `"th-en"`.

| option | default | |
|---|---|---|
| `layout` | `"kedmanee"` | `"kedmanee"`, `"kedmanee-mac"`, `"pattachote"`, `"pattachote-mac"` or `"auto"` |
| `direction` | `"both"` | `"en-th"` or `"th-en"` to look for one kind of mistake only |
| `threshold` | `0.8` | spans at or above this confidence are changed |
| `suggestAbove` | `0.5` | spans at or above this (and below `threshold`) go to `suggestions` |
| `normalize` | `true` | put Thai marks in the right order in fixed spans |
| `keep` | `[]` | strings or RegExps never to touch (product names, codes …) |

### `detect(text, options?) → DetectResult`

Says whether and how the text looks mistyped, without changing it; tries every layout.

```ts
detect("l;ylfu8iy[");   // { dir: "en-th", confidence: 1, layout: "kedmanee", spans: [...] }
detect("hello world");  // { dir: null, confidence: 0, layout: "kedmanee", spans: [] }
```

`dir` is `"en-th"`, `"th-en"`, `"mixed"` or `null`.

### `convert(text, dir, layout = "kedmanee") → string`

Plain key-for-key re-typing, no detection. `dir` is `"en-th"` / `"th-en"` (or `"th"` / `"en"`,
naming the target). Characters the layout has no key for are kept. Reversible:
`convert(convert(x, "en-th"), "th-en") === x` for any string of keys the layout types.

```ts
convert("l;ylfu", "en-th");               // "สวัสดี"
convert("ฟหกด", "th-en");                 // "asdf"
convert("mogmuh", "th", "pattachote");    // "สวัสดี"
```

### Also exported

`normalizeThai(text)` (mark order: `ส่ิง` → `สิ่ง`, `นำ้` → `น้ำ`, `ํา` → `ำ`),
`thaiViolations(text)` (count of spelling shapes only wrong-layout typing makes),
`getLayout(name)` (the key tables), `LAYOUT_NAMES`, `isLayoutName`, and the types.

## CLI

```sh
echo "l;ylfu" | npx langslip            # สวัสดี
npx langslip "ไปกิน l;ylfu กัน"          # ไปกิน สวัสดี กัน
npx langslip --to th "l;ylfu"           # สวัสดี   (re-type everything)
npx langslip --to en "ฟหกด"             # asdf
npx langslip --json "gxHo"              # spans and confidences
npx langslip --detect "้ำสสน"           # verdict as JSON
npx langslip --layout auto "mogmuhntgz" # สวัสดีครับ (Pattachote found)
```

## Layouts

| name | what | source |
|---|---|---|
| `kedmanee` | Kedmanee as Windows types it (TIS 820-2538) | Unicode CLDR `th-t-k0-windows` |
| `kedmanee-mac` | macOS "Thai" — `` ` `` types `-` and `3` types `_` (Windows: the other way round) | CLDR `th-t-k0-osx`, identical to what macOS 27 types |
| `pattachote` | Pattachote as Windows types it | CLDR `th-t-k0-windows-patta` |
| `pattachote-mac` | macOS "Thai - PattaChote" — differs on `` ` `` `~` `1` `!` `\` `\|` `}` | read from macOS 27 itself |

**Shift.** Upper-case letters and shifted symbols are read as the Thai shifted characters
(`gxHo` → `เป็น`, `H` = `็`). On macOS the Thai layouts type plain ASCII with the **right** Shift
key; langslip assumes the left one, like Windows.
**Caps Lock.** A token typed all in capitals is also tried in lower case (`L;YLFU` → `สวัสดี`).

## How it works

1. Protected ranges (links, e-mail, paths, code, …) are cut out. The rest is split into
   Thai-script and Latin-script segments (`ไปกินl;ylfu` → `ไปกิน` + `l;ylfu`).
2. Each segment is read both ways. The Thai reading is scored on spelling shape (a tone mark needs
   a consonant under it, `เ` needs a consonant after it, `ั` needs a final …), coverage by a Thai
   word list, and Thai letter pairs. The English reading on being a known word (with regular
   endings), English letter pairs, odd characters (`;` `[` `]` inside a word), case, vowels,
   digits inside letters.
3. A logistic model turns that into log-odds; its weights were fitted
   (`scripts/fit-weights.ts`) on seeded synthetic data — Thai words, phrases and chat words typed
   on the English layout against English words, names, identifiers and made-up words typed on the
   Thai layout.
4. Neighbours on the same line nudge the score: a token next to other fixes is more likely
   mistyped too. A one-character token, or a token where **both** readings are real words
   (`ทำ` / `me`, `นา` / `ok`), is only ever changed next to another fix.
5. `confidence ≥ threshold` → changed; `≥ suggestAbove` → suggestion.

## How well it works

`npx tsx scripts/eval.ts` runs a held-out check on sentences in `test/fixtures/` (written by hand,
never used for fitting). At version 0.1.0:

| check | result |
|---|---|
| Thai sentences typed on the English layout, restored | 89 / 89 |
| Mixed Thai–English sentences, Thai parts mistyped, restored | 28 / 28 |
| English sentences typed on the Thai layout (every key), restored | 58 / 60 |
| English words left on the Thai layout inside Thai sentences, restored | 26 / 28 |
| Correct Thai / English / mixed sentences left unchanged | 89 / 89, 60 / 60, 28 / 28 |
| Every ICU Thai dictionary word alone, unchanged | 26,383 / 26,383 |
| Every 12dicts English word alone, unchanged | 19,217 / 19,217 |
| Common Thai words typed alone on the English layout, restored | 206 / 209 |

Honest caveats: the fixtures are small and were written by the same people who built the model;
real text will find cases they miss. The test suite (`npm test`) checks the same sets, with the
few known misses allowed and named, so the numbers cannot silently get worse.

## Limits

- Only Thai ⇄ US QWERTY. Not Dvorak, Colemak, AZERTY, UK, other scripts.
- Within one run of Thai script, a correct part and a mistyped part with no space between
  them (`สวัสดี้ำสสน`) are not separated. Latin and Thai glued together are.
- Digits typed on the Thai layout (`2.0` → `/ใจ`) are not recovered.
- Very short tokens are ambiguous by nature: `me` / `ทำ`, `ok` / `นา`, `wfh` / `ได้`. They are
  decided by their neighbours; alone they are left as typed (`wfh` is read as `ได้`).
- The Thai word list (ICU's) has no slang; chat words are recognised by shape and letter pairs,
  which is weaker. Lower `threshold` and you will see more false fixes.
- `layout: "auto"` on very short text can pick the wrong layout; pass the layout when you know it.
- Size: `fix` / `detect` carry the word lists — about 115 KB minified, 66 KB gzipped.
  `convert` alone tree-shakes to about 5 KB (2 KB gzipped).

## Develop

```sh
npm run data    # rebuild src/generated/* from data/ (layouts, word lists, bigrams)
npm run fit     # refit the model → src/generated/weights.ts (deterministic)
npx tsx scripts/eval.ts --verbose
npm run check   # lint + typecheck + tests + build
```

Demo page: `npm run build`, then open `demo/index.html`.

## Data and licences

Code: MIT. Layout tables from Unicode CLDR (Unicode License v3) and macOS 27; Thai words from
ICU's `thaidict.txt` (Unicode License v3); English words from Alan Beale's 12dicts `3esl` list
(public domain). Details and full licence texts: [NOTICE.md](NOTICE.md).

---

## ภาษาไทย

**langslip แก้ข้อความที่พิมพ์ตอนลืมเปลี่ยนภาษา — ไทย ⇄ อังกฤษ — และแก้เฉพาะช่วงที่ผิด**

```ts
import { fix } from "langslip";
fix("ไปกิน l;ylfu กัน").text; // "ไปกิน สวัสดี กัน"
fix("้ำสสน ไนพสก").text;      // "hello world"
```

### ต่างจากของที่มีอยู่อย่างไร

การแปลงปุ่มต่อปุ่มระหว่างแป้นไม่ใช่เรื่องใหม่ (PyThaiNLP มี `eng_to_thai` / `thai_to_eng`, บน npm มี
`thai-keyboard-corrector`, `key-correction`) แต่ส่วนใหญ่แปลงทั้งข้อความ หรือสลับทั้งก้อนเมื่อตัวอักษรส่วนใหญ่เป็นภาษาเดียว
ซึ่งพังในกรณีที่เจอบ่อยจริง: คำเดียวที่ผิดกลางประโยคไทยที่ถูก, คำอังกฤษที่ต้องเป็นอังกฤษ, ลิงก์, ชื่อไฟล์, ชื่อคน

langslip ตัดสินใจ **ทีละช่วง**:

- หาว่าช่วงไหนพิมพ์ผิดแป้น แก้เฉพาะช่วงนั้น ช่วงที่ถูกอยู่แล้วไม่แตะ และบอกตำแหน่งของทุกการแก้
- ไม่ทำลายภาษาอังกฤษที่ตั้งใจพิมพ์: ลิงก์ อีเมล path ชื่อไฟล์ โค้ด ตัวเลข วันที่ เวลา เวอร์ชัน @mention #แท็ก อีโมติคอน คำอังกฤษ คำแชต ชื่อคน
- ทุกช่วงมี **ค่าความมั่นใจ** จากโมเดลที่ชั่งว่า "อ่านเป็นไทยแล้วเป็นไทยแค่ไหน" (รูปการสะกด, พจนานุกรม, คู่ตัวอักษร)
  เทียบกับ "อ่านเป็นอังกฤษแล้วเป็นอังกฤษแค่ไหน" ถ้าต่ำกว่าเกณฑ์จะไม่แก้ แต่ส่งกลับเป็น **ข้อเสนอ** (`suggestions`)
- สองทิศ: ไทยที่พิมพ์บนแป้นอังกฤษ และอังกฤษที่พิมพ์บนแป้นไทย
- 4 แป้น ตรวจกับตารางจริง: เกษมณี และปัตตะโชติ แบบ Windows และแบบ macOS (ต่างกันบางปุ่ม)
- รองรับ Shift, Caps Lock และจัดลำดับสระ/วรรณยุกต์ให้ถูก (`ส่ิง` → `สิ่ง`, `นำ้` → `น้ำ`)
- ไม่มี dependency ตอนรัน, มี ESM + CJS + types, ใช้ในเบราว์เซอร์ได้

### ติดตั้งและใช้

```sh
npm install langslip
echo "l;ylfu" | npx langslip      # สวัสดี
npx langslip --to th "l;ylfu"     # แปลงทั้งข้อความ ไม่ตรวจ
```

- `fix(text, options)` → `{ text, spans, suggestions, layout }` — แต่ละ span คือ `{ from, to, original, fixed, dir, confidence, layout }`
- `detect(text)` → บอกว่าผิดแป้นทิศไหน (`"en-th"`, `"th-en"`, `"mixed"`, `null`) และน่าจะเป็นแป้นอะไร โดยไม่แก้ข้อความ
- `convert(text, dir, layout)` → แปลงปุ่มต่อปุ่มตรง ๆ ย้อนกลับได้เสมอ

ตัวเลือกหลัก: `layout` (ค่าเริ่มต้น `"kedmanee"`, ใส่ `"auto"` ให้หาเอง), `threshold` (0.8), `suggestAbove` (0.5),
`direction`, `normalize`, `keep` (คำหรือ RegExp ที่ห้ามแตะ)

### ข้อจำกัด

- รองรับเฉพาะไทย ⇄ แป้น US QWERTY
- ถ้าส่วนที่ถูกกับส่วนที่ผิดเป็นอักษรไทยติดกันไม่มีเว้นวรรค (`สวัสดี้ำสสน`) จะแยกไม่ได้
- ตัวเลขที่พิมพ์บนแป้นไทย (`2.0` → `/ใจ`) กู้คืนไม่ได้
- คำสั้นมากกำกวมโดยธรรมชาติ (`me`/`ทำ`, `ok`/`นา`) จะแก้ก็ต่อเมื่อคำข้าง ๆ ถูกแก้ด้วย ถ้าอยู่เดี่ยว ๆ จะปล่อยไว้
- คำแสลงไม่มีในพจนานุกรม ICU จึงอาศัยรูปการสะกดกับคู่ตัวอักษรแทน ซึ่งอ่อนกว่า
- ขนาด: `fix`/`detect` มีรายการคำติดมาด้วย ราว 66 KB เมื่อ gzip; ถ้าใช้แค่ `convert` เหลือราว 2 KB

### ที่มาของข้อมูล

ตารางแป้นจาก Unicode CLDR (Unicode License v3) และตรวจกับ macOS 27 โดยตรง, คำไทยจาก `thaidict.txt` ของ ICU
(Unicode License v3), คำอังกฤษจากรายการ `3esl` ของ 12dicts โดย Alan Beale (public domain) — รายละเอียดใน [NOTICE.md](NOTICE.md)

โค้ดใช้สัญญาอนุญาต MIT
