import { describe, expect, it } from 'vitest'
import { route } from './executive-router'
import type { RoutingConfig, TaskClassification } from '../types/router-config'

// ── fixtures ──────────────────────────────────────────────────────────────────

const BASE_CONFIG: RoutingConfig = {
  enabled: true,
  default_provider: 'anthropic',
  default_model: 'claude-sonnet-4-6',
  escalation: { opus_threshold: 0.75, daily_opus_budget_usd: 5.0 },
  pool: [],
  policy: [],
}

const SIMPLE_TASK: TaskClassification = {
  task_type: 'qa',
  complexity: 0.2,
  context_len: 'short',
  urgency: 'normal',
  has_attachments: false,
  estimated_tokens: 50,
}

const COMPLEX_TASK: TaskClassification = {
  task_type: 'coding',
  complexity: 0.9,
  context_len: 'long',
  urgency: 'normal',
  has_attachments: false,
  estimated_tokens: 6000,
}

// ── routing disabled ──────────────────────────────────────────────────────────

describe('route — routing disabled', () => {
  it('returns defaults when routing.enabled is false', () => {
    const r = route({
      classification: SIMPLE_TASK,
      config: { ...BASE_CONFIG, enabled: false },
      opusSpentToday: 0,
    })
    expect(r.provider).toBe('anthropic')
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.reason).toContain('routing disabled')
  })
})

// ── manual overrides ──────────────────────────────────────────────────────────

describe('route — manual overrides', () => {
  it('respects provider + model manual override (routing disabled)', () => {
    const r = route({
      classification: SIMPLE_TASK,
      config: { ...BASE_CONFIG, enabled: false },
      opusSpentToday: 0,
      manualOverride: { provider: 'openai', model: 'gpt-5.4' },
    })
    expect(r.provider).toBe('openai')
    expect(r.model).toBe('gpt-5.4')
    expect(r.reason).toContain('manual override')
  })

  it('respects provider + model manual override (routing enabled)', () => {
    const r = route({
      classification: COMPLEX_TASK,
      config: BASE_CONFIG,
      opusSpentToday: 0,
      manualOverride: { provider: 'google', model: 'gemini-2.5-pro', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    })
    expect(r.provider).toBe('google')
    expect(r.model).toBe('gemini-2.5-pro')
    expect(r.base_url).toContain('googleapis')
  })

  it('model-only override uses default_provider', () => {
    const r = route({
      classification: SIMPLE_TASK,
      config: BASE_CONFIG,
      opusSpentToday: 0,
      manualOverride: { model: 'claude-opus-4-8' },
    })
    expect(r.provider).toBe('anthropic')
    expect(r.model).toBe('claude-opus-4-8')
    expect(r.reason).toContain('manual model override')
  })

  it('use:deepseek override passes base_url through', () => {
    const r = route({
      classification: SIMPLE_TASK,
      config: BASE_CONFIG,
      opusSpentToday: 0,
      manualOverride: { provider: 'deepseek', model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' },
    })
    expect(r.base_url).toBe('https://api.deepseek.com/v1')
  })

  it('null override is ignored', () => {
    const r = route({
      classification: SIMPLE_TASK,
      config: { ...BASE_CONFIG, enabled: false },
      opusSpentToday: 0,
      manualOverride: null,
    })
    expect(r.reason).toContain('routing disabled')
  })
})

// ── policy rules ──────────────────────────────────────────────────────────────

describe('route — policy rule matching', () => {
  const configWithPolicy: RoutingConfig = {
    ...BASE_CONFIG,
    policy: [
      { match: { task_type: 'coding' }, route: { provider: 'openai', model: 'gpt-5.4' } },
      { match: { complexity_gte: 0.5 }, route: { provider: 'anthropic', model: 'claude-opus-4-8' } },
    ],
  }

  it('matches first applicable rule', () => {
    const r = route({ classification: { ...SIMPLE_TASK, task_type: 'coding' }, config: configWithPolicy, opusSpentToday: 0 })
    expect(r.provider).toBe('openai')
    expect(r.model).toBe('gpt-5.4')
    expect(r.reason).toContain('policy rule matched')
  })

  it('falls through to second rule when first does not match', () => {
    const r = route({ classification: { ...SIMPLE_TASK, complexity: 0.6 }, config: configWithPolicy, opusSpentToday: 0 })
    expect(r.model).toBe('claude-opus-4-8')
  })

  it('falls through to default when no rule matches', () => {
    const r = route({ classification: { ...SIMPLE_TASK, complexity: 0.1 }, config: configWithPolicy, opusSpentToday: 0 })
    expect(r.provider).toBe('anthropic')
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.reason).toContain('no policy match')
  })

  it('matches complexity_gte boundary exactly', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      policy: [{ match: { complexity_gte: 0.5 }, route: { provider: 'openai', model: 'gpt-5.4' } }],
    }
    const r = route({ classification: { ...SIMPLE_TASK, complexity: 0.5 }, config, opusSpentToday: 0 })
    expect(r.model).toBe('gpt-5.4')
  })

  it('does not match complexity_lt at boundary', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      policy: [{ match: { complexity_lt: 0.5 }, route: { provider: 'openai', model: 'gpt-5.4' } }],
    }
    const r = route({ classification: { ...SIMPLE_TASK, complexity: 0.5 }, config, opusSpentToday: 0 })
    expect(r.model).toBe('claude-sonnet-4-6') // fell through
  })

  it('matches combined match conditions (all must hold)', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      policy: [
        { match: { task_type: 'coding', complexity_gte: 0.7 }, route: { provider: 'openai', model: 'o3' } },
      ],
    }
    const match = route({ classification: { ...SIMPLE_TASK, task_type: 'coding', complexity: 0.8 }, config, opusSpentToday: 0 })
    const noMatch = route({ classification: { ...SIMPLE_TASK, task_type: 'coding', complexity: 0.5 }, config, opusSpentToday: 0 })
    expect(match.model).toBe('o3')
    expect(noMatch.model).toBe('claude-sonnet-4-6')
  })

  it('attaches pool base_url to matched provider when present', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      pool: [{ provider: 'deepseek', models: ['deepseek-chat'], base_url: 'https://api.deepseek.com/v1', enabled: true }],
      policy: [{ match: { task_type: 'qa' }, route: { provider: 'deepseek', model: 'deepseek-chat' } }],
    }
    const r = route({ classification: SIMPLE_TASK, config, opusSpentToday: 0 })
    expect(r.base_url).toBe('https://api.deepseek.com/v1')
  })
})

