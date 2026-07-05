import { describe, expect, it } from 'vitest'
import { aggregateWorkerUsage } from './swarm-usage'
import type { SessionUsageRow } from './swarm-usage'

const row = (overrides: Partial<SessionUsageRow>): SessionUsageRow => ({
  started_at: 0,
  model: null,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  ...overrides,
})

describe('aggregateWorkerUsage', () => {
  // Fixed "now": noon local time so start-of-day math is unambiguous.
  const now = new Date(2026, 6, 4, 12, 0, 0)
  const nowMs = now.getTime()
  const nowSec = nowMs / 1000

  it('returns zeroed windows for no rows', () => {
    const u = aggregateWorkerUsage('qa', [], nowMs)
    expect(u).toEqual({
      workerId: 'qa',
      model: null,
      today: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      last7d: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      sessions: 0,
    })
  })

  it('buckets today vs last7d and sums all token columns', () => {
    const rows = [
      // today (2 hours ago)
      row({
        started_at: nowSec - 2 * 3600,
        model: 'qwen3.5:397b',
        input_tokens: 100,
        output_tokens: 20,
        cache_read_tokens: 5,
        cache_write_tokens: 1,
      }),
      // yesterday-ish (2 days ago) — in 7d window, not today
      row({
        started_at: nowSec - 2 * 24 * 3600,
        model: 'llama3.1:8b',
        input_tokens: 1000,
        output_tokens: 200,
      }),
      // older than 7 days — counted only in sessions
      row({
        started_at: nowSec - 10 * 24 * 3600,
        input_tokens: 999999,
      }),
    ]
    const u = aggregateWorkerUsage('qa', rows, nowMs)
    expect(u.sessions).toBe(3)
    expect(u.today).toEqual({
      input: 100,
      output: 20,
      cacheRead: 5,
      cacheWrite: 1,
      total: 126,
    })
    expect(u.last7d).toEqual({
      input: 1100,
      output: 220,
      cacheRead: 5,
      cacheWrite: 1,
      total: 1326,
    })
  })

  it('reports the model of the most recent session with a model', () => {
    const rows = [
      row({ started_at: nowSec - 5 * 24 * 3600, model: 'old-model' }),
      row({ started_at: nowSec - 3600, model: 'new-model' }),
      row({ started_at: nowSec - 60, model: null }),
    ]
    expect(aggregateWorkerUsage('qa', rows, nowMs).model).toBe('new-model')
  })

  it('treats null/undefined token counts as zero', () => {
    const rows = [
      {
        started_at: nowSec - 60,
        model: 'm',
        input_tokens: null,
        output_tokens: undefined,
        cache_read_tokens: 3,
        cache_write_tokens: 0,
      } as unknown as SessionUsageRow,
    ]
    const u = aggregateWorkerUsage('qa', rows, nowMs)
    expect(u.today.total).toBe(3)
  })
})
