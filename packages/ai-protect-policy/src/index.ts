import { ManagedPolicySchema } from "@ai-protect/shared";
import type { ManagedPolicy, PolicyHash } from "@ai-protect/shared";
import { createHash } from "node:crypto";

export function hashPolicy(policy: Omit<ManagedPolicy, "policyHash">): PolicyHash {
  const canonical = JSON.stringify(policy, Object.keys(policy).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export function validatePolicy(raw: unknown): ManagedPolicy {
  return ManagedPolicySchema.parse(raw);
}

export function entaRoleSlice(policy: ManagedPolicy, role: string): ManagedPolicy {
  // Example: `developer` sees ip_phrase secrets, `hr` does not — demo slicing
  if (role === "hr") {
    return { ...policy, company_secrets: policy.company_secrets.filter((e) => e.type !== "ip_phrase") };
  }
  return policy;
}

// Example default for local dev
export const DEFAULT_POLICY: Omit<ManagedPolicy, "policyHash"> = {
  company_secrets: [
    { id: "CS_021", secret: "Project Titan", decoy: "Project Atlas", type: "codename" },
    { id: "CS_033", secret: "Halbleiter-Quellcode V4", decoy: "Modul-Quellcode V4", type: "ip_phrase" },
    { id: "CS_042", secret: "Lithium-Preis 47€/kg", decoy: "Komponentenpreis 48€/kg", type: "pricing_phrase" },
    { id: "CS_088", secret: "Kunden-Joint-Venture Verhandlung 15.7%", decoy: "Partner-Kooperation", type: "strategic" },
  ],
  pii: { enabled: true, placeholderStyle: "bracketed_index" },
  enforcement: { forceInstall: true, antiTamperDevToolsBlock: true, allowedLLMDomains: ["chatgpt.com", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "deepseek.com"] },
  version: "0.1.0",
};
