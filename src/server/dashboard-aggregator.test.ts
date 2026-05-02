import { describe, expect, it } from 'vitest'
import {
  buildDashboardOverview,
  type DashboardFetcher,
} from './dashboard-aggregator'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFetcher(routes: Record<string, unknown>): DashboardFetcher {
  return async (path: string) => {
    const key = Object.keys(routes).find((p) => path.startsWith(p))
    if (key === undefined) {
      return new Response('not found', { status: 404 })
    }
    const value = routes[key]
    if (value instanceof Response) return value
    return jsonResponse(value)
  }
}

describe('buildDashboardOverview', () => {
  it('returns null sections when every upstream call fails', async () => {
    const fetcher: DashboardFetcher = async () =>
      new Response('boom', { status: 500 })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.status).toBeNull()
    expect(overview.platforms).toEqual([])
    expect(overview.cron).toBeNull()
    expect(overview.achievements).toBeNull()
    expect(overview.modelInfo).toBeNull()
    expect(overview.analytics).toBeNull()
  })

  it('parses /api/status into status + platforms', async () => {
    const fetcher = makeFetcher({
      '/api/status': {
        gateway_state: 'running',
        active_agents: 2,
        restart_requested: false,
        updated_at: '2026-05-02T19:00:00Z',
        version: '0.12.0',
        release_date: '2026.4.30',
        config_version: 17,
        latest_config_version: 23,
        hermes_home: '/Users/aurora/.hermes',
        platforms: {
          api_server: {
            state: 'connected',
            updated_at: '2026-05-02T18:55:00Z',
          },
          telegram: {
            state: 'error',
            updated_at: '2026-05-02T18:00:00Z',
            error_message: 'rate limited',
          },
        },
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.status?.gatewayState).toBe('running')
    expect(overview.status?.activeAgents).toBe(2)
    expect(overview.status?.version).toBe('0.12.0')
    expect(overview.status?.releaseDate).toBe('2026.4.30')
    expect(overview.status?.configVersion).toBe(17)
    expect(overview.status?.latestConfigVersion).toBe(23)
    expect(overview.status?.hermesHome).toBe('/Users/aurora/.hermes')
    expect(overview.platforms).toEqual([
      {
        name: 'api_server',
        state: 'connected',
        updatedAt: '2026-05-02T18:55:00Z',
        errorMessage: null,
      },
      {
        name: 'telegram',
        state: 'error',
        updatedAt: '2026-05-02T18:00:00Z',
        errorMessage: 'rate limited',
      },
    ])
  })

  it('summarises cron jobs and finds the earliest next-run', async () => {
    const fetcher = makeFetcher({
      '/api/cron/jobs': {
        jobs: [
          { id: 'a', status: 'scheduled', next_run_at: '2026-05-03T01:00:00Z' },
          { id: 'b', status: 'paused' },
          { id: 'c', status: 'running', next_run_at: '2026-05-03T00:30:00Z' },
        ],
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.cron).toEqual({
      total: 3,
      paused: 1,
      running: 1,
      nextRunAt: '2026-05-03T00:30:00.000Z',
    })
  })

  it('limits and shapes recent achievement unlocks', async () => {
    const fetcher = makeFetcher({
      '/api/plugins/hermes-achievements/recent-unlocks': [
        {
          id: 'let_him_cook',
          name: 'Let Him Cook',
          description: 'autonomous run',
          category: 'Agent Autonomy',
          icon: 'flame',
          tier: 'Silver',
          unlocked_at: 1777741371,
        },
        {
          id: 'image_whisperer',
          name: 'Image Whisperer',
          description: '',
          category: '',
          icon: '',
          tier: 'Copper',
          unlocked_at: 1777741200,
        },
        {
          id: 'extra1',
          name: 'Extra 1',
          description: '',
          category: '',
          icon: '',
          unlocked_at: 1777741100,
        },
        {
          id: 'extra2',
          name: 'Extra 2',
          description: '',
          category: '',
          icon: '',
          unlocked_at: 1777741000,
        },
      ],
      '/api/plugins/hermes-achievements/achievements': {
        achievements: [
          { id: 'a', state: 'unlocked' },
          { id: 'b', state: 'unlocked' },
          { id: 'c', state: 'locked' },
          { id: 'd', state: 'unlocked' },
        ],
      },
    })
    const overview = await buildDashboardOverview({
      fetcher,
      achievementsLimit: 2,
    })
    expect(overview.achievements?.recentUnlocks).toHaveLength(2)
    expect(overview.achievements?.recentUnlocks[0]).toMatchObject({
      id: 'let_him_cook',
      tier: 'Silver',
    })
    expect(overview.achievements?.totalUnlocked).toBe(3)
  })

  it('parses model info', async () => {
    const fetcher = makeFetcher({
      '/api/model/info': {
        model: 'gpt-5.4',
        provider: 'openai-codex',
        effective_context_length: 272000,
        capabilities: { supports_tools: true, model_family: 'gpt' },
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.modelInfo).toEqual({
      provider: 'openai-codex',
      model: 'gpt-5.4',
      effectiveContextLength: 272000,
      capabilities: { supports_tools: true, model_family: 'gpt' },
    })
  })

  it('sorts top models by tokens and limits to 3', async () => {
    const fetcher = makeFetcher({
      '/api/analytics/usage': {
        total_tokens: 5_000_000,
        estimated_cost_usd: 12.34,
        top_models: [
          { id: 'gpt-5.4', tokens: 1_000_000, calls: 200 },
          { id: 'opus-4-7', tokens: 3_500_000, calls: 80 },
          { id: 'sonnet-4-6', tokens: 250_000, calls: 50 },
          { id: 'gpt-5.5', tokens: 250_000, calls: 30 },
        ],
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.analytics?.totalTokens).toBe(5_000_000)
    expect(overview.analytics?.estimatedCostUsd).toBe(12.34)
    expect(overview.analytics?.topModels.map((m) => m.id)).toEqual([
      'opus-4-7',
      'gpt-5.4',
      'sonnet-4-6',
    ])
  })

  it('survives mixed-status inputs (some succeed, some fail)', async () => {
    const fetcher: DashboardFetcher = async (path) => {
      if (path.startsWith('/api/status')) {
        return jsonResponse({
          gateway_state: 'running',
          active_agents: 1,
          platforms: {},
        })
      }
      if (path.startsWith('/api/cron/jobs')) {
        return jsonResponse({ jobs: [{ id: 'a', status: 'scheduled' }] })
      }
      // Everything else fails
      return new Response('nope', { status: 401 })
    }
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.status?.gatewayState).toBe('running')
    expect(overview.status?.version).toBeNull()
    expect(overview.status?.configVersion).toBeNull()
    expect(overview.cron?.total).toBe(1)
    expect(overview.achievements).toBeNull()
    expect(overview.modelInfo).toBeNull()
    expect(overview.analytics).toBeNull()
  })
})
