/**
 * Dispatch-time model router for swarm workers.
 *
 * Picks a model tier per task so cheap tasks run on cheap models and hard
 * tasks get the strong ones, instead of every dispatch paying the worker's
 * roster-default price. The roster `model:` stays the worker's default; the
 * router only overrides per dispatch (oneshot `-m` flag / TUI `/model`).
 *
 * Tier ladder (all served via ollama-cloud, verified live):
 *   light     — trivial lookups, acks, one-liners
 *   standard  — routine work: summaries, triage, small edits
 *   heavy     — implementation, debugging, multi-file code work
 *   reasoning — design, planning, tradeoff analysis, audits
 *
 * Classification is a deterministic heuristic (keywords + length). No LLM
 * call: the classifier must never cost more than the savings it buys.
 */

export type SwarmModelTier = 'light' | 'standard' | 'heavy' | 'reasoning'

// Provider-qualified (`ollama-cloud/<model>`) so hermes-agent does NOT
// re-guess the provider from a bare model name. A bare `-m deepseek-v4-flash`
// or `/model deepseek-v4-flash` makes the CLI infer provider `deepseek` /
// `openrouter` (no key) and rewrite the profile config, breaking the worker.
// Qualifying pins it to the keyed ollama-cloud provider.
export const TIER_MODELS: Record<SwarmModelTier, string> = {
  light: 'ollama-cloud/ministral-3:8b',
  standard: 'ollama-cloud/deepseek-v4-flash',
  heavy: 'ollama-cloud/qwen3-coder:480b',
  reasoning: 'ollama-cloud/kimi-k2-thinking',
}

const TIER_ORDER: Array<SwarmModelTier> = [
  'light',
  'standard',
  'heavy',
  'reasoning',
]

/** Keywords that push a task into the heavy (code) tier. */
const HEAVY_PATTERNS =
  /\b(implement|refactor|debug|fix (the |a |this )?bug|write (the |a |unit |integration )?tests?|migrat(e|ion)|build (a |the )?feature|patch|diff|stack ?trace|compile|typecheck|regression|codebase|pull request|merge conflict)\b/i

/** Keywords that push a task into the reasoning tier. */
const REASONING_PATTERNS =
  /\b(design|architect(ure)?|plan (out|the)|strategy|strategi[sz]e|trade-?offs?|evaluate options|root cause|post-?mortem|audit|threat model|security review|prioriti[sz]e|roadmap|decide between|proposal)\b/i

/** Keywords that mark a task as trivial. */
const LIGHT_PATTERNS =
  /\b(reply with|say (ok|hello)|ping|health ?check|acknowledge|list (the |all )?(files|sessions|workers)|status check|are you (up|alive|ready)|sanity check)\b/i

/**
 * Classify a task prompt into a tier. Deterministic, order matters:
 * explicit-trivial wins, then reasoning, then heavy, then length fallback.
 */
export function classifyTaskTier(task: string): SwarmModelTier {
  const text = task.trim()
  if (!text) return 'light'

  if (LIGHT_PATTERNS.test(text) && text.length < 400) return 'light'
  if (REASONING_PATTERNS.test(text)) return 'reasoning'
  if (HEAVY_PATTERNS.test(text)) return 'heavy'

  // Length fallback: short prompts are usually routine, very long prompts
  // carry specs/logs and deserve a stronger model.
  if (text.length < 160) return 'light'
  if (text.length > 2_500) return 'heavy'
  return 'standard'
}

/**
 * Clamp a tier into a worker's allowed band. Workers can pin a band via the
 * roster's optional `modelTiers: [min, max]` (e.g. qa never needs a 480B
 * coder model; the orchestrator should never drop below standard).
 */
export function clampTier(
  tier: SwarmModelTier,
  allowed?: Array<string> | null,
): SwarmModelTier {
  if (!allowed || allowed.length === 0) return tier
  const valid = allowed.filter((t): t is SwarmModelTier =>
    TIER_ORDER.includes(t as SwarmModelTier),
  )
  if (valid.length === 0) return tier
  const idx = TIER_ORDER.indexOf(tier)
  const indices = valid.map((t) => TIER_ORDER.indexOf(t))
  const min = Math.min(...indices)
  const max = Math.max(...indices)
  if (idx < min) return TIER_ORDER[min]
  if (idx > max) return TIER_ORDER[max]
  return tier
}

/** Next tier up, for escalation after a failed/blocked low-tier attempt. */
export function escalateTier(tier: SwarmModelTier): SwarmModelTier | null {
  const idx = TIER_ORDER.indexOf(tier)
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}

/**
 * Next tier down, for cost right-sizing when the worker's record proves the
 * cheaper model handles its workload. Reasoning tasks are never demoted —
 * design/audit quality is not worth trading for speed.
 */
export function demoteTier(tier: SwarmModelTier): SwarmModelTier | null {
  if (tier === 'reasoning') return null
  const idx = TIER_ORDER.indexOf(tier)
  if (idx <= 0) return null
  return TIER_ORDER[idx - 1]
}

export type RoutedModel = {
  tier: SwarmModelTier
  model: string
}

/**
 * Route a task to a model for a worker. Returns null when routing is
 * disabled (HERMES_SWARM_MODEL_ROUTER=0) so callers fall back to the
 * worker's profile default.
 */
export function routeTaskModel(input: {
  task: string
  allowedTiers?: Array<string> | null
}): RoutedModel | null {
  if (process.env.HERMES_SWARM_MODEL_ROUTER === '0') return null
  const tier = clampTier(classifyTaskTier(input.task), input.allowedTiers)
  return { tier, model: TIER_MODELS[tier] }
}
