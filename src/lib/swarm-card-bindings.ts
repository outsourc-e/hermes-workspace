import type {
  SessionCardChildWire,
  SessionCardListWire,
  SessionCardWire,
} from '@/screens/chat/chat-queries'
import {
  fetchSessionCards,
  hasExactCompleteSessionCardProjection,
} from '@/screens/chat/chat-queries'

export type SwarmWorkerCardOwner = {
  kind: 'session-card-owner'
  cardId: string
  parentCardId: string | null
}

export type SwarmWorkerCardBinding = SwarmWorkerCardOwner & {
  canonicalSource: 'local'
  canonicalSegmentKey: string
  canonicalTransport: 'tmux'
}

export type MutableSessionCardBinding = SwarmWorkerCardOwner & {
  canonicalSource: 'local' | 'remote'
  canonicalSegmentKey: string
  canonicalTransport: 'tmux' | 'gateway'
}

function exactSourceQualifiedIdentity(
  value: unknown,
  source: 'local' | 'remote',
): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value.startsWith(`${source}:`) &&
    value.length > source.length + 1
  )
}

function hasSourceCompleteContinuationProjection(
  owner: {
    cardId: string
    canonicalSegmentKey: string
    continuationSegmentKeys: ReadonlyArray<string>
    continuationCount: number
  },
  source: 'local' | 'remote',
): boolean {
  const continuations = owner.continuationSegmentKeys
  return (
    exactSourceQualifiedIdentity(owner.cardId, source) &&
    exactSourceQualifiedIdentity(owner.canonicalSegmentKey, source) &&
    continuations.length > 0 &&
    continuations.length === owner.continuationCount &&
    continuations.every((identity) =>
      exactSourceQualifiedIdentity(identity, source),
    ) &&
    new Set(continuations).size === continuations.length &&
    continuations[0] === owner.cardId &&
    continuations.at(-1) === owner.canonicalSegmentKey
  )
}

function rootHasAuthoritativeProjection(
  response: SessionCardListWire,
  card: SessionCardWire,
): card is SessionCardWire & { canonicalSource: 'local' } {
  const source = card.canonicalSource
  return (
    source === 'local' &&
    card.parentCardId === undefined &&
    (card.relationshipKind === 'root' || card.relationshipKind === 'orphan') &&
    hasExactCompleteSessionCardProjection(response, card.cardId) &&
    hasSourceCompleteContinuationProjection(card, source)
  )
}

function childHasAuthoritativeProjection(
  child: SessionCardChildWire,
  source: 'local' | 'remote',
): boolean {
  return hasSourceCompleteContinuationProjection(
    {
      cardId: child.cardId,
      canonicalSegmentKey: child.sessionKey,
      continuationSegmentKeys: child.continuationSegmentKeys,
      continuationCount: child.continuationCount,
    },
    source,
  )
}

function findChild(
  children: ReadonlyArray<SessionCardChildWire>,
  cardId: string,
): SessionCardChildWire | null {
  for (const child of children) {
    if (child.cardId === cardId) return child
    const descendant = findChild(child.childNodes ?? [], cardId)
    if (descendant) return descendant
  }
  return null
}

/** Resolve a mounted mutation target to an exact source-qualified Card binding. */
export function resolveMutableSessionCardBinding(
  response: SessionCardListWire | undefined,
  input: { cardId: string; parentCardId?: string | null },
): MutableSessionCardBinding | null {
  if (!response || !Array.isArray(response.cards)) return null
  const parentCardId = input.parentCardId ?? null
  const root = response.cards.find((card) =>
    parentCardId ? card.cardId === parentCardId : card.cardId === input.cardId,
  )
  if (!root || !hasExactCompleteSessionCardProjection(response, root.cardId)) {
    return null
  }
  const source = root.canonicalSource
  if (source !== 'local' && source !== 'remote') return null
  if (!hasSourceCompleteContinuationProjection(root, source)) return null

  const owner = parentCardId ? findChild(root.childNodes, input.cardId) : root
  if (!owner) return null
  const canonicalSegmentKey =
    'sessionKey' in owner ? owner.sessionKey : owner.canonicalSegmentKey
  if (
    !hasSourceCompleteContinuationProjection(
      {
        cardId: owner.cardId,
        canonicalSegmentKey,
        continuationSegmentKeys: owner.continuationSegmentKeys,
        continuationCount: owner.continuationCount,
      },
      source,
    )
  ) {
    return null
  }
  const transport =
    source === 'local'
      ? 'tmux'
      : root.canonicalTransport === 'gateway'
        ? 'gateway'
        : null
  if (!transport) return null
  return {
    kind: 'session-card-owner',
    cardId: owner.cardId,
    parentCardId,
    canonicalSource: source,
    canonicalSegmentKey,
    canonicalTransport: transport,
  }
}

