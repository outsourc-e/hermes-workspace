import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  estimateCost,
  recordUsage,
  readUsageLog,
  sumCostToday,
  getOpusSpendToday,
} from './model-usage-tracker'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTmpPaths() {
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'))
  return { hermesHome }
}

function removeTmp(hermesHome: string) {
  fs.rmSync(hermesHome, { recursive: true, force: true })
}

// ── estimateCost ──────────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('returns 0 for local models', () => {
    expect(estimateCost('llama3.2', 1000, 500)).toBe(0)
  })

  it('calculates cost for claude-opus-4-8 (exact match)', () => {
    // 1000 input @ $0.015/1k + 500 output @ $0.075/1k
    const cost = estimateCost('claude-opus-4-8', 1000, 500)
    expect(cost).toBeCloseTo(0.015 + 0.0375, 6)
  })

  it('calculates cost for claude-sonnet-4-6', () => {
    const cost = estimateCost('claude-sonnet-4-6', 2000, 800)
    // 2*0.003 + 0.8*0.015
    expect(cost).toBeCloseTo(0.006 + 0.012, 6)
  })

  it('calculates cost for deepseek-chat', () => {
    const cost = estimateCost('deepseek-chat', 1000, 1000)
    expect(cost).toBeCloseTo(0.00027 + 0.0011, 6)
  })

  it('matches on model prefix (versioned model IDs)', () => {
    // 'claude-opus-4-8-20250514' should match 'claude-opus-4-8'
    const exact = estimateCost('claude-opus-4-8', 1000, 0)
    const versioned = estimateCost('claude-opus-4-8-20250514', 1000, 0)
    expect(versioned).toBe(exact)
  })

  it('falls back to a non-zero rate for unknown models', () => {
    expect(estimateCost('unknown-model-xyz', 1000, 1000)).toBeGreaterThan(0)
  })

  it('returns 0 cost when both token counts are 0', () => {
    expect(estimateCost('claude-sonnet-4-6', 0, 0)).toBe(0)
  })
})

// ── recordUsage ───────────────────────────────────────────────────────────────

describe('recordUsage', () => {
  let hermesHome: string

  beforeEach(() => {
    ;({ hermesHome } = makeTmpPaths())
  })

  afterEach(() => {
    removeTmp(hermesHome)
  })

  it('returns a complete ModelUsageRecord', () => {
    const r = recordUsage({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      input_tokens: 500,
      output_tokens: 200,
      latency_ms: 1234,
      success: true,
      paths: { hermesHome },
    })
    expect(r.id).toBeTruthy()
    expect(r.provider).toBe('anthropic')
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.input_tokens).toBe(500)
    expect(r.output_tokens).toBe(200)
    expect(r.latency_ms).toBe(1234)
    expect(r.success).toBe(true)
    expect(r.cost_usd).toBeGreaterThan(0)
    expect(r.ts).toBeGreaterThan(0)
  })

  it('persists the record to model-usage.json', () => {
    recordUsage({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      input_tokens: 100,
      output_tokens: 50,
      latency_ms: 800,
      success: true,
      paths: { hermesHome },
    })
    const filePath = path.join(hermesHome, 'model-usage.json')
    expect(fs.existsSync(filePath)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
  })

  it('accumulates multiple records without overwriting', () => {
    const opts = { provider: 'openai', model: 'gpt-5.4', input_tokens: 100, output_tokens: 50, latency_ms: 500, success: true, paths: { hermesHome } }
    recordUsage(opts)
    recordUsage(opts)
    recordUsage(opts)
    expect(readUsageLog({ hermesHome })).toHaveLength(3)
  })

  it('stores error field when provided', () => {
    const r = recordUsage({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: 100,
      success: false,
      error: 'rate limit exceeded',
      paths: { hermesHome },
    })
    expect(r.success).toBe(false)
    expect(r.error).toBe('rate limit exceeded')
    const log = readUsageLog({ hermesHome })
    expect(log[0].error).toBe('rate limit exceeded')
  })

  it('omits error field when not provided', () => {
    const r = recordUsage({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      input_tokens: 10,
      output_tokens: 10,
      latency_ms: 200,
      success: true,
      paths: { hermesHome },
    })
    expect('error' in r).toBe(false)
  })

  it('creates the hermesHome directory if it does not exist', () => {
    const nested = path.join(hermesHome, 'deep', 'nested')
    recordUsage({
      provider: 'google',
      model: 'gemini-2.5-pro',
      input_tokens: 10,
      output_tokens: 10,
      latency_ms: 300,
      success: true,
      paths: { hermesHome: nested },
    })
    expect(fs.existsSync(path.join(nested, 'model-usage.json'))).toBe(true)
  })

  it('each record gets a unique id', () => {
    const opts = { provider: 'anthropic', model: 'claude-sonnet-4-6', input_tokens: 10, output_tokens: 10, latency_ms: 100, success: true, paths: { hermesHome } }
    const a = recordUsage(opts)
    const b = recordUsage(opts)
    expect(a.id).not.toBe(b.id)
  })
})

