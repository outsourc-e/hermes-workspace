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

export type SessionCardOperationProjection = SessionCardOperationOwner & {
  continuationSegmentKeys: Array<string>
}

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

export async function resolveExactSessionCardOperationProjection(
  binding: SessionCardOperationBinding,
): Promise<SessionCardOperationProjection | null> {
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
      continuationSegmentKeys: [...continuations],
    }
  } catch {
    return null
  }
}

export async function resolveExactSessionCardOperationBinding(
  binding: SessionCardOperationBinding,
): Promise<SessionCardOperationOwner | null> {
  const projection = await resolveExactSessionCardOperationProjection(binding)
  return projection
    ? {
        kind: projection.kind,
        cardId: projection.cardId,
        parentCardId: projection.parentCardId,
      }
    : null
}

/**
 * Resolve a server-observed upstream runtime identity to an exact root Card
 * binding. This is intentionally server-only: browser callers never need to
 * receive or echo the mutable upstream key.
 */
export async function resolveSessionCardOperationBindingByUpstream(input: {
  source: 'local' | 'remote'
  upstreamKey: string
}): Promise<SessionCardOperationBinding | null> {
  const upstreamKey = input.upstreamKey.trim()
  if (!upstreamKey || upstreamKey !== input.upstreamKey) return null
  try {
    const resolved =
      input.source === 'remote'
        ? await sessionCardService.resolveRemoteCardByUpstreamSession(
            upstreamKey,
          )
        : await sessionCardService.resolveLocalCardByUpstreamSession(
            upstreamKey,
          )
    const card = resolved.card
    const binding = parseSessionCardOperationBinding(
      {
        kind: 'session-card-owner',
        cardId: card.cardId,
        parentCardId: null,
        canonicalSource: input.source,
        canonicalSegmentKey: card.canonicalSegmentKey,
        canonicalTransport: input.source === 'remote' ? 'gateway' : 'tmux',
      },
      {
        source: input.source,
        transport: input.source === 'remote' ? 'gateway' : 'tmux',
      },
    )
    if (
      !binding ||
      resolved.collection.completeness !== 'complete' ||
      resolved.collection.retryable ||
      card.parentCardId !== undefined ||
      (card.relationshipKind !== 'root' && card.relationshipKind !== 'orphan')
    ) {
      return null
    }
    return (await resolveExactSessionCardOperationBinding(binding))
      ? binding
      : null
  } catch {
    return null
  }
}

/** Resolve a browser-visible Card owner to a server-derived exact binding. */
export async function resolveSessionCardOperationBindingByCardOwner(input: {
  cardId: string
  parentCardId?: string | null
  source: 'local' | 'remote'
  transport: 'gateway' | 'tmux'
}): Promise<SessionCardOperationBinding | null> {
  const cardId = isExactSourceIdentity(input.cardId, input.source)
    ? input.cardId
    : null
  const parentCardId = input.parentCardId
    ? isExactSourceIdentity(input.parentCardId, input.source)
      ? input.parentCardId
      : null
    : null
  if (!cardId || (input.parentCardId && !parentCardId)) return null
  if (
    (input.source === 'remote' && input.transport !== 'gateway') ||
    (input.source === 'local' && input.transport !== 'tmux')
  ) {
    return null
  }
  try {
    const resolved = parentCardId
      ? await sessionCardService.resolveChildCard(parentCardId, cardId)
      : await sessionCardService.resolveCard(cardId)
    const card = resolved.card
    const binding = parseSessionCardOperationBinding(
      {
        kind: 'session-card-owner',
        cardId,
        parentCardId,
        canonicalSource: input.source,
        canonicalSegmentKey: card.canonicalSegmentKey,
        canonicalTransport: input.transport,
      },
      { source: input.source, transport: input.transport },
    )
    return binding && (await resolveExactSessionCardOperationBinding(binding))
      ? binding
      : null
  } catch {
    return null
  }
}
