type ResolveSessionKeyInput = {
  rawSessionKey?: string
  friendlyId?: string
  defaultKey?: string
}

type ResolveSessionResult = {
  sessionKey: string
  resolvedVia: 'raw' | 'friendly' | 'default'
}

const SYNTHETIC_SESSION_KEYS = new Set(['main', 'new'])

export function isSyntheticSessionKey(
  value: string | null | undefined,
): boolean {
  if (!value) return false
  return SYNTHETIC_SESSION_KEYS.has(value.trim())
}

export async function resolveSessionKey({
  rawSessionKey,
  friendlyId,
  defaultKey = 'new',
}: ResolveSessionKeyInput): Promise<ResolveSessionResult> {
  const trimmedRaw = rawSessionKey?.trim() ?? ''
  if (trimmedRaw.length > 0) {
    return { sessionKey: trimmedRaw, resolvedVia: 'raw' }
  }

  const trimmedFriendly = friendlyId?.trim() ?? ''
  if (trimmedFriendly.length > 0) {
    return { sessionKey: trimmedFriendly, resolvedVia: 'friendly' }
  }

  return { sessionKey: defaultKey, resolvedVia: 'default' }
}
