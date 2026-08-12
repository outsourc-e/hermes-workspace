import { json } from '@tanstack/react-start'
import {
  SessionCardNotFoundError,
  SessionCardPinNotEligibleError,
} from '../../server/session-card-service'
import { SESSION_CARD_TITLE_MAX_LENGTH } from '../../server/session-card-store'
import type { SessionCardMetadataUpdate } from '../../server/session-card-store'

const SESSION_CARD_ID_MAX_LENGTH = 256
const METADATA_FIELDS = new Set(['manualTitle', 'autoTitle', 'pinned'])
const MEDIA_TYPE_TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+"
const HTTP_OWS = '[ \\t]*'
const MEDIA_TYPE_VALUE = `(?:${MEDIA_TYPE_TOKEN}|"(?:[ !#-\\[\\]-~]|\\\\[ -~])*")`
const JSON_MEDIA_TYPE = new RegExp(
  `^${HTTP_OWS}application/json(?:${HTTP_OWS};${HTTP_OWS}${MEDIA_TYPE_TOKEN}${HTTP_OWS}=${HTTP_OWS}${MEDIA_TYPE_VALUE})*${HTTP_OWS}$`,
  'i',
)

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAscii(value: string): boolean {
  return Array.from(value).every(
    (character) => (character.codePointAt(0) ?? 128) <= 127,
  )
}

export function normalizedCardId(value: string | undefined): string | null {
  const cardId = value?.trim() ?? ''
  if (
    !cardId ||
    cardId.length > SESSION_CARD_ID_MAX_LENGTH ||
    /\s/u.test(cardId) ||
    Array.from(cardId).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127
    })
  ) {
    return null
  }
  return cardId
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as unknown
  return isRecord(body) ? body : null
}

export function requireSessionCardJsonContentType(
  request: Request,
): Response | null {
  const contentType = request.headers.get('content-type') ?? ''
  if (isAscii(contentType) && JSON_MEDIA_TYPE.test(contentType)) {
    return null
  }
  return json(
    { ok: false, error: 'Content-Type must be application/json' },
    { status: 415 },
  )
}

function sanitizedSourceDiagnostic(value: unknown): unknown {
  if (!isRecord(value)) return {}
  return {
    ...(value.source === undefined ? {} : { source: value.source }),
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.fetched === undefined ? {} : { fetched: value.fetched }),
    ...(value.retryable === undefined ? {} : { retryable: value.retryable }),
    ...(value.reason === undefined ? {} : { reason: value.reason }),
    ...(value.error === undefined
      ? {}
      : { error: 'Session Card source unavailable' }),
  }
}

function sanitizedMissingSegment(value: unknown): unknown {
  if (!isRecord(value)) return {}
  return {
    ...(value.segmentKey === undefined ? {} : { segmentKey: value.segmentKey }),
    ...(value.source === undefined ? {} : { source: value.source }),
    ...(value.retryable === undefined ? {} : { retryable: value.retryable }),
    ...(value.error === undefined
      ? {}
      : { error: 'Session Card history segment unavailable' }),
  }
}

export function sanitizeSourceDiagnostics<
  T extends { sources: Array<unknown> },
>(value: T): T {
  return {
    ...value,
    sources: value.sources.map(sanitizedSourceDiagnostic),
  }
}

export function sanitizeHistoryDiagnostics<
  T extends { missingSegments: Array<unknown> },
>(value: T): T {
  return {
    ...value,
    missingSegments: value.missingSegments.map(sanitizedMissingSegment),
  }
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

export function parseMetadataUpdate(
  body: Record<string, unknown>,
): SessionCardMetadataUpdate | null {
  const fields = Object.keys(body)
  if (
    fields.length === 0 ||
    fields.some((field) => !METADATA_FIELDS.has(field))
  ) {
    return null
  }

  const patch: SessionCardMetadataUpdate = {}
  for (const field of fields) {
    const value = body[field]
    if (field === 'pinned') {
      if (typeof value !== 'boolean') return null
      patch.pinned = value
      continue
    }
    if (value !== null && typeof value !== 'string') return null
    if (
      typeof value === 'string' &&
      (value.trim().length === 0 ||
        value.trim().length > SESSION_CARD_TITLE_MAX_LENGTH ||
        hasControlCharacters(value))
    ) {
      return null
    }
    if (field === 'manualTitle') patch.manualTitle = value
    if (field === 'autoTitle') patch.autoTitle = value
  }
  return patch
}

export function invalidRequest(error: string): Response {
  return json({ ok: false, error }, { status: 400 })
}

export function notFoundResponse(): Response {
  return json({ ok: false, error: 'Session Card not found' }, { status: 404 })
}

export function internalFailure(error: string): Response {
  return json({ ok: false, error }, { status: 500 })
}

export function isSessionCardNotFound(
  error: unknown,
): error is SessionCardNotFoundError {
  return error instanceof SessionCardNotFoundError
}

export function isSessionCardPinNotEligible(
  error: unknown,
): error is SessionCardPinNotEligibleError {
  return error instanceof SessionCardPinNotEligibleError
}
