import { describe, expect, it } from 'vitest'
import { runAggregator } from '../aggregator'
import type { SourceAdapter } from '../sources/index'

const fast: SourceAdapter = {
  id: 'vm-health',
  ttlMs: 30000,
  fetch: async () => ({ value: '15%' }),
}

const slow: SourceAdapter = {
  id: 'agents',
  ttlMs: 60000,
  fetch: () => new Promise((r) => setTimeout(() => r({ value: '7' }), 3000)), // exceeds 1.5s
}

const broken: SourceAdapter = {
  id: 'errors',
  ttlMs: 30000,
  fetch: async () => {
    throw new Error('boom')
  },
}

describe('runAggregator', () => {
  it('returns loaded for fast source', async () => {
    const snap = await runAggregator([fast], { deadlineMs: 1500 })
    expect(snap.widgets['vm-health'].state).toBe('loaded')
    expect((snap.widgets['vm-health'].data as any).value).toBe('15%')
  })

  it('returns loading for source that exceeds deadline', async () => {
    const snap = await runAggregator([slow], { deadlineMs: 1500 })
    expect(snap.widgets['agents'].state).toBe('loading')
  })

  it('returns errored when fetch throws', async () => {
    const snap = await runAggregator([broken], { deadlineMs: 1500 })
    expect(snap.widgets['errors'].state).toBe('errored')
    expect(snap.widgets['errors'].error?.message).toBe('boom')
  })

  it('fast source is not blocked by slow source', async () => {
    const start = Date.now()
    const snap = await runAggregator([fast, slow, broken], { deadlineMs: 1500 })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1800)
    expect(snap.widgets['vm-health'].state).toBe('loaded')
    expect(snap.widgets['agents'].state).toBe('loading')
    expect(snap.widgets['errors'].state).toBe('errored')
  })
})
