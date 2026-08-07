import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { ClaudeMessageIdentityError, getMessagesResult } from './claude-api'
import { getLocalMessagesResult } from './local-session-store'
import { sessionCardService } from './session-card-service'
import type {
  ResolvedSessionCard,
  SessionCardService,
} from './session-card-service'

const CURSOR_VERSION = 6 as const
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT = 500
const RECENT_SEGMENT_WINDOW_SIZE = 2
// A platform delivery transaction is short (the reported replay was seven
// rows). Bound retry inference so a large exact export cannot turn a history
// read into quadratic deep-equality work before pagination is applied.
const MAX_ADJACENT_REPLAY_BLOCK_LENGTH = 64
const defaultCursorSecret = randomBytes(32)

export type SessionCardUpstreamMessage = Record<string, unknown> & {
  id?: string | number | null
  stableId?: string | number | null
}

export type SessionCardHistoryMessageBatch = {
  messages: Array<SessionCardUpstreamMessage>
  source?: string
  resolvedSegmentKey?: string
  snapshot?: string
  total?: number
  truncated?: boolean
}

export type SessionCardHistoryMessageSource = {
  getMessages: (
    segmentKey: string,
    source?: string,
  ) => Promise<SessionCardHistoryMessageBatch>
}

export type SessionCardHistoryEntry = {
  segmentKey: string
  message: SessionCardUpstreamMessage
}

export type SessionCardHistoryMissingSegment = {
  segmentKey: string
  source?: string
  retryable: true
  reason:
    | 'source-unavailable'
    | 'source-mismatch'
    | 'identity-mismatch'
    | 'source-incomplete'
    | 'read-failed'
  error: string
}

export type SessionCardHistoryResult = {
  cardId: string
  canonicalSegmentKey: string
  messages: Array<SessionCardHistoryEntry>
  completeness: 'complete' | 'partial'
  retryable: boolean
  missingSegments: Array<SessionCardHistoryMissingSegment>
  nextCursor?: string
  /** Cursor for the next older pair of continuation segments. */
  previousCursor?: string
  /** Ordered continuation segments represented by this response. */
  loadedSegmentKeys?: Array<string>
}

export type SessionCardHistoryRequest = {
  cardId: string
  /** Required when loading a child Card so ownership is revalidated server-side. */
  parentCardId?: string
  cursor?: string
  limit?: number
  /** Fetch the current pair of continuation segments, or the pair named by a cursor. */
  window?: 'recent'
}

type SessionCardHistoryServiceOptions = {
  cardService?: SessionCardService
  messageSource?: SessionCardHistoryMessageSource
  cursorSecret?: Uint8Array
}

type CursorPayload = {
  v: typeof CURSOR_VERSION
  cardId: string
  snapshot: string
  offset: number
  window: 'messages' | 'recent'
  /** Signed content generation for the re-read newer boundary of a recent page. */
  boundarySegmentKey?: string
  boundarySnapshot?: string
  /** Number of contiguous newest segments already accumulated by the client. */
  visibleSegmentCount?: number
  visibleSnapshot?: string
  /** Signed content generation for the always-visible newest two segments. */
  tipSnapshot?: string
}

export class SessionCardHistoryCursorError extends Error {
  constructor() {
    super('Session Card history cursor is invalid or stale.')
    this.name = 'SessionCardHistoryCursorError'
  }
}

function defaultMessageSource(): SessionCardHistoryMessageSource {
  return {
    async getMessages(segmentKey, source) {
      if (source === 'local') {
        return {
          ...getLocalMessagesResult(segmentKey),
          resolvedSegmentKey: segmentKey,
        }
      }
      if (source !== 'dashboard' && source !== 'gateway') {
        throw new Error(
          `Unknown session history source: ${source ?? 'missing'}`,
        )
      }
      // The interactive dashboard history route deliberately follows a
      // compression continuation to its live tip. A Card needs each exact
      // persisted segment instead; otherwise every ancestor is indistinguishable
      // from the tip and the completeness proof correctly fails.
      const result = await getMessagesResult(segmentKey, source, {
        exact: true,
      })
      return {
        messages: result.messages as Array<SessionCardUpstreamMessage>,
        source: result.source,
        ...(result.resolvedSessionId === undefined
          ? {}
          : { resolvedSegmentKey: result.resolvedSessionId }),
        ...(result.total === undefined ? {} : { total: result.total }),
        ...(result.truncated === undefined
          ? {}
          : { truncated: result.truncated }),
      }
    },
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_HISTORY_LIMIT
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError(
      'Session Card history limit must be a positive integer.',
    )
  }
  return Math.min(limit, MAX_HISTORY_LIMIT)
}

