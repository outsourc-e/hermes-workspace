// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentsScreen } from './agents-screen'
import type { AgentRegistryCardData } from '@/components/agent-view/agent-registry-card'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<unknown>
  enabled?: boolean
}

type QueryResult = {
  data?: unknown
  dataUpdatedAt: number
  isError: boolean
  isFetching: boolean
  isLoading: boolean
  isSuccess: boolean
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  cardResponse: undefined as SessionCardListWire | undefined,
  rawSessions: [] as Array<Record<string, unknown>>,
}))

function queryResult(data?: unknown): QueryResult {
  return {
    data,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSuccess: true,
    refetch: vi.fn().mockResolvedValue({ data }),
  }
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = options.queryKey
    if (key[0] === 'gateway' && key[1] === 'agents' && key.length === 2) {
      return queryResult({
        agents: [
          {
            id: 'worker',
            name: 'Worker',
            role: 'Builder',
            category: 'Coding',
            aliases: ['worker'],
          },
        ],
      })
    }
    if (key[0] === 'agent-registry' && key[1] === 'sessions') {
      return queryResult(mocks.rawSessions)
    }
    if (key[0] === 'chat' && key[1] === 'session-cards') {
      return queryResult(mocks.cardResponse)
    }
    if (key[0] === 'cron') return queryResult([])
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

vi.mock('@/components/agent-view/agent-registry-card', () => ({
  AgentRegistryCard: ({
    agent,
    onChat,
  }: {
    agent: AgentRegistryCardData
    onChat: (agent: AgentRegistryCardData) => void
  }) => (
    <article>
      <span>{agent.name}</span>
      <button
        type="button"
        aria-label={`Chat ${agent.name}`}
        data-session-key={agent.sessionKey ?? ''}
        data-card-id={agent.cardNavigation?.cardId ?? ''}
        onClick={() => onChat(agent)}
      >
        Chat
      </button>
    </article>
  ),
}))

vi.mock('./agent-hub-layout', () => ({ AgentHubLayout: () => null }))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@/components/ui/switch', () => ({ Switch: () => null }))
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: React.PropsWithChildren) => children,
  TabsContent: ({ children }: React.PropsWithChildren) => children,
  TabsList: ({ children }: React.PropsWithChildren) => children,
  TabsTrigger: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }))
vi.mock('@/hooks/use-pull-to-refresh', () => ({
  usePullToRefresh: () => ({
    isPulling: false,
    pullDistance: 0,
    threshold: 64,
  }),
}))
vi.mock('@/lib/cron-api', () => ({ fetchCronJobs: vi.fn() }))
vi.mock('@/lib/gateway-api', () => ({ toggleAgentPause: vi.fn() }))

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
    title: 'Worker active Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:worker-tip',
    continuationSegmentKeys: ['remote:worker-root', 'remote:worker-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'remote:delegated-child',
        sessionKey: 'remote:delegated-tip',
        continuationSegmentKeys: [
          'remote:delegated-child',
          'remote:delegated-tip',
        ],
        relationshipKind: 'child',
        title: 'Hidden delegated activity',
        status: 'running',
        updatedAt: Date.now(),
        continuationCount: 2,
      },
    ],
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

async function renderRegistry() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<AgentsScreen variant="registry" />)
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
  mocks.rawSessions = [
    {
      key: 'worker-tip',
      friendlyId: 'worker',
      title: 'Worker active Card',
      status: 'running',
      updatedAt: Date.now(),
    },
  ]
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('Agent Registry mounted Session Card inventory', () => {
  it('opens a valid remote agent through Card-native identity without a raw inventory query', async () => {
    const body = cardResponse()
    mocks.cardResponse = body
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (String(input) === '/api/session-cards') {
        return Promise.resolve(Response.json(body))
      }
      return Promise.resolve(Response.json({}, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderRegistry()

    const chat = screen.getByRole('button', { name: 'Chat Worker' })
    expect(chat.getAttribute('data-card-id')).toBe('remote:worker-root')
    expect(chat.getAttribute('data-session-key')).toBe('')
    React.act(() => fireEvent.click(chat))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-root' },
      search: {},
    })
    mocks.navigate.mockClear()
    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Open Chat' })),
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:worker-root' },
      search: { inspect: 'remote:delegated-child' },
    })
    expect(document.body.textContent).not.toContain('remote:delegated-tip')

    expect(
      mocks.queryOptions.some(
        ({ queryKey }) =>
          queryKey[0] === 'agent-registry' && queryKey[1] === 'sessions',
      ),
    ).toBe(false)
    const cardQuery = mocks.queryOptions.find(
      ({ queryKey }) =>
        queryKey[0] === 'chat' && queryKey[1] === 'session-cards',
    )
    await expect(cardQuery?.queryFn()).resolves.toEqual(body)
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      '/api/sessions',
    )
  })

  it('hides source activity whose owning Card resolution is incomplete', async () => {
    mocks.cardResponse = cardResponse('incomplete')
    mocks.rawSessions = [
      {
        key: 'subagent:delegated-tip',
        title: 'Hidden delegated activity',
        status: 'running',
        updatedAt: Date.now(),
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(mocks.cardResponse)),
    )

    await renderRegistry()

    expect(screen.queryByText('Hidden delegated activity')).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
