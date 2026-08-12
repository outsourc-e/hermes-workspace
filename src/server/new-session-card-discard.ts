import { randomBytes, timingSafeEqual } from 'node:crypto'

const DISCARD_CAPABILITY_TTL_MS = 30 * 60 * 1000

type DiscardCapability = {
  cardId: string
  token: string
  expiresAt: number
  claimed: boolean
}

type DiscardCapabilityClaim = {
  complete: () => void
  release: () => void
}

const capabilities = new Map<string, DiscardCapability>()

function capabilityKey(cardId: string): string {
  return cardId
}

function pruneExpiredCapabilities(now = Date.now()): void {
  for (const [key, capability] of capabilities) {
    if (capability.expiresAt <= now) capabilities.delete(key)
  }
}

function tokenMatches(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  )
}

/**
 * Mint a short-lived, process-local capability for discarding the exact Card
 * created by a New Session click. It is intentionally not durable: after a
 * server restart we retain the empty Card rather than risk deleting one whose
 * browser ownership cannot be proved.
 */
export function issueNewSessionCardDiscardCapability(cardId: string): string {
  pruneExpiredCapabilities()
  const token = randomBytes(32).toString('base64url')
  capabilities.set(capabilityKey(cardId), {
    cardId,
    token,
    expiresAt: Date.now() + DISCARD_CAPABILITY_TTL_MS,
    claimed: false,
  })
  return token
}

/**
 * Exclusively claim a capability before a discard attempt. A transient server
 * failure can release the claim; a completed attempt consumes it permanently.
 */
export function claimNewSessionCardDiscardCapability(
  cardId: string,
  token: string,
): DiscardCapabilityClaim | null {
  pruneExpiredCapabilities()
  const key = capabilityKey(cardId)
  const capability = capabilities.get(key)
  if (
    !capability ||
    capability.cardId !== cardId ||
    capability.claimed ||
    !tokenMatches(capability.token, token)
  ) {
    return null
  }

  capability.claimed = true
  return {
    complete: () => {
      if (capabilities.get(key) === capability) capabilities.delete(key)
    },
    release: () => {
      if (capabilities.get(key) === capability) capability.claimed = false
    },
  }
}