// ── disabled providers ────────────────────────────────────────────────────────

describe('route — disabled provider skipping', () => {
  it('skips a policy rule whose provider is disabled in pool', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      pool: [{ provider: 'openai', models: ['gpt-5.4'], enabled: false }],
      policy: [
        { match: { task_type: 'coding' }, route: { provider: 'openai', model: 'gpt-5.4' } },
        { match: { task_type: 'coding' }, route: { provider: 'anthropic', model: 'claude-opus-4-8' } },
      ],
    }
    const r = route({ classification: { ...SIMPLE_TASK, task_type: 'coding' }, config, opusSpentToday: 0 })
    expect(r.provider).toBe('anthropic')
    expect(r.model).toBe('claude-opus-4-8')
  })

  it('allows provider absent from pool (pool is opt-in restriction)', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      pool: [], // openai not restricted
      policy: [{ match: { task_type: 'qa' }, route: { provider: 'openai', model: 'gpt-5.4' } }],
    }
    const r = route({ classification: SIMPLE_TASK, config, opusSpentToday: 0 })
    expect(r.provider).toBe('openai')
  })
})

// ── Opus budget cap ───────────────────────────────────────────────────────────

describe('route — Opus budget cap', () => {
  it('escalates to Opus when complexity is high and budget available', () => {
    const r = route({ classification: COMPLEX_TASK, config: BASE_CONFIG, opusSpentToday: 1.0 })
    expect(r.model).toBe('claude-opus-4-8')
    expect(r.reason).toContain('escalating to Opus')
  })

  it('falls back when Opus budget is exhausted at escalation threshold', () => {
    const r = route({ classification: COMPLEX_TASK, config: BASE_CONFIG, opusSpentToday: 5.0 })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.reason).toContain('budget exhausted')
  })

  it('falls back when policy routes to Opus but budget exhausted', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      policy: [{ match: { task_type: 'coding' }, route: { provider: 'anthropic', model: 'claude-opus-4-8' } }],
    }
    const r = route({ classification: { ...SIMPLE_TASK, task_type: 'coding' }, config, opusSpentToday: 5.0 })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.reason).toContain('budget exhausted')
  })

  it('does not escalate to Opus when complexity is below threshold', () => {
    const r = route({ classification: SIMPLE_TASK, config: BASE_CONFIG, opusSpentToday: 0 })
    expect(r.model).not.toContain('opus')
  })

  it('respects opus_threshold boundary — exactly at threshold triggers escalation', () => {
    const r = route({
      classification: { ...SIMPLE_TASK, complexity: 0.75 },
      config: BASE_CONFIG,
      opusSpentToday: 0,
    })
    expect(r.model).toBe('claude-opus-4-8')
  })

  it('budget of 0 disables Opus entirely', () => {
    const config: RoutingConfig = {
      ...BASE_CONFIG,
      escalation: { opus_threshold: 0.5, daily_opus_budget_usd: 0 },
    }
    const r = route({ classification: COMPLEX_TASK, config, opusSpentToday: 0 })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.reason).toContain('budget exhausted')
  })
})

// ── default path ──────────────────────────────────────────────────────────────

describe('route — default path', () => {
  it('returns default provider and model with explanatory reason', () => {
    const r = route({ classification: SIMPLE_TASK, config: BASE_CONFIG, opusSpentToday: 0 })
    expect(r.provider).toBe(BASE_CONFIG.default_provider)
    expect(r.model).toBe(BASE_CONFIG.default_model)
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('has no base_url on default anthropic route', () => {
    const r = route({ classification: SIMPLE_TASK, config: BASE_CONFIG, opusSpentToday: 0 })
    expect(r.base_url).toBeUndefined()
  })
})
