import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionCardHistoryCursorError as CardHistoryCursorError } from '../../server/session-card-history'
import {
  SessionCardNotFoundError as CardNotFoundError,
  SessionCardPinNotEligibleError as CardPinNotEligibleError,
  SessionCardProjectionIncompleteError as CardProjectionIncompleteError,
} from '../../server/session-card-service'
import { requireSessionCardJsonContentType } from './-session-card-http'
import { Route as ListRoute } from './session-cards'
import { Route as MetadataRoute } from './session-cards.$cardId'
import { Route as ArchiveRoute } from './session-cards.$cardId.archive'
import { Route as BranchRoute } from './session-cards.$cardId.branch'
import { Route as HistoryRoute } from './session-cards.$cardId.history'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
  listCards: vi.fn(),
  resolveCard: vi.fn(),
  updateCardMetadata: vi.fn(),
  archiveCard: vi.fn(),
  getHistory: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  forkSession: vi.fn(),
  deleteSession: vi.fn(),
  readBranchReplay: vi.fn(),
  reserveBranchReplay: vi.fn(),
  completeBranchReplay: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  getSessionTokenFromCookie: (cookie: string | null) =>
    cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('claude-auth='))
      ?.slice('claude-auth='.length) ?? null,
  isAuthenticated: mocks.isAuthenticated,
  isPasswordProtectionEnabled: mocks.isPasswordProtectionEnabled,
}))

vi.mock('../../server/session-card-service', () => ({
  SessionCardNotFoundError: class SessionCardNotFoundError extends Error {},
  SessionCardPinNotEligibleError: class SessionCardPinNotEligibleError extends Error {},
  SessionCardProjectionIncompleteError: class SessionCardProjectionIncompleteError extends Error {},
  sessionCardService: {
    listCards: mocks.listCards,
    resolveCard: mocks.resolveCard,
    updateCardMetadata: mocks.updateCardMetadata,
    archiveCard: mocks.archiveCard,
  },
}))

vi.mock('../../server/session-card-store', () => ({
  SESSION_CARD_TITLE_MAX_LENGTH: 200,
  readSessionCardBranchReplay: mocks.readBranchReplay,
  reserveSessionCardBranchReplay: mocks.reserveBranchReplay,
  completeSessionCardBranchReplay: mocks.completeBranchReplay,
}))

vi.mock('../../server/session-card-history', () => ({
  SessionCardHistoryCursorError: class SessionCardHistoryCursorError extends Error {},
  sessionCardHistoryService: { fetch: mocks.getHistory },
}))

vi.mock('../../server/claude-api', () => ({
  SessionForkUnavailableError: class SessionForkUnavailableError extends Error {},
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  forkSession: mocks.forkSession,
  deleteSession: mocks.deleteSession,
}))

type GetHandler = (context: {
  request: Request
  params: { cardId?: string }
}) => Promise<Response>
type MutationHandler = GetHandler

type ListTestRoute = { server: { handlers: { GET: GetHandler } } }
type MetadataTestRoute = { server: { handlers: { PATCH: MutationHandler } } }
type ArchiveTestRoute = { server: { handlers: { POST: MutationHandler } } }
type BranchTestRoute = { server: { handlers: { POST: MutationHandler } } }
type HistoryTestRoute = { server: { handlers: { GET: GetHandler } } }

const listHandler = (ListRoute as unknown as ListTestRoute).server.handlers.GET
const metadataHandler = (MetadataRoute as unknown as MetadataTestRoute).server
  .handlers.PATCH
const archiveHandler = (ArchiveRoute as unknown as ArchiveTestRoute).server
  .handlers.POST
const branchHandler = (BranchRoute as unknown as BranchTestRoute).server
  .handlers.POST
const historyHandler = (HistoryRoute as unknown as HistoryTestRoute).server
  .handlers.GET

function getRequest(path = '/api/session-cards'): Request {
  return new Request(`http://workspace.test${path}`)
}

function jsonRequest(
  path: string,
  method: 'PATCH' | 'POST',
  body: string,
  contentType = 'application/json',
): Request {
  let requestBody = body
  if (path.endsWith('/branch')) {
    try {
      const parsed = JSON.parse(body) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        requestBody = branchRequestBody(parsed as Record<string, unknown>)
      }
    } catch {
      // Preserve malformed JSON verbatim for strict parser tests.
    }
  }
  return new Request(`http://workspace.test${path}`, {
    method,
    headers: { 'content-type': contentType },
    body: requestBody,
  })
}

let branchIntentSequence = 0
const durableBranchReplays = new Map<
  string,
  { fingerprint: string; outcome?: Record<string, unknown> }
>()

function branchRequestBody(patch: Record<string, unknown> = {}): string {
  branchIntentSequence += 1
  return JSON.stringify({
    expectedCanonicalSegmentKey: 'remote:tip',
    idempotencyKey: `branch-route-test-${branchIntentSequence}`,
    ...patch,
  })
}

function contentTypeOnlyRequest(contentType: string): Request {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType : null,
    },
  } as unknown as Request
}

