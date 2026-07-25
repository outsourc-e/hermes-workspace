export type AuthoritativeStreamHandoff = {
  fromSessionKey: string
  sessionKey: string
}

const SESSION_BOOTSTRAP_KEYS = new Set(['main', 'new'])

export function resolveAuthoritativeBootstrapHandoff(
  requestedSessionKey: string,
  resolvedSessionKey: string,
): AuthoritativeStreamHandoff | null {
  const fromSessionKey = requestedSessionKey.trim()
  const sessionKey = resolvedSessionKey.trim()
  if (
    !SESSION_BOOTSTRAP_KEYS.has(fromSessionKey) ||
    !sessionKey ||
    SESSION_BOOTSTRAP_KEYS.has(sessionKey)
  ) {
    return null
  }
  return { fromSessionKey, sessionKey }
}

/**
 * Only session_id is authoritative stream handoff data. Lineage metadata such
 * as parent_session_id describes ancestry and must never trigger routing.
 */
export function resolveAuthoritativeStreamHandoff(
  currentSessionKey: string,
  data: Record<string, unknown>,
): AuthoritativeStreamHandoff | null {
  const sessionKey =
    typeof data.session_id === 'string' ? data.session_id.trim() : ''
  if (
    !sessionKey ||
    SESSION_BOOTSTRAP_KEYS.has(sessionKey) ||
    sessionKey === currentSessionKey
  )
    return null
  return { fromSessionKey: currentSessionKey, sessionKey }
}
