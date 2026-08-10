// @vitest-environment jsdom

import React from 'react'
import { screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardScreen } from './dashboard-screen'

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<unknown>
}

type MutationOptions = {
  mutationFn: () => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  mutationOptions: [] as Array<MutationOptions>,
  mutateAchievements: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = JSON.stringify(options.queryKey)

    return {
      data: key.includes('skills-count') ? 0 : undefined,
      status: 'success',
      isError: false,
      isFetching: false,
    }
  },
  useMutation: (options: MutationOptions) => {
    mocks.mutationOptions.push(options)
    return {
      mutate: mocks.mutateAchievements,
      isPending: false,
      isError: false,
      isSuccess: false,
      data: undefined,
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
    isVisible: () => false,
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
  mocks.mutationOptions.length = 0
  mocks.mutateAchievements.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('Dashboard mounted Session Card inventory', () => {
  it('does not render or query the Session Card inventory', async () => {
    await renderDashboard()

    const inventoryQueries = mocks.queryOptions.filter((option) =>
      JSON.stringify(option.queryKey).includes('session-cards'),
    )
    expect(inventoryQueries).toEqual([])
    expect(screen.queryByText(/Recent Sessions/i)).toBeNull()
  })

  it('defers achievement requests until the operator explicitly loads them', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await renderDashboard()

    const initialOverviewQuery = mocks.queryOptions.find(
      (option) =>
        option.queryKey[0] === 'dashboard' && option.queryKey[1] === 'overview',
    )
    expect(initialOverviewQuery).toBeDefined()
    await initialOverviewQuery?.queryFn()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/dashboard/overview?days=30',
    )

    await React.act(async () => {
      screen.getByRole('button', { name: 'Load achievements' }).click()
      await Promise.resolve()
    })

    expect(mocks.mutateAchievements).toHaveBeenCalledTimes(1)
    expect(initialOverviewQuery?.queryKey).toEqual([
      'dashboard',
      'overview',
      30,
    ])

    const achievementMutation = mocks.mutationOptions.at(-1)
    await achievementMutation?.mutationFn()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/dashboard/overview?days=30&achievements=5',
    )
  })
})
