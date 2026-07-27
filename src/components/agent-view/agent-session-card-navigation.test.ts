import { describe, expect, it } from 'vitest'
import {
  buildAgentSessionCardRoute,
  resolveAgentSessionCardNavigation,
} from './agent-session-card-navigation'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'

const parentCard: SessionCard = {
  cardId: 'remote:parent-card',
  canonicalSource: 'remote',
  title: 'Parent Card',
  titleSource: 'manual',
  canonicalSegmentKey: 'remote:parent-tip',
  continuationSegmentKeys: ['remote:parent-card', 'remote:parent-tip'],
  continuationCount: 2,
  relationshipKind: 'root',
  childNodes: [
    {
      cardId: 'remote:child-card',
      sessionKey: 'remote:child-tip',
      continuationSegmentKeys: ['remote:child-card', 'remote:child-tip'],
      relationshipKind: 'child',
      title: 'Child Card',
      status: 'running',
      updatedAt: 2,
      continuationCount: 2,
    },
  ],
  updatedAt: 3,
  archived: false,
  pinned: false,
}

const completeResponse: SessionCardListWire = {
  cards: [parentCard],
  cardResolutions: [
    {
      cardId: parentCard.cardId,
      completeness: 'complete',
      retryable: false,
    },
  ],
  completeness: 'complete',
  retryable: false,
  sources: [],
}

describe('gateway agent Session Card navigation', () => {
  it('routes parent and continuation identities through the stable parent cardId', () => {
    expect(
      resolveAgentSessionCardNavigation(completeResponse, {
        sessionKey: 'remote:parent-tip',
        friendlyId: 'legacy-friendly-id',
      }),
    ).toEqual({ cardId: 'remote:parent-card' })
    expect(
      resolveAgentSessionCardNavigation(completeResponse, {
        key: 'remote:parent-card',
      }),
    ).toEqual({ cardId: 'remote:parent-card' })
  })

  it('routes child rows to parent-scoped inspection', () => {
    const target = resolveAgentSessionCardNavigation(completeResponse, {
      key: 'remote:child-tip',
    })
    expect(target).toEqual({
      cardId: 'remote:parent-card',
      inspectedChildCardId: 'remote:child-card',
    })
    if (!target) throw new Error('Expected child Card navigation')
    expect(buildAgentSessionCardRoute(target)).toEqual({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:parent-card' },
      search: { inspect: 'remote:child-card' },
    })
  })

  it('fails closed for missing, incomplete, and unmapped Card projections', () => {
    expect(
      resolveAgentSessionCardNavigation(undefined, {
        sessionKey: 'remote:parent-tip',
      }),
    ).toBeUndefined()
    expect(
      resolveAgentSessionCardNavigation(
        {
          ...completeResponse,
          cardResolutions: [
            {
              cardId: parentCard.cardId,
              completeness: 'incomplete',
              retryable: true,
            },
          ],
          completeness: 'incomplete',
          retryable: true,
        },
        { sessionKey: 'remote:parent-tip' },
      ),
    ).toBeUndefined()
    expect(
      resolveAgentSessionCardNavigation(completeResponse, {
        sessionKey: 'remote:unmapped',
        friendlyId: 'legacy-friendly-id',
      }),
    ).toBeUndefined()
  })
})
