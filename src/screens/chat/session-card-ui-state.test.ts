import { describe, expect, it, vi } from 'vitest'
import {
  cardDraftStorageKey,
  cardThinkingStorageKey,
  removeLegacySegmentUiStorage,
} from './session-card-ui-state'

function storage() {
  const records = new Map<string, string>()
  return {
    records,
    storage: {
      removeItem: (key: string) => records.delete(key),
    },
  }
}

describe('Session Card-owned UI state', () => {
  it('namespaces draft and thinking state only by Card identity', () => {
    expect(cardDraftStorageKey('remote:parent-card')).toBe(
      'workspace.card-draft.v1:remote%3Aparent-card',
    )
    expect(cardThinkingStorageKey('remote:parent-card')).toBe(
      'workspace.card-thinking.v1:remote%3Aparent-card',
    )
    expect(cardDraftStorageKey()).toBe('workspace.card-draft.v1:new')
  })

  it('removes legacy state for every known continuation segment', () => {
    const fake = storage()
    fake.records.set('claude-draft-remote:root', 'old root draft')
    fake.records.set('claude-thinking-remote:tip', 'high')
    fake.records.set(cardDraftStorageKey('remote:root'), 'Card draft')

    removeLegacySegmentUiStorage(['remote:root', 'remote:tip'], fake.storage)

    expect([...fake.records.entries()]).toEqual([
      [cardDraftStorageKey('remote:root'), 'Card draft'],
    ])
  })
})
