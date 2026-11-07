import { z } from "zod";

export const LexiconEntrySchema = z.object({
  id: z.string().regex(/^CS_\d+$/),
  secret: z.string().min(2),
  decoy: z.string().min(2),
  type: z.enum(["codename", "pricing_phrase", "strategic", "supplier", "ip_phrase", "other"]),
  caseSensitive: z.boolean().optional().default(false),
  decoyLemmas: z.array(z.string()).optional(),
});

export const ManagedPolicySchema = z.object({
  company_secrets: z.array(LexiconEntrySchema),
  pii: z.object({
    enabled: z.boolean(),
    customRules: z.array(z.object({ label: z.string(), pattern: z.string() })).optional(),
    placeholderStyle: z.enum(["bracketed_index", "custom_label"]),
  }),
  enforcement: z.object({
    forceInstall: z.boolean(),
    antiTamperDevToolsBlock: z.boolean(),
    allowedLLMDomains: z.array(z.string()),
  }),
  version: z.string(),
  policyHash: z.string(),
});

/** Hit schema for Nano structured output: docs/ai/prompt-api structured-output */
export const NanoHitItemSchema = z.object({
  lexId: z.string(), // SecretId or PII label
  surface: z.string(),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  entityType: z.string().optional(), // for PII
});

export const NanoHitResponseSchema = z.object({
  hits: z.array(NanoHitItemSchema),
  riskTier: z.enum(["low", "high", "critical"]).optional(),
});

/** Audit receipt (Ed25519 signed) — revisionssicher per PDF p10 NIS2 */
export const AuditReceiptSchema = z.object({
  timestamp: z.string(), // ISO
  policyHash: z.string(),
  policyVersion: z.string(),
  substitutedCount: z.number().int().min(0),
  piiSubstitutedCount: z.number().int().min(0),
  companySecretsSubstitutedCount: z.number().int().min(0),
  /** never raw secret/PII — only ids + counts */
  substitutedIds: z.array(z.string()),
  host: z.string(),
  userHash: z.string().optional(),
  riskTier: z.enum(["low", "high", "critical"]).optional(),
});

export type LexiconEntryZ = z.infer<typeof LexiconEntrySchema>;
export type ManagedPolicyZ = z.infer<typeof ManagedPolicySchema>;
export type NanoHitResponseZ = z.infer<typeof NanoHitResponseSchema>;
