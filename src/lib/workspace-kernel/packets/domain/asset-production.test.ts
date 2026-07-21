import { describe, expect, it } from 'vitest'
import { AssetProductionPayloadSchema } from './asset-production'

const sha = 'a'.repeat(64)

export function validPayload() {
  return {
    contractVersion: 'asset-production-v1' as const,
    executionPlanPacketId: 'packet-plan-1',
    stepId: 'step-assets',
    assetSetId: 'set-hannibal-runtime',
    items: [
      {
        itemId: 'idle-sheet',
        required: true,
        artifactRef: 'file:///rescue/idle.webp',
        artifactChecksum: sha,
        lifecycle: 'final' as const,
        provenanceRefs: ['packet-source-art-1'],
        visualQa: {
          status: 'passed' as const,
          evidenceRefs: ['qa://visual/idle'],
        },
      },
    ],
    setQa: {
      status: 'passed' as const,
      approvedItemIds: ['idle-sheet'],
      evidenceRefs: ['qa://set/hannibal-runtime'],
    },
    liveActionsLocked: ['publish', 'external_delivery'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

describe('AssetProductionPayloadSchema', () => {
  it('accepts an exact final asset set and rejects unknown fields', () => {
    expect(AssetProductionPayloadSchema.parse(validPayload())).toEqual(validPayload())
    expect(AssetProductionPayloadSchema.safeParse({ ...validPayload(), publishNow: true }).success).toBe(false)
    expect(AssetProductionPayloadSchema.safeParse({
      ...validPayload(),
      items: [{ ...validPayload().items[0], hiddenApproval: true }],
    }).success).toBe(false)
  })

  it.each(['temporary', 'candidate'] as const)('never treats a %s required item as final', (lifecycle) => {
    const payload = validPayload()
    expect(AssetProductionPayloadSchema.safeParse({
      ...payload,
      items: [{ ...payload.items[0], lifecycle }],
      readiness: 'ready',
      hardBlocks: [],
    }).success).toBe(false)
    expect(AssetProductionPayloadSchema.safeParse({
      ...payload,
      items: [{ ...payload.items[0], lifecycle }],
      readiness: 'blocked',
      hardBlocks: [`items.${payload.items[0].itemId}.lifecycle`],
    }).success).toBe(true)
  })

  it('requires item QA, set QA, provenance, uniqueness and exact derived blockers', () => {
    const payload = validPayload()
    expect(AssetProductionPayloadSchema.safeParse({
      ...payload,
      items: [{ ...payload.items[0], visualQa: { status: 'pending', evidenceRefs: [] } }],
      readiness: 'ready',
      hardBlocks: [],
    }).success).toBe(false)
    expect(AssetProductionPayloadSchema.safeParse({
      ...payload,
      items: [{ ...payload.items[0], visualQa: { status: 'pending', evidenceRefs: [] } }],
      readiness: 'blocked',
      hardBlocks: ['items.idle-sheet.visualQa'],
    }).success).toBe(true)
    expect(AssetProductionPayloadSchema.safeParse({
      ...payload,
      items: [payload.items[0], payload.items[0]],
    }).success).toBe(false)
    expect(AssetProductionPayloadSchema.safeParse({
      ...payload,
      items: [{ ...payload.items[0], provenanceRefs: [] }],
    }).success).toBe(false)
  })
})
