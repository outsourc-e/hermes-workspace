// @vitest-environment jsdom

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Swarm2Screen } from './swarm2-screen'

const RAW_LOG_SENTINEL = 'RAW_AGENT_LOG_ACTIVITY_MUST_NOT_RENDER'
const RAW_TITLE_SENTINEL = 'RAW_STATE_DB_TITLE_MUST_NOT_RENDER'
const SAFE_STATUS = 'Building the requested worker control plane'

const mocks = vi.hoisted(() => ({
  reportRuntimes: [] as Array<Record<string, unknown>>,
}))

const crewMember = {
  id: 'builder',
  displayName: 'Builder',
  role: 'Builder',
  profileFound: true,
  gatewayState: 'running',
  processAlive: true,
  platforms: {},
  model: 'test-model',
  provider: 'test-provider',
  lastSessionTitle: RAW_TITLE_SENTINEL,
  lastSessionAt: 1_700_000_000_000,
  sessionCount: 1,
  messageCount: 2,
  toolCallCount: 3,
  totalTokens: 4,
  estimatedCostUsd: null,
  cronJobCount: 0,
  assignedTaskCount: 1,
}

const runtimeEntry = {
  workerId: 'builder',
  displayName: 'Builder',
  role: 'Builder',
  currentTask: SAFE_STATUS,
  recentLogTail: RAW_LOG_SENTINEL,
  pid: 123,
  startedAt: 1_700_000_000_000,
  lastOutputAt: 1_700_000_000_100,
  cwd: null,
  phase: 'running',
  lastSummary: 'Safe checkpoint status',
  blockedReason: null,
  checkpointStatus: 'running',
  state: 'executing',
  needsHuman: false,
  assignedTaskCount: 1,
  cronJobCount: 0,
  tmuxSession: null,
  tmuxAttachable: false,
  logPath: '/profiles/builder/logs/agent.log',
  terminalKind: 'log-tail',
  lastSessionStartedAt: 1_700_000_000_200,
  source: 'runtime.json',
  session: {
    sessionTitle: RAW_TITLE_SENTINEL,
    historySource: 'state.db',
    recentLogTail: RAW_LOG_SENTINEL,
    logPath: '/profiles/builder/logs/agent.log',
  },
  artifacts: [],
  previews: [],
}

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }))
vi.mock('@/components/workflow-help-modal', () => ({
  WorkflowHelpModal: () => null,
}))
vi.mock('@/hooks/use-crew-status', () => ({
  getOnlineStatus: () => 'online',
  useCrewStatus: () => ({
    crew: [crewMember],
    lastUpdated: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: Array<string> }) => {
    const key = queryKey.join(':')
    const data =
      key === 'swarm2:runtime'
        ? { entries: [runtimeEntry], tmuxAvailable: false }
        : key === 'swarm2:health'
          ? {
              workspaceModel: 'test-model',
              summary: { totalAuthErrors24h: 0 },
            }
          : []
    return {
      data,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn().mockResolvedValue({ data }),
    }
  },
}))
vi.mock('./swarm2-wires', () => ({ Swarm2Wires: () => null }))
vi.mock('./swarm2-kanban-board', () => ({ Swarm2KanbanBoard: () => null }))
vi.mock('./operational-worker-card', () => ({
  OperationalWorkerCard: (props: {
    member: typeof crewMember
    currentTask?: string | null
    recentLines?: Array<string>
    recentSummary?: string | null
  }) => (
    <div data-testid="worker-card-props">
      {props.member.lastSessionTitle}
      {props.currentTask}
      {props.recentLines?.join('\n')}
      {props.recentSummary}
    </div>
  ),
}))
vi.mock('./swarm2-orchestrator-card', () => ({
  Swarm2OrchestratorCard: (props: {
    members: Array<typeof crewMember>
    activeAgents?: Array<{ task: string }>
    recentUpdates?: Array<{ text: string }>
  }) => (
    <div data-testid="orchestrator-props">
      {props.members.map((member) => member.lastSessionTitle).join('\n')}
      {props.activeAgents?.map((agent) => agent.task).join('\n')}
      {props.recentUpdates?.map((update) => update.text).join('\n')}
    </div>
  ),
}))
vi.mock('./swarm2-reports-view', () => ({
  buildSwarm2InboxLanes: ({
    runtimes,
  }: {
    runtimes: Array<Record<string, unknown>>
  }) => {
    mocks.reportRuntimes = runtimes
    return { needs_review: [], blocked: [], ready: [] }
  },
  Swarm2ReportsView: ({
    runtimes,
  }: {
    runtimes: Array<Record<string, unknown>>
  }) => <div data-testid="report-props">{JSON.stringify(runtimes)}</div>,
}))
vi.mock('@/components/swarm/router-chat', () => ({
  RouterChat: ({ members }: { members: Array<typeof crewMember> }) => (
    <div data-testid="router-props">
      {members.map((member) => member.lastSessionTitle).join('\n')}
    </div>
  ),
}))
vi.mock('@/components/swarm/swarm-terminal', () => ({
  SwarmTerminal: ({ command }: { command: Array<string> }) => (
    <div data-testid="terminal-command">{command.join(' ')}</div>
  ),
}))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

async function mountSurface(surface: '/swarm' | '/swarm2') {
  const container = document.createElement('div')
  container.dataset.surface = surface
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<Swarm2Screen />)
    await Promise.resolve()
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return container
}

beforeEach(() => {
  mocks.reportRuntimes = []
  window.localStorage.clear()
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(window, 'scrollTo', {
    value: vi.fn(),
    configurable: true,
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe.each(['/swarm', '/swarm2'] as const)(
  'mounted %s activity boundary',
  (surface) => {
    it('fails closed on raw agent.log and state.db activity while preserving worker status', async () => {
      const container = await mountSurface(surface)
      const text = container.textContent

      expect(text).toContain(SAFE_STATUS)
      expect(text).not.toContain('Recent swarm activity')
      expect(text).not.toContain(RAW_LOG_SENTINEL)
      expect(text).not.toContain(RAW_TITLE_SENTINEL)
      expect(text).not.toContain('agent.log')
      expect(text).not.toContain('state.db')
      expect(JSON.stringify(mocks.reportRuntimes)).not.toContain(
        RAW_LOG_SENTINEL,
      )
      expect(JSON.stringify(mocks.reportRuntimes)).not.toContain(
        RAW_TITLE_SENTINEL,
      )
      expect(JSON.stringify(mocks.reportRuntimes)).not.toContain('agent.log')
      expect(JSON.stringify(mocks.reportRuntimes)).not.toContain('state.db')
    })
  },
)
