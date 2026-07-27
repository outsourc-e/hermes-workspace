import type { SessionCardRouteResolution } from './-session-route-state'

const LAST_SESSION_CARD_KEY = 'hermes-last-session-card'
const CHAT_BOOTSTRAP_CARD_ID = 'new'

export type LastSessionCardPersistenceAction = 'unchanged' | 'bootstrap-new'

export function readLastSessionCard(): string {
  try {
    const stored =
      typeof window !== 'undefined'
        ? localStorage.getItem(LAST_SESSION_CARD_KEY)
        : null
    return stored || CHAT_BOOTSTRAP_CARD_ID
  } catch {
    return CHAT_BOOTSTRAP_CARD_ID
  }
}

export function syncLastSessionCardPersistence({
  activeFriendlyId,
  selectedCardId,
  cardRouteResolution,
}: {
  activeFriendlyId: string
  selectedCardId: string | undefined
  cardRouteResolution?: SessionCardRouteResolution | null
}): LastSessionCardPersistenceAction {
  if (activeFriendlyId === CHAT_BOOTSTRAP_CARD_ID) {
    try {
      localStorage.removeItem(LAST_SESSION_CARD_KEY)
    } catch {}
    return 'unchanged'
  }
  if (selectedCardId) {
    try {
      localStorage.setItem(LAST_SESSION_CARD_KEY, selectedCardId)
    } catch {}
    return 'unchanged'
  }
  if (
    cardRouteResolution?.status !== 'rejected' ||
    cardRouteResolution.reason !== 'missing'
  ) {
    return 'unchanged'
  }
  try {
    if (localStorage.getItem(LAST_SESSION_CARD_KEY) !== activeFriendlyId) {
      return 'unchanged'
    }
    localStorage.removeItem(LAST_SESSION_CARD_KEY)
    return 'bootstrap-new'
  } catch {
    return 'unchanged'
  }
}