type RetrievedSegmentSnapshot = {
  segmentKey: string
  source: string
  upstreamKey: string
  batch: SessionCardHistoryMessageBatch
}

function historySnapshotFingerprint(
  resolved: ResolvedSessionCard,
  segments: Array<RetrievedSegmentSnapshot>,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        cardId: resolved.card.cardId,
        canonicalSegmentKey: resolved.card.canonicalSegmentKey,
        continuationSegmentKeys: resolved.card.continuationSegmentKeys,
        segments: segments.map(
          ({ segmentKey, source, upstreamKey, batch }) => ({
            segmentKey,
            source,
            upstreamKey,
            batchSource: batch.source,
            resolvedSegmentKey: batch.resolvedSegmentKey,
            upstreamSnapshot: batch.snapshot,
            upstreamTotal: batch.total,
            truncated: batch.truncated === true,
            messageCount: batch.messages.length,
            firstMessageId: batch.messages[0]
              ? stableMessageId(batch.messages[0])
              : undefined,
            lastMessageId: batch.messages.length
              ? stableMessageId(batch.messages[batch.messages.length - 1]!)
              : undefined,
            messagesHash: createHash('sha256')
              .update(JSON.stringify(batch.messages))
              .digest('base64url'),
          }),
        ),
      }),
    )
    .digest('base64url')
}

function recentWindowSnapshotFingerprint(
  resolved: ResolvedSessionCard,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        cardId: resolved.card.cardId,
        canonicalSegmentKey: resolved.card.canonicalSegmentKey,
        continuationSegments: resolved.card.continuationSegmentKeys.map(
          (segmentKey) => ({
            segmentKey,
            source: resolved.sourceBySegmentKey.get(segmentKey),
            upstreamKey: resolved.upstreamKeyBySegmentKey.get(segmentKey),
            updatedAt: resolved.updatedAtBySegmentKey.get(segmentKey),
          }),
        ),
      }),
    )
    .digest('base64url')
}

function recentBoundarySnapshot(segment: RetrievedSegmentSnapshot): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        segmentKey: segment.segmentKey,
        source: segment.source,
        upstreamKey: segment.upstreamKey,
        batchSource: segment.batch.source,
        resolvedSegmentKey: segment.batch.resolvedSegmentKey,
        upstreamSnapshot: segment.batch.snapshot,
        upstreamTotal: segment.batch.total,
        truncated: segment.batch.truncated === true,
        messages: segment.batch.messages,
      }),
    )
    .digest('base64url')
}

function recentVisibleSnapshot(
  segments: ReadonlyArray<RetrievedSegmentSnapshot>,
  segmentKeys: ReadonlyArray<string>,
): string | undefined {
  const byKey = new Map(
    segments.map((segment) => [segment.segmentKey, segment]),
  )
  const snapshot = segmentKeys.map((segmentKey) => {
    const segment = byKey.get(segmentKey)
    return segment
      ? { segmentKey, snapshot: recentBoundarySnapshot(segment) }
      : undefined
  })
  if (snapshot.some((entry) => entry === undefined)) return undefined
  return createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('base64url')
}

function cursorSignature(payload: string, secret: Uint8Array): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function encodeCursor(payload: CursorPayload, secret: Uint8Array): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  )
  return `${encoded}.${cursorSignature(encoded, secret)}`
}

