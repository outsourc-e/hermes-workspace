import { describe, expect, it } from 'vitest'
import { ContextPayloadSchema, validateContextPayloadForUse } from './context'

const freshness = {
  policy: 'revalidate_on_use' as const,
  observedAt: '2026-07-19T08:00:00.000Z',
  expiresAt: null,
}
const redaction = { state: 'pre_sanitized' as const, detail: 'unknown' }

export function validPayload() {
  return {
    contractVersion: 'context-v1' as const,
    executionPlanPacketId: 'packet-plan-context-1',
    stepId: 'step-context-1',
    receiver: {
      roomId: 'olympus-command',
      stationId: 'command-table',
      agentId: 'hermes-command',
    },
    mission: 'Supply scoped decision context for one Step.',
    sources: [
      {
        sourceId: 'decision-note',
        rank: 1,
        title: 'Workspace Packet decision',
        kind: 'decision' as const,
        status: 'loaded' as const,
        excerpt: 'Milestone C is local-only.',
        provenanceRefs: ['obsidian://04 Decisions/packet.md'],
        freshness,
        redaction,
      },
      {
        sourceId: 'project-note',
        rank: 2,
        title: 'Workspace project source of truth',
        kind: 'project-source-of-truth' as const,
        status: 'loaded' as const,
        excerpt: 'Do not start Milestone D.',
        provenanceRefs: ['obsidian://01 Projects/workspace.md'],
        freshness,
        redaction,
      },
    ],
    contextItems: [
      {
        itemId: 'decision-local-only',
        kind: 'decision' as const,
        content: 'Milestone C remains local-only.',
        sourceIds: ['decision-note'],
        provenanceRefs: ['obsidian://04 Decisions/packet.md'],
        freshness,
        redaction,
      },
    ],
    contradictions: [],
    includedScope: ['Milestone C Packet contracts'],
    excludedScope: ['Milestone D persistence'],
    localOnly: true as const,
    writebackAllowed: false as const,
  }
}

describe('ContextPayloadSchema', () => {
  it('accepts one compact scoped Step/receiver payload and rejects unknown fields', () => {
    expect(ContextPayloadSchema.parse(validPayload())).toEqual(validPayload())
    expect(ContextPayloadSchema.safeParse({ ...validPayload(), rawVaultBody: 'secret' }).success).toBe(false)
    expect(ContextPayloadSchema.safeParse({
      ...validPayload(),
      sources: [{ ...validPayload().sources[0], absolutePath: '/Users/mac/Documents/Hermes Second Brain/raw.md' }],
    }).success).toBe(false)
  })

  it('requires deterministic unique contiguous source ranks', () => {
    const payload = validPayload()
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      sources: [payload.sources[1], payload.sources[0]],
    }).success).toBe(false)
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      sources: [payload.sources[0], { ...payload.sources[1], rank: 1 }],
    }).success).toBe(false)
  })

  it('requires per-item provenance, freshness and non-overlapping scope', () => {
    const payload = validPayload()
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      contextItems: [{ ...payload.contextItems[0], provenanceRefs: [] }],
    }).success).toBe(false)
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      includedScope: ['Milestone C Packet contracts'],
      excludedScope: ['Milestone C Packet contracts'],
    }).success).toBe(false)
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      contextItems: [{
        ...payload.contextItems[0],
        freshness: {
          policy: 'ttl',
          observedAt: '2026-07-19T08:00:00.000Z',
          expiresAt: '2026-07-19T07:00:00.000Z',
        },
      }],
    }).success).toBe(false)
  })

  it('blocks stale or un-revalidated Context at the use-time boundary', () => {
    const payload = validPayload()
    expect(() => validateContextPayloadForUse(payload, {
      now: '2026-07-19T08:05:00.000Z',
    })).toThrow(/revalidation-required/i)
    const provenanceRefs = [
      ...payload.sources.flatMap((source) => source.provenanceRefs),
      ...payload.contextItems.flatMap((item) => item.provenanceRefs),
    ]
    expect(validateContextPayloadForUse(payload, {
      now: '2026-07-19T08:05:00.000Z',
      revalidatedProvenanceRefs: provenanceRefs,
    })).toEqual(payload)
    const ttlPayload = {
      ...payload,
      sources: payload.sources.map((source) => ({
        ...source,
        freshness: {
          policy: 'ttl' as const,
          observedAt: '2026-07-19T08:00:00.000Z',
          expiresAt: '2026-07-19T08:01:00.000Z',
        },
      })),
    }
    expect(() => validateContextPayloadForUse(ttlPayload, {
      now: '2026-07-19T08:01:00.000Z',
      revalidatedProvenanceRefs: provenanceRefs,
    })).toThrow(/expired/i)
  })

  it('rejects item provenance that is not declared by its referenced sources', () => {
    const payload = validPayload()
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      contextItems: [{
        ...payload.contextItems[0],
        provenanceRefs: payload.sources[1].provenanceRefs,
      }],
    }).success).toBe(false)
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      contextItems: [{ ...payload.contextItems[0], sourceIds: [] }],
    }).success).toBe(false)
  })

  it('blocks missing or blocked sources even when their refs were revalidated', () => {
    const payload = validPayload()
    const provenanceRefs = [
      ...payload.sources.flatMap((source) => source.provenanceRefs),
      ...payload.contextItems.flatMap((item) => item.provenanceRefs),
    ]
    for (const status of ['missing', 'blocked'] as const) {
      expect(() => validateContextPayloadForUse({
        ...payload,
        sources: [{ ...payload.sources[0], status }, payload.sources[1]],
      }, {
        now: '2026-07-19T08:05:00.000Z',
        revalidatedProvenanceRefs: provenanceRefs,
      })).toThrow(new RegExp(`status-${status}`, 'i'))
    }
  })

  it('preserves contradictions as explicit references to known sources/items', () => {
    const payload = validPayload()
    expect(ContextPayloadSchema.safeParse({
      ...payload,
      contradictions: [{
        contradictionId: 'contradiction-1',
        itemIds: ['decision-local-only', 'missing-item'],
        sourceIds: ['decision-note', 'project-note'],
        description: 'Scope statements conflict.',
        status: 'open',
      }],
    }).success).toBe(false)
  })
})
