import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import { getMessagesResult } from './claude-api'
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
      const result = await getMessagesResult(segmentKey, source)
      return {
        messages: result.messages as Array<SessionCardUpstreamMessage>,
        source: result.source,
        ...(result.resolvedSessionId === undefined
          ? {}
          : { resolvedSegmentKey: result.resolvedSessionId }),
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

    const assembled: Array<SessionCardHistoryEntry> = []
    const missingSegments: Array<SessionCardHistoryMissingSegment> = []
    const retrievedSegments: Array<RetrievedSegmentSnapshot> = []
    let previousLoadedBoundaryId: string | undefined
    let historyTruncated = false

    // This is deliberately sequential. It both preserves segment chronology and
    // makes it impossible for child/delegate fetches to enter via tree traversal.
    for (const segmentKey of resolved.card.continuationSegmentKeys) {
      const source = resolved.sourceBySegmentKey.get(segmentKey)
      const upstreamKey = resolved.upstreamKeyBySegmentKey.get(segmentKey)
      if (!source || !upstreamKey) {
        missingSegments.push({
          segmentKey,
          ...(source ? { source } : {}),
          retryable: true,
          error: 'Validated segment source is unavailable.',
        })
        previousLoadedBoundaryId = undefined
        continue
      }

      try {
        const fetchedBatch = await this.messageSource.getMessages(
          upstreamKey,
          source,
        )
        if (fetchedBatch.source !== source) {
          throw new Error(
            `Session history source mismatch (${source} expected, ${fetchedBatch.source ?? 'missing'} received).`,
          )
        }
        // The source check plus the exact canonical key check is the complete
        // source-qualified identity. Neither half is safe on its own.
        if (fetchedBatch.resolvedSegmentKey !== upstreamKey) {
          throw new Error(
            `Session history segment mismatch (${upstreamKey} expected, ${fetchedBatch.resolvedSegmentKey ?? 'missing'} received).`,
          )
        }
        const messages = [...fetchedBatch.messages]
        const batch = { ...fetchedBatch, messages }
        retrievedSegments.push({ segmentKey, source, upstreamKey, batch })
        historyTruncated ||= batch.truncated === true
        const firstId = messages[0] ? stableMessageId(messages[0]) : undefined
        const startsWithBoundaryDuplicate = Boolean(
          previousLoadedBoundaryId &&
          firstId &&
          previousLoadedBoundaryId === firstId,
        )
        const retained = startsWithBoundaryDuplicate
          ? messages.slice(1)
          : messages
        for (const message of retained) {
          assembled.push({ segmentKey, message })
        }
        // A successfully loaded empty segment does not create a history gap, so
        // keep the last stable nonempty boundary for the next available segment.
        if (messages.length > 0) {
          previousLoadedBoundaryId = stableMessageId(
            messages[messages.length - 1]!,
          )
        }
      } catch (error) {
        missingSegments.push({
          segmentKey,
          source,
          retryable: true,
          error: errorMessage(error),
        })
        // Do not de-duplicate across an unavailable segment because those are no
        // longer adjacent loaded boundaries.
        previousLoadedBoundaryId = undefined
      }
    }

    const snapshot = historySnapshotFingerprint(resolved, retrievedSegments)
    const partial =
      missingSegments.length > 0 ||
      historyTruncated ||
      resolved.collection.completeness === 'incomplete'
    if (cursor && (partial || cursor.snapshot !== snapshot)) {
      throw new SessionCardHistoryCursorError()
    }
    if (offset > assembled.length) throw new SessionCardHistoryCursorError()
    const messages = assembled.slice(offset, offset + limit)
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
