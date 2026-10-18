import { describe, it, expect } from "vitest";
import { buildAuditReceipt } from "../../packages/ai-protect-core/src/audit.js";

describe("audit receipt — NIS2 revisionssicher p10, no raw", () => {
  it("contains only ids, no raw secret", () => {
    const r = buildAuditReceipt({
      policyHash: "abc",
      policyVersion: "0.1.0",
      substitutionResult: { hits: [{ id: "CS_021", source: "exact" }, { id: "EMAIL", source: "regex" }] },
      host: "chatgpt.com",
      riskTier: "high",
    });
    expect(r.substitutedCount).toBe(2);
    expect(r.piiSubstitutedCount).toBe(1);
    expect(r.companySecretsSubstitutedCount).toBe(1);
    expect(r.substitutedIds).toContain("CS_021");
    expect(JSON.stringify(r)).not.toContain("Project Titan");
  });
});
