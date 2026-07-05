import { afterEach, describe, expect, it } from 'vitest'
import {
  TIER_MODELS,
  clampTier,
  classifyTaskTier,
  escalateTier,
  routeTaskModel,
} from './swarm-model-router'

afterEach(() => {
  delete process.env.HERMES_SWARM_MODEL_ROUTER
})

describe('classifyTaskTier', () => {
  it('routes trivial acks to light', () => {
    expect(classifyTaskTier('Reply with exactly OK')).toBe('light')
    expect(classifyTaskTier('ping')).toBe('light')
    expect(classifyTaskTier('Sanity check: are you up?')).toBe('light')
  })

  it('routes code work to heavy', () => {
    expect(classifyTaskTier('Implement the retry logic in dispatch')).toBe(
      'heavy',
    )
    expect(
      classifyTaskTier('Fix the bug in swarm-lifecycle and write tests'),
    ).toBe('heavy')
    expect(classifyTaskTier('Refactor the auth middleware module')).toBe(
      'heavy',
    )
  })

  it('routes planning/analysis to reasoning', () => {
    expect(
      classifyTaskTier('Design the architecture for the new sync engine'),
    ).toBe('reasoning')
    expect(
      classifyTaskTier('Evaluate options and list trade-offs for caching'),
    ).toBe('reasoning')
    expect(classifyTaskTier('Run a security review of the API layer')).toBe(
      'reasoning',
    )
  })

  it('falls back by length for unmatched prompts', () => {
    expect(classifyTaskTier('Check the weather')).toBe('light')
    expect(
      classifyTaskTier(
        'Summarize the following meeting notes and produce action items ' +
          'grouped by owner, then note any deadlines mentioned in passing. ' +
          'Include a short section on open questions raised near the end.',
      ),
    ).toBe('standard')
    expect(classifyTaskTier('x'.repeat(3000))).toBe('heavy')
  })
})

describe('clampTier', () => {
  it('returns tier unchanged with no band', () => {
    expect(clampTier('heavy')).toBe('heavy')
    expect(clampTier('light', [])).toBe('light')
  })

  it('clamps below and above the band', () => {
    expect(clampTier('light', ['standard', 'heavy'])).toBe('standard')
    expect(clampTier('reasoning', ['light', 'standard'])).toBe('standard')
    expect(clampTier('standard', ['light', 'standard', 'heavy'])).toBe(
      'standard',
    )
  })

  it('ignores unknown tier names in the band', () => {
    expect(clampTier('heavy', ['bogus', 'nope'])).toBe('heavy')
  })
})

describe('escalateTier', () => {
  it('steps up one tier and stops at the top', () => {
    expect(escalateTier('light')).toBe('standard')
    expect(escalateTier('standard')).toBe('heavy')
    expect(escalateTier('heavy')).toBe('reasoning')
    expect(escalateTier('reasoning')).toBeNull()
  })
})

describe('routeTaskModel', () => {
  it('returns tier + model honoring the allowed band', () => {
    const routed = routeTaskModel({
      task: 'Implement the parser rewrite',
      allowedTiers: ['light', 'standard'],
    })
    expect(routed).toEqual({
      tier: 'standard',
      model: TIER_MODELS.standard,
    })
  })

  it('is disabled via HERMES_SWARM_MODEL_ROUTER=0', () => {
    process.env.HERMES_SWARM_MODEL_ROUTER = '0'
    expect(routeTaskModel({ task: 'anything' })).toBeNull()
  })
})
