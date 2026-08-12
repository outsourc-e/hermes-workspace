const CARD_DRAFT_STORAGE_PREFIX = 'workspace.card-draft.v1:'
const CARD_THINKING_STORAGE_PREFIX = 'workspace.card-thinking.v1:'
function normalizedCardOwner(cardId?: string): string | null {
  const normalized = cardId?.trim()
  return normalized || null
}

export function cardDraftStorageKey(cardId?: string): string | null {
  const owner = normalizedCardOwner(cardId)
  return owner
    ? `${CARD_DRAFT_STORAGE_PREFIX}${encodeURIComponent(owner)}`
    : null
}

export function cardThinkingStorageKey(cardId?: string): string | null {
  const owner = normalizedCardOwner(cardId)
  return owner
    ? `${CARD_THINKING_STORAGE_PREFIX}${encodeURIComponent(owner)}`
    : null
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