function decodeCursor(cursor: string, secret: Uint8Array): CursorPayload {
  const parts = cursor.split('.')
  if (parts.length !== 2) throw new SessionCardHistoryCursorError()
  const [encoded, suppliedSignature] = parts
  if (!encoded || !suppliedSignature) throw new SessionCardHistoryCursorError()

  const expectedSignature = cursorSignature(encoded, secret)
  const supplied = Buffer.from(suppliedSignature, 'utf8')
  const expected = Buffer.from(expectedSignature, 'utf8')
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new SessionCardHistoryCursorError()
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>
    if (
      parsed.v !== CURSOR_VERSION ||
      typeof parsed.cardId !== 'string' ||
      !parsed.cardId ||
      typeof parsed.snapshot !== 'string' ||
      !parsed.snapshot ||
      !Number.isSafeInteger(parsed.offset) ||
      Number(parsed.offset) < 0 ||
      (parsed.window !== 'messages' && parsed.window !== 'recent') ||
      (parsed.window === 'recent' &&
        (typeof parsed.boundarySegmentKey !== 'string' ||
          !parsed.boundarySegmentKey ||
          typeof parsed.boundarySnapshot !== 'string' ||
          !parsed.boundarySnapshot ||
          !Number.isSafeInteger(parsed.visibleSegmentCount) ||
          Number(parsed.visibleSegmentCount) < 1 ||
          typeof parsed.visibleSnapshot !== 'string' ||
          !parsed.visibleSnapshot ||
          typeof parsed.tipSnapshot !== 'string' ||
          !parsed.tipSnapshot))
    ) {
      throw new SessionCardHistoryCursorError()
    }
    return parsed as CursorPayload
  } catch (error) {
    if (error instanceof SessionCardHistoryCursorError) throw error
    throw new SessionCardHistoryCursorError()
  }
}

function normalizedMessageId(candidate: unknown): string | undefined {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return String(candidate)
  }
  if (typeof candidate !== 'string') return undefined
  const normalized = candidate.trim()
  return normalized || undefined
}

function stableMessageId(
  message: SessionCardUpstreamMessage,
): string | undefined {
  return (
    normalizedMessageId(message.stableId) ?? normalizedMessageId(message.id)
  )
}

const REPLAY_CORRELATION_FIELDS = [
  'clientId',
  'client_id',
  'toolCallId',
  'tool_call_id',
  'runId',
  'run_id',
  'deliveryId',
  'delivery_id',
  'requestId',
  'request_id',
] as const

function matchingReplayCorrelation(
  previous: SessionCardUpstreamMessage,
  next: SessionCardUpstreamMessage,
): boolean {
  const previousId = stableMessageId(previous)
  if (previousId !== undefined && previousId === stableMessageId(next)) {
    return true
  }

  return REPLAY_CORRELATION_FIELDS.some((field) => {
    const previousValue = normalizedMessageId(previous[field])
    return (
      previousValue !== undefined &&
      previousValue === normalizedMessageId(next[field])
    )
  })
}

function continuationMessageEvidence(
  message: SessionCardUpstreamMessage,
): Record<string, unknown> {
  // Compression can clone a retained prefix into the child with new database
  // row IDs. Discard only transport/session identities that change during the
  // clone; role, content, tool, and client identity remain evidence. Delivery
  // retries can arrive after a round trip, so timestamps are not identity.
  const {
    id: _id,
    stableId: _stableId,
    session_id: _sessionId,
    timestamp: _timestamp,
    createdAt: _createdAt,
    created_at: _createdAtSnake,
    updatedAt: _updatedAt,
    updated_at: _updatedAtSnake,
    ...value
  } = message
  return value
}

function hasMeaningfulContinuationEvidence(
  evidence: Record<string, unknown>,
): boolean {
  const content = evidence.content
  if (typeof content === 'string' && content.trim().length > 0) return true
  if (Array.isArray(content) && content.length > 0) return true
  if (
    content !== null &&
    content !== undefined &&
    typeof content !== 'string' &&
    !Array.isArray(content)
  )
    return true
  if (evidence.role === 'tool') return true

  return Object.entries(evidence).some(
    ([key, value]) =>
      key !== 'role' &&
      key !== 'content' &&
      value !== null &&
      value !== undefined,
  )
}

function continuationMessagesMatch(
  previous: SessionCardUpstreamMessage,
  next: SessionCardUpstreamMessage,
): boolean {
  const previousEvidence = continuationMessageEvidence(previous)
  const nextEvidence = continuationMessageEvidence(next)
  if (!isDeepStrictEqual(previousEvidence, nextEvidence)) return false

  const previousId = stableMessageId(previous)
  const nextId = stableMessageId(next)
  if (previousId && nextId && previousId === nextId) {
    // An ID collision alone proves nothing. Require at least one independently
    // matching message fact after transport identities are removed.
    return Object.keys(previousEvidence).length > 0
  }

  const previousStableId = normalizedMessageId(previous.stableId)
  const nextStableId = normalizedMessageId(next.stableId)
  if (previousStableId || nextStableId) return false

  // Persisted row IDs may change when a continuation clones its retained
  // prefix. In that case require meaningful non-time evidence. Do not use the
  // timestamp to distinguish retry copies, but retain empty placeholders when
  // there is otherwise no safe way to tell two different rows apart.
  return (
    typeof previous.role === 'string' &&
    previous.role.length > 0 &&
    hasMeaningfulContinuationEvidence(previousEvidence)
  )
}

