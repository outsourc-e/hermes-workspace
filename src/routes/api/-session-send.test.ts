import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './session-send'

const mocks = vi.hoisted(() => ({
  resolveCard: vi.fn(),
  resolveChildCard: vi.fn(),
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

type PostHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { options: { server: { handlers: { POST: PostHandler } } } }
const handler = (Route as unknown as TestRoute).options.server.handlers.POST

const cardBinding = {
  kind: 'session-card-owner' as const,
  cardId: 'remote:operations-card',
  parentCardId: null,
  canonicalSource: 'remote' as const,
  canonicalSegmentKey: 'remote:agent%3Amain%3Aops-worker',
  canonicalTransport: 'gateway' as const,
}

function resolvedRemoteCard(overrides: Record<string, unknown> = {}) {
  return {
    card: {
      cardId: cardBinding.cardId,
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      title: 'Operations Card',
      titleSource: 'manual',
      canonicalSegmentKey: cardBinding.canonicalSegmentKey,
      continuationSegmentKeys: [
        cardBinding.cardId,
        cardBinding.canonicalSegmentKey,
      ],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 10,
      archived: false,
      pinned: false,
      ...overrides,
    },
    aliases: [cardBinding.cardId],
    sourceBySegmentKey: new Map(),
    upstreamKeyBySegmentKey: new Map(),
    pinEligible: false,
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

function request(bodyOverrides: Record<string, unknown> = {}) {
  return new Request('http://workspace.test/api/session-send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Run your primary task now',
      cardBinding,
      ...bodyOverrides,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveCard.mockResolvedValue(resolvedRemoteCard())
  mocks.resolveChildCard.mockResolvedValue(resolvedRemoteCard())
})

describe('POST /api/session-send Card-authoritative Operations delivery', () => {
  it('revalidates the exact current binding and delivers through the canonical Card mapping', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('event: started\ndata: {}\n\n'))
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler({ request: request() })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      cardOwner: {
        kind: 'session-card-owner',
        cardId: cardBinding.cardId,
        parentCardId: null,
      },
      queued: true,
    })
    expect(mocks.resolveCard).toHaveBeenCalledWith(cardBinding.cardId)
    expect(mocks.resolveChildCard).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('http://127.0.0.1:3000/api/send-stream')
    expect(JSON.parse(String(init?.body))).toEqual({
      cardId: cardBinding.cardId,
      sessionKey: cardBinding.canonicalSegmentKey,
      friendlyId: cardBinding.cardId,
      message: 'Run your primary task now',
    })
    expect(String(init?.body)).not.toContain('agent:main:ops-worker"')
  })

  it.each([
    ['missing binding', undefined],
    ['raw session alias', 'agent:main:ops-worker'],
    [
      'mismatched source',
      {
        ...cardBinding,
        canonicalSource: 'local',
        canonicalSegmentKey: 'local:agent%3Amain%3Aops-worker',
      },
    ],
    [
      'mismatched transport',
      { ...cardBinding, canonicalTransport: 'dashboard' },
    ],
  ] as const)(
    'rejects %s before authoritative lookup or delivery',
    async (_label, value) => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      const response = await handler({
        request: request({ cardBinding: value }),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Invalid Session Card delivery binding',
      })
      expect(mocks.resolveCard).not.toHaveBeenCalled()
      expect(mocks.resolveChildCard).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('rejects a source-qualified but mismatched canonical segment through current authority', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler({
      request: request({
        cardBinding: {
          ...cardBinding,
          canonicalSegmentKey: 'remote:other-segment',
        },
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card delivery binding is unavailable',
    })
    expect(mocks.resolveCard).toHaveBeenCalledWith(cardBinding.cardId)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [
      'missing authority',
      () => mocks.resolveCard.mockRejectedValue(new Error('missing Card')),
    ],
    [
      'ambiguous authority',
      () => mocks.resolveCard.mockRejectedValue(new Error('ambiguous Card')),
    ],
    [
      'Card rollover',
      () =>
        mocks.resolveCard.mockResolvedValue(
          resolvedRemoteCard({
            cardId: 'remote:successor-card',
            continuationSegmentKeys: [
              'remote:successor-card',
              cardBinding.canonicalSegmentKey,
            ],
          }),
        ),
    ],
    [
      'canonical segment rollover',
      () =>
        mocks.resolveCard.mockResolvedValue(
          resolvedRemoteCard({
            canonicalSegmentKey: 'remote:successor-segment',
            continuationSegmentKeys: [
              cardBinding.cardId,
              'remote:successor-segment',
            ],
          }),
        ),
    ],
  ] as const)(
    'rejects %s without delivering to a mutable alias',
    async (_label, arrange) => {
      arrange()
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      const response = await handler({ request: request() })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Session Card delivery binding is unavailable',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('returns a generic failure when canonical Card delivery is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: 'upstream mentioned remote:private-session' },
            { status: 409 },
          ),
        ),
    )

    const response = await handler({ request: request() })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Unable to deliver the Operations command',
    })
  })
})
