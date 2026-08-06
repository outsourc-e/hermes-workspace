import { sessionCardService } from './session-card-service'

export type SessionCardOperationBinding = {
  kind: 'session-card-owner'
  cardId: string
  parentCardId: string | null
  canonicalSource: 'local' | 'remote'
  canonicalSegmentKey: string
  canonicalTransport: 'tmux' | 'gateway'
}

export type SessionCardOperationOwner = Pick<
  SessionCardOperationBinding,
  'kind' | 'cardId' | 'parentCardId'
>

function isExactSourceIdentity(
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

export function parseSessionCardOperationBinding(
  value: unknown,
  expected: {
    source: 'local' | 'remote'
    transport: 'tmux' | 'gateway'
    canonicalSegmentKey?: string
  },
): SessionCardOperationBinding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const binding = value as Partial<
    Record<keyof SessionCardOperationBinding, unknown>
  >
  if (
    binding.kind !== 'session-card-owner' ||
    !isExactSourceIdentity(binding.cardId, expected.source) ||
    !Object.prototype.hasOwnProperty.call(binding, 'parentCardId') ||
    binding.canonicalSource !== expected.source ||
    binding.canonicalTransport !== expected.transport ||
    !isExactSourceIdentity(binding.canonicalSegmentKey, expected.source) ||
    (expected.canonicalSegmentKey !== undefined &&
      binding.canonicalSegmentKey !== expected.canonicalSegmentKey)
  ) {
    return null
  }
  const parentCardId = binding.parentCardId
  if (
    parentCardId !== null &&
    (!isExactSourceIdentity(parentCardId, expected.source) ||
      parentCardId === binding.cardId)
  ) {
    return null
  }
  return {
    kind: 'session-card-owner',
    cardId: binding.cardId,
    parentCardId,
    canonicalSource: expected.source,
    canonicalSegmentKey: binding.canonicalSegmentKey,
    canonicalTransport: expected.transport,
  }
}

export async function resolveExactSessionCardOperationBinding(
  binding: SessionCardOperationBinding,
): Promise<SessionCardOperationOwner | null> {
  try {
    const resolved = binding.parentCardId
      ? await sessionCardService.resolveChildCard(
          binding.parentCardId,
          binding.cardId,
        )
      : await sessionCardService.resolveCard(binding.cardId)
    const card = resolved.card
    const continuations = card.continuationSegmentKeys
    const relationshipMatches = binding.parentCardId
      ? card.parentCardId === binding.parentCardId &&
        (card.relationshipKind === 'child' ||
          card.relationshipKind === 'branch')
      : card.parentCardId === undefined &&
        (card.relationshipKind === 'root' || card.relationshipKind === 'orphan')
    const transportMatches =
      binding.canonicalTransport === 'tmux'
        ? card.canonicalTransport === undefined
        : card.canonicalTransport === 'gateway'
    if (
      resolved.collection.completeness !== 'complete' ||
      resolved.collection.retryable ||
      card.cardId !== binding.cardId ||
      card.canonicalSource !== binding.canonicalSource ||
      !transportMatches ||
      card.canonicalSegmentKey !== binding.canonicalSegmentKey ||
      continuations.length === 0 ||
      continuations.length !== card.continuationCount ||
      continuations[0] !== card.cardId ||
      continuations.at(-1) !== card.canonicalSegmentKey ||
      new Set(continuations).size !== continuations.length ||
      !relationshipMatches
    ) {
      return null
    }
    return {
      kind: 'session-card-owner',
      cardId: card.cardId,
      parentCardId: binding.parentCardId,
    }
  } catch {
    return null
  }
}
