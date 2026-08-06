export const SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION = 2 as const
const LEGACY_SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION = 1 as const

export type SwarmDirectChatAttachmentAcknowledgement = Readonly<{
  id: string
  name: string
  contentType: string
  size: number
  contentDigest: string
}>

type LegacySwarmDirectChatUserAcknowledgement = Readonly<{
  version: typeof LEGACY_SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION
  clientId: string
  observedAt: number
  contentDigest: string
}>

type CurrentSwarmDirectChatUserAcknowledgement = Readonly<{
  version: typeof SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION
  clientId: string
  observedAt: number
  contentDigest: string
  attachments: ReadonlyArray<SwarmDirectChatAttachmentAcknowledgement>
}>

export type SwarmDirectChatUserAcknowledgement =
  | LegacySwarmDirectChatUserAcknowledgement
  | CurrentSwarmDirectChatUserAcknowledgement

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

/** SHA-256 over decoded attachment bytes for browser/server acknowledgement parity. */
export async function swarmDirectChatAttachmentContentDigest(
  base64: string,
): Promise<string | null> {
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return null
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `sha256:${hex}`
}

function parseAttachmentAcknowledgements(
  value: unknown,
): Array<SwarmDirectChatAttachmentAcknowledgement> | null {
  if (!Array.isArray(value) || value.length > 8) return null
  const parsed: Array<SwarmDirectChatAttachmentAcknowledgement> = []
  const identities = new Set<string>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const candidate = entry as Record<string, unknown>
    if (
      typeof candidate.id !== 'string' ||
      !candidate.id ||
      candidate.id.length > 128 ||
      identities.has(candidate.id) ||
      typeof candidate.name !== 'string' ||
      !candidate.name ||
      candidate.name.length > 255 ||
      typeof candidate.contentType !== 'string' ||
      !candidate.contentType ||
      candidate.contentType.length > 127 ||
      typeof candidate.size !== 'number' ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size < 0 ||
      typeof candidate.contentDigest !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(candidate.contentDigest)
    ) {
      return null
    }
    identities.add(candidate.id)
    parsed.push({
      id: candidate.id,
      name: candidate.name,
      contentType: candidate.contentType,
      size: candidate.size,
      contentDigest: candidate.contentDigest,
    })
  }
  return parsed
}

export function parseSwarmDirectChatUserAcknowledgement(
  value: unknown,
  expectedClientId?: string,
): SwarmDirectChatUserAcknowledgement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.version !== SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION &&
    candidate.version !== LEGACY_SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION
  ) {
    return null
  }
  if (
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
  if (candidate.version === LEGACY_SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION) {
    return {
      version: LEGACY_SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
      clientId: candidate.clientId,
      observedAt: candidate.observedAt,
      contentDigest: candidate.contentDigest,
    }
  }
  const attachments = parseAttachmentAcknowledgements(candidate.attachments)
  if (!attachments) return null
  return {
    version: SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
    clientId: candidate.clientId,
    observedAt: candidate.observedAt,
    contentDigest: candidate.contentDigest,
    attachments,
  }
}