function resolvedCard() {
  return {
    card: {
      cardId: 'remote:root',
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      title: 'Root',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:tip',
      continuationSegmentKeys: ['remote:root', 'remote:tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 123,
      archived: false,
      pinned: false,
    },
    aliases: ['remote:root'],
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

function resolvedOrphanCard() {
  const resolved = resolvedCard()
  resolved.card.relationshipKind = 'orphan'
  return resolved
}

function resolvedIncompleteCard() {
  const resolved = resolvedCard()
  resolved.collection = {
    completeness: 'incomplete',
    retryable: true,
    sources: [],
  }
  return resolved
}

function resolvedCardWithBranch(
  options: {
    parentSource?: string
    parentUpstreamKey?: string
    childSource?: string
    childUpstreamKey?: string
    canonicalSource?: string
    canonicalTransport?: string
  } = {},
) {
  const resolved = resolvedCard()
  if (options.canonicalSource !== undefined) {
    Object.assign(resolved.card, { canonicalSource: options.canonicalSource })
  }
  if (options.canonicalTransport !== undefined) {
    Object.assign(resolved.card, {
      canonicalTransport: options.canonicalTransport,
    })
  }
  const childKey = 'remote:child-upstream'
  const card = resolved.card as unknown as {
    canonicalSegmentKey: string
    childNodes: Array<Record<string, unknown>>
  }
  card.childNodes = [
    {
      cardId: childKey,
      sessionKey: childKey,
      relationshipKind: 'branch',
      title: 'New conversation',
      status: 'idle',
      updatedAt: 124,
      continuationCount: 1,
    },
  ]
  resolved.sourceBySegmentKey.set(
    resolved.card.canonicalSegmentKey,
    options.parentSource ?? 'gateway',
  )
  resolved.upstreamKeyBySegmentKey.set(
    resolved.card.canonicalSegmentKey,
    options.parentUpstreamKey ?? 'tip-upstream',
  )
  resolved.sourceBySegmentKey.set(childKey, options.childSource ?? 'gateway')
  resolved.upstreamKeyBySegmentKey.set(
    childKey,
    options.childUpstreamKey ?? 'child-upstream',
  )
  return resolved
}

beforeEach(() => {
  vi.clearAllMocks()
  durableBranchReplays.clear()
  mocks.isAuthenticated.mockReturnValue(true)
  mocks.isPasswordProtectionEnabled.mockReturnValue(false)
  mocks.resolveCard.mockResolvedValue(resolvedCard())
  mocks.listCards.mockResolvedValue({
    cards: [resolvedCard().card],
    completeness: 'complete',
    retryable: false,
    sources: [],
  })
  mocks.ensureGatewayProbed.mockResolvedValue({ sessionFork: true })
  mocks.readBranchReplay.mockImplementation(
    (_cardId: string, requestKeyHash: string) =>
      durableBranchReplays.get(requestKeyHash) ?? null,
  )
  mocks.reserveBranchReplay.mockImplementation(
    (_cardId: string, requestKeyHash: string, fingerprint: string) => {
      const existing = durableBranchReplays.get(requestKeyHash)
      if (existing) {
        if (existing.fingerprint !== fingerprint) return { status: 'conflict' }
        return {
          status: existing.outcome ? 'completed' : 'pending',
          replay: existing,
        }
      }
      durableBranchReplays.set(requestKeyHash, { fingerprint })
      return { status: 'reserved', reservationId: requestKeyHash.slice(0, 32) }
    },
  )
  mocks.completeBranchReplay.mockImplementation(
    (
      _cardId: string,
      requestKeyHash: string,
      fingerprint: string,
      _reservationId: string,
      outcome: Record<string, unknown>,
    ) => {
      durableBranchReplays.set(requestKeyHash, { fingerprint, outcome })
    },
  )
})

describe('GET /api/session-cards', () => {
  it('authenticates before any fresh service work', async () => {
    mocks.isAuthenticated.mockReturnValue(false)

    const response = await listHandler({
      request: getRequest(),
      params: {},
    })

    expect(response.status).toBe(401)
    expect(mocks.listCards).not.toHaveBeenCalled()
  })

  it('returns the fresh Card list status and accepts only boolean includeArchived', async () => {
    const expected = {
      cards: [resolvedCard().card],
      completeness: 'incomplete',
      retryable: true,
      sources: [
        {
          source: 'gateway',
          status: 'incomplete',
          fetched: 100,
          retryable: true,
          reason: 'safe-cap',
        },
      ],
    }
    mocks.listCards.mockResolvedValue(expected)

    const response = await listHandler({
      request: getRequest('/api/session-cards?includeArchived=true'),
      params: {},
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expected)
    expect(mocks.listCards).toHaveBeenCalledWith({ includeArchived: true })

    const invalid = await listHandler({
      request: getRequest('/api/session-cards?includeArchived=1'),
      params: {},
    })
    expect(invalid.status).toBe(400)
  })

  it('recursively sanitizes secret-bearing source diagnostics', async () => {
    const secret = 'Bearer route-secret transcript=https://private.test/log'
    mocks.listCards.mockResolvedValue({
      cards: [],
      completeness: 'incomplete',
      retryable: true,
      sources: [
        {
          source: 'gateway',
          status: 'unavailable',
          fetched: 0,
          retryable: true,
          error: secret,
          diagnostic: { cause: { error: secret, url: secret } },
          transcript: secret,
        },
      ],
    })

    const response = await listHandler({ request: getRequest(), params: {} })
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(200)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('private.test')
    expect(serialized).toContain('Session Card source unavailable')
  })

  it('returns a non-secret failure and never delegates to a legacy endpoint', async () => {
    mocks.listCards.mockRejectedValue(new Error('secret upstream URL'))

    const response = await listHandler({ request: getRequest(), params: {} })

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain(
      'secret upstream URL',
    )
    expect(mocks.listCards).toHaveBeenCalledTimes(1)
  })
})

describe('Session Card structured JSON media type helper', () => {
  it.each([
    'application/json',
    'ApPlIcAtIoN/JsOn; ChArSeT=UtF-8',
    ' application/json\t',
    'application/json ; charset = utf-8',
    'application/json; profile="card v1"; version=2',
    'application/json; profile="card\\"v1"',
  ])('accepts an ordinary media type: %j', (contentType) => {
    expect(
      requireSessionCardJsonContentType(contentTypeOnlyRequest(contentType)),
    ).toBeNull()
  })

  it.each([
    'application/j\u017fon',
    'application/json; \u212aey=value',
    'application/json; key=\u212a',
    'application/json\u00a0;charset=utf-8',
    'application/json\n;charset=utf-8',
    'application/json\r;charset=utf-8',
    'application/json\v;charset=utf-8',
    'application/json\f;charset=utf-8',
    'application/json\u2028;charset=utf-8',
    'application/json;;charset=utf-8',
    'application/json; charset',
    'application/json; =utf-8',
    'application/json; charset=',
    'application/json; charset="unterminated',
    'application/json; charset="utf\t8"',
    'application/json; charset="utf\u007f8"',
    'application/json; charset="utf\\\t8"',
  ])('rejects a malformed media type: %j', (contentType) => {
    expect(
      requireSessionCardJsonContentType(contentTypeOnlyRequest(contentType)),
    ).toBeInstanceOf(Response)
  })
})

describe('Session Card JSON mutation boundaries', () => {
  it('authenticates every Card-specific route before service work', async () => {
    mocks.isAuthenticated.mockReturnValue(false)

    const responses = await Promise.all([
      metadataHandler({
        request: jsonRequest('/api/session-cards/remote%3Aroot', 'PATCH', '{}'),
        params: { cardId: 'remote:root' },
      }),
      archiveHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/archive',
          'POST',
          '{}',
        ),
        params: { cardId: 'remote:root' },
      }),
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          '{}',
        ),
        params: { cardId: 'remote:root' },
      }),
      historyHandler({
        request: getRequest('/api/session-cards/remote%3Aroot/history'),
        params: { cardId: 'remote:root' },
      }),
    ])

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ])
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.getHistory).not.toHaveBeenCalled()
    expect(mocks.updateCardMetadata).not.toHaveBeenCalled()
    expect(mocks.archiveCard).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it.each([
    ['metadata', metadataHandler, 'PATCH' as const],
    ['archive', archiveHandler, 'POST' as const],
    ['branch', branchHandler, 'POST' as const],
  ])(
    'requires the exact JSON media type for %s',
    async (_name, handler, method) => {
      for (const contentType of [
        'text/plain',
        'application/j\u017fon',
        'application/json; \u212aey=value',
        'application/json; key=\u212a',
        'application/jsonp',
        'text/application/json',
        'x-application/json',
        'application/json, text/plain',
        'application/json; charset',
        'application/json;',
        'application/json\u00a0;charset=utf-8',
        'application/json; charset="utf\t8"',
      ]) {
        const response = await handler({
          request: Array.from(contentType).some(
            (character) => (character.codePointAt(0) ?? 0) > 255,
          )
            ? contentTypeOnlyRequest(contentType)
            : jsonRequest(
                '/api/session-cards/remote%3Aroot',
                method,
                '{}',
                contentType,
              ),
          params: { cardId: 'remote:root' },
        })
        expect(response.status, contentType).toBe(415)
      }

      expect(mocks.resolveCard).not.toHaveBeenCalled()
      expect(mocks.updateCardMetadata).not.toHaveBeenCalled()
      expect(mocks.archiveCard).not.toHaveBeenCalled()
      expect(mocks.forkSession).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['metadata', metadataHandler, 'PATCH' as const, '{"manualTitle":"Safe"}'],
    ['archive', archiveHandler, 'POST' as const, '{}'],
    ['branch', branchHandler, 'POST' as const, '{}'],
  ])(
    'accepts mixed-case application/json parameters for %s',
    async (_name, handler, method, body) => {
      const response = await handler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot',
          method,
          body,
          'ApPlIcAtIoN/JsOn; ChArSeT=UtF-8',
        ),
        params: { cardId: 'remote:root' },
      })
      expect(response.status).not.toBe(415)
    },
  )
})