function adjacentContinuationOverlap(
  previous: Array<SessionCardHistoryEntry>,
  next: Array<SessionCardUpstreamMessage>,
): number {
  const max = Math.min(previous.length, next.length)
  for (let overlap = max; overlap > 0; overlap -= 1) {
    let matches = true
    for (let index = 0; index < overlap; index += 1) {
      if (
        !continuationMessagesMatch(
          previous[previous.length - overlap + index]!.message,
          next[index]!,
        )
      ) {
        matches = false
        break
      }
    }
    if (
      matches &&
      Array.from({ length: overlap }, (_, index) =>
        matchingReplayCorrelation(
          previous[previous.length - overlap + index]!.message,
          next[index]!,
        ),
      ).some(Boolean)
    ) {
      return overlap
    }
  }
  return 0
}

/**
 * Gateway-originated conversations can contain an immediately replayed
 * persistence block when an inbound platform retries the same delivery. The
 * database row IDs differ. Collapse only an adjacent exact multi-row block
 * that also contains an independent delivery/client/run/tool correlation; a
 * timestamp is transport timing, not replay identity. This preserves an
 * ambiguous repeated user/assistant exchange instead of discarding a turn.
 */
function collapseAdjacentSegmentDuplicates(
  messages: Array<SessionCardUpstreamMessage>,
): Array<SessionCardUpstreamMessage> {
  const retained: Array<SessionCardUpstreamMessage> = []

  for (const message of messages) {
    retained.push(message)

    // A retry can replay a complete delivery transaction rather than only its
    // final row: assistant, user, tool call, and tool results. Check the
    // longest adjacent trailing block first so a replayed multi-row delivery
    // is collapsed as one transaction instead of being mistaken for separate
    // intentional turns. Limit this to a delivery-sized block so a large
    // source export cannot cause quadratic deep-equality work before response
    // pagination. A single row needs a matching stable identity; a multi-row
    // replay needs at least one matching independent delivery correlation.
    for (
      let blockLength = Math.min(
        Math.floor(retained.length / 2),
        MAX_ADJACENT_REPLAY_BLOCK_LENGTH,
      );
      blockLength > 0;
      blockLength -= 1
    ) {
      if (
        !continuationMessagesMatch(
          retained[retained.length - 1]!,
          retained[retained.length - 1 - blockLength]!,
        )
      ) {
        continue
      }

      let isReplay = true
      for (let index = 0; index < blockLength; index += 1) {
        if (
          !continuationMessagesMatch(
            retained[retained.length - 2 * blockLength + index]!,
            retained[retained.length - blockLength + index]!,
          )
        ) {
          isReplay = false
          break
        }
      }
      const firstReplayMessage = retained[retained.length - 2 * blockLength]!
      const secondReplayMessage = retained[retained.length - blockLength]!
      const hasReplayCorrelation = Array.from(
        { length: blockLength },
        (_, index) =>
          matchingReplayCorrelation(
            retained[retained.length - 2 * blockLength + index]!,
            retained[retained.length - blockLength + index]!,
          ),
      ).some(Boolean)
      const firstReplayId = stableMessageId(firstReplayMessage)
      const hasMatchingStableIdentity =
        firstReplayId !== undefined &&
        firstReplayId === stableMessageId(secondReplayMessage)
      if (
        isReplay &&
        (blockLength === 1 ? hasMatchingStableIdentity : hasReplayCorrelation)
      ) {
        retained.splice(retained.length - blockLength, blockLength)
        break
      }
    }
  }

  return retained
}

type AggregatedCardHistory = {
  messages: Array<SessionCardHistoryEntry>
  missingSegments: Array<SessionCardHistoryMissingSegment>
  retrievedSegments: Array<RetrievedSegmentSnapshot>
  truncated: boolean
}

