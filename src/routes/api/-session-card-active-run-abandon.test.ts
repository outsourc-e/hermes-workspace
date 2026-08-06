import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as AbandonCardRunRoute } from './session-cards.$cardId.active-run.abandon'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  resolveCard: vi.fn(),
  listAllActiveRuns: vi.fn(),
  markRunStatus: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../server/session-card-service', () => ({
  sessionCardService: { resolveCard: mocks.resolveCard },
}))

vi.mock('../../server/run-store', () => ({
  listAllActiveRuns: mocks.listAllActiveRuns,
  markRunStatus: mocks.markRunStatus,
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

function abandonRequest(runId = 'internal-run-id') {
  return new Request(
    'http://workspace.test/api/session-cards/remote%3Achild-card/active-run/abandon',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
    },
  )
}

function resolvedChildCard() {
  return {
    card: {
      cardId: 'remote:child-card',
      canonicalSource: 'remote',
      canonicalSegmentKey: 'remote:child-tip',
      continuationSegmentKeys: [
        'remote:child-card',
        'remote:child-old',
        'remote:child-tip',
      ],
      relationshipKind: 'child',
      childNodes: [],
    },
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

beforeEach(() => {
  mocks.isAuthenticated.mockReset().mockReturnValue(true)
  mocks.resolveCard.mockReset().mockResolvedValue(resolvedChildCard())
  mocks.listAllActiveRuns.mockReset().mockResolvedValue([
    {
      runId: 'internal-run-id',
      sessionKey: 'remote:child-old',
      friendlyId: 'internal-friendly-id',
      status: 'active',
    },
  ])
  mocks.markRunStatus.mockReset().mockResolvedValue({ status: 'error' })
})

describe('Card-owned active-run abandonment', () => {
  it('resolves fresh Card ownership before mutating and returns no raw identity', async () => {
    const response = await handler({
      request: abandonRequest(),
      params: { cardId: 'remote:child-card' },
    })

    expect(mocks.resolveCard).toHaveBeenCalledWith('remote:child-card')
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'remote:child-old',
      'internal-run-id',
      'error',
      'Abandoned by user',
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      cardId: 'remote:child-card',
      status: 'error',
    })
  })

  it('fails closed when the active run is outside the freshly resolved Card', async () => {
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
    expect(mocks.markRunStatus).not.toHaveBeenCalled()
  })

  it('requires the exact active run ID owned by the Card', async () => {
    const response = await handler({
      request: abandonRequest('unknown-run'),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(404)
    expect(mocks.markRunStatus).not.toHaveBeenCalled()
  })

  it('fails closed when fresh Card ownership is incomplete', async () => {
    mocks.resolveCard.mockResolvedValue({
      ...resolvedChildCard(),
      collection: { completeness: 'incomplete', retryable: true, sources: [] },
    })

    const response = await handler({
      request: abandonRequest(),
      params: { cardId: 'remote:child-card' },
    })

    expect(response.status).toBe(503)
    expect(mocks.markRunStatus).not.toHaveBeenCalled()
  })
})
