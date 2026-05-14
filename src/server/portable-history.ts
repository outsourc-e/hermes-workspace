import { BEARER_TOKEN } from './gateway-capabilities'

export type PortableHistoryMessage = {
  role: string
  content: string
}

export function shouldReplayPortableHistory(options?: {
  localBaseUrl?: string
  bearerToken?: string
}): boolean {
  const localBaseUrl = options?.localBaseUrl?.trim() || ''
  if (localBaseUrl) return true

  const bearerToken =
    typeof options?.bearerToken === 'string' ? options.bearerToken : BEARER_TOKEN

  return !bearerToken.trim()
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
