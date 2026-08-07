type NewSessionDiscardCandidate = {
  cardId: string
  discardToken: string
}

type DiscardAttempt = 'discarded' | 'retained' | 'retry'

type NewSessionDiscardRequest = (
  candidate: NewSessionDiscardCandidate,
  keepalive: boolean,
) => Promise<DiscardAttempt>

function isCandidate(value: NewSessionDiscardCandidate): boolean {
  return (
    value.cardId.length > 0 &&
    /^[A-Za-z0-9_-]{32,128}$/.test(value.discardToken)
  )
}

async function requestDiscard(
  candidate: NewSessionDiscardCandidate,
  keepalive: boolean,
): Promise<DiscardAttempt> {
  try {
    const response = await fetch(
      `/api/session-cards/${encodeURIComponent(candidate.cardId)}/discard`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discardToken: candidate.discardToken }),
        keepalive,
      },
    )
    if (!response.ok) return response.status >= 500 ? 'retry' : 'retained'
    const body = (await response.json().catch(() => null)) as unknown
    if (
      body &&
      typeof body === 'object' &&
      (body as { discarded?: unknown }).discarded === true
    ) {
      return 'discarded'
    }
    return 'retained'
  } catch {
    return 'retry'
  }
}

/** Browser-context ownership for Cards created by the New Session control. */
export function createNewSessionDiscardLifecycle(
  request: NewSessionDiscardRequest = requestDiscard,
) {
  const candidates = new Map<string, NewSessionDiscardCandidate>()
  const primaryModelCandidates = new Set<string>()

  return {
    /** Track an exact browser-created Card until its first send chooses a model. */
    registerPrimaryModelCandidate(cardId: string): void {
      if (cardId.trim()) primaryModelCandidates.add(cardId)
    },

    /**
     * Claims the first-send default-model exemption for a Card created by this
     * browser's New Session control. The claim is single-use so later sends use
     * the Card's resolved gateway model as usual.
     */
    consumePrimaryModelCandidate(cardId: string): boolean {
      return primaryModelCandidates.delete(cardId)
    },

    register(cardId: string, discardToken: string): void {
      const candidate = { cardId, discardToken }
      if (isCandidate(candidate)) candidates.set(cardId, candidate)
    },

    /** A send has begun, so this Card must be retained even if navigation races. */
    retain(cardId: string): void {
      candidates.delete(cardId)
      primaryModelCandidates.delete(cardId)
    },

    /**
     * Discard only records created by this browser context that are no longer
     * the active Card. Failed transport/projection attempts stay queued for a
     * later route change; a retained or consumed capability is removed.
     */
    async discardAbandoned(
      activeCardId: string | null,
      options: { keepalive?: boolean } = {},
    ): Promise<Array<string>> {
      const discarded: Array<string> = []
      for (const [cardId, candidate] of candidates) {
        if (cardId === activeCardId) continue
        const outcome = await request(candidate, options.keepalive === true)
        if (outcome === 'retry') continue
        candidates.delete(cardId)
        primaryModelCandidates.delete(cardId)
        if (outcome === 'discarded') discarded.push(cardId)
      }
      return discarded
    },
  }
}

const newSessionDiscardLifecycle = createNewSessionDiscardLifecycle()

export const registerNewSessionCardForDiscard =
  newSessionDiscardLifecycle.register
export const registerNewSessionCardForPrimaryModel =
  newSessionDiscardLifecycle.registerPrimaryModelCandidate
export const consumeNewSessionCardPrimaryModel =
  newSessionDiscardLifecycle.consumePrimaryModelCandidate
export const retainNewSessionCard = newSessionDiscardLifecycle.retain
export const discardAbandonedNewSessionCards =
  newSessionDiscardLifecycle.discardAbandoned
