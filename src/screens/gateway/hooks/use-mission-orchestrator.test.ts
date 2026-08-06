// @vitest-environment jsdom

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveAuthoritativeGatewayTransport,
  useMissionOrchestrator,
} from './use-mission-orchestrator'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { ActiveMission } from '@/stores/mission-store'
import { useMissionStore } from '@/stores/mission-store'

const ROOT_CARD_ID = 'remote:card-root'
const CHILD_CARD_ID = 'remote:card-child'
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const gatewayMocks = vi.hoisted(() => ({
  killAgentSession: vi.fn(),
  toggleAgentPause: vi.fn(),
}))

type MissionStoreState = ReturnType<typeof useMissionStore.getState>

vi.mock('@/stores/mission-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & { useMissionStore: typeof useMissionStore }
  >()
  const original = actual.useMissionStore
  const useMissionStoreWithoutSubscription = Object.assign(
    <T>(selector: (state: MissionStoreState) => T) =>
      selector(original.getState()),
    original,
  )
  return { ...actual, useMissionStore: useMissionStoreWithoutSubscription }
})

vi.mock('@/lib/gateway-api', () => ({
  killAgentSession: gatewayMocks.killAgentSession,
  toggleAgentPause: gatewayMocks.toggleAgentPause,
}))

class FakeEventSource {
  static readonly CLOSED = 2
  readonly url: string
  readyState = 1

  constructor(url: string | URL) {
    this.url = String(url)
  }

  addEventListener(): void {}

  close(): void {
    this.readyState = FakeEventSource.CLOSED
  }
}

