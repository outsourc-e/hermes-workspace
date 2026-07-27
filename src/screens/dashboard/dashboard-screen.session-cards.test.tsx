// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardScreen } from './dashboard-screen'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  cardResponse: undefined as SessionCardListWire | undefined,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = JSON.stringify(options.queryKey)
    if (key === JSON.stringify(['chat', 'session-cards', 'list', false])) {
      return {
        data: mocks.cardResponse,
        status: 'success',
        isError: false,
        isFetching: false,
      }
    }
    if (key === JSON.stringify(['dashboard', 'sessions'])) {
      return {
        data: {
          sessions: [
            {
              key: 'worker-tip',
              derivedTitle: 'Worker Card',
              updatedAt: Date.now(),
            },
          ],
          unavailable: false,
        },
        status: 'success',
        isError: false,
        isFetching: false,
      }
    }
    return {
      data: key.includes('skills-count') ? 0 : undefined,
      status: 'success',
      isError: false,
      isFetching: false,
    }
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@hugeicons/core-free-icons', () => ({
  BubbleChatAddIcon: {},
  CheckmarkCircle02Icon: {},
  ConsoleIcon: {},
  Edit02Icon: {},
  Moon02Icon: {},
  PuzzleIcon: {},
  Settings02Icon: {},
  Sun02Icon: {},
}))

vi.mock('recharts', () => ({
  Area: () => null,
  AreaChart: ({ children }: React.PropsWithChildren) => children,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => children,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

vi.mock('./components/achievements-card', () => ({
  AchievementsCard: () => null,
}))
vi.mock('./components/active-model-kpi', () => ({ ActiveModelKpi: () => null }))
vi.mock('./components/analytics-chart-card', () => ({
  AnalyticsChartCard: () => null,
}))
vi.mock('./components/attention-marquee', () => ({
  AttentionMarquee: () => null,
}))
vi.mock('./components/cache-efficiency-card', () => ({
  CacheEfficiencyCard: () => null,
}))
vi.mock('./components/cost-ledger-card', () => ({ CostLedgerCard: () => null }))
vi.mock('./components/edit-mode-panel', () => ({ EditModePanel: () => null }))
vi.mock('./components/hero-metrics', () => ({ HeroMetrics: () => null }))
vi.mock('./components/logs-tail-card', () => ({ LogsTailCard: () => null }))
vi.mock('./components/operator-tip-card', () => ({
  OperatorTipCard: () => null,
}))
vi.mock('./components/ops-strip', () => ({ OpsStrip: () => null }))
vi.mock('./components/provider-mix-card', () => ({
  ProviderMixCard: () => null,
}))
vi.mock('./components/skills-usage-card', () => ({
  SkillsUsageCard: () => null,
}))
vi.mock('./components/token-mix-hour-card', () => ({
  TokenMixHourCard: () => null,
}))
vi.mock('./components/top-models-card', () => ({ TopModelsCard: () => null }))
vi.mock('./components/velocity-card', () => ({ VelocityCard: () => null }))

vi.mock('./components/widget-shell', () => ({
  WidgetShell: ({ children }: React.PropsWithChildren) => children,
}))

vi.mock('./lib/use-dashboard-layout', () => ({
  useDashboardLayout: () => ({
    editMode: false,
    isVisible: (id: string) => id === 'sessions_intelligence',
    toggleEdit: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-feature-available', () => ({
  useFeatureAvailable: () => true,
}))

vi.mock('@/hooks/use-settings', () => ({
  applyTheme: vi.fn(),
  useSettingsStore: (
    selector: (state: { updateSettings: () => void }) => unknown,
  ) => selector({ updateSettings: vi.fn() }),
}))

vi.mock('@/components/mobile-hamburger-menu', () => ({
  openHamburgerMenu: vi.fn(),
}))

vi.mock('@/components/avatars', () => ({
  AgentIdentityAvatar: () => null,
}))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function cardResponse(
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  const card: SessionCardWire = {
    cardId: 'remote:worker-root',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Worker Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:worker-tip',
    continuationSegmentKeys: ['remote:worker-root', 'remote:worker-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: Date.now(),
    archived: false,
    pinned: false,
  }
  return {
    cards: [card],
    cardResolutions: [
      {
        cardId: card.cardId,
        completeness,
        retryable: completeness === 'incomplete',
      },
    ],
    completeness,
    retryable: completeness === 'incomplete',
    sources: [
      {
        source: 'gateway',
        status: completeness,
        fetched: 1,
        retryable: completeness === 'incomplete',
        ...(completeness === 'incomplete'
          ? { reason: 'safe-cap' as const }
          : {}),
      },
    ],
  }
}

async function renderDashboard() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<DashboardScreen />)
    await Promise.resolve()
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.queryOptions.length = 0
  window.localStorage.clear()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('Dashboard mounted Session Card inventory', () => {
  it('uses the Card query and opens a remote continuation through its parent cardId', async () => {
    const body = cardResponse()
    mocks.cardResponse = body
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (String(input) === '/api/session-cards') {
        return Promise.resolve(Response.json(body))
      }
      return Promise.resolve(Response.json({}, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderDashboard()

    const row = screen.getByRole('button', { name: /Worker Card/i })
    expect(row.hasAttribute('disabled')).toBe(false)
    React.act(() => fireEvent.click(row))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-root' },
      search: {},
    })

    const inventoryQueries = mocks.queryOptions.filter((option) =>
      JSON.stringify(option.queryKey).includes('session'),
    )
    expect([
      ...new Set(
        inventoryQueries.map((option) => JSON.stringify(option.queryKey)),
      ),
    ]).toEqual([JSON.stringify(['chat', 'session-cards', 'list', false])])
    await expect(inventoryQueries[0]?.queryFn()).resolves.toEqual(body)
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      '/api/sessions?limit=200&offset=0',
    )
  })

  it('does not render activity from an incomplete Card resolution', async () => {
    mocks.cardResponse = cardResponse('incomplete')
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(mocks.cardResponse)),
    )

    await renderDashboard()

    expect(screen.queryByRole('button', { name: /Worker Card/i })).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