// ── readUsageLog ──────────────────────────────────────────────────────────────

describe('readUsageLog', () => {
  let hermesHome: string

  beforeEach(() => {
    ;({ hermesHome } = makeTmpPaths())
  })

  afterEach(() => {
    removeTmp(hermesHome)
  })

  it('returns empty array when file does not exist', () => {
    expect(readUsageLog({ hermesHome })).toEqual([])
  })

  it('returns empty array when file contains invalid JSON', () => {
    const filePath = path.join(hermesHome, 'model-usage.json')
    fs.mkdirSync(hermesHome, { recursive: true })
    fs.writeFileSync(filePath, 'not json', 'utf-8')
    expect(readUsageLog({ hermesHome })).toEqual([])
  })

  it('returns empty array when file contains non-array JSON', () => {
    const filePath = path.join(hermesHome, 'model-usage.json')
    fs.mkdirSync(hermesHome, { recursive: true })
    fs.writeFileSync(filePath, '{"oops": true}', 'utf-8')
    expect(readUsageLog({ hermesHome })).toEqual([])
  })

  it('reads back what was written', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8', input_tokens: 500, output_tokens: 200, latency_ms: 1000, success: true, paths: { hermesHome } })
    recordUsage({ provider: 'openai',    model: 'gpt-5.4',         input_tokens: 300, output_tokens: 100, latency_ms: 500,  success: true, paths: { hermesHome } })
    const log = readUsageLog({ hermesHome })
    expect(log).toHaveLength(2)
    expect(log[0].provider).toBe('anthropic')
    expect(log[1].provider).toBe('openai')
  })
})

// ── sumCostToday ──────────────────────────────────────────────────────────────

