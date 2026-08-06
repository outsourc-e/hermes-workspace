import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resolveExactSessionCardOperationBinding,
  resolveSessionCardOperationBindingByCardOwner,
} from './session-card-operation-binding'

const mocks = vi.hoisted(() => ({
  resolveCard: vi.fn(),
  resolveChildCard: vi.fn(),
}))

vi.mock('./session-card-service', () => ({
  sessionCardService: {
    resolveCard: mocks.resolveCard,
    resolveChildCard: mocks.resolveChildCard,
  },
}))

const binding = {
  kind: 'session-card-owner' as const,
  cardId: 'remote:card-a',
  parentCardId: null,
  canonicalSource: 'remote' as const,
  canonicalSegmentKey: 'remote:segment-a',
  canonicalTransport: 'gateway' as const,
}

function resolvedCard(
  canonicalSegmentKey = binding.canonicalSegmentKey,
  continuationSegmentKeys = [binding.cardId, canonicalSegmentKey],
) {
  return {
    card: {
      cardId: binding.cardId,
      canonicalSource: binding.canonicalSource,
      canonicalTransport: binding.canonicalTransport,
      canonicalSegmentKey,
      continuationSegmentKeys,
      continuationCount: continuationSegmentKeys.length,
      relationshipKind: 'root',
    },
    collection: {
      completeness: 'complete',
      retryable: false,
    },
  }
}

describe('Session Card operation binding resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveCard.mockResolvedValue(resolvedCard())
  })

  it('resolves only the exact current canonical Card owner', async () => {
    await expect(
      resolveExactSessionCardOperationBinding(binding),
    ).resolves.toEqual({
      kind: 'session-card-owner',
      cardId: binding.cardId,
      parentCardId: null,
    })
    expect(mocks.resolveCard).toHaveBeenCalledWith(binding.cardId)
  })

  it('rejects the same Card after its canonical continuation rolls over', async () => {
    mocks.resolveCard.mockResolvedValueOnce(
      resolvedCard('remote:segment-b', [
        binding.cardId,
        binding.canonicalSegmentKey,
        'remote:segment-b',
      ]),
    )

    await expect(
      resolveExactSessionCardOperationBinding(binding),
    ).resolves.toBeNull()
  })

  it('fails Card-owner binding derivation when the canonical tip rolls between projection and exact resolution', async () => {
    mocks.resolveCard
      .mockResolvedValueOnce(resolvedCard())
      .mockResolvedValueOnce(
        resolvedCard('remote:segment-b', [
          binding.cardId,
          binding.canonicalSegmentKey,
          'remote:segment-b',
        ]),
      )

    await expect(
      resolveSessionCardOperationBindingByCardOwner({
        cardId: binding.cardId,
        source: 'remote',
        transport: 'gateway',
      }),
    ).resolves.toBeNull()
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2)
  })
})
