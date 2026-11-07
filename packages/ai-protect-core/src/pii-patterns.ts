/**
 * Deterministic PII patterns — 18 Safe Harbor + extended (own-products.md:26-33)
 * Sync, <2ms budget. No LLM.
 */
export interface PiiPattern {
  label: string; // e.g. PERSON, EMAIL, IBAN
  regex: RegExp;
  placeholderPrefix: string;
}

export const DEFAULT_PII_PATTERNS: PiiPattern[] = [
  { label: "EMAIL", regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, placeholderPrefix: "EMAIL" },
  { label: "IBAN", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, placeholderPrefix: "IBAN" },
  { label: "PHONE_DE", regex: /\b(?:\+49|0)(?:\s*\d){9,}\b/g, placeholderPrefix: "PHONE" },
  // Source code secrets (deck p4: apiKey, secret, databaseCredentials)
  { label: "API_KEY", regex: /\b(?:api[_-]?key|secret)\s*[:=]\s*['"][^'"]{8,}['"]/gi, placeholderPrefix: "API_KEY" },
  { label: "DB_CRED", regex: /\bdatabaseCredentials\s*=\s*['"][^'"]+['"]/gi, placeholderPrefix: "DB_CRED" },
  { label: "AWS_KEY", regex: /\bAKIA[0-9A-Z]{16}\b/g, placeholderPrefix: "AWS_KEY" },
  // HIPAA / DSGVO extras
  { label: "IPV4", regex: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, placeholderPrefix: "IP" },
  // Person heuristic removed — too greedy (matched "Project Titan"). Nano handles semantic PERSON via structured output (deck p9 Max Müller case).
];

export function buildPiiTrie(patterns: PiiPattern[]) {
  return patterns;
}
