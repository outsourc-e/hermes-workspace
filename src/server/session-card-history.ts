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

const CURSOR_VERSION = 2 as const
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT = 500
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
}

export type SessionCardHistoryRequest = {
  cardId: string
  /** Required when loading a child Card so ownership is revalidated server-side. */
  parentCardId?: string
  cursor?: string
  limit?: number
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
      Number(parsed.offset) < 0
    ) {
      throw new SessionCardHistoryCursorError()
    }
    return parsed as CursorPayload
  } catch (error) {
    if (error instanceof SessionCardHistoryCursorError) throw error
    throw new SessionCardHistoryCursorError()
  }
}

function normalizedMessageId(
  candidate: string | number | null | undefined,
): string | undefined {
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

function continuationMessageEvidence(
  message: SessionCardUpstreamMessage,
): Record<string, unknown> {
  // Compression can clone a retained prefix into the child with new database
  // row IDs. Discard only transport/session identities that change during the
  // clone; role, content, timestamp, tool, and client identity remain evidence.
  const {
    id: _id,
    stableId: _stableId,
    session_id: _sessionId,
    ...value
  } = message
  return value
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
  // prefix. In that case require the full role/content/timestamp tuple.
  return (
    typeof previous.role === 'string' &&
    previous.role.length > 0 &&
    Object.prototype.hasOwnProperty.call(previous, 'content') &&
    typeof previous.timestamp === 'number' &&
    Number.isFinite(previous.timestamp)
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
    if (matches) return overlap
  }
  return 0
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
): Promise<AggregatedCardHistory> {
  const messages: Array<SessionCardHistoryEntry> = []
  const missingSegments: Array<SessionCardHistoryMissingSegment> = []
  const retrievedSegments: Array<RetrievedSegmentSnapshot> = []
  let hasContiguousLoadedHistory = false
  let truncated = false

  // Every Card follows this path. A standalone Card is simply an ordered segment
  // list of length one; a child Card supplies only its own resolved segment list.
  // Sequential reads preserve the authoritative continuation order.
  for (const segmentKey of resolved.card.continuationSegmentKeys) {
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
      const segmentMessages = [...fetchedBatch.messages]
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