describe('PATCH /api/session-cards/$cardId', () => {
  it('strictly validates title fields and requires at least one', async () => {
    for (const body of [
      {},
      { manualTitle: 1 },
      { autoTitle: false },
      { pinned: null },
      { pinned: 1 },
      { pinned: 'true' },
      { pinned: [] },
      { manualTitle: 'ok', parentSessionId: 'spoofed' },
    ]) {
      const response = await metadataHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot',
          'PATCH',
          JSON.stringify(body),
        ),
        params: { cardId: 'remote:root' },
      })
      expect(response.status).toBe(400)
    }
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.updateCardMetadata).not.toHaveBeenCalled()
  })

  it('validates a root before mutation, then returns a fresh visible Card', async () => {
    const fresh = resolvedCard()
    fresh.card.title = 'Renamed'
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(fresh)

    const response = await metadataHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot',
        'PATCH',
        JSON.stringify({ manualTitle: ' Renamed ', autoTitle: null }),
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(200)
    expect(mocks.updateCardMetadata).toHaveBeenCalledWith('remote:root', {
      manualTitle: ' Renamed ',
      autoTitle: null,
    })
    expect(mocks.resolveCard).toHaveBeenLastCalledWith('remote:root')
    expect(await response.json()).toEqual({ card: fresh.card })
  })

  it('does not call mutation for child, nonexistent, or archived Card IDs', async () => {
    for (const cardId of ['remote:child', 'missing', 'remote:archived']) {
      mocks.resolveCard.mockRejectedValueOnce(new CardNotFoundError(cardId))
      const response = await metadataHandler({
        request: jsonRequest(
          `/api/session-cards/${encodeURIComponent(cardId)}`,
          'PATCH',
          JSON.stringify({ manualTitle: 'Safe title' }),
        ),
        params: { cardId },
      })
      expect(response.status).toBe(404)
    }
    expect(mocks.updateCardMetadata).not.toHaveBeenCalled()
  })

  it('rejects a resolved orphan before any rename or pin mutation', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedOrphanCard())

    const response = await metadataHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aorphan',
        'PATCH',
        JSON.stringify({ manualTitle: 'Unsafe rename' }),
      ),
      params: { cardId: 'remote:orphan' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Only root Session Cards can be updated',
    })
    expect(mocks.updateCardMetadata).not.toHaveBeenCalled()
  })

  it('fails closed on incomplete fresh Card projection before metadata mutation', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedIncompleteCard())

    const response = await metadataHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot',
        'PATCH',
        JSON.stringify({ manualTitle: 'Unsafe rename' }),
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card inventory is temporarily unavailable',
      retryable: true,
    })
    expect(mocks.updateCardMetadata).not.toHaveBeenCalled()
  })

  it('maps a projection that becomes incomplete at the service mutation boundary to the stable retry response', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedCard())
    mocks.updateCardMetadata.mockRejectedValueOnce(
      new CardProjectionIncompleteError('remote:root'),
    )

    const response = await metadataHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot',
        'PATCH',
        JSON.stringify({ manualTitle: 'Unsafe rename' }),
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card inventory is temporarily unavailable',
      retryable: true,
    })
  })

  it('accepts an exact boolean pin and returns the resolved Card pin state', async () => {
    const fresh = resolvedCard()
    fresh.card.pinned = true
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(fresh)

    const response = await metadataHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot',
        'PATCH',
        JSON.stringify({ pinned: true }),
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(200)
    expect(mocks.updateCardMetadata).toHaveBeenCalledWith('remote:root', {
      pinned: true,
    })
    expect(await response.json()).toEqual({ card: fresh.card })
  })

  it('rejects a pin rejected by the authoritative Card service', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedCard())
    mocks.updateCardMetadata.mockRejectedValueOnce(
      new CardPinNotEligibleError('remote:orphan-child'),
    )

    const response = await metadataHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aorphan-child',
        'PATCH',
        JSON.stringify({ pinned: true }),
      ),
      params: { cardId: 'remote:orphan-child' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Only root Session Cards can be pinned',
    })
  })
})

