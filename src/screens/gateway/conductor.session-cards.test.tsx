// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
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

function persistedMissionV3(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 3,
    missionId: null,
    missionJobId: null,
    goal: 'A mission whose title does not match any Card',
    phase: 'running',
    missionStartedAt: '2026-07-27T11:59:00.000Z',
    isPaused: false,
    pausedElapsedMs: 0,
    accumulatedPausedMs: 0,
    pauseStartedAt: null,
    orchestratorCardId: 'remote:shared-worker',
    workerCards: [{ cardId: 'remote:shared-worker' }],
    completedAt: null,
    tasks: [],
    ...overrides,
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
      JSON.stringify(persistedMissionV3()),
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
    // The exact root Card owner also admits its verified child Card activity.
    expect(screen.getByText('2 active')).not.toBeNull()
    expect(container.textContent).not.toContain('remote:shared-runtime-key')
    expect(container.textContent).not.toContain('raw-incomplete-session')

    const serialized = localStorage.getItem('conductor:active-mission') ?? ''
    expect(serialized).toContain('remote:shared-worker')
    expect(serialized).not.toContain('remote:shared-runtime-key')
    expect(serialized).not.toContain('workerKeys')
    expect(serialized).not.toContain('workerOutputs')
    expect(serialized).not.toContain('streamText')
    expect(serialized).not.toContain('planText')
    expect(serialized).not.toContain('"output"')
  })

  it('removes legacy raw worker ownership instead of restoring it', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify({
        version: 2,
        goal: 'Legacy mission',
        phase: 'running',
        workerKeys: ['remote:shared-runtime-key'],
        workerOutputs: {
          'remote:shared-runtime-key': 'legacy transcript',
        },
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json(mocks.cardResponse)),
      ),
    )

    const container = await renderConductor()

    expect(localStorage.getItem('conductor:active-mission')).toBeNull()
    expect(container.textContent).not.toContain('remote:shared-runtime-key')
    expect(container.textContent).not.toContain('legacy transcript')
  })

  it.each([
    ['partial', 'partial', true],
    ['retryable', 'complete', true],
  ] as const)(
    'hides %s worker history output and exposes a retry control',
    async (_case, completeness, retryable) => {
      localStorage.setItem(
        'conductor:active-mission',
        JSON.stringify(persistedMissionV3()),
      )
      const fetchMock = vi.fn<typeof fetch>((input) => {
        const url = String(input)
        if (url.includes('/history')) {
          return Promise.resolve(
            Response.json({
              cardId: 'remote:shared-worker',
              canonicalSegmentKey: 'remote:shared-runtime-key',
              messages: [
                {
                  segmentKey: 'remote:shared-runtime-key',
                  message: {
                    role: 'assistant',
                    content: 'unsafe Conductor transcript',
                  },
                },
              ],
              completeness,
              retryable,
              missingSegments:
                completeness === 'partial'
                  ? [
                      {
                        segmentKey: 'remote:missing',
                        retryable: true,
                        error: 'temporarily unavailable',
                      },
                    ]
                  : [],
            }),
          )
        }
        if (url === '/api/session-cards') {
          return Promise.resolve(Response.json(mocks.cardResponse))
        }
        return Promise.resolve(Response.json({}, { status: 404 }))
      })
      vi.stubGlobal('fetch', fetchMock)

      const container = await renderConductor()
      await React.act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(container.textContent).not.toContain('unsafe Conductor transcript')
      expect(
        screen.getAllByText(
          'Worker transcript unavailable until complete history can be loaded.',
        ).length,
      ).toBeGreaterThan(0)
      React.act(() =>
        fireEvent.click(
          screen.getAllByRole('button', {
            name: 'Retry worker transcript',
          })[0]!,
        ),
      )
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).includes('/history'),
        ).length,
      ).toBeGreaterThan(1)
    },
  )

  it('removes current-version canonical transport strings injected as Card ownership', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify(
        persistedMissionV3({
          orchestratorCardId: 'remote:shared-runtime-key',
          workerCards: [{ cardId: 'remote:delegated-worker-tip' }],
          tasks: [
            {
              id: 'task-raw',
              title: 'Raw injection',
              status: 'running',
              workerCardId: 'remote:delegated-worker-tip',
            },
          ],
        }),
      ),
    )

    await renderConductor()
    await React.act(async () => Promise.resolve())

    expect(localStorage.getItem('conductor:active-mission')).toBeNull()
    expect(screen.queryByText('Raw injection')).toBeNull()
  })

  it('requires the exact projected parent for a persisted child Card', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify(
        persistedMissionV3({
          workerCards: [{ cardId: 'remote:delegated-worker' }],
          tasks: [],
        }),
      ),
    )

    await renderConductor()
    await React.act(async () => Promise.resolve())
    expect(localStorage.getItem('conductor:active-mission')).toBeNull()
  })

  it('retains and re-persists an exact child Card with its exact parent', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify(
        persistedMissionV3({
          workerCards: [
            {
              cardId: 'remote:delegated-worker',
              parentCardId: 'remote:shared-worker',
            },
          ],
          tasks: [],
        }),
      ),
    )

    await renderConductor()
    await React.act(async () => Promise.resolve())

    const restored = localStorage.getItem('conductor:active-mission')
    expect(restored).not.toBeNull()
    expect(JSON.parse(restored ?? '{}').workerCards).toEqual([
      {
        cardId: 'remote:delegated-worker',
        parentCardId: 'remote:shared-worker',
      },
    ])
  })

  it('retains durable Card ownership and stays retryable when stop is only partially successful', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify(persistedMissionV3()),
    )
    let stopBody: {
      cardBindings?: Array<{
        cardId?: string
        parentCardId?: string | null
        canonicalSegmentKey?: string
      }>
    } = {}
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/conductor-stop') {
        stopBody = JSON.parse(String(init?.body)) as {
          cardBindings?: Array<{
            cardId?: string
            parentCardId?: string | null
            canonicalSegmentKey?: string
          }>
        }
        return Promise.resolve(
          Response.json(
            {
              ok: false,
              deleted: 1,
              failures: [
                {
                  operation: 'delete-session',
                  id: 'remote:delegated-worker',
                  error: 'gateway delete failed',
                },
              ],
            },
            { status: 502 },
          ),
        )
      }
      if (url.includes('/history')) {
        return Promise.resolve(
          Response.json({
            completeness: 'incomplete',
            retryable: true,
            messages: [],
            missingSegments: [],
          }),
        )
      }
      return Promise.resolve(Response.json(mocks.cardResponse))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderConductor()
    await React.act(async () => {
      await Promise.resolve()
      fireEvent.click(screen.getByRole('button', { name: /stop mission/i }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(stopBody.cardBindings?.map((binding) => binding.cardId)).toEqual(
      expect.arrayContaining([
        'remote:shared-worker',
        'remote:delegated-worker',
      ]),
    )
    expect(
      stopBody.cardBindings?.map((binding) => binding.canonicalSegmentKey),
    ).not.toContain('raw-incomplete-session')
    expect(
      screen.getByText(/Mission stop incomplete; retry Stop/),
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: /stop mission/i })).not.toBeNull()

    const persisted = localStorage.getItem('conductor:active-mission')
    expect(persisted).not.toBeNull()
    expect(JSON.parse(persisted ?? '{}').workerCards).toEqual([
      {
        cardId: 'remote:delegated-worker',
        parentCardId: 'remote:shared-worker',
      },
    ])
    expect(persisted).not.toContain('raw-incomplete-session')
  })

  it('stays retryable instead of completing when no authoritative stop target is projected', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify(
        persistedMissionV3({
          orchestratorCardId: null,
          workerCards: [],
        }),
      ),
    )
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json(mocks.cardResponse)),
    )
    vi.stubGlobal('fetch', fetchMock)

    await renderConductor()
    await React.act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop mission/i }))
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/api/conductor-stop'),
      ),
    ).toBe(false)
    expect(
      screen.getByText(/No authoritative mission ownership is available yet/),
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: /stop mission/i })).not.toBeNull()
    expect(localStorage.getItem('conductor:active-mission')).not.toBeNull()
  })

  it('renders worker output from complete non-retryable Card history', async () => {
    localStorage.setItem(
      'conductor:active-mission',
      JSON.stringify(persistedMissionV3()),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input) =>
        Promise.resolve(
          String(input).includes('/history')
            ? Response.json({
                cardId: 'remote:shared-worker',
                canonicalSegmentKey: 'remote:shared-runtime-key',
                messages: [
                  {
                    segmentKey: 'remote:shared-runtime-key',
                    message: {
                      role: 'assistant',
                      content: 'complete Conductor transcript',
                    },
                  },
                ],
                completeness: 'complete',
                retryable: false,
                missingSegments: [],
              })
            : Response.json(mocks.cardResponse),
        ),
      ),
    )

    const container = await renderConductor()
    await React.act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('complete Conductor transcript')
  })
})
