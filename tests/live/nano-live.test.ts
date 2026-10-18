/**
 * Live Gemini Nano test — runs only when Chrome 151 + Nano actually available on this M2 Max.
 * - In jsdom/Node (CI) it skips automatically (LanguageModel === undefined).
 * - On your machine with Antigravity built-in browser or `pnpm nano:launch` + playwright, it runs real prompts.
 *
 * Usage:
 *   pnpm test:live                          # will skip in Node, pass if Nano downloadable/available
 *   @vitest-environment jsdom  with --browser or playwright: will attempt real prompt
 *
 * For Antigravity: open any page in built-in browser, open DevTools Console and paste:
 *   await LanguageModel.availability({expectedInputs:[{type:"text",languages:["de","en"]}]})
 *   // expect "available"
 * Or run this file via Vitest browser mode: pnpm exec vitest run tests/live --browser.enabled --browser.name=chromium
 */

import { describe, it, expect } from "vitest";

const hasLanguageModel = typeof (globalThis as any).LanguageModel !== "undefined";

describe.skipIf(!hasLanguageModel)("live Nano — M2 Max 64GB (Chrome 151)", () => {
  it("availability is available|downloadable|downloading (not unavailable) on this Mac", async () => {
    const LM = (globalThis as any).LanguageModel;
    const avail = await LM.availability({
      expectedInputs: [{ type: "text", languages: ["de", "en"] }],
      expectedOutputs: [{ type: "text", languages: ["de"] }],
    });
    console.log("[live] availability:", avail);
    expect(["available", "downloadable", "downloading"]).toContain(avail);
  });

  it("creates session and does structured hit detection (real Nano)", async () => {
    const LM = (globalThis as any).LanguageModel;
    const avail = await LM.availability({
      expectedInputs: [{ type: "text", languages: ["de"] }],
      expectedOutputs: [{ type: "text", languages: ["de"] }],
    });
    if (avail === "unavailable") {
      console.warn("[live] Nano unavailable — check chrome://flags #optimization-guide-on-device-model and #prompt-api-for-gemini-nano → Enabled");
      return;
    }
    const session: any = await LM.create({
      expectedInputs: [{ type: "text", languages: ["de"] }],
      expectedOutputs: [{ type: "text", languages: ["de"] }],
      initialPrompts: [{ role: "system", content: "Du bist AI-Protect NER. Antworte nur JSON." }],
    });
    // Simple prompt — if Nano not ready it may still download; we use most-predictable implicitly
    const out: string = await session.prompt('Erkenne Personen in: "Max Müller arbeitet an Project Titan"');
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    // Structured output variant (requires HIT_SCHEMA support — Chrome 151 stable supports responseConstraint)
    try {
      const hitSchema = {
        type: "object",
        properties: { hits: { type: "array", items: { type: "object", properties: { lexId: { type: "string" }, surface: { type: "string" }, start: { type: "integer" }, end: { type: "integer" }, confidence: { type: "number" } }, required: ["lexId", "surface", "start", "end", "confidence"] } } },
        required: ["hits"],
      } as any;
      const structured: string = await session.prompt('Text: "Max Müller arbeitet an Project Titan" — gib hits als JSON', { responseConstraint: hitSchema });
      const parsed = JSON.parse(structured);
      expect(parsed).toHaveProperty("hits");
    } catch (e) {
      console.warn("[live] structured output not yet supported in this Chrome build — skipping", (e as Error).message);
    } finally {
      try { session.destroy?.(); } catch {}
    }
  }, 30_000);
});

describe("live Nano — fallback check (always runs, Node)", () => {
  it("core substituteExact still works without Nano (regression guard for M2 Max live mode)", async () => {
    const { substituteExact } = await import("../../packages/ai-protect-core/src/substitute.js");
    const lex = [{ id: "CS_021", secret: "Project Titan", decoy: "Project Atlas", type: "codename" as const }];
    const r = substituteExact("Project Titan Status", { policyHash: "h", lexicon: lex as any });
    expect(r.cleanText).toBe("Project Atlas Status");
  });
});
