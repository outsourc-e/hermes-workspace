import { describe, it, expect, vi, beforeEach } from "vitest";
/**
 * Integration: content fetch monkey-patch (uses jsdom from vitest env)
 * Simulates openai fetch body contains secret → decoy in egress wire.
 */

describe("fetch intercept (content.ts logic port)", () => {
  it("substitutes via substituteExact before fetch", async () => {
    const { substituteExact } = await import("../../packages/ai-protect-core/src/substitute.js");
    const lex = [{ id: "CS_021", secret: "Project Titan", decoy: "Project Atlas", type: "codename" as const }];
    const body = JSON.stringify({ messages: [{ content: "Project Titan status at chatgpt.com" }] });
    const data = JSON.parse(body);
    const r = substituteExact(data.messages[0].content, { policyHash: "h", lexicon: lex });
    data.messages[0].content = r.cleanText;
    expect(data.messages[0].content).toBe("Project Atlas status at chatgpt.com");
    expect(r.map["Project Atlas"]).toBe("Project Titan");
  });
});
