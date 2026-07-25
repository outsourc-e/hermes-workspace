import type { SessionMeta } from './types'

const NON_REMOTE_SESSION_SOURCES = new Set(['local', 'portable'])

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getAuthoritativeSessionKey(session: SessionMeta): string {
  return normalizedString(session.backendKey)
}

export function isSessionForkEligible(session: SessionMeta): boolean {
  const sessionKey = getAuthoritativeSessionKey(session)
  if (!sessionKey) return false

  const source = normalizedString(session.lineage?.source).toLowerCase()
  return !NON_REMOTE_SESSION_SOURCES.has(source)
}

export function getForkedSessionRouteKey(
  response: unknown,
  requestedParentSessionKey: string,
): string {
  if (
    !isRecord(response) ||
    response.ok !== true ||
    response.supported !== true ||
    response.parentSessionKey !== requestedParentSessionKey
  ) {
    return ''
  }

  const authoritativeSessionKey = normalizedString(response.sessionKey)
  const entry = response.entry
  if (
    !authoritativeSessionKey ||
    authoritativeSessionKey === requestedParentSessionKey ||
    response.sessionKey !== authoritativeSessionKey ||
    !isRecord(entry) ||
    entry.key !== authoritativeSessionKey
  ) {
    return ''
  }

  return normalizedString(entry.friendlyId) || authoritativeSessionKey
}
