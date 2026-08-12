import { describe, expect, it } from 'vitest'
import { resolveSwarmSessionCardTarget } from './use-swarm-chat'
import type {
  SwarmSessionCardOwner,
  UseSwarmChatOptions,
} from './use-swarm-chat'
import type {
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'

function card(overrides: Partial<SessionCardWire> = {}): SessionCardWire {
  return {
    cardId: 'local:worker-card',
    canonicalSource: 'local',
    title: 'Authoritative worker Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'local:worker-tip',
    continuationSegmentKeys: ['local:worker-card', 'local:worker-tip'],
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

const rootOwner: SwarmSessionCardOwner = {
  kind: 'session-card-owner',
  cardId: 'local:worker-card',
  parentCardId: null,
}

const childOwner: SwarmSessionCardOwner = {
  kind: 'session-card-owner',
  cardId: 'local:worker-child-card',
  parentCardId: 'local:worker-card',
}

function childCard(): SessionCardWire {
  return card({
    childNodes: [
      {
        cardId: 'local:worker-child-card',
        sessionKey: 'local:worker-child-tip',
        continuationSegmentKeys: [
          'local:worker-child-card',
          'local:worker-child-tip',
        ],
        continuationCount: 2,
        relationshipKind: 'child',
        title: 'Worker child Card',
        status: 'running',
        updatedAt: 20,
      },
    ],
  })
}

describe('resolveSwarmSessionCardTarget', () => {
  it('resolves only an exact source-qualified stable root Card owner', () => {
    const list = response([card()])

    expect(resolveSwarmSessionCardTarget(list, rootOwner)).toEqual({
      cardId: 'local:worker-card',
      parentCardId: null,
      title: 'Authoritative worker Card',
      relationship: 'root',
      route: {
        to: '/chat/$sessionKey',
        params: { sessionKey: 'local:worker-card' },
        search: {},
      },
    })
    expect(
      resolveSwarmSessionCardTarget(list, {
        ...rootOwner,
        cardId: 'local:worker-tip',
      }),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(list, {
        ...rootOwner,
        cardId: 'worker-card',
      }),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(
        response([
          card({
            cardId: 'remote:worker-card',
            canonicalSource: 'remote',
            canonicalTransport: 'gateway',
            canonicalSegmentKey: 'remote:builder',
            continuationSegmentKeys: ['remote:worker-card', 'remote:builder'],
          }),
        ]),
        {
          kind: 'session-card-owner',
          cardId: 'remote:worker-card',
          parentCardId: null,
        },
      ),
    ).toBeUndefined()
  })

  it('resolves an exact child only under its authoritative parent Card', () => {
    const list = response([childCard()])

    expect(resolveSwarmSessionCardTarget(list, childOwner)).toEqual({
      cardId: 'local:worker-child-card',
      parentCardId: 'local:worker-card',
      title: 'Worker child Card',
      relationship: 'child',
      route: {
        to: '/chat/$sessionKey',
        params: { sessionKey: 'local:worker-card' },
        search: { inspect: 'local:worker-child-card' },
      },
    })
    expect(
      resolveSwarmSessionCardTarget(list, {
        ...childOwner,
        parentCardId: 'local:other-parent',
      }),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(list, {
        ...childOwner,
        parentCardId: null,
      }),
    ).toBeUndefined()
  })

  it('fails closed for source mismatch, malformed child ownership, incomplete, duplicate, and unmapped Cards', () => {
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
        rootOwner,
      ),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(
        response([complete, { ...complete }]),
        rootOwner,
      ),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(response([complete]), {
        ...rootOwner,
        cardId: 'local:missing',
      }),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(
        response([
          childCard(),
          card({
            cardId: 'local:other-parent',
            canonicalSegmentKey: 'local:other-parent',
            continuationSegmentKeys: ['local:other-parent'],
            continuationCount: 1,
            childNodes: [childCard().childNodes[0]!],
          }),
        ]),
        childOwner,
      ),
    ).toBeUndefined()
    expect(
      resolveSwarmSessionCardTarget(
        response(
          [childCard()].map((parent) => ({
            ...parent,
            childNodes: parent.childNodes.map((child) => ({
              ...child,
              cardId: 'local:worker-child-card',
              sessionKey: 'remote:worker-child-tip',
              continuationSegmentKeys: [
                'local:worker-child-card',
                'remote:worker-child-tip',
              ],
            })),
          })),
        ),
        {
          ...childOwner,
          cardId: 'local:worker-child-card',
        },
      ),
    ).toBeUndefined()
  })
})

// Compile-time closure: callers must provide a Card-owner object with explicit
// parent identity. Retired raw activity/session strings are not identity APIs.
function compileTimeIdentityContract() {
  // @ts-expect-error Raw Card/session strings cannot identify embedded Chat.
  resolveSwarmSessionCardTarget(response([card()]), 'local:worker-card')

  const invalidOptions: UseSwarmChatOptions = {
    workerId: 'builder',
    // @ts-expect-error The legacy raw activity Card argument is retired.
    activityCardId: 'local:worker-card',
  }
  void invalidOptions

  const incompleteOwner: SwarmSessionCardOwner = {
    kind: 'session-card-owner',
    cardId: 'local:worker-card',
    // @ts-expect-error Parent identity must be explicit, including null for roots.
    parentCardId: undefined,
  }
  void incompleteOwner
}
void compileTimeIdentityContract
