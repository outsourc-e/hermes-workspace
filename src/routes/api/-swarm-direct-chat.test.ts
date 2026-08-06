import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-direct-chat'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  readWorkerMessages: vi.fn(),
  resolveCard: vi.fn(),
  resolveChildCard: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
vi.mock('node:fs', () => ({
  existsSync: () => true,
  readFileSync: () => '#!/bin/sh\n',
}))
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))
vi.mock('../../server/session-card-service', () => ({
  sessionCardService: {
    resolveCard: mocks.resolveCard,
    resolveChildCard: mocks.resolveChildCard,
  },
}))
vi.mock('../../server/swarm-chat-reader', () => ({
  readWorkerMessages: mocks.readWorkerMessages,
}))
vi.mock('../../server/swarm-roster', () => ({
  rosterByWorkerId: () => new Map(),
}))

type PostHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { options: { server: { handlers: { POST: PostHandler } } } }
const handler = (Route as unknown as TestRoute).options.server.handlers.POST

const owner = {
  kind: 'session-card-owner' as const,
  cardId: 'local:builder-card',
  parentCardId: null,
}

const cardBinding = {
  ...owner,
  canonicalSource: 'local' as const,
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux' as const,
}

function resolvedLocalCard(overrides: Record<string, unknown> = {}) {
  return {
    card: {
      cardId: owner.cardId,
      canonicalSource: 'local',
      title: 'Builder Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'local:builder',
      continuationSegmentKeys: [owner.cardId, 'local:builder'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 10,
      archived: false,
      pinned: false,
      ...overrides,
    },
    aliases: [owner.cardId],
    sourceBySegmentKey: new Map(),
    upstreamKeyBySegmentKey: new Map(),
    pinEligible: false,
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

function request(bodyOverrides: Record<string, unknown> = {}): Request {
  return new Request('http://workspace.test/api/swarm-direct-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workerId: 'builder',
      prompt: 'Run the focused checks',
      cardBinding,
      limit: 30,
      timeoutMs: 1_000,
      ...bodyOverrides,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveCard.mockResolvedValue(resolvedLocalCard())
  mocks.resolveChildCard.mockResolvedValue(resolvedLocalCard())
  mocks.execFile.mockImplementation(
    (
      _command: string,
      _args: Array<string>,
      optionsOrCallback: unknown,
      callback?: (
        error: Error | null,
        stdout?: string,
        stderr?: string,
      ) => void,
    ) => {
      const resolvedCallback =
        typeof optionsOrCallback === 'function'
          ? (optionsOrCallback as typeof callback)
          : callback
      queueMicrotask(() => resolvedCallback?.(null, '', ''))
      return { stdin: { end: vi.fn() } }
    },
  )
  const baseline = {
    id: 'raw-message-id',
    role: 'assistant',
    content: 'Raw state.db content',
    timestamp: 1,
  }
  mocks.readWorkerMessages
    .mockReturnValueOnce({
      sessionId: 'raw-session-id',
      sessionTitle: 'Raw session title',
      messages: [baseline],
      ok: true,
    })
    .mockReturnValue({
      sessionId: 'raw-session-id',
      sessionTitle: 'Raw session title',
      messages: [
        baseline,
        {
          id: 'raw-user-id',
          role: 'user',
          content: 'Run the focused checks',
          timestamp: 2,
        },
        {
          id: 'raw-assistant-id',
          role: 'assistant',
          content: 'Done',
          timestamp: 3,
        },
      ],
      ok: true,
    })
})

describe('POST /api/swarm-direct-chat Card-authoritative delivery', () => {
  it('validates the current local Card binding before delivery and returns only the same safe owner', async () => {
    const response = await handler({ request: request() })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(mocks.resolveCard).toHaveBeenCalledWith(owner.cardId)
    expect(mocks.resolveChildCard).not.toHaveBeenCalled()
    expect(body).toMatchObject({
      ok: true,
      cardOwner: owner,
      delivered: true,
      delivery: 'tmux',
    })
    expect(body).not.toHaveProperty('workerId')
    expect(body).not.toHaveProperty('canonicalSegmentKey')
    expect(body).not.toHaveProperty('sessionId')
    expect(body).not.toHaveProperty('sessionTitle')
    expect(body).not.toHaveProperty('messages')
    expect(body).not.toHaveProperty('source')
    expect(JSON.stringify(body)).not.toContain('local:builder"')
    expect(JSON.stringify(body)).not.toContain('raw-message-id')
    expect(JSON.stringify(body)).not.toContain('raw-session-id')
    expect(mocks.execFile).toHaveBeenCalled()
  })

  it('does not leak the Card transport or baseline transcript when delivery fails', async () => {
    mocks.execFile.mockImplementation(
      (
        _command: string,
        _args: Array<string>,
        optionsOrCallback: unknown,
        callback?: (
          error: Error | null,
          stdout?: string,
          stderr?: string,
        ) => void,
      ) => {
        const resolvedCallback =
          typeof optionsOrCallback === 'function'
            ? (optionsOrCallback as typeof callback)
            : callback
        queueMicrotask(() =>
          resolvedCallback?.(
            new Error('tmux unavailable for local:builder'),
            '',
            '',
          ),
        )
        return { stdin: { end: vi.fn() } }
      },
    )

    const response = await handler({ request: request() })
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(500)
    expect(body).toEqual({
      ok: false,
      cardOwner: owner,
      delivered: false,
      error: 'Unable to deliver the worker message',
      fetchedAt: expect.any(Number),
    })
    expect(JSON.stringify(body)).not.toContain('local:builder"')
    expect(JSON.stringify(body)).not.toContain('raw-message-id')
    expect(JSON.stringify(body)).not.toContain('tmux unavailable')
  })

  it('validates explicit parent ownership for a local child Card', async () => {
    const childOwner = {
      kind: 'session-card-owner' as const,
      cardId: 'local:builder-child-card',
      parentCardId: 'local:builder-parent-card',
    }
    mocks.resolveChildCard.mockResolvedValue(
      resolvedLocalCard({
        cardId: childOwner.cardId,
        parentCardId: childOwner.parentCardId,
        relationshipKind: 'child',
        canonicalSegmentKey: 'local:builder',
        continuationSegmentKeys: [childOwner.cardId, 'local:builder'],
      }),
    )

    const response = await handler({
      request: request({
        cardBinding: {
          ...childOwner,
          canonicalSource: 'local',
          canonicalSegmentKey: 'local:builder',
          canonicalTransport: 'tmux',
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(mocks.resolveChildCard).toHaveBeenCalledWith(
      childOwner.parentCardId,
      childOwner.cardId,
    )
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ cardOwner: childOwner })
  })

  it.each([
    [
      'missing authority',
      {},
      () => mocks.resolveCard.mockRejectedValue(new Error('missing')),
    ],
    [
      'ambiguous authority',
      {},
      () => mocks.resolveCard.mockRejectedValue(new Error('ambiguous')),
    ],
    [
      'Card A after ownership rolls to Card B',
      {},
      () =>
        mocks.resolveCard.mockResolvedValue(
          resolvedLocalCard({ cardId: 'local:other-card' }),
        ),
    ],
    [
      'stale canonical segment',
      {},
      () =>
        mocks.resolveCard.mockResolvedValue(
          resolvedLocalCard({
            canonicalSegmentKey: 'local:builder-successor',
            continuationSegmentKeys: [owner.cardId, 'local:builder-successor'],
          }),
        ),
    ],
    [
      'incomplete authority',
      {},
      () =>
        mocks.resolveCard.mockResolvedValue({
          ...resolvedLocalCard(),
          collection: {
            completeness: 'incomplete',
            retryable: true,
            sources: [],
          },
        }),
    ],
  ] as const)(
    'fails closed for %s without reading or targeting the mutable worker alias',
    async (_label, bodyOverrides, arrange) => {
      arrange()

      const response = await handler({ request: request(bodyOverrides) })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: 'Session Card delivery binding is unavailable',
      })
      expect(mocks.readWorkerMessages).not.toHaveBeenCalled()
      expect(mocks.execFile).not.toHaveBeenCalled()
    },
  )

  it('rejects a remote Card even when its suffix matches a local worker alias', async () => {
    const remoteBinding = {
      kind: 'session-card-owner',
      cardId: 'remote:builder-card',
      parentCardId: null,
      canonicalSource: 'remote',
      canonicalSegmentKey: 'remote:builder',
      canonicalTransport: 'gateway',
    }
    mocks.resolveCard.mockResolvedValue(
      resolvedLocalCard({
        cardId: remoteBinding.cardId,
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        canonicalSegmentKey: 'remote:builder',
        continuationSegmentKeys: [
          remoteBinding.cardId,
          remoteBinding.canonicalSegmentKey,
        ],
      }),
    )

    const response = await handler({
      request: request({ cardBinding: remoteBinding }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid Session Card delivery binding',
    })
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.readWorkerMessages).not.toHaveBeenCalled()
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('rejects a missing or malformed Card binding before delivery', async () => {
    for (const cardBindingValue of [
      undefined,
      'local:builder-card',
      { ...cardBinding, parentCardId: undefined },
      { ...cardBinding, canonicalTransport: 'gateway' },
      { ...cardBinding, canonicalSegmentKey: 'local:other-worker' },
    ]) {
      vi.clearAllMocks()
      const response = await handler({
        request: request({ cardBinding: cardBindingValue }),
      })
      expect(response.status).toBe(400)
      expect(mocks.resolveCard).not.toHaveBeenCalled()
      expect(mocks.resolveChildCard).not.toHaveBeenCalled()
      expect(mocks.readWorkerMessages).not.toHaveBeenCalled()
      expect(mocks.execFile).not.toHaveBeenCalled()
    }
  })
})
