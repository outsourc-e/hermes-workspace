import { createHash } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createCapabilityUnavailablePayload } from '../../lib/feature-gates'
import {
  getSessionTokenFromCookie,
  isAuthenticated,
  isPasswordProtectionEnabled,
} from '../../server/auth-middleware'
import {
  SessionForkUnavailableError,
  ensureGatewayProbed,
  forkSession,
} from '../../server/claude-api'
import { sessionCardService } from '../../server/session-card-service'
import {
  completeSessionCardBranchReplay,
  readSessionCardBranchReplay,
  reconcileSessionCardBranchReplay,
  reserveSessionCardBranchReplay,
} from '../../server/session-card-store'
import {
  invalidRequest,
  isSessionCardNotFound,
  normalizedCardId,
  notFoundResponse,
  readJsonObject,
  requireSessionCardJsonContentType,
} from './-session-card-http'
import type {
  PersistedSessionCardBranchReplay,
  SessionCardBranchReplayOutcome,
} from '../../server/session-card-store'

const MAX_BRANCH_TITLE_LENGTH = 500
const MAX_CANONICAL_SEGMENT_KEY_LENGTH = 2_048
const MAX_IDEMPOTENCY_KEY_LENGTH = 128
const MAX_ACTIVE_BRANCHES = 256
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/
const OPERATOR_NO_EFFECT_CONFIRMATION =
  'I verified the upstream fork did not occur and cannot still complete'

type BranchReplay = {
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string
}

type BranchReplayEntry = {
  fingerprint: string
  promise: Promise<BranchReplay>
}

const branchReplayEntries = new Map<string, BranchReplayEntry>()

function branchConflict(): Response {
  return json(
    {
      ok: false,
      error: 'Session Card changed or is not ready to branch',
      retryable: true,
    },
    { status: 409 },
  )
}

function idempotencyConflict(): Response {
  return json(
    { ok: false, error: 'Branch request conflicts with an earlier intent' },
    { status: 409 },
  )
}

function replayCapacityUnavailable(): Response {
  return json(
    {
      ok: false,
      error: 'Branch request tracking is temporarily unavailable',
      retryable: true,
    },
    { status: 503 },
  )
}

function replayPendingUnavailable(): Response {
  return json(
    {
      ok: false,
      error: 'Branch request is still being finalized',
      retryable: true,
    },
    { status: 503, headers: { 'Retry-After': '5' } },
  )
}

function replayAmbiguousUnavailable(): Response {
  return json(
    {
      ok: false,
      error:
        'The upstream branch outcome is unknown; this idempotency key will not be forked again',
      retryable: true,
    },
    { status: 503, headers: { 'Retry-After': '5' } },
  )
}

async function captureReplay(response: Response): Promise<BranchReplay> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body: await response.text(),
  }
}

function replayResponse(replay: BranchReplay): Response {
  return new Response(replay.body, {
    status: replay.status,
    statusText: replay.statusText,
    headers: replay.headers,
  })
}

function sha256Fingerprint(parts: Array<string>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function requesterSemantic(request: Request): string {
  if (!isPasswordProtectionEnabled()) {
    return sha256Fingerprint([
      'session-card-branch-requester-v1',
      'unprotected',
    ])
  }
  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  return sha256Fingerprint([
    'session-card-branch-requester-v1',
    token ? `session:${token}` : 'authenticated',
  ])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function outcomeFromReplay(
  replay: BranchReplay,
): SessionCardBranchReplayOutcome {
  if (replay.status === 201 || replay.status === 202) {
    try {
      const payload = JSON.parse(replay.body) as unknown
      if (
        isRecord(payload) &&
        typeof payload.canonicalSegmentKey === 'string' &&
        typeof payload.childSessionKey === 'string'
      ) {
        return {
          kind: replay.status === 201 ? 'created' : 'projection-pending',
          canonicalSegmentKey: payload.canonicalSegmentKey,
          childSessionKey: payload.childSessionKey,
        }
      }
    } catch {
      // A malformed response after dispatch cannot prove that the opaque fork
      // did not happen. Fall through to the durable ambiguity fence.
    }
  }
  // This classifier is called only after beginSideEffect reserved the durable
  // effect intent. Any response without a verified child identity may follow a
  // provider-accepted request, so it must never age into an automatic re-fork.
  return { kind: 'ambiguous' }
}

function durableReplayResponse(
  cardId: string,
  replay: PersistedSessionCardBranchReplay,
): Response {
  const outcome = replay.outcome
  if (!outcome) return replayPendingUnavailable()
  if (outcome.kind === 'ambiguous') return replayAmbiguousUnavailable()
  if (outcome.kind === 'failed') return branchFailure()
  if (outcome.kind === 'unavailable') return unavailableResponse(cardId)
  if (outcome.kind === 'projection-pending') {
    return projectionPendingResponse(
      cardId,
      outcome.canonicalSegmentKey,
      outcome.childSessionKey,
    )
  }
  return json(
    {
      ok: true,
      cardId,
      canonicalSegmentKey: outcome.canonicalSegmentKey,
      childSessionKey: outcome.childSessionKey,
      supported: true,
    },
    { status: 201 },
  )
}

function unavailableResponse(cardId: string): Response {
  return json(
    createCapabilityUnavailablePayload('sessionFork', {
      error:
        'Whole-conversation branching is unavailable on this Hermes backend.',
      cardId,
      supported: false,
    }),
    { status: 503 },
  )
}

function branchFailure(): Response {
  return json(
    { ok: false, error: 'Unable to safely create Session Card branch' },
    { status: 502 },
  )
}

function projectionPendingResponse(
  cardId: string,
  canonicalSegmentKey: string,
  childSessionKey: string,
): Response {
  return json(
    {
      ok: true,
      cardId,
      canonicalSegmentKey,
      childSessionKey,
      supported: true,
      projectionPending: true,
    },
    { status: 202 },
  )
}

function remoteProjectedKey(upstreamKey: string): string {
  return `remote:${encodeURIComponent(upstreamKey)}`
}

function validOptionalParentIdentity(
  value: unknown,
  expectedParent: string,
): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' &&
      value.trim().length > 0 &&
      value === expectedParent)
  )
}