function projection(
  canonicalSegmentKey: string,
  options: {
    source?: 'local' | 'remote'
    transport?: 'dashboard' | 'gateway'
  } = {},
): SessionCardListWire {
  const source = options.source ?? 'remote'
  return {
    cards: [
      {
        cardId: ROOT_CARD_ID,
        canonicalSource: source,
        ...(source === 'remote'
          ? { canonicalTransport: options.transport ?? 'gateway' }
          : {}),
        title: 'Root',
        titleSource: 'manual',
        canonicalSegmentKey,
        continuationSegmentKeys: [ROOT_CARD_ID, canonicalSegmentKey],
        continuationCount: 2,
        relationshipKind: 'root',
        childNodes: [
          {
            cardId: CHILD_CARD_ID,
            sessionKey: canonicalSegmentKey.replace('root', 'child'),
            continuationSegmentKeys: [
              CHILD_CARD_ID,
              canonicalSegmentKey.replace('root', 'child'),
            ],
            continuationCount: 2,
            relationshipKind: 'child',
            title: 'Child',
            status: 'running',
            updatedAt: 2,
          },
        ],
        updatedAt: 2,
        archived: false,
        pinned: false,
      },
    ],
    cardResolutions: [
      {
        cardId: ROOT_CARD_ID,
        completeness: 'complete',
        retryable: false,
      },
    ],
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

function emptyProjection(): SessionCardListWire {
  return {
    cards: [],
    cardResolutions: [],
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

function mission(): ActiveMission {
  return {
    id: 'mission-1',
    goal: 'Verify Mission ownership',
    name: 'Mission 1',
    state: 'running',
    team: [
      {
        id: 'agent-1',
        name: 'Agent 1',
        modelId: 'auto',
        roleDescription: 'worker',
        goal: 'verify',
        backstory: '',
        status: 'available',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Verify transport',
        description: '',
        priority: 'normal',
        status: 'assigned',
        agentId: 'agent-1',
        missionId: 'mission-1',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    agentCardIdMap: {},
    agentParentCardIdMap: {},
    agentCardTitleMap: {},
    agentCardModelMap: {},
    agentCardStatus: {},
    processType: 'parallel',
    budgetLimit: '',
    startedAt: 1,
    artifacts: [],
  }
}

function startStoreMission(): ActiveMission {
  const candidate = mission()
  const { state: _state, ...input } = candidate
  useMissionStore.getState().startMission(input)
  return useMissionStore.getState().activeMission!
}

async function renderMissionOrchestrator() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let current: ReturnType<typeof useMissionOrchestrator> | null = null
  function Harness() {
    current = useMissionOrchestrator()
    return null
  }
  await React.act(async () => {
    root.render(React.createElement(Harness))
    await Promise.resolve()
  })
  return {
    get current(): ReturnType<typeof useMissionOrchestrator> {
      if (!current) throw new Error('Mission orchestrator did not mount')
      return current
    },
    unmount: () => {
      React.act(() => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useMissionStore.setState(useMissionStore.getInitialState(), true)
  gatewayMocks.killAgentSession.mockReset()
  gatewayMocks.toggleAgentPause.mockReset()
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authoritative Mission gateway transport', () => {
  it('fails closed when authoritative Card mapping is exhausted', () => {
    expect(
      resolveAuthoritativeGatewayTransport(emptyProjection(), {
        cardId: 'remote:raw-session',
      }),
    ).toBeNull()
  })

  it('normalizes a source-qualified gateway identity exactly once', () => {
    expect(
      resolveAuthoritativeGatewayTransport(projection('remote:remote:root'), {
        cardId: ROOT_CARD_ID,
      })?.sessionKey,
    ).toBe('remote:root')
  })

  it('rejects local and non-gateway remote transports', () => {
    expect(
      resolveAuthoritativeGatewayTransport(
        projection('local:root', { source: 'local' }),
        { cardId: ROOT_CARD_ID },
      ),
    ).toBeNull()
    expect(
      resolveAuthoritativeGatewayTransport(
        projection('remote:root', { transport: 'dashboard' }),
        { cardId: ROOT_CARD_ID },
      ),
    ).toBeNull()
  })

  it('requires an exact child parent rather than treating omission as a wildcard', () => {
    const cards = projection('remote:root')
    expect(
      resolveAuthoritativeGatewayTransport(cards, {
        cardId: CHILD_CARD_ID,
      }),
    ).toBeNull()
    expect(
      resolveAuthoritativeGatewayTransport(cards, {
        cardId: CHILD_CARD_ID,
        parentCardId: ROOT_CARD_ID,
      })?.sessionKey,
    ).toBe('child')
  })

  it('projects each verified successor Card transport for handoff mutations', () => {
    const reference = { cardId: ROOT_CARD_ID }
    const transports = [
      projection('remote:root-a'),
      projection('remote:root-b'),
      projection('remote:root-c'),
    ].map(
      (cards) =>
        resolveAuthoritativeGatewayTransport(cards, reference)?.sessionKey,
    )

    expect(transports).toEqual(['root-a', 'root-b', 'root-c'])
  })

  it('refreshes successor transport before steer, pause, and kill while preserving ownership on kill failure', async () => {
    startStoreMission()
    const initialCards = projection('remote:root-a')
    useMissionStore
      .getState()
      .setAgentCardOwner(
        'agent-1',
        { cardId: ROOT_CARD_ID, title: 'Root' },
        initialCards,
      )
    useMissionStore.getState().setMissionState('paused')

    const successorCards = [
      projection('remote:root-b'),
      projection('remote:root-c'),
      projection('remote:root-d'),
    ]
    const sendKeys: Array<string> = []
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/session-cards') {
        return Promise.resolve(
          Response.json(successorCards.shift() ?? emptyProjection()),
        )
      }
      if (url === '/api/sessions/send') {
        const body = JSON.parse(String(init?.body)) as { sessionKey: string }
        sendKeys.push(body.sessionKey)
        return Promise.resolve(Response.json({ ok: true }))
      }
      return Promise.resolve(Response.json({}, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    gatewayMocks.toggleAgentPause.mockResolvedValue(undefined)
    gatewayMocks.killAgentSession.mockRejectedValue(new Error('kill failed'))

    const harness = await renderMissionOrchestrator()

    await React.act(async () => {
      await harness.current.handleSteerAgent('agent-1', 'continue')
    })
    expect(sendKeys).toEqual(['root-b'])

    await React.act(async () => {
      await harness.current.handleMissionPause(true)
    })
    expect(gatewayMocks.toggleAgentPause).toHaveBeenCalledWith('root-c', true)

    await React.act(async () => {
      await expect(harness.current.handleKillAgent('agent-1')).rejects.toThrow(
        'kill failed',
      )
    })
    expect(gatewayMocks.killAgentSession).toHaveBeenCalledWith('root-d')
    expect(useMissionStore.getState().agentCardIdMap).toEqual({
      'agent-1': ROOT_CARD_ID,
    })

    harness.unmount()
  })

  it('refuses stale transient reuse when retry mapping is exhausted', async () => {
    const activeMission = startStoreMission()
    const initialCards = projection('remote:root-a')
    useMissionStore
      .getState()
      .setAgentCardOwner(
        'agent-1',
        { cardId: ROOT_CARD_ID, title: 'Root' },
        initialCards,
      )
    useMissionStore.getState().setMissionState('paused')

    const projectedResponses = [
      projection('remote:root-b'),
      projection('remote:root-c'),
      emptyProjection(),
    ]
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/sessions' && init?.method !== 'POST') {
        return Promise.resolve(
          Response.json({
            sessions: [{ label: 'Mission: Agent 1', key: 'remote:root-b' }],
          }),
        )
      }
      if (url === '/api/session-cards') {
        return Promise.resolve(
          Response.json(projectedResponses.shift() ?? emptyProjection()),
        )
      }
      if (url === '/api/agent-dispatch') {
        return Promise.resolve(Response.json({ ok: true }))
      }
      return Promise.resolve(Response.json({}, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    gatewayMocks.killAgentSession.mockResolvedValue(undefined)

    const harness = await renderMissionOrchestrator()
    await React.act(async () => {
      await harness.current.dispatchMission(activeMission)
    })
    await React.act(async () => {
      await expect(harness.current.retryAgent('agent-1')).rejects.toThrow(
        /authoritative gateway/i,
      )
    })

    expect(gatewayMocks.killAgentSession).not.toHaveBeenCalled()
    expect(useMissionStore.getState().agentCardIdMap).toEqual({
      'agent-1': ROOT_CARD_ID,
    })
    harness.unmount()
  })

  it('blocks existing-session reuse and dispatch after mapping exhaustion', async () => {
    const activeMission = startStoreMission()
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = String(input)
      if (url === '/api/sessions' && init?.method !== 'POST') {
        return Promise.resolve(
          Response.json({
            sessions: [
              {
                label: 'Mission: Agent 1',
                key: 'unmapped-existing-session',
              },
            ],
          }),
        )
      }
      if (url === '/api/session-cards') {
        return Promise.resolve(Response.json(emptyProjection()))
      }
      if (url === '/api/agent-dispatch') {
        return Promise.resolve(Response.json({ ok: true }))
      }
      return Promise.resolve(Response.json({}, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const harness = await renderMissionOrchestrator()
    await React.act(async () => {
      await harness.current.dispatchMission(activeMission)
    })

    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === '/api/session-cards',
      ),
    ).toHaveLength(6)
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === '/api/agent-dispatch',
      ),
    ).toHaveLength(0)
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === '/api/sessions' && init?.method === 'POST',
      ),
    ).toHaveLength(0)
    expect(useMissionStore.getState().agentCardIdMap).toEqual({})

    harness.unmount()
  })
})