async function aggregateCardSegmentHistory(
  resolved: ResolvedSessionCard,
  messageSource: SessionCardHistoryMessageSource,
  segmentKeys = resolved.card.continuationSegmentKeys,
): Promise<AggregatedCardHistory> {
  const messages: Array<SessionCardHistoryEntry> = []
  const missingSegments: Array<SessionCardHistoryMissingSegment> = []
  const retrievedSegments: Array<RetrievedSegmentSnapshot> = []
  let hasContiguousLoadedHistory = false
  let truncated = false

  // Every Card follows this path. A standalone Card is simply an ordered segment
  // list of length one; a child Card supplies only its own resolved segment list.
  // Sequential reads preserve the authoritative continuation order.
  for (const segmentKey of segmentKeys) {
    const source = resolved.sourceBySegmentKey.get(segmentKey)
    const upstreamKey = resolved.upstreamKeyBySegmentKey.get(segmentKey)
    if (!source || !upstreamKey) {
      missingSegments.push({
        segmentKey,
        ...(source ? { source } : {}),
        retryable: true,
        reason: 'source-unavailable',
        error: 'Validated segment source is unavailable.',
      })
      hasContiguousLoadedHistory = false
      continue
    }

    try {
      const fetchedBatch = await messageSource.getMessages(upstreamKey, source)
      if (fetchedBatch.source !== source) {
        missingSegments.push({
          segmentKey,
          source,
          retryable: true,
          reason: 'source-mismatch',
          error: 'Session history source did not match the requested segment.',
        })
        hasContiguousLoadedHistory = false
        continue
      }
      // The source check plus the exact canonical key check is the complete
      // source-qualified identity. Neither half is safe on its own.
      if (fetchedBatch.resolvedSegmentKey !== upstreamKey) {
        missingSegments.push({
          segmentKey,
          source,
          retryable: true,
          reason: 'identity-mismatch',
          error:
            'Session history source returned a different segment identity.',
        })
        hasContiguousLoadedHistory = false
        continue
      }
      const segmentMessages = collapseAdjacentSegmentDuplicates(
        fetchedBatch.messages,
      )
      const batch = { ...fetchedBatch, messages: segmentMessages }
      retrievedSegments.push({ segmentKey, source, upstreamKey, batch })
      truncated ||= batch.truncated === true

      const overlap = hasContiguousLoadedHistory
        ? adjacentContinuationOverlap(messages, segmentMessages)
        : 0
      const retained = segmentMessages.slice(overlap)
      for (const message of retained) {
        messages.push({ segmentKey, message })
      }

      if (batch.truncated === true) {
        missingSegments.push({
          segmentKey,
          source,
          retryable: true,
          reason: 'source-incomplete',
          error: 'Session history segment is incomplete at its source.',
        })
        // The retained rows are still useful, but their final boundary is not
        // authoritative and cannot be used to collapse the next continuation.
        hasContiguousLoadedHistory = false
      } else {
        // A successfully loaded empty segment does not create a history gap.
        hasContiguousLoadedHistory = true
      }
    } catch (error) {
      const identityMismatch = error instanceof ClaudeMessageIdentityError
      missingSegments.push({
        segmentKey,
        source,
        retryable: true,
        reason: identityMismatch ? 'identity-mismatch' : 'read-failed',
        error: identityMismatch
          ? 'Session history source returned a different segment identity.'
          : 'Session history segment could not be read.',
      })
      // A failed segment makes adjacent-boundary identity unprovable. Never
      // de-duplicate across that gap or replace the aggregate with the tip.
      hasContiguousLoadedHistory = false
    }
  }

  return { messages, missingSegments, retrievedSegments, truncated }
}

export class SessionCardHistoryService {
  private readonly cardService: SessionCardService
  private readonly messageSource: SessionCardHistoryMessageSource
  private readonly cursorSecret: Uint8Array

  constructor(options: SessionCardHistoryServiceOptions = {}) {
    this.cardService = options.cardService ?? sessionCardService
    this.messageSource = options.messageSource ?? defaultMessageSource()
    this.cursorSecret = options.cursorSecret ?? defaultCursorSecret
  }

