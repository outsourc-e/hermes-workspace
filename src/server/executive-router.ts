import type {
  TaskClassification,
  RoutingConfig,
  RouteDecision,
  PolicyRule,
  RouterPoolEntry,
} from '../types/router-config'
import type { ManualOverride } from './task-classifier'

export type RouteOpts = {
  classification: TaskClassification
  config: RoutingConfig
  /** Accumulated Opus spend today in USD — injected by caller to keep this function pure. */
  opusSpentToday: number
  manualOverride?: ManualOverride | null
}

const OPUS_FALLBACK_MODEL = 'claude-sonnet-4-6'

function isOpusModel(model: string): boolean {
  return model.toLowerCase().includes('opus')
}

function findPoolEntry(config: RoutingConfig, provider: string): RouterPoolEntry | undefined {
  return config.pool.find((p) => p.provider === provider)
}

function isProviderEnabled(config: RoutingConfig, provider: string): boolean {
  const entry = findPoolEntry(config, provider)
  // Provider absent from pool → not explicitly restricted → allowed
  if (!entry) return true
  return entry.enabled
}

function policyMatches(rule: PolicyRule, cls: TaskClassification): boolean {
  const m = rule.match
  if (m.task_type !== undefined && m.task_type !== cls.task_type) return false
  if (m.complexity_gte !== undefined && cls.complexity < m.complexity_gte) return false
  if (m.complexity_lt !== undefined && cls.complexity >= m.complexity_lt) return false
  if (m.context_len !== undefined && m.context_len !== cls.context_len) return false
  if (m.urgency !== undefined && m.urgency !== cls.urgency) return false
  return true
}

function budgetExceeded(opusSpentToday: number, config: RoutingConfig): boolean {
  return opusSpentToday >= config.escalation.daily_opus_budget_usd
}

/**
 * Determine which provider/model to use for the given task.
 * Pure function — no network, no file I/O, no env reads.
 */
export function route(opts: RouteOpts): RouteDecision {
  const { classification, config, opusSpentToday, manualOverride } = opts

  // 1. Manual override with explicit provider + model
  if (manualOverride?.provider && manualOverride.model) {
    return {
      provider: manualOverride.provider,
      model: manualOverride.model,
      base_url: manualOverride.base_url,
      reason: `manual override — ${manualOverride.provider}/${manualOverride.model}`,
    }
  }

  // 2. Manual model-only override (model:<id>)
  if (manualOverride?.model) {
    return {
      provider: config.default_provider,
      model: manualOverride.model,
      reason: `manual model override — ${manualOverride.model}`,
    }
  }

  // 3. Routing disabled → defaults
  if (!config.enabled) {
    return {
      provider: config.default_provider,
      model: config.default_model,
      reason: 'routing disabled — using default',
    }
  }

  // 4. Policy rules — first match with an enabled provider wins
  for (const rule of config.policy) {
    if (!policyMatches(rule, classification)) continue
    const { provider, model } = rule.route
    if (!isProviderEnabled(config, provider)) continue

    if (isOpusModel(model) && budgetExceeded(opusSpentToday, config)) {
      return {
        provider: config.default_provider,
        model: OPUS_FALLBACK_MODEL,
        reason: `policy matched ${provider}/${model} but daily Opus budget exhausted ($${opusSpentToday.toFixed(2)} >= $${config.escalation.daily_opus_budget_usd}) — falling back to ${OPUS_FALLBACK_MODEL}`,
      }
    }

    return {
      provider,
      model,
      base_url: findPoolEntry(config, provider)?.base_url,
      reason: `policy rule matched: task_type=${classification.task_type} complexity=${classification.complexity.toFixed(2)}`,
    }
  }

  // 5. Complexity escalation to Opus
  if (
    classification.complexity >= config.escalation.opus_threshold &&
    isProviderEnabled(config, 'anthropic')
  ) {
    if (!budgetExceeded(opusSpentToday, config)) {
      return {
        provider: 'anthropic',
        model: 'claude-opus-4-8',
        reason: `complexity ${classification.complexity.toFixed(2)} >= threshold ${config.escalation.opus_threshold} — escalating to Opus`,
      }
    }
    return {
      provider: config.default_provider,
      model: OPUS_FALLBACK_MODEL,
      reason: `complexity ${classification.complexity.toFixed(2)} warrants Opus but daily budget exhausted ($${opusSpentToday.toFixed(2)}) — using ${OPUS_FALLBACK_MODEL}`,
    }
  }

  // 6. Default
  return {
    provider: config.default_provider,
    model: config.default_model,
    reason: 'no policy match — using default',
  }
}