function ownsCurrentLocalWorkerAlias(
  workerId: string,
  canonicalSegmentKey: string,
): boolean {
  return (
    Boolean(workerId) &&
    workerId.trim() === workerId &&
    canonicalSegmentKey === `local:${workerId}`
  )
}

/** Resolve one mutable worker alias to one exact complete Card binding. */
export function resolveSwarmWorkerCardBinding(
  response: SessionCardListWire | undefined,
  workerId: string,
): SwarmWorkerCardBinding | null {
  if (
    !response ||
    !Array.isArray(response.cards) ||
    !Array.isArray(response.cardResolutions)
  ) {
    return null
  }

  const candidates: Array<SwarmWorkerCardBinding> = []
  for (const card of response.cards) {
    if (!rootHasAuthoritativeProjection(response, card)) continue
    const source = card.canonicalSource
    if (ownsCurrentLocalWorkerAlias(workerId, card.canonicalSegmentKey)) {
      candidates.push({
        kind: 'session-card-owner',
        cardId: card.cardId,
        parentCardId: null,
        canonicalSource: 'local',
        canonicalSegmentKey: `local:${workerId}`,
        canonicalTransport: 'tmux',
      })
    }

    for (const child of card.childNodes) {
      if (!childHasAuthoritativeProjection(child, source)) continue
      if (ownsCurrentLocalWorkerAlias(workerId, child.sessionKey)) {
        candidates.push({
          kind: 'session-card-owner',
          cardId: child.cardId,
          parentCardId: card.cardId,
          canonicalSource: 'local',
          canonicalSegmentKey: `local:${workerId}`,
          canonicalTransport: 'tmux',
        })
      }
    }
  }

  return candidates.length === 1 ? candidates[0]! : null
}

export function resolveUniqueSwarmWorkerCardBindings(
  response: SessionCardListWire | undefined,
  workerIds: ReadonlyArray<string>,
): ReadonlyMap<string, SwarmWorkerCardBinding> {
  const projected = workerIds.flatMap((workerId) => {
    const binding = resolveSwarmWorkerCardBinding(response, workerId)
    return binding ? [{ workerId, binding }] : []
  })
  const ownerCounts = new Map<string, number>()
  for (const { binding } of projected) {
    const key = JSON.stringify([binding.parentCardId, binding.cardId])
    ownerCounts.set(key, (ownerCounts.get(key) ?? 0) + 1)
  }

  return new Map(
    projected.flatMap(({ workerId, binding }) => {
      const key = JSON.stringify([binding.parentCardId, binding.cardId])
      return ownerCounts.get(key) === 1 ? [[workerId, binding] as const] : []
    }),
  )
}

/** Refresh ownership immediately before a browser mutation and fail closed. */
export async function fetchExactSwarmWorkerCardBindings(
  workerIds: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, SwarmWorkerCardBinding>> {
  const uniqueWorkerIds = [...new Set(workerIds)]
  const bindings = resolveUniqueSwarmWorkerCardBindings(
    await fetchSessionCards(),
    uniqueWorkerIds,
  )
  if (bindings.size !== uniqueWorkerIds.length) {
    throw new Error('Session Card ownership changed; refresh and try again')
  }
  return bindings
}