describe('POST /api/session-cards/$cardId/archive', () => {
  it('accepts only an empty object and never calls a remote delete or fork', async () => {
    const invalid = await archiveHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/archive',
        'POST',
        JSON.stringify({ segmentKey: 'tip-upstream' }),
      ),
      params: { cardId: 'remote:root' },
    })
    expect(invalid.status).toBe(400)

    const response = await archiveHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/archive',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(200)
    expect(mocks.resolveCard).toHaveBeenCalledWith('remote:root', {
      includeArchived: true,
    })
    expect(mocks.archiveCard).toHaveBeenCalledWith('remote:root')
    expect(await response.json()).toEqual({
      ok: true,
      cardId: 'remote:root',
      archived: true,
    })
    expect(mocks.deleteSession).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('does not archive an unresolved child or arbitrary Card ID', async () => {
    mocks.resolveCard.mockRejectedValue(new CardNotFoundError('child'))

    const response = await archiveHandler({
      request: jsonRequest('/api/session-cards/child/archive', 'POST', '{}'),
      params: { cardId: 'child' },
    })

    expect(response.status).toBe(404)
    expect(mocks.archiveCard).not.toHaveBeenCalled()
  })

  it('rejects a resolved orphan before archive mutation', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedOrphanCard())

    const response = await archiveHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aorphan/archive',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:orphan' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Only root Session Cards can be archived',
    })
    expect(mocks.archiveCard).not.toHaveBeenCalled()
  })

  it('fails closed on incomplete fresh Card projection before archive mutation', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedIncompleteCard())

    const response = await archiveHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/archive',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card inventory is temporarily unavailable',
      retryable: true,
    })
    expect(mocks.archiveCard).not.toHaveBeenCalled()
  })

  it('maps an archive projection that becomes incomplete at the service mutation boundary to the stable retry response', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedCard())
    mocks.archiveCard.mockRejectedValueOnce(
      new CardProjectionIncompleteError('remote:root'),
    )

    const response = await archiveHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/archive',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card inventory is temporarily unavailable',
      retryable: true,
    })
  })
})

