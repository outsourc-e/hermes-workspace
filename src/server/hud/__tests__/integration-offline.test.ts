import { describe, expect, it } from 'vitest'
import { runAggregator } from '../aggregator'
import type { SourceAdapter } from '../sources'
import type { WidgetId } from '../types'

describe('aggregator with broken source', () => {
  it('returns errored for broken adapter, loaded for healthy', async () => {
    const broken: SourceAdapter = {
      id: 'agents' as WidgetId,
      ttlMs: 30000,
      fetch: async () => {
        throw new Error('upstream down')
      },
    }
    const healthy: SourceAdapter = {
      id: 'vm-health' as WidgetId,
      ttlMs: 30000,
      fetch: async () => ({ value: '15%' }),
    }
    const snap = await runAggregator([broken, healthy], { deadlineMs: 1500 })
    expect(snap.widgets['agents'].state).toBe('errored')
    expect(snap.widgets['vm-health'].state).toBe('loaded')
    expect(snap.widgets['agents'].error?.message).toBe('upstream down')
  })

  it('returns loading for slow source with no cache fallback', async () => {
    const slow: SourceAdapter = {
      id: 'plaud' as WidgetId,
      ttlMs: 30000,
      fetch: () =>
        new Promise((r) => setTimeout(() => r({ value: 'late' }), 3000)),
    }
    const snap = await runAggregator([slow], { deadlineMs: 500 })
    expect(snap.widgets['plaud'].state).toBe('loading')
  })
})
