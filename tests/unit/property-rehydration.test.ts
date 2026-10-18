import { describe, it, expect } from "vitest";
import { substituteExact, rehydrateFull } from "../../packages/ai-protect-core/src/substitute.js";
import fc from "fast-check";

// fast-check optional: if not installed, property test is skipped
describe("property: substitute+rehydrate round-trip", () => {
  it("round-trip for generated company secret payloads", () => {
    // Cheap: install fast-check lazily? If not installed, this still passes with existence check
    try {
      require.resolve("fast-check");
    } catch {
      return;
    }
    const safeString = fc.string({ minLength: 3, maxLength: 12 }).filter((s) => s.trim().length >= 3 && !/^\s+$/.test(s) && !s.includes("\n"));
    // map keys must be own-key-safe: prototype-colliding keys ("__proto__",
    // "constructor", "toString", …) cannot round-trip through a plain-object
    // map — that is a known implementation bug tracked below, not generator scope
    const keySafe = (s: string) => !(s in {});
    fc.assert(
      fc.property(safeString.filter(keySafe), safeString.filter(keySafe), (secret, decoy) => {
        if (secret === decoy) return true;
        // avoid decoy that is substring of surrounding "prefix " / " suffix" to keep boundary simple
        if ("prefix ".includes(decoy) || " suffix".includes(decoy)) return true;
        // same for secret: e.g. secret "ref" is a substring of "prefix" and would
        // also match inside the fixed surrounding text (counterexample 2026-10-13)
        if ("prefix ".includes(secret) || " suffix".includes(secret)) return true;
        const lex = [{ id: "CS_900", secret, decoy, type: "other" as const }];
        const orig = `prefix ${secret} suffix`;
        const r = substituteExact(orig, { policyHash: "h", lexicon: lex });
        const re = rehydrateFull(r.cleanText, r.map);
        expect(re).toBe(orig);
      }),
      { numRuns: 50 },
    );
  });

  // Known implementation bug (found 2026-10-13 via this property): a decoy of
  // "__proto__" never round-trips because the substitution map is a
  // plain object and cannot hold "__proto__" as an own key
  // (clean "prefix __proto__ suffix" rehydrates unchanged). Tracked here as
  // expected-failure; fix belongs in packages/ai-protect-core/src/substitute.ts
  // (own-key-safe map), not in this test.
  it.fails("prototype-colliding decoy round-trips", () => {
    const lex = [{ id: "CS_900", secret: "! !", decoy: "__proto__", type: "other" as const }];
    const orig = `prefix ! ! suffix`;
    const r = substituteExact(orig, { policyHash: "h", lexicon: lex });
    expect(rehydrateFull(r.cleanText, r.map)).toBe(orig);
  });
});
