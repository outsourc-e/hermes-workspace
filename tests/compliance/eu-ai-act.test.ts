import { describe, it, expect } from "vitest";
import { LEAKAGE_RATES_LAYERX_2026 } from "../../packages/ai-protect-shared/src/constants.js";
import { ManagedPolicySchema } from "../../packages/ai-protect-shared/src/schemas.js";

describe("compliance — EU AI Act / leakage thresholds", () => {
  it("LayerX 2026 thresholds are present for regression", () => {
    expect(LEAKAGE_RATES_LAYERX_2026["DeepSeek"]).toBeCloseTo(12.63);
    expect(LEAKAGE_RATES_LAYERX_2026["Copilot M365"]).toBeCloseTo(3.65);
  });
  it("policy schema enforces audit-relevant fields", () => {
    expect(() => ManagedPolicySchema.parse({ company_secrets: [], pii: { enabled: true, placeholderStyle: "bracketed_index" }, enforcement: { forceInstall: true, antiTamperDevToolsBlock: true, allowedLLMDomains: ["chatgpt.com"] }, version: "0.1.0", policyHash: "abc" })).not.toThrow();
  });
});
