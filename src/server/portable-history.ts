export type PortableHistoryMessage = {
  role: string
  content: string
}

export function shouldReplayPortableHistory(options?: {
  localBaseUrl?: string
  bearerToken?: string
}): boolean {
  const localBaseUrl = options?.localBaseUrl?.trim() || ''
  // Direct local-provider / custom-base-url requests remain stateless from the
  // workspace perspective, so replay the transcript there.
  if (localBaseUrl) return true

  // When portable chat targets the Hermes gateway, Workspace now forwards a
  // stable X-Hermes-Session-Id / X-Claude-Session-Id for server-side session
  // continuity. Replaying the full transcript on every turn would duplicate
  // prompt context and can explode token usage.
  return false
}

export function selectPortableConversationHistory(
  persistedHistory: Array<PortableHistoryMessage>,
  fallbackHistory: Array<PortableHistoryMessage>,
  options?: {
    localBaseUrl?: string
    bearerToken?: string
  },
): Array<PortableHistoryMessage> {
  if (!shouldReplayPortableHistory(options)) return []
  return persistedHistory.length > 0 ? persistedHistory : fallbackHistory
}
