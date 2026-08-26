/**
 * Type definitions for the Executive Router v1 configuration.
 *
 * These types describe the `routing:` block in ~/.hermes/config.yaml.
 * No routing logic lives here — see src/server/executive-router.ts (Step 5).
 */

export type TaskType =
  | 'coding'
  | 'research'
  | 'writing'
  | 'reasoning'
  | 'summarisation'
  | 'qa'
  | 'creative'
  | 'ops'

export type ContextLen = 'short' | 'medium' | 'long'
export type Urgency = 'normal' | 'fast'

/** Output of the task classifier — describes the incoming request. */
export type TaskClassification = {
  task_type: TaskType
  /** Normalised 0.0–1.0 score derived from token count and keyword signals. */
  complexity: number
  context_len: ContextLen
  urgency: Urgency
  has_attachments: boolean
  estimated_tokens: number
}

/** What the router decided — passed back to the dispatch layer. */
export type RouteDecision = {
  provider: string
  model: string
  /** Non-null for providers that bypass the Hermes gateway (Gemini, DeepSeek, OpenRouter, Ollama). */
  base_url?: string
  /** Human-readable explanation, surfaced in the transparency UI. */
  reason: string
}

/** One entry in routing.pool — a provider and its available models. */
export type RouterPoolEntry = {
  provider: string
  /** Empty array means "use runtime discovery" (applicable to Ollama). */
  models: string[]
  base_url?: string
  enabled: boolean
}

/** Conditions that must all hold for a policy rule to match. */
export type PolicyMatch = {
  task_type?: TaskType
  /** Match when complexity >= this value. */
  complexity_gte?: number
  /** Match when complexity < this value. */
  complexity_lt?: number
  context_len?: ContextLen
  urgency?: Urgency
}

/** A single routing rule: when `match` conditions hold, send to `route`. */
export type PolicyRule = {
  match: PolicyMatch
  route: { provider: string; model: string }
}

export type RouterEscalationConfig = {
  /**
   * Complexity threshold above which the router will consider escalating
   * to a more capable (and more expensive) model such as Claude Opus.
   * Range: 0.0–1.0. Default: 0.75.
   */
  opus_threshold: number
  /**
   * Hard daily USD cap for Opus (and any other high-cost escalation target).
   * When the cap is reached the router substitutes the default model instead.
   * Set to 0 to disable Opus entirely.
   */
  daily_opus_budget_usd: number
}

/**
 * The full routing configuration block, matching the `routing:` key in
 * ~/.hermes/config.yaml.  Read via readRoutingConfig() in hermes-config-store.ts.
 */
export type RoutingConfig = {
  /** Master switch. When false the router is bypassed entirely. Default: false. */
  enabled: boolean
  default_provider: string
  default_model: string
  escalation: RouterEscalationConfig
  pool: RouterPoolEntry[]
  /**
   * Ordered list of routing rules. First matching rule wins.
   * Falls back to default_provider / default_model when no rule matches.
   */
  policy: PolicyRule[]
}
