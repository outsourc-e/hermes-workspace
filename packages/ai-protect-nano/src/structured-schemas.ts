/** JSON Schemas for Prompt API responseConstraint (docs/ai/prompt-api structured-output) */
export const HIT_SCHEMA = {
  type: "object",
  properties: {
    hits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lexId: { type: "string", description: "Lexicon id e.g. CS_021 or PII label" },
          surface: { type: "string", description: "surface form as typed" },
          start: { type: "integer" },
          end: { type: "integer" },
          confidence: { type: "number" },
          entityType: { type: "string" },
        },
        required: ["lexId", "surface", "start", "end", "confidence"],
        additionalProperties: false,
      },
    },
    riskTier: { type: "string", enum: ["low", "high", "critical"] },
  },
  required: ["hits"],
  additionalProperties: false,
} as const;
