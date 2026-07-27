const LAST_SESSION_CARD_KEY = 'hermes-last-session-card'
const CHAT_BOOTSTRAP_CARD_ID = 'new'

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
}: {
  activeFriendlyId: string
  selectedCardId: string | undefined
}): void {
  if (activeFriendlyId === CHAT_BOOTSTRAP_CARD_ID) {
    try {
      localStorage.removeItem(LAST_SESSION_CARD_KEY)
    } catch {}
    return
  }
  if (!selectedCardId) return
  try {
    localStorage.setItem(LAST_SESSION_CARD_KEY, selectedCardId)
  } catch {}
}
