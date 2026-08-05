const CARD_DRAFT_STORAGE_PREFIX = 'workspace.card-draft.v1:'
const CARD_THINKING_STORAGE_PREFIX = 'workspace.card-thinking.v1:'
const NEW_CHAT_OWNER = 'new'

function normalizedCardOwner(cardId?: string): string {
  const normalized = cardId?.trim()
  return normalized || NEW_CHAT_OWNER
}

export function cardDraftStorageKey(cardId?: string): string {
  return `${CARD_DRAFT_STORAGE_PREFIX}${encodeURIComponent(normalizedCardOwner(cardId))}`
}

export function cardThinkingStorageKey(cardId?: string): string {
  return `${CARD_THINKING_STORAGE_PREFIX}${encodeURIComponent(normalizedCardOwner(cardId))}`
}

/** Remove pre-Card UI state for known backend continuation segments. */
export function removeLegacySegmentUiStorage(
  continuationSegmentKeys: ReadonlyArray<string>,
  storage?: Pick<Storage, 'removeItem'>,
): void {
  const resolvedStorage =
    storage ??
    (typeof window === 'undefined' ? undefined : window.sessionStorage)
  if (!resolvedStorage) return
  for (const segmentKey of continuationSegmentKeys) {
    const normalized = segmentKey.trim()
    if (!normalized) continue
    try {
      resolvedStorage.removeItem(`claude-draft-${normalized}`)
      resolvedStorage.removeItem(`claude-thinking-${normalized}`)
    } catch {
      return
    }
  }
}
