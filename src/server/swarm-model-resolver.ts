/**
 * Resolve a roster `model:` display string (e.g. "Opus 4.7", "GPT-5.5",
 * "PC1 Coder") into the concrete `provider` + `default` model id pair
 * that Hermes Agent's `config.yaml` expects.
 *
 * The roster YAML carries a human-friendly label so the Swarm UI can
 * render it without a lookup. The runtime needs the precise ids though,
 * because `hermes` invokes its provider plugins by id.
 *
 * This resolver is intentionally string-matching + tolerant: unknown
 * labels return `null` and the caller is expected to leave the existing
 * profile config alone (so a typo in the roster never wedges a worker).
 */

export type ResolvedSwarmModel = {
  provider: string
  default: string
}

/**
 * Map a roster `model:` label to a Hermes Agent provider+model. The label
 * comparison is case-insensitive and ignores extra whitespace. Returns
 * `null` when the label is empty, blank, or unrecognised.
 */
export function resolveSwarmModelLabel(
  label: string | null | undefined,
): ResolvedSwarmModel | null {
  if (!label) return null
  const normalized = label.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized || normalized === 'worker') return null

  // Anthropic Claude family
  if (/^opus\s*4\.7$|^claude\s*opus\s*4\.7$/.test(normalized)) {
    return { provider: 'anthropic-oauth', default: 'claude-opus-4-7' }
  }
  if (/^opus\s*4\.6$|^claude\s*opus\s*4\.6$/.test(normalized)) {
    return { provider: 'anthropic-oauth', default: 'claude-opus-4-6' }
  }
  if (/^opus\s*4\.5$|^claude\s*opus\s*4\.5$/.test(normalized)) {
    return { provider: 'anthropic-oauth', default: 'claude-opus-4-5' }
  }
  if (/^sonnet\s*4\.6$|^claude\s*sonnet\s*4\.6$/.test(normalized)) {
    return { provider: 'anthropic-oauth', default: 'claude-sonnet-4-6' }
  }
  if (/^sonnet\s*4\.5$|^claude\s*sonnet\s*4\.5$/.test(normalized)) {
    return { provider: 'anthropic', default: 'claude-sonnet-4-5' }
  }

  // OpenAI Codex family
  if (/^gpt[- ]?5\.5$|^codex\s*\(?gpt[- ]?5\.5\)?$/.test(normalized)) {
    return { provider: 'openai-codex', default: 'gpt-5.5' }
  }
  if (/^gpt[- ]?5\.4$|^codex\s*\(?gpt[- ]?5\.4\)?$/.test(normalized)) {
    return { provider: 'openai-codex', default: 'gpt-5.4' }
  }
  if (/^gpt[- ]?5\.3[- ]codex(?:[- ]?spark)?$/.test(normalized)) {
    return { provider: 'openai-codex', default: 'gpt-5.3-codex-spark' }
  }

  // MiniMax
  if (/^minimax(?:\s*m)?\s*2\.7$|^minimax m?2\.7$/.test(normalized)) {
    return { provider: 'minimax', default: 'MiniMax-M2.7' }
  }
  if (/^minimax(?:\s*m)?\s*2\.7[- ]lightning$/.test(normalized)) {
    return { provider: 'minimax', default: 'MiniMax-M2.7-Lightning' }
  }

  // Local PC1 / PC2 — match by suffix only because labels include speed
  // qualifiers ("PC1 Coder (97 TPS)") that we want to ignore.
  if (/^pc1[\s-]coder/.test(normalized)) {
    return {
      provider: 'ollama-pc1',
      default: 'qwen3-coder-30b-fixed:latest',
    }
  }
  if (/^pc1[\s-]planner/.test(normalized)) {
    return { provider: 'ollama-pc1', default: 'pc1-planner:latest' }
  }
  if (/^pc1[\s-]critic/.test(normalized)) {
    return { provider: 'ollama-pc1', default: 'pc1-critic:latest' }
  }
  if (/^pc1[\s-]score|^pc1[\s-]scorer/.test(normalized)) {
    return { provider: 'ollama-pc1', default: 'pc1-scorer:latest' }
  }
  if (/^pc1[\s-]quality/.test(normalized)) {
    return {
      provider: 'ollama-pc1',
      default: 'hf.co/unsloth/Qwen3.5-27B-GGUF:Q4_K_M',
    }
  }
  if (/^pc1[\s-]fast/.test(normalized)) {
    return { provider: 'ollama-pc1', default: 'qwen3-14b-fixed:latest' }
  }
  if (/^pc1[\s-]think/.test(normalized)) {
    return { provider: 'ollama-pc1', default: 'deepseek-r1-32b-fixed:latest' }
  }
  if (/^pc1[\s-]qwen30b/.test(normalized)) {
    return { provider: 'ollama-pc1', default: 'qwen3-30b-a3b-fixed:latest' }
  }

  // Provider-prefixed full id (already in canonical form). Pass through.
  const slashMatch = label.trim().match(/^([\w.-]+)\/(.+)$/)
  if (slashMatch) {
    return { provider: slashMatch[1], default: slashMatch[2] }
  }

  return null
}
