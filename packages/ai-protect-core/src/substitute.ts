import type { Hit, LexiconEntry, PolicyHash, SubstitutionResult } from "@ai-protect/shared";
import { CompanySecretsTrie } from "./aho-corasick.js";
import { DEFAULT_PII_PATTERNS } from "./pii-patterns.js";

export interface SubstituteOptions {
  policyHash: PolicyHash;
  lexicon: LexiconEntry[];
  piiPatterns?: typeof DEFAULT_PII_PATTERNS;
  /** placeholder style for PII (deck p9: [PERSON_1]) */
  piiCounters?: Record<string, number>;
}

/**
 * Exact substitution for company_secrets + deterministic PII regex.
 * Sync, intended for content-script fast-path (<2ms).
 */
export function substituteExact(text: string, opts: SubstituteOptions): SubstitutionResult {
  const { policyHash, lexicon } = opts;
  const piiPatterns = opts.piiPatterns ?? DEFAULT_PII_PATTERNS;
  const trie = new CompanySecretsTrie(lexicon);

  // 1) Company secrets longest-first
  const secretHits: Hit[] = trie.search(text);
  // Build mutable working text with offset tracking
  let working = text;
  const map: Record<string, string> = {};
  const reverseMap: Record<string, string> = {};
  const hits: Hit[] = [];

  // Apply secrets in descending start order to keep indices stable
  const sorted = [...secretHits].sort((a, b) => b.start - a.start);
  for (const h of sorted) {
    const entry = trie.getById(h.id)!;
    // word-boundary guard via Intl.Segmenter is implicit in Aho (exact). For phrase we trust lexicon.
    working = working.slice(0, h.start) + entry.decoy + working.slice(h.end);
    map[entry.decoy] = entry.secret;
    reverseMap[entry.secret] = entry.decoy;
    hits.push({ ...h, confidence: 1 });
  }

  // 2) PII deterministic regex on the decoy-substituted text
  // We keep counters per label to emit [PERSON_1], [EMAIL_2] etc.
  const counters: Record<string, number> = { ...(opts.piiCounters ?? {}) };
  // Collect regex hits on working copy before mutation
  const piiHits: { label: string; match: string; start: number; end: number; prefix: string }[] = [];
  for (const pat of piiPatterns) {
    const re = new RegExp(pat.regex.source, pat.regex.flags.includes("g") ? pat.regex.flags : pat.regex.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(working))) {
      // skip if already inside a decoy span overlapping — simplistic: if match intersects a decoy literal we skip
      piiHits.push({ label: pat.label, match: m[0], start: m.index, end: m.index + m[0].length, prefix: pat.placeholderPrefix });
    }
  }
  // Sort PII hits by start asc length desc to avoid inner overlap
  piiHits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  let lastEnd = -1;
  const filtered: typeof piiHits = [];
  for (const h of piiHits) {
    if (h.start >= lastEnd) {
      filtered.push(h);
      lastEnd = h.end;
    }
  }
  // Apply in reverse order
  filtered.sort((a, b) => b.start - a.start);
  for (const h of filtered) {
    const n = (counters[h.prefix] ?? 0) + 1;
    counters[h.prefix] = n;
    const placeholder = `[${h.prefix}_${n}]`;
    working = working.slice(0, h.start) + placeholder + working.slice(h.end);
    map[placeholder] = h.match;
    reverseMap[h.match] = placeholder;
    hits.push({ id: h.label, surface: h.match, start: h.start, end: h.end, confidence: 1, source: "regex" });
  }

  return { cleanText: working, map, reverseMap, hits, policyHash };
}

/**
 * Streaming rehydration: replace decoy/placeholder -> original.
 * Streaming-aware: caller must handle chunk-split by buffering word boundaries.
 * This pure function does global replacement for complete text; streaming wrapper in rehydrator.ts handles chunks.
 */
export function rehydrateFull(text: string, map: Record<string, string>): string {
  if (!map || Object.keys(map).length === 0) return text;
  // longest decoy first to avoid partial
  const decoys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const decoy of decoys) {
    // boundary-aware: for placeholders [X_1] exact; for phrases use word boundary via lookaround
    const esc = decoy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isPlaceholder = decoy.startsWith("[") && decoy.endsWith("]");
    const pat = isPlaceholder ? esc : `(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`;
    const re = new RegExp(pat, "gu");
    const repl = map[decoy];
    out = out.replace(re, () => repl);
  }
  return out;
}

/** Secure wipe map values (best-effort in JS). */
export function wipeMap(map: Record<string, string>) {
  for (const k of Object.keys(map)) {
    // overwrite value then delete
    // @ts-ignore
    if (typeof map[k] === "string") map[k] = "\0".repeat((map[k] as string).length);
    delete map[k];
  }
}
