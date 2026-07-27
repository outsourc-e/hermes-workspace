import { describe, expect, it } from 'vitest'
import { resolveSwarmSessionCardTarget } from './use-swarm-chat'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'

function card(overrides: Partial<SessionCardWire> = {}): SessionCardWire {
  return {
    cardId: 'remote:worker-card',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Authoritative worker Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:worker-tip',
    continuationSegmentKeys: ['remote:worker-card', 'remote:worker-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: 10,
    archived: false,
    pinned: false,
    ...overrides,
  }
}

function response(
  cards: Array<SessionCardWire>,
  resolutions: SessionCardListWire['cardResolutions'] = cards.map((item) => ({
    cardId: item.cardId,
    completeness: 'complete',
    retryable: false,
  })),
): SessionCardListWire {
  return {
    cards,
    cardResolutions: resolutions,
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

describe('resolveSwarmSessionCardTarget', () => {
  it('resolves only an exact source-qualified stable Card ID', () => {
    const list = response([card()])

    expect(
      resolveSwarmSessionCardTarget(list, 'remote:worker-card'),
    ).toMatchObject({
      cardId: 'remote:worker-card',
      canonicalSegmentKey: 'remote:worker-tip',
      route: {
        params: { sessionKey: 'remote:worker-card' },
        search: {},
      },
    })
    expect(resolveSwarmSessionCardTarget(list, 'worker-card')).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(list, 'remote:worker-tip'),
    ).toBeUndefined()
  })

  it('resolves an exact direct-child Card under its owning parent route', () => {
    const list = response([
      card({
        childNodes: [
          {
            cardId: 'remote:worker-child-card',
            sessionKey: 'remote:worker-child-tip',
            continuationSegmentKeys: [
              'remote:worker-child-card',
              'remote:worker-child-tip',
            ],
            continuationCount: 2,
            relationshipKind: 'child',
            title: 'Worker child Card',
            status: 'running',
            updatedAt: 20,
          },
        ],
      }),
    ])

    expect(
      resolveSwarmSessionCardTarget(list, 'remote:worker-child-card'),
    ).toMatchObject({
      cardId: 'remote:worker-child-card',
      parentCardId: 'remote:worker-card',
      canonicalSegmentKey: 'remote:worker-child-tip',
      route: {
        params: { sessionKey: 'remote:worker-card' },
        search: { inspect: 'remote:worker-child-card' },
      },
    })
  })

  it('fails closed for incomplete, retryable, duplicate, and unmapped Cards', () => {
    const complete = card()
    expect(
      resolveSwarmSessionCardTarget(
        response(
          [complete],
          [
            {
              cardId: complete.cardId,
              completeness: 'incomplete',
              retryable: true,
            },
          ],
        ),
        complete.cardId,
      ),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(
        response([complete, { ...complete }]),
        complete.cardId,
      ),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(response([complete]), 'remote:missing'),
    ).toBeUndefined()
  })
})
