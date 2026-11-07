/** Primitive branded IDs */
export type SecretId = string; // e.g. "CS_021"
export type PolicyHash = string; // sha256 of managed config

/** Detection hit unified */
export interface Hit {
  /** For PII: entity type, for company_secrets: lexId */
  id: string;
  /** matched surface string as typed */
  surface: string;
  start: number;
  end: number;
  /** confidence 0..1 (regex=1, Nano= model) */
  confidence: number;
  /** provenance */
  source: "exact" | "regex" | "nano-fuzzy";
}

export interface SubstitutionResult {
  cleanText: string;
  /** map decoy/placeholder -> original secret/PII surface */
  map: Record<string, string>;
  /** reverse map for audit */
  reverseMap: Record<string, string>;
  hits: Hit[];
  /** policy version used */
  policyHash: PolicyHash;
}

export interface LexiconEntry {
  id: SecretId;
  secret: string;
  decoy: string;
  type: "codename" | "pricing_phrase" | "strategic" | "supplier" | "ip_phrase" | "other";
  caseSensitive?: boolean;
  /** optional lemma variants for rehydration, e.g. ["Atlas", "Atlasses"] */
  decoyLemmas?: string[];
}

export interface ManagedPolicy {
  company_secrets: LexiconEntry[];
  /** standard PII toggles + EU AI Act mapping toggles */
  pii: {
    enabled: boolean;
    customRules?: { label: string; pattern: string }[];
    /** maps PII label -> placeholder, e.g. PERSON -> [PERSON_1] */
    placeholderStyle: "bracketed_index" | "custom_label";
  };
  enforcement: {
    forceInstall: boolean;
    antiTamperDevToolsBlock: boolean;
    allowedLLMDomains: string[]; // chatgpt.com, claude.ai, etc.
  };
  version: string;
  policyHash: PolicyHash;
}

export type NanoAvailability = "unavailable" | "downloadable" | "downloading" | "available";
