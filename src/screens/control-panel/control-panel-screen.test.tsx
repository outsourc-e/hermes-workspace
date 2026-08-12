// @vitest-environment jsdom

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ControlPanelScreen } from './control-panel-screen'

// ── Mocks ────────────────────────────────────────────────────────

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<unknown>
  enabled?: boolean
  refetchInterval?: number
}

type QueryResult = {
  data?: unknown
  error: null
  isError: boolean
  isFetching: boolean
  isLoading: boolean
  isPending: boolean
  isSuccess: boolean
  refetch: ReturnType<typeof vi.fn>
}

const queryResults = new Map<string, unknown>()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions): QueryResult => {
    const key = options.queryKey[1] as string
    const data = queryResults.get(key)
    return {
      data,
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      isPending: false,
      isSuccess: true,
      refetch: vi.fn().mockResolvedValue({ data }),
    }
  },
  useMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => null,
}))

vi.mock('@/hooks/use-page-title', () => ({
  usePageTitle: () => {},
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}))

// ── Setup ────────────────────────────────────────────────────────

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  queryResults.clear()
})

afterEach(() => {
  while (mountedRoots.length > 0) {
    const cleanup = mountedRoots.pop()
    cleanup?.()
  }
})

function renderScreen(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(<ControlPanelScreen />)
  mountedRoots.push(() => {
    root.unmount()
    container.remove()
  })
  return container
}

// ── Tests ────────────────────────────────────────────────────────