  async fetch(
    request: SessionCardHistoryRequest,
  ): Promise<SessionCardHistoryResult> {
    const limit = normalizeLimit(request.limit)
    const cursor = request.cursor
      ? decodeCursor(request.cursor, this.cursorSecret)
      : undefined
    let resolved: ResolvedSessionCard
    try {
      resolved = request.parentCardId
        ? await this.cardService.resolveChildCard(
            request.parentCardId,
            request.cardId,
          )
        : await this.cardService.resolveCard(request.cardId)
    } catch (error) {
      if (cursor) throw new SessionCardHistoryCursorError()
      throw error
    }
    if (cursor && cursor.cardId !== resolved.card.cardId) {
      throw new SessionCardHistoryCursorError()
    }
    if (request.window === 'recent') {
      if (cursor && cursor.window !== 'recent') {
        throw new SessionCardHistoryCursorError()
      }
      const snapshot = recentWindowSnapshotFingerprint(resolved)
      let priorVisibleSegments: Array<RetrievedSegmentSnapshot> = []
      const segmentCount = resolved.card.continuationSegmentKeys.length
      const offset =
        cursor?.offset ?? Math.max(0, segmentCount - RECENT_SEGMENT_WINDOW_SIZE)
      if (offset >= segmentCount) throw new SessionCardHistoryCursorError()
      if (cursor && cursor.snapshot !== snapshot) {
        throw new SessionCardHistoryCursorError()
      }
      if (cursor) {
        const cursorVisibleSegmentKeys =
          resolved.card.continuationSegmentKeys.slice(
            -cursor.visibleSegmentCount!,
          )
        if (cursorVisibleSegmentKeys.length !== cursor.visibleSegmentCount) {
          throw new SessionCardHistoryCursorError()
        }
        const visibleHistory = await aggregateCardSegmentHistory(
          resolved,
          this.messageSource,
          cursorVisibleSegmentKeys,
        )
        if (
          visibleHistory.missingSegments.length > 0 ||
          visibleHistory.truncated ||
          recentVisibleSnapshot(
            visibleHistory.retrievedSegments,
            cursorVisibleSegmentKeys,
          ) !== cursor.visibleSnapshot
        ) {
          throw new SessionCardHistoryCursorError()
        }
        priorVisibleSegments = visibleHistory.retrievedSegments
      }
      const visibleSegmentKeys = resolved.card.continuationSegmentKeys.slice(
        offset,
        offset + RECENT_SEGMENT_WINDOW_SIZE,
      )
      // Older windows re-read exactly one already-visible successor so cloned
      // continuation prefixes can be removed with the same adjacent-boundary
      // proof as complete aggregation. The client replaces this overlap, so
      // every non-terminal request still adds two previously unseen segments.
      const loadedSegmentKeys =
        cursor && offset + RECENT_SEGMENT_WINDOW_SIZE < segmentCount
          ? resolved.card.continuationSegmentKeys.slice(
              offset,
              offset + RECENT_SEGMENT_WINDOW_SIZE + 1,
            )
          : visibleSegmentKeys
      const { messages, missingSegments, truncated, retrievedSegments } =
        await aggregateCardSegmentHistory(
          resolved,
          this.messageSource,
          loadedSegmentKeys,
        )
      const expectedBoundarySegmentKey =
        cursor === undefined
          ? undefined
          : resolved.card.continuationSegmentKeys[
              offset + RECENT_SEGMENT_WINDOW_SIZE
            ]
      const retrievedBoundary = expectedBoundarySegmentKey
        ? retrievedSegments.find(
            (segment) => segment.segmentKey === expectedBoundarySegmentKey,
          )
        : undefined
      if (
        cursor &&
        (!retrievedBoundary ||
          cursor.boundarySegmentKey !== expectedBoundarySegmentKey ||
          cursor.boundarySnapshot !== recentBoundarySnapshot(retrievedBoundary))
      ) {
        throw new SessionCardHistoryCursorError()
      }
      const sourceIncomplete =
        missingSegments.length > 0 ||
        truncated ||
        resolved.collection.completeness === 'incomplete'
      const hasOlderSegments = offset > 0
      const nextOffset = Math.max(0, offset - RECENT_SEGMENT_WINDOW_SIZE)
      const nextBoundarySegmentKey = hasOlderSegments
        ? resolved.card.continuationSegmentKeys[
            nextOffset + RECENT_SEGMENT_WINDOW_SIZE
          ]
        : undefined
      const nextBoundary = nextBoundarySegmentKey
        ? retrievedSegments.find(
            (segment) => segment.segmentKey === nextBoundarySegmentKey,
          )
        : undefined
      const nextVisibleSegmentCount = cursor
        ? cursor.visibleSegmentCount! + visibleSegmentKeys.length
        : visibleSegmentKeys.length
      const nextVisibleSegmentKeys =
        resolved.card.continuationSegmentKeys.slice(-nextVisibleSegmentCount)
      const nextVisibleSnapshot = recentVisibleSnapshot(
        [...retrievedSegments, ...priorVisibleSegments],
        nextVisibleSegmentKeys,
      )
      if (cursor && nextVisibleSnapshot) {
        // The retained suffix was validated before the older reads. Verify the
        // complete prospective client window again after those reads so a
        // source transition between the two phases cannot be returned as a
        // falsely coherent, terminal history.
        const confirmedVisibleHistory = await aggregateCardSegmentHistory(
          resolved,
          this.messageSource,
          nextVisibleSegmentKeys,
        )
        if (
          confirmedVisibleHistory.missingSegments.length > 0 ||
          confirmedVisibleHistory.truncated ||
          recentVisibleSnapshot(
            confirmedVisibleHistory.retrievedSegments,
            nextVisibleSegmentKeys,
          ) !== nextVisibleSnapshot
        ) {
          throw new SessionCardHistoryCursorError()
        }
      }
      const tipSegmentKeys = resolved.card.continuationSegmentKeys.slice(-2)
      const tipSnapshot = recentVisibleSnapshot(
        [...retrievedSegments, ...priorVisibleSegments],
        tipSegmentKeys,
      )
      const previousCursor =
        !sourceIncomplete &&
        hasOlderSegments &&
        nextBoundary &&
        nextBoundarySegmentKey &&
        nextVisibleSnapshot &&
        tipSnapshot
          ? encodeCursor(
              {
                v: CURSOR_VERSION,
                cardId: resolved.card.cardId,
                snapshot,
                offset: nextOffset,
                window: 'recent',
                boundarySegmentKey: nextBoundarySegmentKey,
                boundarySnapshot: recentBoundarySnapshot(nextBoundary),
                visibleSegmentCount: nextVisibleSegmentCount,
                visibleSnapshot: nextVisibleSnapshot,
                tipSnapshot,
              },
              this.cursorSecret,
            )
          : undefined
      return {
        cardId: resolved.card.cardId,
        canonicalSegmentKey: resolved.card.canonicalSegmentKey,
        messages,
        completeness:
          sourceIncomplete || hasOlderSegments ? 'partial' : 'complete',
        retryable: sourceIncomplete,
        missingSegments,
        loadedSegmentKeys,
        ...(previousCursor ? { previousCursor } : {}),
      }
    }
    if (cursor && cursor.window !== 'messages') {
      throw new SessionCardHistoryCursorError()
    }
    const offset = cursor?.offset ?? 0

    const {
      messages: assembled,
      missingSegments,
      retrievedSegments,
      truncated: historyTruncated,
    } = await aggregateCardSegmentHistory(resolved, this.messageSource)

    const snapshot = historySnapshotFingerprint(resolved, retrievedSegments)
    const partial =
      missingSegments.length > 0 ||
      historyTruncated ||
      resolved.collection.completeness === 'incomplete'
    if (cursor && (partial || cursor.snapshot !== snapshot)) {
      throw new SessionCardHistoryCursorError()
    }
    if (offset > assembled.length) throw new SessionCardHistoryCursorError()
    // A partial aggregate has no stable offset cursor. Return every row that is
    // currently available so applying the requested limit cannot make the
    // remainder unreachable while the missing/truncated segment is retried.
    const messages = partial
      ? assembled
      : assembled.slice(offset, offset + limit)
    const nextOffset = offset + messages.length
    const nextCursor =
      !partial && nextOffset < assembled.length
        ? encodeCursor(
            {
              v: CURSOR_VERSION,
              cardId: resolved.card.cardId,
              snapshot,
              offset: nextOffset,
              window: 'messages',
            },
            this.cursorSecret,
          )
        : undefined

    return {
      cardId: resolved.card.cardId,
      canonicalSegmentKey: resolved.card.canonicalSegmentKey,
      messages,
      completeness: partial ? 'partial' : 'complete',
      retryable: partial,
      missingSegments,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }
}

export const sessionCardHistoryService = new SessionCardHistoryService()
