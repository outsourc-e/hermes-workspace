import { describe, expect, it } from 'vitest'

import {
  buildConductorStopCardBindings,
  resolveAuthoritativeConductorCardOwner,
  shouldPersistActiveConductorMission,
} from './use-conductor-gateway'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'

function cardProjection(): SessionCardListWire {
  return {
    cards: [
      {
        cardId: 'remote:mission-card',
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        title: 'Mission orchestrator',
        titleSource: 'manual',
        canonicalSegmentKey: 'remote:mission-successor',
        continuationSegmentKeys: [
          'remote:mission-card',
          'remote:mission-anchor',
          'remote:mission-successor',
        ],
        continuationCount: 3,
        relationshipKind: 'root',
        childNodes: [],
        updatedAt: 2,
        archived: false,
        pinned: false,
      },
      {
        cardId: 'remote:unrelated-card',
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        title: 'Unrelated session',
        titleSource: 'manual',
        canonicalSegmentKey: 'remote:hostile-started-key',
        continuationSegmentKeys: [
          'remote:unrelated-card',
          'remote:hostile-started-key',
        ],
        continuationCount: 2,
        relationshipKind: 'root',
        childNodes: [],
        updatedAt: 2,
        archived: false,
        pinned: false,
      },
    ],
    cardResolutions: [
      {
        cardId: 'remote:mission-card',
        completeness: 'complete',
        retryable: false,
      },
      {
        cardId: 'remote:unrelated-card',
        completeness: 'complete',
        retryable: false,
      },
    ],
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

describe('Conductor stream event authority', () => {
  it('builds destructive requests from exact Card owners and canonical bindings', () => {
    expect(
      buildConductorStopCardBindings(cardProjection(), [
        { cardId: 'remote:mission-card' },
      ]),
    ).toEqual([
      {
        kind: 'session-card-owner',
        cardId: 'remote:mission-card',
        parentCardId: null,
        canonicalSource: 'remote',
        canonicalSegmentKey: 'remote:mission-successor',
        canonicalTransport: 'gateway',
      },
    ])
  })

  it('rejects a hostile started-event key projected to an unrelated Card', () => {
    expect(
      resolveAuthoritativeConductorCardOwner(
        cardProjection(),
        'mission-anchor',
        'hostile-started-key',
      ),
    ).toBeNull()
  })

  it('accepts a started-event successor only when the complete projection ties it to the mission Card', () => {
    expect(
      resolveAuthoritativeConductorCardOwner(
        cardProjection(),
        'mission-anchor',
        'mission-successor',
      ),
    ).toEqual({
      cardId: 'remote:mission-card',
      sessionKey: 'mission-successor',
    })

    const incomplete = cardProjection()
    incomplete.cardResolutions[0] = {
      cardId: 'remote:mission-card',
      completeness: 'incomplete',
      retryable: true,
    }
    expect(
      resolveAuthoritativeConductorCardOwner(
        incomplete,
        'mission-anchor',
        'mission-successor',
      ),
    ).toBeNull()
  })
})

describe('Conductor active mission persistence', () => {
  it('persists only resumable in-flight phases', () => {
    expect(shouldPersistActiveConductorMission('decomposing')).toBe(true)
    expect(shouldPersistActiveConductorMission('running')).toBe(true)
  })

  it('does not persist terminal or idle phases as the active mission', () => {
    expect(shouldPersistActiveConductorMission('idle')).toBe(false)
    expect(shouldPersistActiveConductorMission('complete')).toBe(false)
  })
})
