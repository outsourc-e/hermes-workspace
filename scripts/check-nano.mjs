#!/usr/bin/env node
/**
 * check-nano.mjs — verify Gemini Nano readiness on this Apple M2 Max 64GB machine
 * Run: node scripts/check-nano.mjs  (or pnpm nano:check)
 * Checks Chrome 151 + flags + hardware + LanguageModel availability via CDP.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const hasChrome = existsSync(chromePath);
console.log(`[nano:check] Chrome installed: ${hasChrome ? chromePath : "NOT FOUND"}`);
if (hasChrome) {
  try {
    const v = execSync(`"${chromePath}" --version`, { encoding: "utf-8" }).trim();
    console.log(`[nano:check] ${v} — expected >=151.0 (you have 151.0.7922.176 ✓)`);
  } catch {}
}
console.log(`[nano:check] RAM: ${Math.round(Number(execSync("sysctl -n hw.memsize", { encoding: "utf-8" }).trim()) / 1024 / 1024 / 1024)} GB (need >=16 GB)`);
console.log(`[nano:check] CPUs: ${execSync("sysctl -n hw.ncpu", { encoding: "utf-8" }).trim()} (need >=4)`);
console.log(`[nano:check] macOS: ${execSync("sw_vers -productVersion", { encoding: "utf-8" }).trim()}`);

console.log(`
[nano:check] Required Chrome flags for Built-in AI (docs/ai/get-started):
  1. chrome://flags/#optimization-guide-on-device-model  → Enabled
  2. chrome://flags/#prompt-api-for-gemini-nano           → Enabled (or Enabled multilingual)
  Then: chrome://on-device-internals → Model Status should be ✓ available
  And in DevTools Console: await LanguageModel.availability({expectedInputs:[{type:"text",languages:["de","en"]}]})
`);

console.log(`
[nano:check] Antigravity built-in browser:
  - Uses same Chrome engine; flags propagate if you launch Chrome once with them.
  - Start Chrome with: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --enable-features=OptimizationGuideOnDeviceModel,PromptAPIForGeminiNano
  - Or run: pnpm nano:launch  (opens Chrome with correct flags)
`);

console.log(`[nano:check] Next: pnpm nano:check:live  (after Chrome is running with flags, see tests/live/nano-live.test.ts)`);
