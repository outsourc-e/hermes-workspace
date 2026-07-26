import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './$sessionKey.active-run'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  resolveCard: vi.fn(),
  getActiveRunForCard: vi.fn(),
  getActiveRunForSession: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../../server/session-card-service', () => ({
  sessionCardService: { resolveCard: mocks.resolveCard },
}))

vi.mock('../../../server/run-store', () => ({
  getActiveRunForCard: mocks.getActiveRunForCard,
  getActiveRunForSession: mocks.getActiveRunForSession,
}))

type ActiveRunHandler = (context: {
  request: Request
  params: { sessionKey?: string }
}) => Promise<Response>

type TestRoute = {
  server: { handlers: { GET: ActiveRunHandler } }
}

const handler = (Route as unknown as TestRoute).server.handlers.GET

function resolvedCard() {
  return {
    card: {
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      canonicalSource: 'remote',
      continuationSegmentKeys: ['remote:root', 'remote:tip'],
      relationshipKind: 'root',
      childNodes: [],
    },
    sourceBySegmentKey: new Map([
      ['remote:root', 'gateway'],
      ['remote:tip', 'gateway'],
    ]),
    upstreamKeyBySegmentKey: new Map([
      ['remote:root', 'root-upstream'],
      ['remote:tip', 'tip-upstream'],
    ]),
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

function cardRequest(
  sessionKey = 'remote:tip',
  cardId = 'remote:root',
): { request: Request; params: { sessionKey: string } } {
  return {
    request: new Request(
      `http://workspace.test/api/sessions/${encodeURIComponent(sessionKey)}/active-run?cardId=${encodeURIComponent(cardId)}`,
    ),
    params: { sessionKey },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
  mocks.resolveCard.mockResolvedValue(resolvedCard())
  mocks.getActiveRunForCard.mockResolvedValue(null)
  mocks.getActiveRunForSession.mockResolvedValue(null)
})

describe('GET /api/sessions/$sessionKey/active-run', () => {
  it('fresh-resolves a valid Card and recovers only its current canonical run', async () => {
    const run = {
      runId: 'card-run',
      sessionKey: 'tip-upstream',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      status: 'active',
    }
    mocks.getActiveRunForCard.mockResolvedValue(run)

    const response = await handler(cardRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, run })
    expect(mocks.resolveCard).toHaveBeenCalledWith('remote:root')
    expect(mocks.getActiveRunForCard).toHaveBeenCalledWith(
      'remote:root',
      'remote:tip',
    )
    expect(mocks.getActiveRunForSession).not.toHaveBeenCalled()
  })

  it.each([
    'cardId=',
    'cardId=%20root',
    'cardId=remote%3Aroot%20card',
    'cardId=remote%3Aroot&cardId=remote%3Aother',
  ])('rejects malformed card identity query %s', async (query) => {
    const response = await handler({
      request: new Request(
        `http://workspace.test/api/sessions/remote%3Atip/active-run?${query}`,
      ),
      params: { sessionKey: 'remote:tip' },
    })

    expect(response.status).toBe(400)
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.getActiveRunForCard).not.toHaveBeenCalled()
    expect(mocks.getActiveRunForSession).not.toHaveBeenCalled()
  })

  it('fails closed when fresh lineage advances beyond the requested route segment', async () => {
    const fresh = resolvedCard()
    fresh.card.canonicalSegmentKey = 'remote:new-tip'
    fresh.card.continuationSegmentKeys.push('remote:new-tip')
    fresh.sourceBySegmentKey.set('remote:new-tip', 'gateway')
    fresh.upstreamKeyBySegmentKey.set('remote:new-tip', 'new-tip-upstream')
    mocks.resolveCard.mockResolvedValue(fresh)

    const response = await handler(cardRequest('remote:tip'))

    await expect(response.json()).resolves.toEqual({ ok: true, run: null })
    expect(mocks.getActiveRunForCard).not.toHaveBeenCalled()
  })

  it('requires the exact current canonical route segment', async () => {
    const response = await handler(cardRequest(' remote:tip '))

    await expect(response.json()).resolves.toEqual({ ok: true, run: null })
    expect(mocks.getActiveRunForCard).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a mismatched stable Card',
      () => {
        const fresh = resolvedCard()
        fresh.card.cardId = 'remote:other-root'
        return fresh
      },
    ],
    [
      'an incomplete Card projection',
      () => {
        const fresh = resolvedCard()
        fresh.collection.completeness = 'incomplete'
        fresh.collection.retryable = true
        return fresh
      },
    ],
    [
      'a missing current source',
      () => {
        const fresh = resolvedCard()
        fresh.sourceBySegmentKey.delete('remote:tip')
        return fresh
      },
    ],
    [
      'an invalid canonical source classification',
      () => {
        const fresh = resolvedCard()
        fresh.card.canonicalSource = 'unknown'
        return fresh
      },
    ],
    [
      'a missing current upstream identity',
      () => {
        const fresh = resolvedCard()
        fresh.upstreamKeyBySegmentKey.delete('remote:tip')
        return fresh
      },
    ],
    [
      'a canonical segment outside the current lineage',
      () => {
        const fresh = resolvedCard()
        fresh.card.continuationSegmentKeys = ['remote:root']
        return fresh
      },
    ],
  ])('fails closed for %s', async (_description, makeResolution) => {
    mocks.resolveCard.mockResolvedValue(makeResolution())

    const response = await handler(cardRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, run: null })
    expect(mocks.getActiveRunForCard).not.toHaveBeenCalled()
  })

  it('fails closed when the Card is missing from the fresh projection', async () => {
    mocks.resolveCard.mockRejectedValue(new Error('Session Card not found'))

    const response = await handler(cardRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, run: null })
    expect(mocks.getActiveRunForCard).not.toHaveBeenCalled()
  })

  it.each([
    {
      runId: 'stale-card-run',
      sessionKey: 'tip-upstream',
      cardId: 'remote:other-root',
      canonicalSegmentKey: 'remote:tip',
      status: 'active',
    },
    {
      runId: 'stale-lineage-run',
      sessionKey: 'old-tip-upstream',
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:old-tip',
      status: 'active',
    },
  ])('does not attach stale persisted Card identity $runId', async (run) => {
    mocks.getActiveRunForCard.mockResolvedValue(run)

    const response = await handler(cardRequest())

    await expect(response.json()).resolves.toEqual({ ok: true, run: null })
  })

  it('preserves legacy session-key recovery when no card id is present', async () => {
    await handler({
      request: new Request(
        'http://workspace.test/api/sessions/legacy/active-run',
      ),
      params: { sessionKey: 'legacy' },
    })

    expect(mocks.getActiveRunForSession).toHaveBeenCalledWith('legacy')
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.getActiveRunForCard).not.toHaveBeenCalled()
  })
})
