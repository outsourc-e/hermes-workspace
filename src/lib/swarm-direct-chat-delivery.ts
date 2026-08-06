export const SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION = 1 as const

export type SwarmDirectChatUserAcknowledgement = Readonly<{
  version: typeof SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION
  clientId: string
  observedAt: number
  contentDigest: string
}>

/**
 * Small deterministic digest used only to correlate a server-observed tmux
 * echo with its Card projection. This is an identity checksum, not a security
 * primitive.
 */
export function swarmDirectChatContentDigest(content: string): string {
  let hash = 2166136261
  const normalized = content.trim()
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function parseSwarmDirectChatUserAcknowledgement(
  value: unknown,
  expectedClientId?: string,
): SwarmDirectChatUserAcknowledgement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.version !== SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION ||
    typeof candidate.clientId !== 'string' ||
    !candidate.clientId ||
    (expectedClientId !== undefined &&
      candidate.clientId !== expectedClientId) ||
    typeof candidate.observedAt !== 'number' ||
    !Number.isFinite(candidate.observedAt) ||
    candidate.observedAt <= 0 ||
    typeof candidate.contentDigest !== 'string' ||
    !/^fnv1a32:[0-9a-f]{8}$/u.test(candidate.contentDigest)
  ) {
    return null
  }
  return {
    version: SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
    clientId: candidate.clientId,
    observedAt: candidate.observedAt,
    contentDigest: candidate.contentDigest,
  }
}