describe('sumCostToday', () => {
  let hermesHome: string

  beforeEach(() => {
    ;({ hermesHome } = makeTmpPaths())
  })

  afterEach(() => {
    removeTmp(hermesHome)
  })

  it('returns 0 when no records exist', () => {
    expect(sumCostToday({}, { hermesHome })).toBe(0)
  })

  it('sums all costs when no filter applied', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 500, latency_ms: 800, success: true, paths: { hermesHome } })
    recordUsage({ provider: 'openai',    model: 'gpt-5.4',           input_tokens: 1000, output_tokens: 500, latency_ms: 600, success: true, paths: { hermesHome } })
    const total = sumCostToday({}, { hermesHome })
    expect(total).toBeGreaterThan(0)
    const sonnetCost = estimateCost('claude-sonnet-4-6', 1000, 500)
    const gptCost    = estimateCost('gpt-5.4', 1000, 500)
    expect(total).toBeCloseTo(sonnetCost + gptCost, 8)
  })

  it('filters by provider', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 500, latency_ms: 800, success: true, paths: { hermesHome } })
    recordUsage({ provider: 'openai',    model: 'gpt-5.4',           input_tokens: 1000, output_tokens: 500, latency_ms: 600, success: true, paths: { hermesHome } })
    const anthropicOnly = sumCostToday({ provider: 'anthropic' }, { hermesHome })
    expect(anthropicOnly).toBeCloseTo(estimateCost('claude-sonnet-4-6', 1000, 500), 8)
  })

  it('filters by model', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8',  input_tokens: 1000, output_tokens: 200, latency_ms: 2000, success: true, paths: { hermesHome } })
    recordUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 200, latency_ms: 800,  success: true, paths: { hermesHome } })
    const opusOnly = sumCostToday({ model: 'claude-opus-4-8' }, { hermesHome })
    expect(opusOnly).toBeCloseTo(estimateCost('claude-opus-4-8', 1000, 200), 8)
  })

  it('excludes records from yesterday', () => {
    const yesterday = Date.now() - 25 * 60 * 60 * 1000
    // Write a record directly with a past timestamp
    const filePath = path.join(hermesHome, 'model-usage.json')
    fs.mkdirSync(hermesHome, { recursive: true })
    fs.writeFileSync(
      filePath,
      JSON.stringify([{ id: 'old', ts: yesterday, provider: 'anthropic', model: 'claude-opus-4-8', input_tokens: 10000, output_tokens: 5000, cost_usd: 999, latency_ms: 100, success: true }]),
      'utf-8',
    )
    expect(sumCostToday({}, { hermesHome })).toBe(0)
  })

  it('includes records from today', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 500, latency_ms: 1000, success: true, paths: { hermesHome } })
    expect(sumCostToday({}, { hermesHome })).toBeGreaterThan(0)
  })
})

// ── getOpusSpendToday ─────────────────────────────────────────────────────────

describe('getOpusSpendToday', () => {
  let hermesHome: string

  beforeEach(() => {
    ;({ hermesHome } = makeTmpPaths())
  })

  afterEach(() => {
    removeTmp(hermesHome)
  })

  it('returns 0 when no records', () => {
    expect(getOpusSpendToday({ hermesHome })).toBe(0)
  })

  it('sums only opus model records', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8',  input_tokens: 1000, output_tokens: 500, latency_ms: 1000, success: true, paths: { hermesHome } })
    recordUsage({ provider: 'anthropic', model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 500, latency_ms: 800,  success: true, paths: { hermesHome } })
    recordUsage({ provider: 'openai',    model: 'gpt-5.4',           input_tokens: 1000, output_tokens: 500, latency_ms: 600,  success: true, paths: { hermesHome } })
    const opusSpend = getOpusSpendToday({ hermesHome })
    expect(opusSpend).toBeCloseTo(estimateCost('claude-opus-4-8', 1000, 500), 8)
  })

  it('accumulates multiple opus calls', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 500, latency_ms: 1000, success: true, paths: { hermesHome } })
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8', input_tokens: 2000, output_tokens: 800, latency_ms: 1500, success: true, paths: { hermesHome } })
    const expected = estimateCost('claude-opus-4-8', 1000, 500) + estimateCost('claude-opus-4-8', 2000, 800)
    expect(getOpusSpendToday({ hermesHome })).toBeCloseTo(expected, 8)
  })

  it('matches by opus substring — catches versioned model IDs', () => {
    recordUsage({ provider: 'anthropic', model: 'claude-opus-4-8-20250514', input_tokens: 1000, output_tokens: 500, latency_ms: 1000, success: true, paths: { hermesHome } })
    expect(getOpusSpendToday({ hermesHome })).toBeGreaterThan(0)
  })

  it('excludes yesterday opus records', () => {
    const yesterday = Date.now() - 25 * 60 * 60 * 1000
    const filePath = path.join(hermesHome, 'model-usage.json')
    fs.mkdirSync(hermesHome, { recursive: true })
    fs.writeFileSync(
      filePath,
      JSON.stringify([{ id: 'x', ts: yesterday, provider: 'anthropic', model: 'claude-opus-4-8', input_tokens: 9999, output_tokens: 9999, cost_usd: 999, latency_ms: 100, success: true }]),
      'utf-8',
    )
    expect(getOpusSpendToday({ hermesHome })).toBe(0)
  })
})
