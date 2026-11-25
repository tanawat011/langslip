import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: false,
    target: "es2020",
    platform: "neutral",
    treeshake: true,
  },
  {
    // one file for <script> tags and the demo page: window.langslip
    entry: { "langslip.global": "src/index.ts" },
    format: ["iife"],
    globalName: "langslip",
    minify: true,
    target: "es2020",
    platform: "browser",
    outExtension: () => ({ js: ".js" }),
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    banner: { js: "#!/usr/bin/env node" },
    define: { __VERSION__: JSON.stringify(version) },
  },
]);
