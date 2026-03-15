type ResolveSessionKeyInput = {
  rawSessionKey?: string
  friendlyId?: string
  defaultKey?: string
}

type ResolveSessionResult = {
  sessionKey: string
  resolvedVia: 'raw' | 'friendly' | 'default'
}

export async function resolveSessionKey({
  rawSessionKey,
  friendlyId,
  defaultKey = 'main',
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
