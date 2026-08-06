// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Swarm2Screen, resolveSwarmWorkerCardOwner } from './swarm2-screen'
import type { Root } from 'react-dom/client'
import type { CrewMember } from '@/hooks/use-crew-status'
import type { SwarmSessionCardOwner } from '@/hooks/use-swarm-chat'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'

const workers: Array<CrewMember> = [
  {
    id: 'root-worker',
    displayName: 'Root worker',
    role: 'Builder',
    profileFound: true,
    gatewayState: 'running',
    processAlive: true,
    platforms: {},
    model: 'test-model',
    provider: 'test-provider',
    cronJobCount: 0,
    assignedTaskCount: 1,
  },
  {
    id: 'child-worker',
    displayName: 'Child worker',
    role: 'Reviewer',
    profileFound: true,
    gatewayState: 'running',
    processAlive: true,
    platforms: {},
    model: 'test-model',
    provider: 'test-provider',
    cronJobCount: 0,
    assignedTaskCount: 1,
  },
  {
    id: 'missing-worker',
    displayName: 'Missing worker',
    role: 'QA',
    profileFound: true,
    gatewayState: 'running',
    processAlive: true,
    platforms: {},
    model: 'test-model',
    provider: 'test-provider',
    cronJobCount: 0,
    assignedTaskCount: 0,
  },
]

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: (context: { signal?: AbortSignal }) => Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  sessionCards: undefined as SessionCardListWire | undefined,
  fetch: vi.fn<typeof fetch>(),
  queryOptions: [] as Array<QueryOptions>,
  runtime: { entries: [], tmuxAvailable: false } as Record<string, unknown>,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    const key = options.queryKey.join(':')
    const data =
      key === 'chat:session-cards:list:false:0'
        ? mocks.sessionCards
        : key === 'swarm2:runtime'
          ? mocks.runtime
          : key === 'swarm2:health'
            ? {
                workspaceModel: 'test-model',
                summary: {
                  totalWorkers: workers.length,
                  totalAuthErrors24h: 0,
                },
              }
            : key === 'swarm2:roster' || key === 'swarm2:missions'
              ? []
              : key === 'swarm2:available-models'
                ? []
                : {}
    return {
      data,
      isLoading: false,
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(() => options.queryFn({ signal: undefined })),
    }
  },
}))

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }))
vi.mock('@/components/workflow-help-modal', () => ({
  WorkflowHelpModal: () => null,
}))
vi.mock('@/hooks/use-crew-status', () => ({
  getOnlineStatus: () => 'online',
  useCrewStatus: () => ({
    crew: workers,
    lastUpdated: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/components/agent-swarm/pixel-avatar', () => ({
  PixelAvatar: () => null,
}))
vi.mock('@/components/agent-view/agent-progress', () => ({
  AgentProgress: () => null,
}))
vi.mock('./swarm2-artifacts', () => ({ Swarm2Artifacts: () => null }))
vi.mock('./swarm2-task-queue', () => ({ Swarm2TaskQueue: () => null }))
vi.mock('./swarm2-live-chat', () => ({
  Swarm2LiveChat: ({
    workerId,
    cardOwner,
  }: {
    workerId: string
    cardOwner?: SwarmSessionCardOwner | null
  }) => (
    <section data-testid={`worker-chat-${workerId}`}>
      <output data-testid={`worker-owner-${workerId}`}>
        {cardOwner ? JSON.stringify(cardOwner) : 'unavailable'}
      </output>
      <textarea
        aria-label={`Message ${workerId}`}
        disabled={!cardOwner}
        defaultValue=""
      />
      {cardOwner ? <p>Authoritative Card transcript for {workerId}</p> : null}
    </section>
  ),
}))
vi.mock('./swarm2-wires', () => ({ Swarm2Wires: () => null }))
vi.mock('./swarm2-kanban-board', () => ({ Swarm2KanbanBoard: () => null }))
vi.mock('./swarm2-orchestrator-card', () => ({
  Swarm2OrchestratorCard: () => null,
}))
vi.mock('./swarm2-reports-view', () => ({
  buildSwarm2InboxLanes: () => ({
    needs_review: [],
    blocked: [],
    ready: [],
  }),
  Swarm2ReportsView: () => null,
}))
vi.mock('@/components/swarm/router-chat', () => ({ RouterChat: () => null }))
vi.mock('@/components/swarm/swarm-terminal', () => ({
  SwarmTerminal: () => null,
}))

const ROOT_CARD_ID = 'local:stable-root-card'
const CHILD_CARD_ID = 'local:stable-child-card'
const ROOT_WORKER_ALIAS = 'local:root-worker'
const CHILD_WORKER_ALIAS = 'local:child-worker'

function completeProjection(): SessionCardListWire {
  return {
    cards: [
      {
        cardId: ROOT_CARD_ID,
        canonicalSource: 'local',
        title: 'Root worker Card',
        titleSource: 'manual',
        canonicalSegmentKey: ROOT_WORKER_ALIAS,
        continuationSegmentKeys: [ROOT_CARD_ID, ROOT_WORKER_ALIAS],
        continuationCount: 2,
        relationshipKind: 'root',
        childNodes: [
          {
            cardId: CHILD_CARD_ID,
            sessionKey: CHILD_WORKER_ALIAS,
            continuationSegmentKeys: [CHILD_CARD_ID, CHILD_WORKER_ALIAS],
            continuationCount: 2,
            relationshipKind: 'child',
            title: 'Child worker Card',
            status: 'running',
            updatedAt: 20,
          },
        ],
        updatedAt: 10,
        archived: false,
        pinned: false,
      },
    ],
    cardResolutions: [
      { cardId: ROOT_CARD_ID, completeness: 'complete', retryable: false },
    ],
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

function failClosedProjection(): SessionCardListWire {
  const complete = completeProjection()
  return {
    ...complete,
    cards: [
      {
        ...complete.cards[0]!,
        canonicalSegmentKey: 'local:different-worker',
        continuationSegmentKeys: [ROOT_CARD_ID, 'local:different-worker'],
        childNodes: [
          {
            ...complete.cards[0]!.childNodes[0]!,
            sessionKey: 'local:different-child-worker',
            continuationSegmentKeys: [
              CHILD_CARD_ID,
              'local:different-child-worker',
            ],
          },
        ],
      },
    ],
    cardResolutions: [
      { cardId: ROOT_CARD_ID, completeness: 'incomplete', retryable: true },
    ],
    completeness: 'incomplete',
    retryable: true,
    sources: [
      {
        source: 'remote',
        status: 'unavailable',
        fetched: 0,
        retryable: true,
        error: 'test projection is incomplete',
      },
    ],
  }
}

const mountedRoots: Array<{
  root: Root
  container: HTMLDivElement
}> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

async function mountScreen() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })
  await React.act(async () => {
    root.render(<Swarm2Screen />)
    await Promise.resolve()
  })
  return { container }
}

beforeEach(() => {
  mocks.sessionCards = completeProjection()
  mocks.runtime = { entries: [], tmuxAvailable: false }
  mocks.queryOptions.length = 0
  mocks.fetch.mockReset()
  mocks.fetch.mockImplementation((input) => {
    const url = String(input)
    if (url === '/api/session-cards') {
      return Promise.resolve(Response.json(mocks.sessionCards))
    }
    if (url === '/api/swarm-runtime') {
      return Promise.resolve(Response.json(mocks.runtime))
    }
    if (url === '/api/swarm-health') {
      return Promise.resolve(
        Response.json({
          workspaceModel: 'test-model',
          summary: { totalWorkers: workers.length, totalAuthErrors24h: 0 },
        }),
      )
    }
    if (url === '/api/swarm-roster') {
      return Promise.resolve(
        Response.json({ ok: true, roster: { workers: [] } }),
      )
    }
    if (url.startsWith('/api/swarm-missions')) {
      return Promise.resolve(Response.json({ ok: true, missions: [] }))
    }
    if (url === '/api/models') {
      return Promise.resolve(Response.json({ ok: true, data: [] }))
    }
    if (url.startsWith('/api/swarm-project?')) {
      return Promise.resolve(Response.json({}))
    }
    if (url === '/api/swarm-tmux-stop') {
      return Promise.resolve(Response.json({ killed: true }))
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubGlobal('scrollTo', vi.fn())
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop()!
    React.act(() => mounted.root.unmount())
    mounted.container.remove()
  }
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

it('passes unique complete root/child Card owners through the mounted worker cards and enables Chat', async () => {
  await mountScreen()

  await waitFor(() => {
    expect(
      screen.getByText('Authoritative Card transcript for root-worker'),
    ).toBeTruthy()
    expect(
      screen.getByText('Authoritative Card transcript for child-worker'),
    ).toBeTruthy()
  })

  expect(screen.getByTestId('worker-owner-root-worker').textContent).toBe(
    JSON.stringify({
      kind: 'session-card-owner',
      cardId: ROOT_CARD_ID,
      parentCardId: null,
    }),
  )
  expect(screen.getByTestId('worker-owner-child-worker').textContent).toBe(
    JSON.stringify({
      kind: 'session-card-owner',
      cardId: CHILD_CARD_ID,
      parentCardId: ROOT_CARD_ID,
    }),
  )
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Message root-worker').disabled,
  ).toBe(false)
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Message child-worker').disabled,
  ).toBe(false)
  expect(screen.getByTestId('worker-owner-missing-worker').textContent).toBe(
    'unavailable',
  )
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Message missing-worker')
      .disabled,
  ).toBe(true)
  const cardQuery = mocks.queryOptions.find(
    (options) =>
      options.queryKey.join(':') === 'chat:session-cards:list:false:0',
  )
  expect(cardQuery).toBeTruthy()
  expect(await cardQuery!.queryFn({ signal: undefined })).toEqual(
    completeProjection(),
  )
  expect(mocks.fetch).toHaveBeenCalledWith('/api/session-cards')
  expect(document.body.textContent).not.toContain(ROOT_WORKER_ALIAS)
  expect(document.body.textContent).not.toContain(CHILD_WORKER_ALIAS)
})

it('submits an exact fresh Card binding when stopping a live worker', async () => {
  mocks.runtime = {
    tmuxAvailable: true,
    entries: [
      {
        workerId: 'root-worker',
        currentTask: null,
        pid: 123,
        startedAt: 1,
        lastOutputAt: 2,
        cwd: '/tmp',
        tmuxSession: 'swarm-root-worker',
        tmuxAttachable: true,
        state: 'running',
      },
    ],
  }
  await mountScreen()

  const stopButton = await screen.findByTitle(
    'Stop live agent session swarm-root-worker',
  )
  await React.act(async () => {
    fireEvent.click(stopButton)
    await Promise.resolve()
    await Promise.resolve()
  })

  await waitFor(() => {
    const call = mocks.fetch.mock.calls.find(
      ([input]) => String(input) === '/api/swarm-tmux-stop',
    )
    expect(call).toBeTruthy()
    const init = call![1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      workerId: 'root-worker',
      cardBinding: {
        kind: 'session-card-owner',
        cardId: ROOT_CARD_ID,
        parentCardId: null,
        canonicalSource: 'local',
        canonicalSegmentKey: ROOT_WORKER_ALIAS,
        canonicalTransport: 'tmux',
      },
    })
  })
})

it('rejects ambiguous complete Card owners for the same worker alias', () => {
  const projection = completeProjection()
  const competingCardId = 'local:competing-root-card'
  const competingCard = {
    ...projection.cards[0]!,
    cardId: competingCardId,
    continuationSegmentKeys: [competingCardId, ROOT_WORKER_ALIAS],
    childNodes: [],
  }

  expect(
    resolveSwarmWorkerCardOwner(
      {
        ...projection,
        cards: [projection.cards[0]!, competingCard],
        cardResolutions: [
          ...projection.cardResolutions,
          {
            cardId: competingCardId,
            completeness: 'complete',
            retryable: false,
          },
        ],
      },
      'root-worker',
    ),
  ).toBeNull()
})

it('rebinds a worker immediately from rolled-over Card A to current Card B and rejects remote Cards', () => {
  const projection = completeProjection()
  const cardA = {
    ...projection.cards[0]!,
    canonicalSegmentKey: 'local:retired-root-tip',
    continuationSegmentKeys: [ROOT_CARD_ID, 'local:retired-root-tip'],
    childNodes: [],
  }
  const cardBId = 'local:current-root-card'
  const cardB = {
    ...projection.cards[0]!,
    cardId: cardBId,
    canonicalSegmentKey: ROOT_WORKER_ALIAS,
    continuationSegmentKeys: [cardBId, ROOT_WORKER_ALIAS],
    childNodes: [],
  }

  expect(
    resolveSwarmWorkerCardOwner(
      {
        ...projection,
        cards: [cardA, cardB],
        cardResolutions: [
          { cardId: ROOT_CARD_ID, completeness: 'complete', retryable: false },
          { cardId: cardBId, completeness: 'complete', retryable: false },
        ],
      },
      'root-worker',
    ),
  ).toEqual({
    kind: 'session-card-owner',
    cardId: cardBId,
    parentCardId: null,
  })

  expect(
    resolveSwarmWorkerCardOwner(
      {
        ...projection,
        cards: [
          {
            ...cardB,
            cardId: 'remote:current-root-card',
            canonicalSource: 'remote',
            canonicalTransport: 'gateway',
            canonicalSegmentKey: 'remote:root-worker',
            continuationSegmentKeys: [
              'remote:current-root-card',
              'remote:root-worker',
            ],
          },
        ],
        cardResolutions: [
          {
            cardId: 'remote:current-root-card',
            completeness: 'complete',
            retryable: false,
          },
        ],
      },
      'root-worker',
    ),
  ).toBeNull()
})

it('keeps incomplete and nonmatching projections unavailable at the mounted screen seam', async () => {
  mocks.sessionCards = failClosedProjection()
  await mountScreen()

  const cardQuery = mocks.queryOptions.find(
    (options) =>
      options.queryKey.join(':') === 'chat:session-cards:list:false:0',
  )
  expect(cardQuery).toBeTruthy()
  expect(await cardQuery!.queryFn({ signal: undefined })).toEqual(
    failClosedProjection(),
  )
  expect(mocks.fetch).toHaveBeenCalledWith('/api/session-cards')

  for (const worker of workers) {
    expect(screen.getByTestId(`worker-owner-${worker.id}`).textContent).toBe(
      'unavailable',
    )
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(`Message ${worker.id}`)
        .disabled,
    ).toBe(true)
  }
  expect(document.body.textContent).not.toContain(
    'Authoritative Card transcript for',
  )
})
