import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const run = (args: string[], input?: string) =>
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

describe("cli", () => {
  it("fixes standard input and keeps its trailing newline", () => {
    expect(run([], "l;ylfu\n")).toBe("สวัสดี\n");
    expect(run([], "ไปกิน l;ylfu กัน")).toBe("ไปกิน สวัสดี กัน");
  });

  it("fixes arguments", () => {
    expect(run(["ไปกิน", "l;ylfu", "กัน"])).toBe("ไปกิน สวัสดี กัน\n");
  });

  it("--to re-types everything", () => {
    expect(run(["--to", "th", "l;ylfu"])).toBe("สวัสดี\n");
    expect(run(["--to", "en", "ฟหกด"])).toBe("asdf\n");
    expect(run(["--to", "th", "--layout", "pattachote", "mogmuh"])).toBe("สวัสดี\n");
  });

  it("--json prints spans and confidences", () => {
    const r = JSON.parse(run(["--json", "gxHo"])) as { text: string; spans: Array<{ fixed: string; confidence: number }> };
    expect(r.text).toBe("เป็น");
    expect(r.spans[0]!.fixed).toBe("เป็น");
  });

  it("--detect prints the verdict", () => {
    expect(JSON.parse(run(["--detect", "้ำสสน"]))).toMatchObject({ dir: "th-en", layout: "kedmanee" });
  });

  it("refuses bad options with exit code 2", () => {
    expect(() => run(["--layout", "dvorak", "x"])).toThrow(/unknown layout/);
    expect(() => run(["--to", "fr", "x"])).toThrow(/--to must be/);
    expect(() => run(["--nope"])).toThrow(/unknown option/);
  });

  it("prints help", () => {
    expect(run(["--help"])).toMatch(/Usage/);
  });
});
