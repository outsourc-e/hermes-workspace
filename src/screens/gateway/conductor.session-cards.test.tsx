// @vitest-environment jsdom

import React from 'react'
import { screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Conductor } from './conductor'
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
  error: null
  isError: boolean
  isFetching: boolean
  isLoading: boolean
  isPending: boolean
  isSuccess: boolean
  refetch: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  queryOptions: [] as Array<QueryOptions>,
  cardResponse: undefined as SessionCardListWire | undefined,
}))

function queryResult(data?: unknown): QueryResult {
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
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = options.queryKey
    if (key[0] === 'chat' && key[1] === 'session-cards') {
      return queryResult(mocks.cardResponse)
    }
    if (key[0] === 'conductor' && key[1] === 'models') {
      return queryResult({ models: [] })
    }
    return queryResult(undefined)
  },
  useMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('./components/office-view', () => ({
  OfficeView: ({
    agentRows,
  }: {
    agentRows: Array<{
      id: string
      lastLine?: string
      roleDescription?: string
      sessionKey?: string
    }>
  }) => (
    <div data-testid="office-view">
      {agentRows.map((row) => (
        <article key={row.id}>
          {row.roleDescription} {row.lastLine}
        </article>
      ))}
    </div>
  ),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@/components/workflow-help-modal', () => ({
  WorkflowHelpModal: () => null,
}))
vi.mock('@/components/prompt-kit/markdown', () => ({
  Markdown: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function rootCard(
  cardId: string,
  title: string,
  updatedAt: number,
): SessionCardWire {
  const source = cardId.startsWith('local:') ? 'local' : 'remote'
  return {
    cardId,
    canonicalSource: source,
    ...(source === 'remote' ? { canonicalTransport: 'gateway' as const } : {}),
    title,
    titleSource: 'manual',
    canonicalSegmentKey: cardId,
    continuationSegmentKeys: [cardId],
    continuationCount: 1,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt,
    archived: false,
    pinned: false,
  }
}

function conductorCards(): SessionCardListWire {
  const completeRemote = rootCard(
    'remote:shared-worker',
    'Remote complete Card activity',
    Date.now(),
  )
  completeRemote.canonicalSegmentKey = 'remote:shared-runtime-key'
  completeRemote.continuationSegmentKeys = [
    completeRemote.cardId,
    completeRemote.canonicalSegmentKey,
  ]
  completeRemote.continuationCount = 2
  completeRemote.childNodes = [
    {
      cardId: 'remote:delegated-worker',
      sessionKey: 'remote:delegated-worker-tip',
      continuationSegmentKeys: [
        'remote:delegated-worker',
        'remote:delegated-worker-tip',
      ],
      continuationCount: 2,
      relationshipKind: 'child',
      title: 'Qualified child Card activity',
      status: 'running',
      updatedAt: Date.now() - 1,
    },
  ]
  const completeLocal = rootCard(
    'local:shared-worker',
    'Local complete Card activity',
    Date.now() - 2,
  )
  completeLocal.canonicalSegmentKey = 'local:shared-runtime-key'
  completeLocal.continuationSegmentKeys = [
    completeLocal.cardId,
    completeLocal.canonicalSegmentKey,
  ]
  completeLocal.continuationCount = 2
  const incomplete = rootCard(
    'remote:raw-incomplete-session',
    'Incomplete raw fallback must stay hidden',
    Date.now() - 3,
  )
  return {
    cards: [completeRemote, completeLocal, incomplete],
    cardResolutions: [
      {
        cardId: completeRemote.cardId,
        completeness: 'complete',
        retryable: false,
      },
      {
        cardId: completeLocal.cardId,
        completeness: 'complete',
        retryable: false,
      },
      {
        cardId: incomplete.cardId,
        completeness: 'incomplete',
        retryable: true,
      },
    ],
    completeness: 'incomplete',
    retryable: true,
    sources: [
      {
        source: 'gateway',
        status: 'incomplete',
        fetched: 2,
        retryable: true,
        reason: 'safe-cap',
      },
      {
        source: 'local',
        status: 'complete',
        fetched: 1,
        retryable: false,
      },
    ],
  }
}

async function renderConductor() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<Conductor />)
    await Promise.resolve()
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return container
}

beforeEach(() => {
  localStorage.clear()
  mocks.queryOptions.length = 0
  mocks.cardResponse = conductorCards()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
  vi.clearAllTimers()
})

describe('mounted /conductor Session Card inventory', () => {
  it('uses exact complete source-qualified Cards and never requests or emits raw session routes', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (String(input) === '/api/session-cards') {
        return Promise.resolve(Response.json(mocks.cardResponse))
      }
      return Promise.resolve(Response.json({}, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const container = await renderConductor()

    expect(
      screen.getAllByText(/Remote complete Card activity/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Local complete Card activity/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Qualified child Card activity/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText('Incomplete raw fallback must stay hidden'),
    ).toBeNull()

    const cardQuery = mocks.queryOptions.find(
      ({ queryKey }) =>
        queryKey[0] === 'chat' && queryKey[1] === 'session-cards',
    )
    expect(cardQuery).toBeDefined()
    await expect(cardQuery?.queryFn()).resolves.toEqual(mocks.cardResponse)
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/session-cards',
    ])
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      '/api/sessions',
    )
    expect(
      mocks.queryOptions.some(
        ({ queryKey }) =>
          queryKey[0] === 'conductor' &&
          (queryKey[1] === 'gateway' || queryKey[1] === 'recent-sessions'),
      ),
    ).toBe(false)

    expect(container.textContent).not.toContain('raw-incomplete-session')
    expect(
      [...container.querySelectorAll('a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).not.toContain('/chat/raw-incomplete-session')
  })

  it('matches active workers by source-qualified Card identity and renders only the matched Card state', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify({
        goal: 'A mission whose title does not match any Card',
        phase: 'running',
        missionStartedAt: '2026-07-27T11:59:00.000Z',
        isPaused: false,
        pausedElapsedMs: 0,
        accumulatedPausedMs: 0,
        pauseStartedAt: null,
        workerKeys: ['remote:shared-runtime-key'],
        workerLabels: [],
        workerOutputs: {},
        streamText: '',
        planText: '',
        completedAt: null,
        tasks: [],
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json(mocks.cardResponse)),
      ),
    )

    const container = await renderConductor()

    expect(
      screen.getAllByText(/Remote complete Card activity/).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/Local complete Card activity/)).toBeNull()
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
    expect(screen.getByText('1 active')).not.toBeNull()
    expect(container.textContent).not.toContain('remote:shared-runtime-key')
    expect(container.textContent).not.toContain('raw-incomplete-session')
  })
})
