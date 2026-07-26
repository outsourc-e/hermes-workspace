import { describe, expect, it } from 'vitest'

import { resolveSessionRowCardNavigation } from '../screens/dashboard/components/sessions-intelligence-card'
import { resolveBackgroundRunCardNavigation } from './agent-view/background-runs-section'
import { recentSessionCards } from './command-palette'
import { resolveSearchSessionCardNavigation } from './search/search-modal'
import type { SessionCardListWire } from '../screens/chat/chat-queries'
import type { SessionCard } from '../screens/chat/types'

const card: SessionCard = {
  cardId: 'remote:parent-card',
  title: 'Parent Card',
  titleSource: 'manual',
  canonicalSegmentKey: 'remote:parent-tip',
  continuationSegmentKeys: ['remote:parent-root', 'remote:parent-tip'],
  continuationCount: 2,
  relationshipKind: 'root',
  childNodes: [
    {
      cardId: 'remote:child-card',
      sessionKey: 'remote:child-tip',
      relationshipKind: 'child',
      title: 'Child Card',
      status: 'running',
      updatedAt: 2,
      continuationCount: 1,
    },
  ],
  updatedAt: 3,
  archived: false,
  pinned: false,
}

const response: SessionCardListWire = {
  cards: [card],
  completeness: 'complete',
  retryable: false,
  sources: [],
}

describe('Session Card route producers', () => {
  it('builds command-palette recents only from authoritative Cards', () => {
    expect(recentSessionCards(response)).toEqual([card])
    expect(
      recentSessionCards({
        ...response,
        completeness: 'incomplete',
        retryable: true,
      }),
    ).toEqual([])
  })

  it('maps search results to the owning parent Card and fails closed', () => {
    expect(
      resolveSearchSessionCardNavigation(response, {
        key: 'remote:parent-root',
        friendlyId: 'legacy-parent-label',
      }),
    ).toEqual({ cardId: 'remote:parent-card' })
    expect(
      resolveSearchSessionCardNavigation(response, {
        key: 'raw-without-card',
        friendlyId: 'another-raw-id',
      }),
    ).toBeUndefined()
  })

  it('maps dashboard rows to Card routes instead of raw session keys', () => {
    expect(
      resolveSessionRowCardNavigation(response, {
        key: 'remote:parent-tip',
      }),
    ).toEqual({ cardId: 'remote:parent-card' })
    expect(
      resolveSessionRowCardNavigation(response, { key: 'unmapped' }),
    ).toBeUndefined()
  })

  it('opens child background runs as parent-scoped inspection only', () => {
    expect(
      resolveBackgroundRunCardNavigation(response, {
        sessionKey: 'remote:child-tip',
        friendlyId: 'raw-child-label',
      }),
    ).toEqual({
      cardId: 'remote:parent-card',
      inspectedChildCardId: 'remote:child-card',
    })
    expect(
      resolveBackgroundRunCardNavigation(response, {
        sessionKey: 'unmapped',
        friendlyId: 'also-unmapped',
      }),
    ).toBeUndefined()
  })
})
