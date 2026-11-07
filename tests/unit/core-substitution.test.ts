import { describe, it, expect } from "vitest";
import { substituteExact, rehydrateFull } from "@ai-protect/core/substitute";
import { StreamingRehydrator } from "@ai-protect/core/rehydrator";

const LEX = [
  { id: "CS_021", secret: "Project Titan", decoy: "Project Atlas", type: "codename" as const },
  { id: "CS_022", secret: "Project Titan Phase 2", decoy: "Project Atlas Phase 2", type: "codename" as const },
  { id: "CS_033", secret: "Halbleiter-Quellcode V4", decoy: "Modul-Quellcode V4", type: "ip_phrase" as const },
  { id: "CS_042", secret: "Lithium-Preis 47€/kg", decoy: "Komponentenpreis 48€/kg", type: "pricing_phrase" as const },
  { id: "CS_088", secret: "Kunden-Joint-Venture Verhandlung 15.7%", decoy: "Partner-Kooperation", type: "strategic" as const },
];

describe("substituteExact — longest-first", () => {
  it("prefers longest phrase Project Titan Phase 2", () => {
    const r = substituteExact("Status: Project Titan Phase 2 heute", { policyHash: "h", lexicon: LEX });
    expect(r.cleanText).toBe("Status: Project Atlas Phase 2 heute");
    expect(r.map["Project Atlas Phase 2"]).toBe("Project Titan Phase 2");
    expect(r.hits.some((h) => h.id === "CS_022")).toBe(true);
    expect(r.hits.some((h) => h.id === "CS_021")).toBe(false);
  });

  it("single phrase Project Titan", () => {
    const r = substituteExact("Project Titan Status", { policyHash: "h", lexicon: LEX });
    expect(r.cleanText).toBe("Project Atlas Status");
  });

  it("PII regex still runs after secrets (deck p9 Max Müller → [PERSON_1])", () => {
    const r = substituteExact("Max Müller max.mueller@example.com", { policyHash: "h", lexicon: [] });
    expect(r.cleanText).toContain("[EMAIL_1]");
  });

  it("combined secrets + PII", () => {
    const r = substituteExact("Project Titan email max.mueller@example.com", { policyHash: "h", lexicon: LEX });
    expect(r.cleanText).toBe("Project Atlas email [EMAIL_1]");
  });
});

describe("rehydrateFull", () => {
  it("rehydrates decoy → secret word-boundary safe", () => {
    const map = { "Project Atlas": "Project Titan" };
    expect(rehydrateFull("The Project Atlas timeline is tbd. Project Атлас not replaced.", map)).toBe(
      "The Project Titan timeline is tbd. Project Атлас not replaced."
    );
  });

  it("rehydrates placeholder [PERSON_1] style (deck p9)", () => {
    const map = { "[PERSON_1]": "Max Müller" };
    expect(rehydrateFull("Hi [PERSON_1], please review", map)).toBe("Hi Max Müller, please review");
  });

  it("idempotent property", () => {
    const lex = [{ id: "CS_900", secret: "A B", decoy: "X Y", type: "other" as const }];
    const orig = "A B then C D";
    const r = substituteExact(orig, { policyHash: "h", lexicon: lex });
    const re = rehydrateFull(r.cleanText, r.map);
    expect(re).toBe(orig);
    // ensure decoy present only in cleanText
    expect(r.cleanText).toBe("X Y then C D");
  });
});

describe("StreamingRehydrator — handles chunk split", () => {
  it("handles decoy split across chunks (buffered flush)", () => {
    const map = { "Project Atlas Phase 2": "Project Titan Phase 2" };
    const rh = new StreamingRehydrator(map);
    rh.push("The Pro");
    rh.push("ject Atlas Phase 2 plan");
    const flushed = rh.flush();
    expect(flushed).toBe("The Project Titan Phase 2 plan");
  });
  it("flushIncremental also works", () => {
    const map = { "[PERSON_1]": "Max Müller" };
    const rh = new StreamingRehydrator(map);
    rh.push("Hello [PER");
    rh.push("SON_1], please");
    expect(rh.flush()).toBe("Hello Max Müller, please");
  });
});
