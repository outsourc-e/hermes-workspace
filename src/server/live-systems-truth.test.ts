import { describe, expect, it } from 'vitest'
import { buildLiveSystems } from './dashboard-aggregator'
import type {
  DashboardAnalyticsSection,
  DashboardCronSection,
  DashboardGitWorkSection,
  DashboardKanbanSection,
  DashboardModelInfoSection,
  DashboardStatusSection,
} from './dashboard-aggregator'

function statusSection(
  partial: Partial<DashboardStatusSection> = {},
): DashboardStatusSection {
  return {
    gatewayState: 'running',
    activeSessions: 1,
    activeAgents: 1,
    restartRequested: false,
    updatedAt: '2026-07-09T00:00:00.000Z',
    lastHeartbeatAt: '2026-07-09T00:00:00.000Z',
    version: '1.0.0',
    releaseDate: null,
    configVersion: 1,
    ...partial,
  }
}

function modelInfo(
  partial: Partial<DashboardModelInfoSection> = {},
): DashboardModelInfoSection {
  return {
    provider: 'openai-codex',
    model: 'gpt-5.5',
    effectiveContextLength: 200000,
    capabilities: null,
    ...partial,
  }
}

function cronSection(
  partial: Partial<DashboardCronSection> = {},
): DashboardCronSection {
  return {
    total: 3,
    paused: 0,
    running: 0,
    failed: 0,
    nextRunAt: null,
    recentFailures: [],
    ...partial,
  }
}

function kanbanSection(
  partial: Partial<DashboardKanbanSection> = {},
): DashboardKanbanSection {
  return {
    total: 4,
    triage: 0,
    todo: 2,
    ready: 1,
    running: 1,
    blocked: 0,
    done: 0,
    other: 0,
    topBlocked: [],
    ...partial,
  }
}

function analyticsSection(
  partial: Partial<DashboardAnalyticsSection> = {},
): DashboardAnalyticsSection {
  return {
    windowDays: 30,
    totalTokens: 1000,
    inputTokens: 500,
    outputTokens: 500,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    totalSessions: 2,
    totalApiCalls: 10,
    topModels: [
      { id: 'gpt-5.5', tokens: 1000, calls: 10, cost: 0.5, sessions: 2 },
    ],
    estimatedCostUsd: 0.5,
    costLabel: '$0.50',
    ...partial,
  } as DashboardAnalyticsSection
}

function gitWork(
  partial: Partial<DashboardGitWorkSection> = {},
): DashboardGitWorkSection {
  return {
    branch: 'feature/nova-skin',
    clean: true,
    ahead: 0,
    behind: 0,
    changedFiles: 0,
    upstream: 'fork/feature/nova-skin',
    latestCommit: { hash: 'abc1234', subject: 'feat: test' },
    remotes: [],
    prUrl: null,
    warning: null,
    ...partial,
  }
}

type BuildInput = Parameters<typeof buildLiveSystems>[0]

function baseInput(partial: Partial<BuildInput> = {}): BuildInput {
  return {
    status: null,
    platforms: [],
    cron: null,
    kanban: null,
    modelInfo: null,
    analytics: null,
    skillsRaw: null,
    oauthProvidersRaw: null,
    jobBoard: {
      online: false,
      version: null,
      stateKeys: 0,
      events: 0,
      taylorKanbanItems: 0,
      taylorKanban: null,
    },
    gitWork: null,
    approvals: null,
    vaultProbe: { reachable: false, nodeCount: 0, memoryFiles: 0, newestModified: null },
    ...partial,
  }
}

function systemStatus(input: BuildInput, id: string): string | undefined {
  const section = buildLiveSystems(input)
  return section.systems.find((system) => system.id === id)?.status
}

