// LLM allow-list — 9–11 UIs from own-products.md:33 + PDF
export const DEFAULT_ALLOWED_LLM_DOMAINS = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "copilot.cloud.microsoft",
  "www.deepseek.com",
  "chat.deepseek.com",
  "perplexity.ai",
  "qwen.ai",
  "kimi.moonshot.cn",
] as const;

// Placeholder style for PII (deck p9: [PERSON_1])
export const PII_PLACEHOLDER_PREFIXES: Record<string, string> = {
  PERSON: "PERSON",
  EMAIL: "EMAIL",
  IBAN: "IBAN",
  PHONE: "PHONE",
  API_KEY: "API_KEY",
  DATABASE_CREDENTIALS: "DB_CRED",
};

// Sampling mode enum from docs/ai/prompt-api
export const SAMPLING_MODES = [
  "most-predictable",
  "predictable",
  "slightly-predictable",
  "balanced",
  "slightly-creative",
  "creative",
  "most-creative",
] as const;

// Risk assessment matrix defaults (deck p1)
export const RISK_MATRIX_DEFAULTS = {
  dataFlowTBPerMonth: 14.5,
  shadowAIDetectedThreshold: 1280,
  browserVulnIdx: 8.5,
  threatMitigationRate: 0.95,
  uptime: 0.999,
};

// Leakage rates LayerX 2026 (deck p5) — used as regression thresholds in tests/perf
export const LEAKAGE_RATES_LAYERX_2026: Record<string, number> = {
  DeepSeek: 12.63,
  ChatGPT: 8.38,
  Copilot: 8.31,
  Claude: 6.43,
  "Gemini Enterprise": 6.14,
  Gemini: 4.5,
  "Copilot M365": 3.65,
};

// PDF p7 gap matrix labels
export const GAP_MATRIX = {
  firewallSSE: "Blockiert IPs/URLs, blind in HTTPS",
  endpointDLP: "Blockiert USB/Downloads, blind Copy&Paste Browser-Feld",
  casb: "Schützt nur sanktionierte M365, keine persönlichen SaaS-Accounts",
  lastMile: "Das Eingabefeld — hier werden vertrauliche Daten verschlüsselt an fremde LLMs gesendet",
};
