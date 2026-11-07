import { z } from "zod";
import { AuditReceiptSchema } from "@ai-protect/shared";

/**
 * Build audit receipt — never contains raw secret/PII, only ids + counts.
 * Caller should Ed25519-sign the JSON canonical string outside (libsodium).
 */
export function buildAuditReceipt(input: {
  policyHash: string;
  policyVersion: string;
  substitutionResult: { hits: { id: string; source: string }[] };
  host: string;
  riskTier?: "low" | "high" | "critical";
}): z.infer<typeof AuditReceiptSchema> {
  const allIds = input.substitutionResult.hits.map((h) => h.id);
  const uniqueIds = [...new Set(allIds)];
  const piiCount = input.substitutionResult.hits.filter((h) => !h.id.startsWith("CS_")).length;
  const secretsCount = allIds.length - piiCount;
  const receipt = {
    timestamp: new Date().toISOString(),
    policyHash: input.policyHash,
    policyVersion: input.policyVersion,
    substitutedCount: allIds.length,
    piiSubstitutedCount: piiCount,
    companySecretsSubstitutedCount: secretsCount,
    substitutedIds: uniqueIds,
    host: input.host,
    riskTier: input.riskTier,
  };
  AuditReceiptSchema.parse(receipt);
  return receipt;
}
