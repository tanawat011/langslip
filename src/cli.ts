import { convert, detect, fix, isLayoutName, LAYOUT_NAMES, type LayoutName } from "./index.js";

declare const __VERSION__: string | undefined;
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const HELP = `langslip — fix text typed on the wrong keyboard layout (Thai ⇄ English)

Usage
  echo "l;ylfu" | langslip            → สวัสดี   (finds the mistyped parts, keeps the rest)
  langslip "ไปกิน l;ylfu กัน"          → ไปกิน สวัสดี กัน
  langslip --to th "l;ylfu"           → สวัสดี   (re-type everything, no detection)
  langslip --to en "ฟหกด"             → asdf

Options
  --to th|en          Re-type the whole input to Thai / to English, key for key.
  --layout <name>     ${LAYOUT_NAMES.join(" | ")} | auto   (default: kedmanee)
  --threshold <0-1>   Change spans at or above this confidence (default 0.8).
  --json              Print the full result (spans, confidences, suggestions) as JSON.
  --detect            Only say what looks mistyped (JSON).
  -h, --help          This help.
  -v, --version       Version.

Text comes from the arguments, or from standard input when there are none.`;

function fail(msg: string): never {
  process.stderr.write(`langslip: ${msg}\n`);
  process.exit(2);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(argv: string[]): Promise<void> {
  let to: "th" | "en" | undefined;
  let layout: LayoutName | "auto" = "kedmanee";
  let threshold: number | undefined;
  let json = false;
  let onlyDetect = false;
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => argv[++i] ?? fail(`${a} needs a value`);
    if (a === "-h" || a === "--help") return void process.stdout.write(HELP + "\n");
    else if (a === "-v" || a === "--version") return void process.stdout.write(VERSION + "\n");
    else if (a === "--to") {
      const v = value();
      if (v !== "th" && v !== "en") fail(`--to must be "th" or "en", not "${v}"`);
      to = v;
    } else if (a === "--layout") {
      const v = value();
      if (v !== "auto" && !isLayoutName(v)) fail(`unknown layout "${v}" (${LAYOUT_NAMES.join(", ")}, auto)`);
      layout = v;
    } else if (a === "--threshold") {
      const v = Number(value());
      if (!(v >= 0 && v <= 1)) fail("--threshold must be between 0 and 1");
      threshold = v;
    } else if (a === "--json") json = true;
    else if (a === "--detect") onlyDetect = true;
    else if (a === "--") {
      words.push(...argv.slice(i + 1));
      break;
    }
    else if (a.startsWith("-") && a.length > 1) fail(`unknown option ${a} (see --help)`);
    else words.push(a);
  }

  const fromStdin = words.length === 0;
  if (fromStdin && process.stdin.isTTY) return void process.stdout.write(HELP + "\n");
  const raw = fromStdin ? await readStdin() : words.join(" ");
  // keep a trailing newline of piped input where it was
  const nl = /\r?\n$/.exec(raw)?.[0] ?? "";
  const text = raw.slice(0, raw.length - nl.length);

  if (to) {
    if (layout === "auto") fail("--to needs a concrete --layout, not auto");
    process.stdout.write(convert(text, to, layout) + (fromStdin ? nl : "\n"));
    return;
  }
  if (onlyDetect) {
    process.stdout.write(JSON.stringify(detect(text, { ...(layout === "auto" ? {} : { layout }), ...(threshold === undefined ? {} : { threshold }) }), null, 2) + "\n");
    return;
  }
  const result = fix(text, { layout, ...(threshold === undefined ? {} : { threshold }) });
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else process.stdout.write(result.text + (fromStdin ? nl : "\n"));
}

main(process.argv.slice(2)).catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
