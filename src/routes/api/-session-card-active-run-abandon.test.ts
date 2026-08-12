import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as AbandonCardRunRoute } from './session-cards.$cardId.active-run.abandon'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  resolveChildCard: vi.fn(),
  listAllActiveRuns: vi.fn(),
  abandonActiveCardRun: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../server/session-card-service', () => ({
  sessionCardService: { resolveChildCard: mocks.resolveChildCard },
}))

vi.mock('../../server/run-store', () => ({
  listAllActiveRuns: mocks.listAllActiveRuns,
  abandonActiveCardRun: mocks.abandonActiveCardRun,
}))

type Handler = (context: {
  request: Request
  params: { cardId: string }
}) => Promise<Response>

const handler = (
  AbandonCardRunRoute as unknown as {
    server: { handlers: { POST: Handler } }
  }
).server.handlers.POST

const childBinding = {
  kind: 'session-card-owner',
  cardId: 'remote:child-card',
  parentCardId: 'remote:parent-card',
  canonicalSource: 'remote',
  canonicalSegmentKey: 'remote:child-tip',
  canonicalTransport: 'gateway',
} as const

function abandonRequest(runId = 'internal-run-id', body = {}) {
  return new Request(
    'http://workspace.test/api/session-cards/remote%3Achild-card/active-run/abandon',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, cardBinding: childBinding, ...body }),
    },
  )
}

function resolvedChildCard() {
  return {
    card: {
      cardId: 'remote:child-card',
      parentCardId: 'remote:parent-card',
      canonicalSource: 'remote',
      canonicalSegmentKey: 'remote:child-tip',
      canonicalTransport: 'gateway',
      continuationSegmentKeys: [
        'remote:child-card',
        'remote:child-old',
        'remote:child-tip',
      ],
      continuationCount: 3,
      relationshipKind: 'child',
      childNodes: [],
    },
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

beforeEach(() => {
  mocks.isAuthenticated.mockReset().mockReturnValue(true)
  mocks.resolveChildCard.mockReset().mockResolvedValue(resolvedChildCard())
  mocks.listAllActiveRuns.mockReset().mockResolvedValue([
    {
      runId: 'internal-run-id',
      sessionKey: 'remote:child-old',
      friendlyId: 'internal-friendly-id',
      cardId: 'remote:child-card',
      canonicalSegmentKey: 'remote:child-old',
      status: 'active',
    },
  ])
  mocks.abandonActiveCardRun.mockReset().mockResolvedValue({
    outcome: 'abandoned',
    run: { status: 'error' },
  })
})

describe('Card-owned active-run abandonment', () => {
  it('validates the parent-qualified child binding before the locked mutation', async () => {
    const response = await handler({
      request: abandonRequest(),
      params: { cardId: 'remote:child-card' },
    })

    expect(mocks.resolveChildCard).toHaveBeenCalledWith(
      'remote:parent-card',
      'remote:child-card',
    )
    expect(mocks.abandonActiveCardRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: 'remote:child-old',
        runId: 'internal-run-id',
        cardId: 'remote:child-card',
        ownedSegmentKeys: [
          'remote:child-card',
          'remote:child-old',
          'remote:child-tip',
        ],
        revalidateCardOwner: expect.any(Function),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      cardId: 'remote:child-card',
      status: 'error',
    })
  })

  it('rejects a child request without its parent binding', async () => {
    const response = await handler({
      request: abandonRequest('internal-run-id', {
        cardBinding: { ...childBinding, parentCardId: null },
      }),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(503)
    expect(mocks.abandonActiveCardRun).not.toHaveBeenCalled()
  })

  it('fails closed when the active run is outside the fresh child projection', async () => {
    mocks.listAllActiveRuns.mockResolvedValue([
      {
        runId: 'other-run',
        sessionKey: 'remote:other-card-segment',
        friendlyId: 'remote:other-card',
        cardId: 'remote:other-card',
        canonicalSegmentKey: 'remote:other-card-segment',
        status: 'active',
      },
    ])

    const response = await handler({
      request: abandonRequest('other-run'),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(404)
    expect(mocks.abandonActiveCardRun).not.toHaveBeenCalled()
  })

  it('requires the exact active run ID owned by the Card', async () => {
    const response = await handler({
      request: abandonRequest('unknown-run'),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(404)
    expect(mocks.abandonActiveCardRun).not.toHaveBeenCalled()
  })

  it('fails closed when fresh Card ownership is incomplete', async () => {
    mocks.resolveChildCard.mockResolvedValue({
      ...resolvedChildCard(),
      collection: { completeness: 'incomplete', retryable: true, sources: [] },
    })

    const response = await handler({
      request: abandonRequest(),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(503)
    expect(mocks.abandonActiveCardRun).not.toHaveBeenCalled()
  })

  it('returns the current terminal result without reporting an abandonment', async () => {
    mocks.abandonActiveCardRun.mockResolvedValue({
      outcome: 'terminal',
      run: { status: 'complete' },
    })

    const response = await handler({
      request: abandonRequest(),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      ok: false,
      cardId: 'remote:child-card',
      status: 'complete',
      error: 'Active Card run is already terminal',
    })
  })

  it('fails closed when ownership changes beneath the locked mutation', async () => {
    mocks.abandonActiveCardRun.mockImplementation(async (input) => {
      mocks.resolveChildCard.mockResolvedValueOnce({
        ...resolvedChildCard(),
        card: {
          ...resolvedChildCard().card,
          continuationSegmentKeys: ['remote:child-card', 'remote:child-tip'],
          continuationCount: 2,
        },
      })
      return (await input.revalidateCardOwner())
        ? { outcome: 'abandoned', run: { status: 'error' } }
        : { outcome: 'not-found' }
    })

    const response = await handler({
      request: abandonRequest(),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Active Card run not found',
    })
  })
})