describe('GET /api/session-cards/$cardId/history', () => {
  it('rejects malformed or unbounded cursor/limit inputs before service work', async () => {
    for (const query of [
      'limit=0',
      'limit=501',
      'limit=1.5',
      'cursor=',
      `cursor=${'x'.repeat(4097)}`,
      'segmentKey=remote%3Atip',
      'parentCardId=',
      'parentCardId=remote%3Aroot&parentCardId=remote%3Aother',
      'parentCardId=remote%3Aroot',
    ]) {
      const response = await historyHandler({
        request: getRequest(
          `/api/session-cards/remote%3Aroot/history?${query}`,
        ),
        params: { cardId: 'remote:root' },
      })
      expect(response.status).toBe(400)
    }
    expect(mocks.getHistory).not.toHaveBeenCalled()
  })

  it('passes a distinct parent Card only for validated child-history resolution', async () => {
    const childHistory = {
      cardId: 'remote:child',
      canonicalSegmentKey: 'remote:child-tip',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    }
    mocks.getHistory.mockResolvedValue(childHistory)

    const response = await historyHandler({
      request: getRequest(
        '/api/session-cards/remote%3Achild/history?parentCardId=remote%3Aroot&limit=25',
      ),
      params: { cardId: 'remote:child' },
    })

    expect(response.status).toBe(200)
    expect(mocks.getHistory).toHaveBeenCalledWith({
      cardId: 'remote:child',
      parentCardId: 'remote:root',
      limit: 25,
    })
    expect(await response.json()).toEqual(childHistory)
  })

  it('preserves partial status while recursively sanitizing missing-segment diagnostics', async () => {
    const secret = 'sk-history-secret https://private.test/transcript'
    const partial = {
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      messages: [{ segmentKey: 'remote:root', message: { id: 'm1' } }],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:tip',
          source: 'gateway',
          retryable: true,
          error: secret,
          diagnostic: { cause: { error: secret, stack: secret } },
          transcript: secret,
        },
      ],
    }
    mocks.getHistory.mockResolvedValue(partial)

    const response = await historyHandler({
      request: getRequest(
        '/api/session-cards/remote%3Aroot/history?limit=25&cursor=cursor-token',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(200)
    expect(mocks.getHistory).toHaveBeenCalledWith({
      cardId: 'remote:root',
      limit: 25,
      cursor: 'cursor-token',
    })
    const serialized = JSON.stringify(await response.json())
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('private.test')
    expect(serialized).toContain('Session Card history segment unavailable')
  })

  it('maps unknown Cards to 404 and stale cursors to 400', async () => {
    mocks.getHistory.mockRejectedValueOnce(new CardNotFoundError('missing'))
    const missing = await historyHandler({
      request: getRequest('/api/session-cards/missing/history'),
      params: { cardId: 'missing' },
    })
    expect(missing.status).toBe(404)

    mocks.getHistory.mockRejectedValueOnce(new CardHistoryCursorError())
    const stale = await historyHandler({
      request: getRequest(
        '/api/session-cards/remote%3Aroot/history?cursor=stale',
      ),
      params: { cardId: 'remote:root' },
    })
    expect(stale.status).toBe(400)
  })
})

describe('POST /api/session-cards/$cardId/branch', () => {
  it('rejects spoofed relationship and message-target fields', async () => {
    for (const body of [
      { parentSessionId: 'spoofed' },
      { segmentKey: 'spoofed' },
      { childId: 'spoofed' },
      { keepCount: 2 },
      { messageId: 'm1' },
      { title: 42 },
    ]) {
      const response = await branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          branchRequestBody(body),
        ),
        params: { cardId: 'remote:root' },
      })
      expect(response.status).toBe(400)
    }
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('rejects a stale canonical precondition with no upstream fork and no raw identity disclosure', async () => {
    const fresh = resolvedCard()
    fresh.card.canonicalSegmentKey = 'remote:fresh-tip'
    fresh.card.continuationSegmentKeys.push('remote:fresh-tip')
    fresh.sourceBySegmentKey.set('remote:fresh-tip', 'gateway')
    fresh.upstreamKeyBySegmentKey.set('remote:fresh-tip', 'fresh-tip-upstream')
    mocks.resolveCard.mockResolvedValueOnce(fresh)

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        branchRequestBody(),
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(409)
    const payload = await response.json()
    expect(payload).toMatchObject({ ok: false })
    expect(JSON.stringify(payload)).not.toContain('remote:tip')
    expect(JSON.stringify(payload)).not.toContain('remote:fresh-tip')
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
    expect(mocks.reserveBranchReplay).not.toHaveBeenCalled()
  })

  it('coalesces concurrent same-key same-intent requests into one fork and one replayed response', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(resolvedCardWithBranch())
    const body = JSON.stringify({
      expectedCanonicalSegmentKey: 'remote:tip',
      idempotencyKey: 'same-branch-intent',
      title: 'Alternate path',
    })
    const invoke = () =>
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          body,
        ),
        params: { cardId: 'remote:root' },
      })

    const [first, replay] = await Promise.all([invoke(), invoke()])

    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    const firstPayload = await first.json()
    expect(await replay.json()).toEqual(firstPayload)
    const laterReplay = await invoke()
    expect(laterReplay.status).toBe(201)
    expect(await laterReplay.json()).toEqual(firstPayload)
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('keeps a cross-process reservation loser retryable without a duplicate fork', async () => {
    mocks.reserveBranchReplay.mockReturnValueOnce({
      status: 'pending',
      replay: {
        fingerprint: 'a'.repeat(64),
        createdAt: Date.now(),
      },
    })

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        JSON.stringify({ idempotencyKey: 'independent-process-loser' }),
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.json()).toMatchObject({
      ok: false,
      retryable: true,
    })
    expect(mocks.forkSession).not.toHaveBeenCalled()
    expect(mocks.completeBranchReplay).not.toHaveBeenCalled()
  })

  it('replays a durable projection-pending outcome after process-local coalescing ends', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(resolvedCard())
    const body = JSON.stringify({
      expectedCanonicalSegmentKey: 'remote:tip',
      idempotencyKey: 'durable-pending-intent',
    })
    const invoke = () =>
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          body,
        ),
        params: { cardId: 'remote:root' },
      })

    const first = await invoke()
    expect(first.status).toBe(202)
    const firstPayload = await first.json()
    const replay = await invoke()

    expect(replay.status).toBe(202)
    expect(await replay.json()).toEqual(firstPayload)
    expect(mocks.completeBranchReplay).toHaveBeenCalledWith(
      'remote:root',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{32}$/),
      {
        kind: 'projection-pending',
        canonicalSegmentKey: 'remote:tip',
        childSessionKey: 'remote:child-upstream',
      },
    )
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('fails closed without a second fork when durable outcome persistence fails', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    mocks.completeBranchReplay.mockImplementationOnce(() => {
      throw new Error('private persistence detail')
    })
    const body = JSON.stringify({
      expectedCanonicalSegmentKey: 'remote:tip',
      idempotencyKey: 'failed-persistence-intent',
    })
    const invoke = () =>
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          body,
        ),
        params: { cardId: 'remote:root' },
      })

    const first = await invoke()
    const replay = await invoke()

    expect(first.status).toBe(502)
    expect(JSON.stringify(await first.json())).not.toContain('private')
    expect(replay.status).toBe(503)
    expect(JSON.stringify(await replay.json())).not.toContain('private')
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('conflicts instead of replaying a key across a different expected parent or title', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    const idempotencyKey = 'bound-branch-intent'
    const invoke = (expectedCanonicalSegmentKey: string, title: string) =>
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          JSON.stringify({
            expectedCanonicalSegmentKey,
            idempotencyKey,
            title,
          }),
        ),
        params: { cardId: 'remote:root' },
      })

    const first = await invoke('remote:tip', 'First title')
    const differentParent = await invoke('remote:other-tip', 'First title')
    const differentTitle = await invoke('remote:tip', 'Different title')

    expect(first.status).toBe(202)
    expect(differentParent.status).toBe(409)
    expect(differentTitle.status).toBe(409)
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('binds a durable idempotency key to the authenticated requester', async () => {
    mocks.isPasswordProtectionEnabled.mockReturnValue(true)
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    const body = JSON.stringify({
      expectedCanonicalSegmentKey: 'remote:tip',
      idempotencyKey: 'requester-bound-intent',
    })
    const invoke = (token: string) =>
      branchHandler({
        request: new Request(
          'http://workspace.test/api/session-cards/remote%3Aroot/branch',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: `claude-auth=${token}`,
            },
            body,
          },
        ),
        params: { cardId: 'remote:root' },
      })

    expect((await invoke('requester-one')).status).toBe(202)
    const conflict = await invoke('requester-two')

    expect(conflict.status).toBe(409)
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('scopes the same idempotency key to its Card instead of replaying another Card result', async () => {
    const other = resolvedCard()
    other.card.cardId = 'remote:other'
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(other)
      .mockResolvedValueOnce(other)
    mocks.forkSession
      .mockResolvedValueOnce({
        session: { id: 'child-one', parent_session_id: 'tip-upstream' },
        forkedFrom: 'tip-upstream',
      })
      .mockResolvedValueOnce({
        session: { id: 'child-two', parent_session_id: 'tip-upstream' },
        forkedFrom: 'tip-upstream',
      })
    const invoke = (cardId: string) =>
      branchHandler({
        request: jsonRequest(
          `/api/session-cards/${encodeURIComponent(cardId)}/branch`,
          'POST',
          JSON.stringify({
            expectedCanonicalSegmentKey: 'remote:tip',
            idempotencyKey: 'card-scoped-intent',
          }),
        ),
        params: { cardId },
      })

    const first = await invoke('remote:root')
    const second = await invoke('remote:other')

    expect(await first.json()).toMatchObject({
      cardId: 'remote:root',
      childSessionKey: 'remote:child-one',
    })
    expect(await second.json()).toMatchObject({
      cardId: 'remote:other',
      childSessionKey: 'remote:child-two',
    })
    expect(mocks.forkSession).toHaveBeenCalledTimes(2)
  })

  it('authenticates before replaying a completed branch intent', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    const body = JSON.stringify({
      expectedCanonicalSegmentKey: 'remote:tip',
      idempotencyKey: 'authenticated-replay-intent',
    })
    const invoke = () =>
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          body,
        ),
        params: { cardId: 'remote:root' },
      })

    expect((await invoke()).status).toBe(202)
    mocks.isAuthenticated.mockReturnValue(false)
    const unauthorized = await invoke()

    expect(unauthorized.status).toBe(401)
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('allows a distinct idempotency key to create a new valid branch intent', async () => {
    mocks.forkSession
      .mockResolvedValueOnce({
        session: { id: 'child-one', parent_session_id: 'tip-upstream' },
        forkedFrom: 'tip-upstream',
      })
      .mockResolvedValueOnce({
        session: { id: 'child-two', parent_session_id: 'tip-upstream' },
        forkedFrom: 'tip-upstream',
      })

    const invoke = (idempotencyKey: string) =>
      branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          JSON.stringify({
            expectedCanonicalSegmentKey: 'remote:tip',
            idempotencyKey,
          }),
        ),
        params: { cardId: 'remote:root' },
      })

    const first = await invoke('branch-intent-one')
    const second = await invoke('branch-intent-two')

    expect(first.status).toBe(202)
    expect(second.status).toBe(202)
    expect(await first.json()).toMatchObject({
      childSessionKey: 'remote:child-one',
    })
    expect(await second.json()).toMatchObject({
      childSessionKey: 'remote:child-two',
    })
    expect(mocks.forkSession).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ idempotencyKey: 'missing-expected' }],
    [{ expectedCanonicalSegmentKey: 'remote:tip' }],
  ])('requires both precondition and idempotency fields', async (body) => {
    const response = await branchHandler({
      request: new Request(
        'http://workspace.test/api/session-cards/remote%3Aroot/branch',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(400)
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed', 'not valid because spaces'],
    ['oversized', 'a'.repeat(129)],
  ])(
    'rejects a %s idempotency key before Card resolution',
    async (_name, idempotencyKey) => {
      const response = await branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          JSON.stringify({
            expectedCanonicalSegmentKey: 'remote:tip',
            idempotencyKey,
          }),
        ),
        params: { cardId: 'remote:root' },
      })

      expect(response.status).toBe(400)
      expect(mocks.resolveCard).not.toHaveBeenCalled()
      expect(mocks.forkSession).not.toHaveBeenCalled()
    },
  )

  it('forks only the server-resolved canonical upstream parent and verifies the fresh child relation', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: null,
    })
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(resolvedCardWithBranch())

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        JSON.stringify({ title: ' Alternate path ' }),
        'application/json; charset=utf-8',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(201)
    expect(mocks.forkSession).toHaveBeenCalledWith('tip-upstream', {
      title: 'Alternate path',
    })
    expect(mocks.resolveCard).toHaveBeenNthCalledWith(2, 'remote:root', {
      includeArchived: true,
    })
    expect(await response.json()).toEqual({
      ok: true,
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      childSessionKey: 'remote:child-upstream',
      supported: true,
    })
  })

  it('acknowledges an upstream fork as projection-pending instead of returning a retryable failure', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(resolvedCard())

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      ok: true,
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      childSessionKey: 'remote:child-upstream',
      supported: true,
      projectionPending: true,
    })
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('reconciles the fork against its original parent when the Card tip rotates after the fork', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    const rotated = resolvedCardWithBranch()
    rotated.card.canonicalSegmentKey = 'remote:new-tip'
    rotated.card.continuationSegmentKeys.push('remote:new-tip')
    rotated.sourceBySegmentKey.set('remote:new-tip', 'gateway')
    rotated.upstreamKeyBySegmentKey.set('remote:new-tip', 'new-tip-upstream')
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(rotated)

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      ok: true,
      cardId: 'remote:root',
      canonicalSegmentKey: 'remote:tip',
      childSessionKey: 'remote:child-upstream',
      supported: true,
    })
    expect(mocks.forkSession).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid Cards and unsupported capability without forking', async () => {
    mocks.resolveCard.mockRejectedValueOnce(
      new CardNotFoundError('remote:child'),
    )
    const child = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Achild/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:child' },
    })
    expect(child.status).toBe(404)

    mocks.resolveCard.mockResolvedValueOnce(resolvedCard())
    mocks.ensureGatewayProbed.mockResolvedValue({ sessionFork: false })
    const unsupported = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })
    expect(unsupported.status).toBe(503)
    expect(await unsupported.json()).toMatchObject({
      supported: false,
      capability: 'sessionFork',
    })
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('rejects a resolved orphan before capability probing or forking', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedOrphanCard())

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aorphan/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:orphan' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Only root Session Cards can be branched',
    })
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('fails closed on incomplete fresh Card projection before capability probing or forking', async () => {
    mocks.resolveCard.mockResolvedValueOnce(resolvedIncompleteCard())

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Session Card changed or is not ready to branch',
      retryable: true,
    })
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('does not fork a local Card even when its upstream key collides with a remote session', async () => {
    const local = resolvedCard()
    local.sourceBySegmentKey.set('remote:tip', 'local')
    mocks.resolveCard.mockResolvedValue(local)

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(503)
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it('rejects a mismatched canonical source or transport discriminator before forking', async () => {
    for (const patch of [
      { canonicalSource: 'local', canonicalTransport: 'gateway' },
      { canonicalSource: 'remote', canonicalTransport: 'dashboard' },
    ]) {
      const mismatched = resolvedCard()
      Object.assign(mismatched.card, patch)
      mocks.resolveCard.mockResolvedValueOnce(mismatched)

      const response = await branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          '{}',
        ),
        params: { cardId: 'remote:root' },
      })

      expect(response.status).toBe(503)
    }
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.forkSession).not.toHaveBeenCalled()
  })

  it.each(['dashboard', 'unknown'])(
    'returns unavailable without probing or forking a %s Card',
    async (source) => {
      const nongateway = resolvedCard()
      nongateway.sourceBySegmentKey.set('remote:tip', source)
      mocks.resolveCard.mockResolvedValue(nongateway)

      const response = await branchHandler({
        request: jsonRequest(
          '/api/session-cards/remote%3Aroot/branch',
          'POST',
          '{}',
        ),
        params: { cardId: 'remote:root' },
      })

      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ supported: false })
      expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
      expect(mocks.forkSession).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      name: 'canonical transport switch',
      fresh: resolvedCardWithBranch({ canonicalTransport: 'dashboard' }),
    },
    {
      name: 'canonical source switch',
      fresh: resolvedCardWithBranch({ canonicalSource: 'local' }),
    },
    {
      name: 'parent source switch',
      fresh: resolvedCardWithBranch({ parentSource: 'dashboard' }),
    },
    {
      name: 'same child ID collision in a local source',
      fresh: resolvedCardWithBranch({ childSource: 'local' }),
    },
    {
      name: 'mismatched authoritative parent',
      fresh: resolvedCardWithBranch({ parentUpstreamKey: 'other-parent' }),
    },
    {
      name: 'self-child authoritative identity',
      fresh: resolvedCardWithBranch({ childUpstreamKey: 'tip-upstream' }),
    },
  ])('fails closed after fork for $name', async ({ fresh }) => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(fresh)

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false })
  })

  it.each([
    {
      name: 'mismatched forkedFrom',
      fork: {
        session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
        forkedFrom: 'different-parent',
      },
    },
    {
      name: 'mismatched returned parent',
      fork: {
        session: {
          id: 'child-upstream',
          parent_session_id: 'different-parent',
        },
        forkedFrom: 'tip-upstream',
      },
    },
    {
      name: 'self child',
      fork: {
        session: { id: 'tip-upstream', parent_session_id: 'tip-upstream' },
        forkedFrom: 'tip-upstream',
      },
    },
    {
      name: 'blank forked_from alongside a valid parent_session_id',
      fork: {
        session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
        forkedFrom: '   ',
      },
    },
    {
      name: 'nonprimitive forked_from alongside a valid parent_session_id',
      fork: {
        session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
        forkedFrom: ['tip-upstream'],
      },
    },
    {
      name: 'blank parent_session_id alongside a valid forked_from',
      fork: {
        session: { id: 'child-upstream', parent_session_id: '   ' },
        forkedFrom: 'tip-upstream',
      },
    },
    {
      name: 'nonprimitive parent_session_id alongside a valid forked_from',
      fork: {
        session: {
          id: 'child-upstream',
          parent_session_id: { id: 'tip-upstream' },
        },
        forkedFrom: 'tip-upstream',
      },
    },
  ])('returns 502 for $name', async ({ fork }) => {
    mocks.forkSession.mockResolvedValue(fork)

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(502)
    expect(mocks.listCards).not.toHaveBeenCalled()
  })

  it('returns 502 rather than fabricating a child when the fresh Card relation is spoofed', async () => {
    mocks.forkSession.mockResolvedValue({
      session: { id: 'child-upstream', parent_session_id: 'tip-upstream' },
      forkedFrom: 'tip-upstream',
    })
    const spoofed = resolvedCardWithBranch()
    const child = spoofed.card.childNodes[0] as unknown as {
      cardId: string
      sessionKey: string
    }
    child.cardId = 'remote:other-child'
    child.sessionKey = 'remote:other-child'
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(spoofed)

    const response = await branchHandler({
      request: jsonRequest(
        '/api/session-cards/remote%3Aroot/branch',
        'POST',
        '{}',
      ),
      params: { cardId: 'remote:root' },
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false })
  })
})
