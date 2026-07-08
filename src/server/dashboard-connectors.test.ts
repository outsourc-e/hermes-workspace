import { describe, expect, it } from 'vitest'
import {
  buildRouteCostAnomalies,
  summarizeTaylorKanban,
} from './dashboard-aggregator'
import type { DashboardAnalyticsSection } from './dashboard-aggregator'

const NOW = '2026-07-08T12:00:00.000Z'

describe('summarizeTaylorKanban', () => {
  it('returns null for non-array payloads', () => {
    expect(summarizeTaylorKanban('nope', NOW)).toBeNull()
    expect(summarizeTaylorKanban({ items: [] }, NOW)).toBeNull()
  })

  it('counts open, stale, and blocked items defensively', () => {
    const summary = summarizeTaylorKanban(
      [
        { title: 'Fresh task', status: 'open', updatedAt: NOW },
        {
          name: 'Old task',
          state: 'in-progress',
          updated: '2026-06-01T00:00:00.000Z',
        },
        { text: 'Stuck task', status: 'blocked', updatedAt: NOW },
        { title: 'Done task', status: 'done', updatedAt: NOW },
        'garbage entry',
      ],
      NOW,
    )
    expect(summary).not.toBeNull()
    expect(summary?.items).toBe(5)
    expect(summary?.open).toBe(3)
    expect(summary?.stale).toBe(1)
    expect(summary?.blockers).toBe(1)
    expect(summary?.topTitles).toContain('Fresh task')
    expect(summary?.topTitles).not.toContain('Done task')
  })
})

describe('buildRouteCostAnomalies', () => {
  function analytics(
    topModels: DashboardAnalyticsSection['topModels'],
  ): DashboardAnalyticsSection {
    return {
      topModels,
    } as DashboardAnalyticsSection
  }

  it('returns nothing when analytics is unavailable', () => {
    expect(buildRouteCostAnomalies(null)).toEqual([])
  })

  it('flags paid spend on unexpected models as route leaks', () => {
    const anomalies = buildRouteCostAnomalies(
      analytics([
        { id: 'gpt-5.5', tokens: 100, calls: 5, cost: 0, sessions: 1 },
        {
          id: 'claude-opus-4-8',
          tokens: 900,
          calls: 3,
          cost: 4.2,
          sessions: 1,
        },
      ]),
      ['gpt-5.5', 'kimi-k2.6'],
    )
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('claude-opus-4-8')
    expect(anomalies[0]).toContain('Route leak')
  })

  it('ignores expected models and dust-sized costs', () => {
    const anomalies = buildRouteCostAnomalies(
      analytics([
        { id: 'kimi-k2.6', tokens: 100, calls: 5, cost: 1.5, sessions: 1 },
        { id: 'mystery-model', tokens: 10, calls: 1, cost: 0.01, sessions: 1 },
      ]),
      ['gpt-5.5', 'kimi-k2.6'],
    )
    expect(anomalies).toEqual([])
  })
})