async function executeBranch(
  cardId: string,
  expectedCanonicalSegmentKey: string,
  title: string,
  beginSideEffect: () => Response | null,
): Promise<Response> {
  let resolved
  try {
    resolved = await sessionCardService.resolveCard(cardId)
  } catch (error) {
    if (isSessionCardNotFound(error)) return notFoundResponse()
    return branchFailure()
  }

  if (resolved.collection.completeness !== 'complete') {
    return branchConflict()
  }
  if (resolved.card.relationshipKind !== 'root') {
    return invalidRequest('Only root Session Cards can be branched')
  }

  const canonicalSegmentKey = resolved.card.canonicalSegmentKey
  if (canonicalSegmentKey !== expectedCanonicalSegmentKey) {
    return branchConflict()
  }
  const canonicalSource = resolved.sourceBySegmentKey.get(canonicalSegmentKey)
  const authoritativeUpstreamKey =
    resolved.upstreamKeyBySegmentKey.get(canonicalSegmentKey)
  if (
    resolved.card.canonicalSource !== 'remote' ||
    resolved.card.canonicalTransport !== 'gateway' ||
    canonicalSource !== 'gateway'
  ) {
    return unavailableResponse(resolved.card.cardId)
  }
  if (!authoritativeUpstreamKey) return branchFailure()

  let supported = false
  try {
    supported = (await ensureGatewayProbed()).sessionFork
  } catch {
    // A failed capability probe is indistinguishable from unavailable.
  }
  if (!supported) return unavailableResponse(resolved.card.cardId)

  try {
    const reservationFailure = beginSideEffect()
    if (reservationFailure) return reservationFailure
    const result = await forkSession(
      authoritativeUpstreamKey,
      title ? { title } : undefined,
    )
    const childUpstreamKey = result.session.id.trim()
    const returnedParent = result.session.parent_session_id
    if (
      !childUpstreamKey ||
      childUpstreamKey === authoritativeUpstreamKey ||
      !validOptionalParentIdentity(
        result.forkedFrom,
        authoritativeUpstreamKey,
      ) ||
      !validOptionalParentIdentity(returnedParent, authoritativeUpstreamKey) ||
      (result.forkedFrom == null && returnedParent == null)
    ) {
      return branchFailure()
    }

    const expectedChildKey = remoteProjectedKey(childUpstreamKey)
    let fresh
    try {
      fresh = await sessionCardService.resolveCard(resolved.card.cardId, {
        includeArchived: true,
      })
    } catch {
      return projectionPendingResponse(
        resolved.card.cardId,
        canonicalSegmentKey,
        expectedChildKey,
      )
    }
    if (fresh.card.cardId !== resolved.card.cardId) return branchFailure()
    if (fresh.collection.completeness !== 'complete') {
      return projectionPendingResponse(
        resolved.card.cardId,
        canonicalSegmentKey,
        expectedChildKey,
      )
    }

    const freshCanonicalKey = fresh.card.canonicalSegmentKey
    const malformedProjectedBranch = fresh.card.childNodes.some(
      (candidate) =>
        candidate.relationshipKind === 'branch' &&
        (!fresh.sourceBySegmentKey.has(candidate.sessionKey) ||
          !fresh.upstreamKeyBySegmentKey.has(candidate.sessionKey)),
    )
    if (malformedProjectedBranch) return branchFailure()
    const child = fresh.card.childNodes.find(
      (candidate) =>
        candidate.relationshipKind === 'branch' &&
        candidate.cardId === expectedChildKey &&
        candidate.sessionKey === expectedChildKey,
    )
    if (!child) {
      return projectionPendingResponse(
        resolved.card.cardId,
        canonicalSegmentKey,
        expectedChildKey,
      )
    }

    const freshParentSource = fresh.sourceBySegmentKey.get(canonicalSegmentKey)
    const freshParentUpstreamKey =
      fresh.upstreamKeyBySegmentKey.get(canonicalSegmentKey)
    const freshCanonicalSource = fresh.sourceBySegmentKey.get(freshCanonicalKey)
    const freshCanonicalUpstreamKey =
      fresh.upstreamKeyBySegmentKey.get(freshCanonicalKey)
    const freshChildSource = fresh.sourceBySegmentKey.get(child.sessionKey)
    const freshChildUpstreamKey = fresh.upstreamKeyBySegmentKey.get(
      child.sessionKey,
    )
    if (
      freshParentSource === undefined ||
      freshParentUpstreamKey === undefined ||
      freshCanonicalSource === undefined ||
      freshCanonicalUpstreamKey === undefined
    ) {
      return projectionPendingResponse(
        resolved.card.cardId,
        canonicalSegmentKey,
        expectedChildKey,
      )
    }
    if (
      fresh.card.canonicalSource !== 'remote' ||
      fresh.card.canonicalTransport !== 'gateway' ||
      freshParentSource !== 'gateway' ||
      freshCanonicalSource !== 'gateway' ||
      freshChildSource !== 'gateway' ||
      freshParentUpstreamKey !== authoritativeUpstreamKey ||
      freshChildUpstreamKey !== childUpstreamKey ||
      freshChildUpstreamKey === freshParentUpstreamKey
    ) {
      return branchFailure()
    }

    return json(
      {
        ok: true,
        cardId: resolved.card.cardId,
        canonicalSegmentKey,
        childSessionKey: child.sessionKey,
        supported: true,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof SessionForkUnavailableError) {
      return unavailableResponse(resolved.card.cardId)
    }
    return branchFailure()
  }
}

export const Route = createFileRoute('/api/session-cards/$cardId/branch')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireSessionCardJsonContentType(request)
        if (contentTypeError) return contentTypeError

        const cardId = normalizedCardId(params.cardId)
        if (!cardId) return invalidRequest('Valid cardId required')
        const body = await readJsonObject(request)
        if (!body) return invalidRequest('Request body must be a JSON object')
        if (
          Object.keys(body).some(
            (key) =>
              key !== 'expectedCanonicalSegmentKey' &&
              key !== 'idempotencyKey' &&
              key !== 'title' &&
              key !== 'resolution',
          )
        ) {
          return invalidRequest(
            'Only the original branch intent and a resolution may be provided',
          )
        }
        if (
          typeof body.expectedCanonicalSegmentKey !== 'string' ||
          body.expectedCanonicalSegmentKey.length === 0 ||
          body.expectedCanonicalSegmentKey.length >
            MAX_CANONICAL_SEGMENT_KEY_LENGTH ||
          body.expectedCanonicalSegmentKey.trim() !==
            body.expectedCanonicalSegmentKey
        ) {
          return invalidRequest('Valid expected canonical segment required')
        }
        if (
          typeof body.idempotencyKey !== 'string' ||
          body.idempotencyKey.length === 0 ||
          body.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
          !IDEMPOTENCY_KEY_PATTERN.test(body.idempotencyKey)
        ) {
          return invalidRequest('Valid branch idempotency key required')
        }
        if (body.title !== undefined && typeof body.title !== 'string') {
          return invalidRequest('title must be a string')
        }
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (title.length > MAX_BRANCH_TITLE_LENGTH) {
          return invalidRequest('title must be 500 characters or fewer')
        }
        if (!isRecord(body.resolution)) {
          return invalidRequest('Valid branch ambiguity resolution required')
        }

        const expectedCanonicalSegmentKey = body.expectedCanonicalSegmentKey
        const idempotencyKey = body.idempotencyKey
        const requestKeyHash = sha256Fingerprint([
          'session-card-branch-key-v1',
          cardId,
          idempotencyKey,
        ])
        let ambiguous: PersistedSessionCardBranchReplay | null
        try {
          ambiguous = readSessionCardBranchReplay(cardId, requestKeyHash)
        } catch {
          return replayCapacityUnavailable()
        }
        if (!ambiguous || ambiguous.outcome?.kind !== 'ambiguous') {
          return branchConflict()
        }

        const resolution = body.resolution
        if (resolution.kind === 'operator-no-effect') {
          if (
            Object.keys(resolution).some(
              (key) => key !== 'kind' && key !== 'confirmation',
            ) ||
            resolution.confirmation !== OPERATOR_NO_EFFECT_CONFIRMATION
          ) {
            return invalidRequest(
              'Exact operator no-effect confirmation is required',
            )
          }
          // Clearing an opaque effect intent permits a later retry. Require a
          // real password-authenticated operator, never open-mode auth.
          if (!isPasswordProtectionEnabled()) {
            return json(
              { ok: false, error: 'Password-authenticated operator required' },
              { status: 403 },
            )
          }
          const token = getSessionTokenFromCookie(request.headers.get('cookie'))
          if (!token) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
          }
          try {
            reconcileSessionCardBranchReplay(
              cardId,
              requestKeyHash,
              ambiguous.fingerprint,
              {
                kind: 'operator-no-effect',
                actorFingerprint: sha256Fingerprint([
                  'session-card-branch-operator-v1',
                  token,
                ]),
                assertedAt: Date.now(),
              },
            )
          } catch {
            return branchConflict()
          }
          return json({
            ok: true,
            cardId,
            reconciled: true,
            effect: 'absent',
          })
        }

        if (
          resolution.kind !== 'projection-created' ||
          Object.keys(resolution).some(
            (key) => key !== 'kind' && key !== 'childSessionKey',
          ) ||
          typeof resolution.childSessionKey !== 'string' ||
          resolution.childSessionKey.length === 0 ||
          resolution.childSessionKey.length >
            MAX_CANONICAL_SEGMENT_KEY_LENGTH ||
          resolution.childSessionKey.trim() !== resolution.childSessionKey ||
          resolution.childSessionKey === expectedCanonicalSegmentKey
        ) {
          return invalidRequest('Valid projection reconciliation required')
        }

        let resolved
        try {
          resolved = await sessionCardService.resolveCard(cardId, {
            includeArchived: true,
          })
        } catch (error) {
          if (isSessionCardNotFound(error)) return notFoundResponse()
          return branchConflict()
        }
        const child = resolved.card.childNodes.find(
          (candidate) =>
            candidate.relationshipKind === 'branch' &&
            candidate.cardId === resolution.childSessionKey &&
            candidate.sessionKey === resolution.childSessionKey,
        )
        const parentSource = resolved.sourceBySegmentKey.get(
          expectedCanonicalSegmentKey,
        )
        const parentUpstreamKey = resolved.upstreamKeyBySegmentKey.get(
          expectedCanonicalSegmentKey,
        )
        const childSource = child
          ? resolved.sourceBySegmentKey.get(child.sessionKey)
          : undefined
        const childUpstreamKey = child
          ? resolved.upstreamKeyBySegmentKey.get(child.sessionKey)
          : undefined
        if (
          resolved.collection.completeness !== 'complete' ||
          resolved.card.cardId !== cardId ||
          resolved.card.relationshipKind !== 'root' ||
          resolved.card.canonicalSource !== 'remote' ||
          resolved.card.canonicalTransport !== 'gateway' ||
          !resolved.card.continuationSegmentKeys.includes(
            expectedCanonicalSegmentKey,
          ) ||
          !child ||
          parentSource !== 'gateway' ||
          childSource !== 'gateway' ||
          !parentUpstreamKey ||
          !childUpstreamKey ||
          childUpstreamKey === parentUpstreamKey
        ) {
          return branchConflict()
        }

        try {
          reconcileSessionCardBranchReplay(
            cardId,
            requestKeyHash,
            ambiguous.fingerprint,
            {
              kind: 'projection-created',
              canonicalSegmentKey: expectedCanonicalSegmentKey,
              childSessionKey: child.sessionKey,
            },
          )
        } catch {
          return branchConflict()
        }
        return json({
          ok: true,
          cardId,
          canonicalSegmentKey: expectedCanonicalSegmentKey,
          childSessionKey: child.sessionKey,
          reconciled: true,
        })
      },
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentTypeError = requireSessionCardJsonContentType(request)
        if (contentTypeError) return contentTypeError

        const cardId = normalizedCardId(params.cardId)
        if (!cardId) return invalidRequest('Valid cardId required')
        const body = await readJsonObject(request)
        if (!body) return invalidRequest('Request body must be a JSON object')
        if (
          Object.keys(body).some(
            (key) =>
              key !== 'expectedCanonicalSegmentKey' &&
              key !== 'idempotencyKey' &&
              key !== 'title',
          )
        ) {
          return invalidRequest(
            'Only expectedCanonicalSegmentKey, idempotencyKey, and an optional title may be provided',
          )
        }
        if (
          typeof body.expectedCanonicalSegmentKey !== 'string' ||
          body.expectedCanonicalSegmentKey.length === 0 ||
          body.expectedCanonicalSegmentKey.length >
            MAX_CANONICAL_SEGMENT_KEY_LENGTH ||
          body.expectedCanonicalSegmentKey.trim() !==
            body.expectedCanonicalSegmentKey
        ) {
          return invalidRequest('Valid expected canonical segment required')
        }
        if (
          typeof body.idempotencyKey !== 'string' ||
          body.idempotencyKey.length === 0 ||
          body.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
          !IDEMPOTENCY_KEY_PATTERN.test(body.idempotencyKey)
        ) {
          return invalidRequest('Valid branch idempotency key required')
        }
        if (body.title !== undefined && typeof body.title !== 'string') {
          return invalidRequest('title must be a string')
        }
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (title.length > MAX_BRANCH_TITLE_LENGTH) {
          return invalidRequest('title must be 500 characters or fewer')
        }

        const expectedCanonicalSegmentKey = body.expectedCanonicalSegmentKey
        const idempotencyKey = body.idempotencyKey
        const requestKeyHash = sha256Fingerprint([
          'session-card-branch-key-v1',
          cardId,
          idempotencyKey,
        ])
        const fingerprint = sha256Fingerprint([
          'session-card-branch-intent-v1',
          cardId,
          idempotencyKey,
          expectedCanonicalSegmentKey,
          title,
          requesterSemantic(request),
        ])
        const active = branchReplayEntries.get(requestKeyHash)
        if (active) {
          if (active.fingerprint !== fingerprint) return idempotencyConflict()
          return replayResponse(await active.promise)
        }

        let durableReplay: PersistedSessionCardBranchReplay | null
        try {
          durableReplay = readSessionCardBranchReplay(cardId, requestKeyHash)
        } catch {
          return replayCapacityUnavailable()
        }
        if (durableReplay) {
          if (durableReplay.fingerprint !== fingerprint) {
            return idempotencyConflict()
          }
          return durableReplayResponse(cardId, durableReplay)
        }
        if (branchReplayEntries.size >= MAX_ACTIVE_BRANCHES) {
          return replayCapacityUnavailable()
        }

        const operationState: { reservationId: string | null } = {
          reservationId: null,
        }
        const operation = Promise.resolve().then(async () => {
          const response = await executeBranch(
            cardId,
            expectedCanonicalSegmentKey,
            title,
            () => {
              let reservation
              try {
                reservation = reserveSessionCardBranchReplay(
                  cardId,
                  requestKeyHash,
                  fingerprint,
                )
              } catch {
                return replayCapacityUnavailable()
              }
              if (reservation.status === 'conflict') {
                return idempotencyConflict()
              }
              if (reservation.status === 'capacity') {
                return replayCapacityUnavailable()
              }
              if (reservation.status === 'archived') {
                return branchConflict()
              }
              if (reservation.status === 'pending') {
                return replayPendingUnavailable()
              }
              if (reservation.status === 'completed') {
                return durableReplayResponse(cardId, reservation.replay)
              }
              operationState.reservationId = reservation.reservationId
              return null
            },
          )
          let replay = await captureReplay(response)
          if (operationState.reservationId) {
            try {
              const outcome = outcomeFromReplay(replay)
              completeSessionCardBranchReplay(
                cardId,
                requestKeyHash,
                fingerprint,
                operationState.reservationId,
                outcome,
              )
              if (outcome.kind === 'ambiguous') {
                replay = await captureReplay(replayAmbiguousUnavailable())
              }
            } catch {
              replay = await captureReplay(branchFailure())
            }
          }
          return replay
        })
        const entry: BranchReplayEntry = { fingerprint, promise: operation }
        branchReplayEntries.set(requestKeyHash, entry)

        try {
          return replayResponse(await operation)
        } finally {
          if (branchReplayEntries.get(requestKeyHash) === entry) {
            branchReplayEntries.delete(requestKeyHash)
          }
        }
      },
    },
  },
})
