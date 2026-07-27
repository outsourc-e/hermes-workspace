// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationsScreen } from './operations-screen'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<unknown>
}

type QueryResult = {
  data?: unknown
  error: null
  isPending: boolean
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  cardResponse: undefined as SessionCardListWire | undefined,
}))

function queryResult(data?: unknown): QueryResult {
  return {
    data,
    error: null,
    isPending: false,
    refetch: vi.fn().mockResolvedValue({ data }),
  }
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = options.queryKey
    if (key[0] === 'operations' && key[1] === 'config') {
      return queryResult({
        parsed: {
          agents: {
            list: [
              {
                id: 'worker',
                name: 'Worker',
                model: 'test-model',
              },
            ],
          },
          defaultModel: 'test-model',
        },
      })
    }
    if (key[0] === 'chat' && key[1] === 'session-cards') {
      return queryResult(mocks.cardResponse)
    }
    if (key[0] === 'operations' && key[1] === 'sessions') {
      return queryResult([
        {
          key: 'raw-unmapped-session',
          title: 'Raw session must stay hidden',
          status: 'running',
          updatedAt: Date.now(),
        },
      ])
    }
    if (key[0] === 'operations' && key[1] === 'cron') return queryResult([])
    return queryResult(undefined)
  },
  useMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button {...props}>{children}</button>
    ),
  },
}))

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('./components/orchestrator-card', () => ({
  OrchestratorCard: () => null,
}))
vi.mock('./components/operations-agent-card', () => ({
  OperationsAgentCard: ({
    agent,
  }: {
    agent: { name: string; sessionKey: string }
  }) => (
    <button
      type="button"
      aria-label={`Control ${agent.name}`}
      data-control-session-key={agent.sessionKey}
    >
      {agent.name}
    </button>
  ),
}))
vi.mock('./components/operations-agent-detail', () => ({
  OperationsAgentDetail: () => null,
}))
vi.mock('./components/operations-new-agent-modal', () => ({
  OperationsNewAgentModal: () => null,
}))
vi.mock('./components/operations-settings-modal', () => ({
  OperationsSettingsModal: () => null,
}))
vi.mock('./components/full-outputs-view', () => ({
  FullOutputsView: () => null,
}))
vi.mock('./components/agent-bus-panel', () => ({ AgentBusPanel: () => null }))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }))
vi.mock('@/lib/cron-api', () => ({ fetchCronJobs: vi.fn() }))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function sessionCardResponse({
  rootCompleteness = 'complete',
  includeMissingResolution = false,
}: {
  rootCompleteness?: 'complete' | 'incomplete'
  includeMissingResolution?: boolean
} = {}): SessionCardListWire {
  const root: SessionCardWire = {
    cardId: 'remote:worker-root',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Worker root activity',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:worker-tip',
    continuationSegmentKeys: ['remote:worker-root', 'remote:worker-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'remote:worker-child',
        sessionKey: 'remote:worker-child-tip',
        continuationSegmentKeys: [
          'remote:worker-child',
          'remote:worker-child-tip',
        ],
        continuationCount: 2,
        relationshipKind: 'child',
        title: 'Worker child activity',
        status: 'running',
        updatedAt: 20,
      },
    ],
    updatedAt: 10,
    archived: false,
    pinned: false,
  }
  const missingResolution: SessionCardWire = {
    ...root,
    cardId: 'local:unmapped-root',
    canonicalSource: 'local',
    canonicalTransport: undefined,
    title: 'Unmapped Card activity',
    canonicalSegmentKey: 'local:unmapped-root',
    continuationSegmentKeys: ['local:unmapped-root'],
    continuationCount: 1,
    childNodes: [],
  }
  const cards = includeMissingResolution ? [root, missingResolution] : [root]
  return {
    cards,
    cardResolutions: [
      {
        cardId: root.cardId,
        completeness: rootCompleteness,
        retryable: rootCompleteness === 'incomplete',
      },
    ],
    completeness: rootCompleteness,
    retryable: rootCompleteness === 'incomplete',
    sources: [],
  }
}

async function renderOperations() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<OperationsScreen />)
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
  mocks.cardResponse = sessionCardResponse()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('mounted Operations Session Card activity', () => {
  it('uses the Card endpoint and routes exact complete root and child activity', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(mocks.cardResponse))
    vi.stubGlobal('fetch', fetchMock)

    await renderOperations()

    expect(screen.queryByText('Raw session must stay hidden')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Control Worker' })
        .getAttribute('data-control-session-key'),
    ).toBe('agent:main:ops-worker')
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Worker root activity' }),
      ),
    )
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-root' },
      search: {},
    })
    React.act(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Open Worker child activity' }),
      ),
    )
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-root' },
      search: { inspect: 'remote:worker-child' },
    })

    expect(
      mocks.queryOptions.some(
        ({ queryKey }) =>
          queryKey[0] === 'operations' && queryKey[1] === 'sessions',
      ),
    ).toBe(false)
    const cardQuery = mocks.queryOptions.find(
      ({ queryKey }) =>
        queryKey[0] === 'chat' && queryKey[1] === 'session-cards',
    )
    await expect(cardQuery?.queryFn()).resolves.toEqual(mocks.cardResponse)
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/session-cards',
    ])
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      '/api/sessions',
    )
  })

  it('hides incomplete and unresolved Card activity', async () => {
    mocks.cardResponse = sessionCardResponse({
      rootCompleteness: 'incomplete',
      includeMissingResolution: true,
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(mocks.cardResponse)),
    )

    await renderOperations()

    expect(screen.queryByText('Worker root activity')).toBeNull()
    expect(screen.queryByText('Worker child activity')).toBeNull()
    expect(screen.queryByText('Unmapped Card activity')).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
