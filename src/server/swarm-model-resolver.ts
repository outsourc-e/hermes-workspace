/**
 * Parse a swarm roster `model:` field into the concrete `provider` + `default`
 * model id pair that Hermes Agent's `config.yaml` expects.
 *
 * The roster YAML carries a `provider/model-id` string (e.g.
 * "openai-codex/gpt-5.5", "deepseek/deepseek-v4-pro",
 * "custom:my-gateway/org/model-id").
 * This parser extracts the provider and model-id components.
 *
 * Returns `null` when the label is empty, blank, or does not match the
 * expected `provider/model-id` format.
 */

export type ResolvedSwarmModel = {
  provider: string
  default: string
}

/**
 * Parse a `provider/model-id` string into { provider, default }.
 * Splits on the first `/` only so providers may contain `:` and model ids may
 * contain additional slashes (e.g. upstream ids like `deepseek-ai/deepseek-v4-pro`).
 * Returns `null` when the label is empty, blank, or unparseable.
 */
export function parseSwarmModelLabel(
  label: string | null | undefined,
): ResolvedSwarmModel | null {
  if (!label) return null
  const trimmed = label.trim()
  if (!trimmed) return null

  const slashIdx = trimmed.indexOf('/')
  if (slashIdx <= 0) return null
  return {
    provider: trimmed.slice(0, slashIdx),
    default: trimmed.slice(slashIdx + 1),
  }
}

export type SwarmModelOption = {
  id: string
  name: string
  provider: string
}

/** Build the swarm.yaml `model:` value from a Hermes provider + upstream model id. */
export function toSwarmModelKey(provider: string, modelId: string): string {
  const p = provider.trim()
  const m = modelId.trim()
  if (!p || p === 'unknown') return m
  if (!m) return p
  // Upstream ids like `minimaxai/minimax-m2.7` may already embed an org prefix that
  // matches a mistaken provider guess — never double-prefix.
  if (m === p || m.startsWith(`${p}/`)) return m
  return `${p}/${m}`
}

export function swarmModelKeyFromOption(m: SwarmModelOption): string {
  return toSwarmModelKey(m.provider, m.id)
}

/**
 * Resolve a roster/profile model string to the canonical swarm.yaml key.
 * Handles legacy values that stored only the upstream model id.
 */
export function resolveSwarmModelKey(
  model: string | null | undefined,
  provider: string | null | undefined,
  options?: Array<SwarmModelOption>,
): string {
  const trimmed = (model ?? '').trim()
  if (!trimmed || trimmed === 'unknown') {
    const p = (provider ?? '').trim()
    return p && p !== 'unknown' ? p : ''
  }

  if (options?.length) {
    if (options.some((m) => swarmModelKeyFromOption(m) === trimmed)) return trimmed
    const byId = options.find((m) => m.id === trimmed)
    if (byId) return swarmModelKeyFromOption(byId)
    const p = (provider ?? '').trim()
    if (p && p !== 'unknown') {
      const combined = toSwarmModelKey(p, trimmed)
      if (options.some((m) => swarmModelKeyFromOption(m) === combined)) return combined
    }
  }

  return trimmed
}
