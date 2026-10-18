import { describe, it, expect } from "vitest";
import { substituteExact } from "../../packages/ai-protect-core/src/substitute.js";

describe("perf: tinybench style", () => {
  it("benchmark 14.5TB replay shape (2000 iterations)", () => {
    const lex = Array.from({ length: 50 }, (_, i) => ({ id: `CS_${i}`, secret: `Secret${i}_phrase`, decoy: `Decoy${i}_phrase`, type: "other" as const }));
    const sample = "Project Titan and Secret5_phrase with max.mueller@example.com and Lithium-Preis 47€/kg";
    // warmup
    for (let i = 0; i < 100; i++) substituteExact(sample, { policyHash: "h", lexicon: lex });
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) substituteExact(sample, { policyHash: "h", lexicon: lex });
    const dur = performance.now() - t0;
    const p95estimate = dur / 2000;
    expect(p95estimate).toBeLessThan(2); // budget from deck performance panel analogy
  });
});