describe('ControlPanelScreen', () => {
  it('renders the header and quick actions', async () => {
    queryResults.set('gateway-status', {
      capabilities: { health: true, chatCompletions: true },
      mode: 'zero-fork',
      gateway: { available: true, url: 'http://127.0.0.1:8642' },
      dashboard: { available: true, url: 'http://127.0.0.1:9119' },
    })
    queryResults.set('mission-metrics', {
      ok: true,
      metrics: { total: 0, active: 0, completed: 0, failed: 0, byState: {} },
    })
    queryResults.set('mission-list', { ok: true, missions: [] })
    queryResults.set('swarm-health', { workers: [], summary: undefined })
    queryResults.set('approvals', { ok: true, approvals: [] })
    queryResults.set('sessions', { sessions: [] })

    const container = await renderScreen()
    await React.act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('Agent Control Panel')
    expect(container.textContent).toContain('One surface')
    expect(container.textContent).toContain('Conductor')
    expect(container.textContent).toContain('Mission Graph')
    expect(container.textContent).toContain('Swarm')
  })

  it('renders gateway status with online indicator', async () => {
    queryResults.set('gateway-status', {
      capabilities: { health: true, chatCompletions: true, sessions: true },
      mode: 'zero-fork',
      gateway: { available: true, url: 'http://127.0.0.1:8642' },
      dashboard: { available: true, url: 'http://127.0.0.1:9119' },
    })
    queryResults.set('mission-metrics', {
      ok: true,
      metrics: { total: 0, active: 0, completed: 0, failed: 0, byState: {} },
    })
    queryResults.set('mission-list', { ok: true, missions: [] })
    queryResults.set('swarm-health', { workers: [], summary: undefined })
    queryResults.set('approvals', { ok: true, approvals: [] })
    queryResults.set('sessions', { sessions: [] })

    const container = await renderScreen()
    await React.act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('Gateway online')
    expect(container.textContent).toContain('Dashboard online')
    expect(container.textContent).toContain('zero-fork')
  })

  it('renders mission metrics and active missions', async () => {
    queryResults.set('gateway-status', {
      capabilities: {},
      gateway: { available: false, url: '' },
      dashboard: { available: false },
    })
    queryResults.set('mission-metrics', {
      ok: true,
      metrics: {
        total: 5,
        active: 2,
        completed: 2,
        failed: 1,
        byState: { running: 2, done: 2, failed: 1 },
      },
    })
    queryResults.set('mission-list', {
      ok: true,
      missions: [
        {
          id: 'm1',
          title: 'Test Mission',
          nodes: [
            { id: 'n1', title: 'Build', state: 'running', role: 'builder' },
            { id: 'n2', title: 'Review', state: 'done', role: 'reviewer' },
          ],
        },
      ],
    })
    queryResults.set('swarm-health', { workers: [], summary: undefined })
    queryResults.set('approvals', { ok: true, approvals: [] })
    queryResults.set('sessions', { sessions: [] })

    const container = await renderScreen()
    await React.act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('Total')
    expect(container.textContent).toContain('5')
    expect(container.textContent).toContain('Test Mission')
    expect(container.textContent).toContain('running')
  })

  it('renders swarm workers with auth status', async () => {
    queryResults.set('gateway-status', {
      capabilities: {},
      gateway: { available: false, url: '' },
      dashboard: { available: false },
    })
    queryResults.set('mission-metrics', {
      ok: true,
      metrics: { total: 0, active: 0, completed: 0, failed: 0, byState: {} },
    })
    queryResults.set('mission-list', { ok: true, missions: [] })
    queryResults.set('swarm-health', {
      workers: [
        {
          workerId: 'swarm-builder',
          displayName: 'Builder',
          humanLabel: 'Builder',
          role: 'builder',
          model: 'deepseek-v4-pro',
          provider: 'custom',
          profileFound: true,
          modelAuthStatus: 'ready',
          recentAuthErrors: 0,
        },
      ],
      summary: {
        totalWorkers: 1,
        wrappersConfigured: 1,
        totalAuthErrors24h: 0,
        degraded: false,
        warnings: [],
      },
    })
    queryResults.set('approvals', { ok: true, approvals: [] })
    queryResults.set('sessions', { sessions: [] })

    const container = await renderScreen()
    await React.act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('Builder')
    expect(container.textContent).toContain('builder')
    expect(container.textContent).toContain('ready')
  })

  it('renders pending approvals with approve/reject buttons', async () => {
    queryResults.set('gateway-status', {
      capabilities: {},
      gateway: { available: false, url: '' },
      dashboard: { available: false },
    })
    queryResults.set('mission-metrics', {
      ok: true,
      metrics: { total: 0, active: 0, completed: 0, failed: 0, byState: {} },
    })
    queryResults.set('mission-list', { ok: true, missions: [] })
    queryResults.set('swarm-health', { workers: [], summary: undefined })
    queryResults.set('approvals', {
      ok: true,
      approvals: [
        {
          id: 'a1',
          missionId: 'm1',
          actionId: 'deploy-prod',
          risk: 'high',
          target: 'production',
          status: 'pending',
          requestedBy: 'conductor',
          expiresAt: Date.now() + 60_000,
        },
      ],
    })
    queryResults.set('sessions', { sessions: [] })

    const container = await renderScreen()
    await React.act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('deploy-prod')
    expect(container.textContent).toContain('Approve')
    expect(container.textContent).toContain('Reject')
  })

  it('renders empty states when no data', async () => {
    queryResults.set('gateway-status', {
      capabilities: {},
      gateway: { available: false, url: '' },
      dashboard: { available: false },
    })
    queryResults.set('mission-metrics', {
      ok: true,
      metrics: { total: 0, active: 0, completed: 0, failed: 0, byState: {} },
    })
    queryResults.set('mission-list', { ok: true, missions: [] })
    queryResults.set('swarm-health', { workers: [], summary: undefined })
    queryResults.set('approvals', { ok: true, approvals: [] })
    queryResults.set('sessions', { sessions: [] })

    const container = await renderScreen()
    await React.act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('No missions created yet')
    expect(container.textContent).toContain('No swarm workers configured')
    expect(container.textContent).toContain('No pending approvals')
    expect(container.textContent).toContain('No active sessions')
  })
})
