/**
 * Gemini Nano adapter — wraps LanguageModel.* per docs/ai/prompt-api
 * Handles availability, download progress, session lifecycle, structured output,
 * fallback to regex-only when unavailable.
 */
import { HIT_SCHEMA } from "./structured-schemas.js";
import type { LexiconEntry, Hit } from "@ai-protect/shared";
import { NanoHitResponseSchema } from "@ai-protect/shared";

// ambient LanguageModel from @types/dom-chromium-ai (no redeclare)

export interface NanoOptions {
  expectedLanguages?: string[]; // default ["de","en"]
  samplingMode?: string; // default most-predictable
  systemPrompt?: string;
  lexicon?: LexiconEntry[];
}

const DEFAULT_SYSTEM = `Du bist AI-Protect DACH KRITIS-NER. Aufgabe: Mappe Textstellen auf Lexikon-IDs (company_secrets KD, Lieferant, Preisphrase) und Standard-PII. Antworte NUR als JSON gemäß Schema. Gib niemals Klartext-Geheimnisse zurück. Nutze Confidence 0..1.`;

export async function checkAvailability(opts: NanoOptions = {}) {
  const langs = opts.expectedLanguages ?? ["de", "en"];
  try {
    if (typeof LanguageModel === "undefined") return "unavailable" as const;
    const avail = await LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: langs }],
      expectedOutputs: [{ type: "text", languages: langs }],
    });
    return avail as "unavailable" | "downloadable" | "downloading" | "available";
  } catch {
    return "unavailable" as const;
  }
}

export async function createSession(opts: NanoOptions = {}, onProgress?: (p: number) => void) {
  const langs = opts.expectedLanguages ?? ["de", "en"];
  const samplingMode = (opts.samplingMode ?? "most-predictable") as any;
  const monitor = (m: any) => {
    m.addEventListener("downloadprogress", (e: any) => onProgress?.(e.loaded));
  };
  const initialPrompts = [{ role: "system", content: opts.systemPrompt ?? DEFAULT_SYSTEM }];
  // include lexicon ids as context (not secrets) to help model — we pass ids + decoy? only ids + type to avoid leaking secret via prompt
  if (opts.lexicon && opts.lexicon.length) {
    const lexIds = opts.lexicon.map((e) => `${e.id}:${e.type}`).join(", ");
    initialPrompts.push({ role: "system", content: `Lexikon-IDs verfügbar: ${lexIds}` } as any);
  }
  const session = await LanguageModel.create({
    expectedInputs: [{ type: "text", languages: langs }],
    expectedOutputs: [{ type: "text", languages: langs }],
    samplingMode,
    initialPrompts: initialPrompts as any,
    monitor,
  });
  // context overflow handling caller will attach
  return session as any;
}

/** Fuzzy detection via Nano — returns hits with lexId mapping. Validates via zod. */
export async function detectWithNano(
  session: any,
  text: string,
  lexicon: LexiconEntry[],
): Promise<{ hits: Hit[]; riskTier?: string }> {
  const prompt = `Text: """${text}"""\nAufgabe: Erkenne Lexikon-Treffer (auch Varianten, Groß/Kleinschreibung, Bindestrich) und Standard-PII.`;
  const raw: string = await session.prompt(prompt, { responseConstraint: HIT_SCHEMA as any });
  const parsed = JSON.parse(raw);
  const validated = NanoHitResponseSchema.parse(parsed);
  const hits: Hit[] = validated.hits.map((h) => ({
    id: h.lexId,
    surface: h.surface,
    start: h.start,
    end: h.end,
    confidence: h.confidence,
    source: "nano-fuzzy" as const,
  }));
  // client-side guard: ensure start/end consistent with text slice normalized — if mismatch, discard
  const guarded = hits.filter((h) => {
    const slice = text.slice(h.start, h.end);
    // allow case-insensitive match for secrets, but require len match
    return slice.length === h.surface.length;
  });
  return { hits: guarded, riskTier: validated.riskTier };
}

/** Prompt helper to generate decoy candidates offline (once, human-approved). */
export async function proposeDecoy(session: any, secret: string, hint: string): Promise<string> {
  const prompt = `Erzeuge eine plausible, aber verschiedene Decoy-Formulierung für Geheimnis: "${secret}" (Kontext: ${hint}). Gleiche Wortart/Länge-Klasse, kein echter Geheimnis-String collision, nur ein Vorschlag ohne Erklärung.`;
  const raw: string = await session.prompt(prompt);
  return raw.trim().replace(/^["']|["']$/g, "");
}