describe('live systems truth taxonomy', () => {
  it('reports the gateway offline when the status endpoint is unreachable', () => {
    expect(systemStatus(baseInput(), 'hermes-gateway')).toBe('offline')
  })

  it('reports the gateway operational when status is parsed and platforms are healthy', () => {
    expect(
      systemStatus(baseInput({ status: statusSection() }), 'hermes-gateway'),
    ).toBe('operational')
  })

  it('reports the gateway degraded when a platform reports an error', () => {
    expect(
      systemStatus(
        baseInput({
          status: statusSection(),
          platforms: [
            { name: 'telegram', state: 'error', updatedAt: null, errorMessage: 'boom' },
          ],
        }),
        'hermes-gateway',
      ),
    ).toBe('degraded')
  })

  it('reports the model route operational only with both provider and model', () => {
    expect(
      systemStatus(baseInput({ modelInfo: modelInfo() }), 'model-route'),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({ modelInfo: modelInfo({ model: '' }) }),
        'model-route',
      ),
    ).toBe('connected')
    expect(systemStatus(baseInput(), 'model-route')).toBe('not-wired')
  })

  it('distinguishes reachable skills payloads from wired ones', () => {
    expect(
      systemStatus(baseInput({ skillsRaw: { skills: [{}, {}] } }), 'tools-skills'),
    ).toBe('operational')
    expect(
      systemStatus(baseInput({ skillsRaw: { skills: [] } }), 'tools-skills'),
    ).toBe('reachable')
    expect(systemStatus(baseInput(), 'tools-skills')).toBe('not-wired')
  })

  it('reports cron connected when the endpoint returns an empty real payload', () => {
    expect(
      systemStatus(baseInput({ cron: cronSection({ total: 0 }) }), 'cron-background'),
    ).toBe('connected')
    expect(
      systemStatus(baseInput({ cron: cronSection() }), 'cron-background'),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({ cron: cronSection({ failed: 1 }) }),
        'cron-background',
      ),
    ).toBe('degraded')
  })

  it('marks google workspace approval-gated when connected, reachable on weak signals', () => {
    const connected = {
      providers: [
        { name: 'google-gmail', connected: true },
        { name: 'google-calendar', connected: true },
      ],
    }
    expect(
      systemStatus(baseInput({ oauthProvidersRaw: connected }), 'google-workspace'),
    ).toBe('approval-gated')
    const weak = { providers: [{ name: 'google', connected: false }] }
    expect(
      systemStatus(baseInput({ oauthProvidersRaw: weak }), 'google-workspace'),
    ).toBe('reachable')
    expect(systemStatus(baseInput(), 'google-workspace')).toBe('not-wired')
  })

  it('reports the vault operational with nodes, reachable when empty, not-wired when missing', () => {
    expect(
      systemStatus(
        baseInput({
          vaultProbe: { reachable: true, nodeCount: 12, memoryFiles: 3, newestModified: null },
        }),
        'obsidian-vault',
      ),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({
          vaultProbe: { reachable: true, nodeCount: 0, memoryFiles: 0, newestModified: null },
        }),
        'obsidian-vault',
      ),
    ).toBe('reachable')
    expect(systemStatus(baseInput(), 'obsidian-vault')).toBe('not-wired')
  })

  it('splits job board reachable (ping only) from operational (kanban parsed)', () => {
    expect(
      systemStatus(
        baseInput({
          jobBoard: {
            online: true,
            version: '1.2',
            stateKeys: 5,
            events: 2,
            taylorKanbanItems: 3,
            taylorKanban: { items: 3, open: 2, stale: 0, blockers: 0, topTitles: [] },
          },
        }),
        'neon-moon-job-board',
      ),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({
          jobBoard: {
            online: true,
            version: null,
            stateKeys: 0,
            events: 0,
            taylorKanbanItems: 0,
            taylorKanban: null,
          },
        }),
        'neon-moon-job-board',
      ),
    ).toBe('reachable')
    expect(systemStatus(baseInput(), 'neon-moon-job-board')).toBe('not-wired')
  })

  it('reports kanban degraded on blocked cards, operational otherwise', () => {
    expect(
      systemStatus(baseInput({ kanban: kanbanSection() }), 'kanban-board'),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({ kanban: kanbanSection({ blocked: 2 }) }),
        'kanban-board',
      ),
    ).toBe('degraded')
  })

  it('flags cost route watch degraded on an unexpected-model spend anomaly', () => {
    expect(
      systemStatus(baseInput({ analytics: analyticsSection() }), 'cost-route-watch'),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({
          analytics: analyticsSection({
            topModels: [
              { id: 'gpt-5.5', tokens: 100, calls: 1, cost: 0.01, sessions: 1 },
              { id: 'claude-opus-4-8', tokens: 900, calls: 9, cost: 4.2, sessions: 1 },
            ],
          }),
        }),
        'cost-route-watch',
      ),
    ).toBe('degraded')
  })

  it('reports github/agent work operational from real git evidence', () => {
    expect(
      systemStatus(baseInput({ gitWork: gitWork() }), 'github-agent-work'),
    ).toBe('operational')
    expect(systemStatus(baseInput(), 'github-agent-work')).toBe('not-wired')
  })

  it('adds a taylor-approvals system that is approval-gated while items wait', () => {
    expect(
      systemStatus(
        baseInput({ approvals: { pending: 2, actionable: 1, degraded: false } }),
        'taylor-approvals',
      ),
    ).toBe('approval-gated')
    expect(
      systemStatus(
        baseInput({ approvals: { pending: 0, actionable: 0, degraded: false } }),
        'taylor-approvals',
      ),
    ).toBe('operational')
    expect(
      systemStatus(
        baseInput({ approvals: { pending: 0, actionable: 0, degraded: true } }),
        'taylor-approvals',
      ),
    ).toBe('degraded')
    expect(systemStatus(baseInput(), 'taylor-approvals')).toBe('not-wired')
  })

  it('summarizes the new taxonomy and only treats real problems as blockers', () => {
    const section = buildLiveSystems(
      baseInput({
        status: statusSection(),
        modelInfo: modelInfo(),
        approvals: { pending: 1, actionable: 1, degraded: false },
      }),
    )
    expect(section.summary.total).toBe(section.systems.length)
    expect(section.summary.operational).toBeGreaterThanOrEqual(2)
    expect(section.summary.approvalGated).toBe(1)
    expect(
      section.summary.operational +
        section.summary.connected +
        section.summary.reachable +
        section.summary.approvalGated +
        section.summary.degraded +
        section.summary.offline +
        section.summary.notWired,
    ).toBe(section.summary.total)
    // approval-gated is a "needs Taylor" state, not an outage — never a blocker
    expect(
      section.blockers.some((entry) => entry.startsWith('Taylor approvals')),
    ).toBe(false)
  })
})
