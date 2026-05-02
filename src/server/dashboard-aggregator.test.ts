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
      failed: 0,
      nextRunAt: '2026-05-03T00:30:00.000Z',
      recentFailures: [],
    })
  })

  it('detects failed cron jobs and surfaces them in incidents', async () => {
    const fetcher = makeFetcher({
      '/api/cron/jobs': {
        jobs: [
          {
            id: 'a',
            name: 'Daily roll-up',
            state: 'scheduled',
            last_status: 'failed',
            last_error: 'connection refused',
            last_run_at: '2026-05-02T03:00:00Z',
            next_run_at: '2026-05-03T03:00:00Z',
          },
          { id: 'b', state: 'scheduled' },
        ],
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.cron?.failed).toBe(1)
    expect(overview.cron?.recentFailures).toHaveLength(1)
    expect(overview.cron?.recentFailures[0]).toMatchObject({
      id: 'a',
      name: 'Daily roll-up',
      lastError: 'connection refused',
    })
    const cronIncident = overview.incidents.find(
      (i) => i.id === 'cron-fail-a',
    )
    expect(cronIncident?.severity).toBe('error')
    expect(cronIncident?.detail).toBe('connection refused')
  })

  it('uses /health/detailed active_agents over /api/status active_sessions', async () => {
    const fetcher = makeFetcher({
      '/api/status': {
        gateway_state: 'running',
        active_sessions: 7,
        platforms: {},
      },
    })
    const gatewayFetcher: DashboardFetcher = async (p) => {
      if (p === '/health/detailed') {
        return jsonResponse({ active_agents: 2 })
      }
      return new Response('nope', { status: 404 })
    }
    const overview = await buildDashboardOverview({
      fetcher,
      gatewayFetcher,
    })
    expect(overview.status?.activeSessions).toBe(7)
    expect(overview.status?.activeAgents).toBe(2)
  })

  it('parses skills usage and emits a top-skill insight', async () => {
    const fetcher = makeFetcher({
      '/api/analytics/usage': {
        period_days: 30,
        totals: {
          total_input: 1_000_000,
          total_output: 50_000,
          total_sessions: 10,
          total_api_calls: 50,
        },
        by_model: [
          { model: 'gpt-5.4', input_tokens: 1_000_000, output_tokens: 50_000 },
        ],
        daily: Array.from({ length: 14 }).map((_, i) => ({
          day: `2026-04-${String(18 + i).padStart(2, '0')}`,
          input_tokens: 1_000,
          output_tokens: 100,
          cache_read_tokens: 500,
          reasoning_tokens: 0,
          sessions: 1,
          api_calls: 1,
          estimated_cost: 0,
        })),
        skills: {
          summary: {
            total_skill_loads: 283,
            total_skill_edits: 5,
            total_skill_actions: 288,
            distinct_skills_used: 55,
          },
          top_skills: [
            {
              skill: 'systematic-debugging',
              total_count: 39,
              percentage: 13.5,
              last_used_at: 1_777_698_307,
            },
            {
              skill: 'test-driven-development',
              total_count: 27,
              percentage: 9.4,
              last_used_at: 1_777_698_307,
            },
          ],
        },
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.skillsUsage?.distinctSkills).toBe(55)
    expect(overview.skillsUsage?.topSkills).toHaveLength(2)
    expect(overview.skillsUsage?.topSkills[0].skill).toBe(
      'systematic-debugging',
    )
    const skillInsight = overview.insights.find((i) =>
      i.text.includes('systematic-debugging'),
    )
    expect(skillInsight).toBeTruthy()
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

  it('parses native Hermes analytics shape (totals + by_model + daily)', async () => {
    const fetcher = makeFetcher({
      '/api/analytics/usage': {
        period_days: 30,
        totals: {
          total_input: 245_000_000,
          total_output: 1_200_000,
          total_cache_read: 184_000_000,
          total_reasoning: 250_000,
          total_estimated_cost: 0.05,
          total_actual_cost: 0,
          total_sessions: 788,
          total_api_calls: 2760,
        },
        by_model: [
          {
            model: 'gpt-5.4',
            input_tokens: 161_000_000,
            output_tokens: 600_000,
            estimated_cost: 0.02,
            sessions: 113,
            api_calls: 1370,
          },
          {
            model: 'claude-opus-4-6',
            input_tokens: 39_000_000,
            output_tokens: 320_000,
            estimated_cost: 0,
            sessions: 507,
            api_calls: 0,
          },
        ],
        daily: [
          {
            day: '2026-04-18',
            input_tokens: 38_000_000,
            output_tokens: 86_000,
            cache_read_tokens: 4_300_000,
            reasoning_tokens: 18_000,
            estimated_cost: 0,
            sessions: 9,
            api_calls: 0,
          },
          {
            day: '2026-04-19',
            input_tokens: 6_700_000,
            output_tokens: 24_000,
            cache_read_tokens: 1_100_000,
            reasoning_tokens: 8_000,
            estimated_cost: 0,
            sessions: 4,
            api_calls: 0,
          },
        ],
      },
    })
    const overview = await buildDashboardOverview({ fetcher })
    expect(overview.analytics?.source).toBe('analytics')
    expect(overview.analytics?.inputTokens).toBe(245_000_000)
    expect(overview.analytics?.cacheReadTokens).toBe(184_000_000)
    expect(overview.analytics?.totalSessions).toBe(788)
    expect(overview.analytics?.totalApiCalls).toBe(2760)
    expect(overview.analytics?.totalTokens).toBe(245_000_000 + 1_200_000)
    expect(overview.analytics?.estimatedCostUsd).toBe(0.05)
    expect(overview.analytics?.topModels.map((m) => m.id)).toEqual([
      'gpt-5.4',
      'claude-opus-4-6',
    ])
    expect(overview.analytics?.daily).toHaveLength(2)
    expect(overview.analytics?.daily[0]).toMatchObject({
      day: '2026-04-18',
      inputTokens: 38_000_000,
      sessions: 9,
    })
  })

  it('falls back to legacy analytics shape (top_models + total_tokens)', async () => {
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
      'gpt-5.5',
    ])
  })

  it('parses log tail with error/warn detection', async () => {
    const fetcher = makeFetcher({
      '/api/logs': {
        file: 'agent',
        lines: [
          'INFO  starting up\n',
          'WARN  deprecated config key\n',
          'ERROR  KeyboardInterrupt\n',
          'Traceback (most recent call last):\n',
          'INFO  recovered\n',
        ],
      },
    })
    const overview = await buildDashboardOverview({ fetcher, logsLimit: 10 })
    expect(overview.logs?.file).toBe('agent')
    expect(overview.logs?.lines).toHaveLength(5)
    expect(overview.logs?.errorCount).toBe(2)
    expect(overview.logs?.warnCount).toBe(1)
  })

  it('survives mixed-status inputs (some succeed, some fail)', async () => {
    const fetcher: DashboardFetcher = async (path) => {
      if (path.startsWith('/api/status')) {
        return jsonResponse({
          gateway_state: 'running',
          active_agents: 1,
          active_sessions: 3,
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
    // No /health/detailed fetcher provided → falls back to legacy
    // active_agents on /api/status payload.
    expect(overview.status?.activeAgents).toBe(1)
    expect(overview.status?.activeSessions).toBe(3)
    expect(overview.status?.version).toBeNull()
    expect(overview.status?.configVersion).toBeNull()
    expect(overview.cron?.total).toBe(1)
    expect(overview.achievements).toBeNull()
    expect(overview.modelInfo).toBeNull()
    expect(overview.analytics).toBeNull()
  })
})
