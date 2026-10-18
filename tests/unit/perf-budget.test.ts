import { describe, it, expect } from "vitest";
import { substituteExact } from "../../packages/ai-protect-core/src/substitute.js";

describe("perf budget exact (deck 14.5TB replay) — tuned for M2 Max 64GB", () => {
  it("p95 < 1.0ms on M2 Max (was <2ms generic) + p50 < 0.5ms", () => {
    const lex = Array.from({ length: 50 }, (_, i) => ({ id: `CS_${300 + i}`, secret: `Secret${i}_phrase_longer`, decoy: `Decoy${i}_phrase_longer`, type: "other" as const }));
    const times: number[] = [];
    // warmup JIT
    for (let i = 0; i < 200; i++) substituteExact(`Hello Secret5_phrase_longer and max.mueller@example.com and Secret19_phrase_longer`, { policyHash: "h", lexicon: lex });
    for (let i = 0; i < 5000; i++) {
      const t0 = performance.now();
      substituteExact(`Hello Secret5_phrase_longer and max.mueller@example.com and Secret19_phrase_longer and Lithium-Preis 47€/kg`, { policyHash: "h", lexicon: lex });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    const p50 = times[Math.floor(times.length * 0.5)];
    console.log(`[perf M2 Max] p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms (target p95<1.0ms)`);
    expect(p95).toBeLessThan(1.0);
    expect(p50).toBeLessThan(0.5);
  });
});
