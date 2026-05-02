export const HERMES_SESSION_KEY_HEADER = 'X-Hermes-Session-Key'
export const HERMES_FRIENDLY_ID_HEADER = 'X-Hermes-Friendly-Id'
export const LEGACY_CLAUDE_SESSION_KEY_HEADER = 'x-claude-session-key'
export const LEGACY_CLAUDE_FRIENDLY_ID_HEADER = 'x-claude-friendly-id'

type HeaderReader = {
  get(name: string): string | null
}

function normalizeHeaderValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildResolvedSessionHeaders(payload: {
  sessionKey: string
  friendlyId: string
}): Record<string, string> {
  return {
    [HERMES_SESSION_KEY_HEADER]: payload.sessionKey,
    [HERMES_FRIENDLY_ID_HEADER]: payload.friendlyId,
    [LEGACY_CLAUDE_SESSION_KEY_HEADER]: payload.sessionKey,
    [LEGACY_CLAUDE_FRIENDLY_ID_HEADER]: payload.friendlyId,
  }
}

export function readResolvedSessionHeaders(
  headers: HeaderReader,
  fallback: {
    sessionKey: string
    friendlyId: string
  },
): {
  sessionKey: string
  friendlyId: string
} {
  const sessionKey =
    normalizeHeaderValue(headers.get(HERMES_SESSION_KEY_HEADER)) ||
    normalizeHeaderValue(headers.get(LEGACY_CLAUDE_SESSION_KEY_HEADER)) ||
    fallback.sessionKey

  const friendlyId =
    normalizeHeaderValue(headers.get(HERMES_FRIENDLY_ID_HEADER)) ||
    normalizeHeaderValue(headers.get(LEGACY_CLAUDE_FRIENDLY_ID_HEADER)) ||
    sessionKey ||
    fallback.friendlyId

  return {
    sessionKey,
    friendlyId,
  }
}
