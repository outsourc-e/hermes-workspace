import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { workspacePacketContentHash } from './canonical-json'
import {
  UniversalPacketEnvelopeSchema,
  createWorkspacePacketPayloadSchemaRegistry,
  parseWorkspacePacket,
  safeParseWorkspacePacket,
} from './schemas'

function validEnvelope() {
  const envelope = {
    packetId: 'packet-1',
    packetLineageId: 'lineage-1',
    revision: 1,
    supersedesPacketId: null,
    runId: 'run-1',
    schemaVersion: '1.0.0',
    packetType: 'execution-plan' as const,
    from: { roomId: 'olympus-command', agentId: 'hermes-command' },
    to: { roomId: 'agora-opportunity', agentId: 'goblin' },
    createdAt: '2026-07-18T17:30:00.000Z',
    sourceRefs: ['obsidian://decision/packet-contracts'],
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: ['external-action'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'criterion-1', description: 'Packet validates.', required: true },
    ],
    idempotencyKey: 'run-1:execution-plan:1',
    payload: { objective: 'Validate the Packet core.' },
  }
  return { ...envelope, contentHash: workspacePacketContentHash(envelope) }
}

function rehash(input: ReturnType<typeof validEnvelope>) {
  const { contentHash: _contentHash, ...content } = input
  return { ...content, contentHash: workspacePacketContentHash(content) }
}

describe('UniversalPacketEnvelopeSchema', () => {
  it('accepts a strict valid envelope', () => {
    expect(UniversalPacketEnvelopeSchema.parse(validEnvelope())).toEqual(validEnvelope())
  })

  it.each([
    ['empty packet ID', { packetId: '' }],
    ['invalid schema SemVer', { schemaVersion: 'v1' }],
    ['invalid revision', { revision: 0 }],
    ['invalid timestamp', { createdAt: 'yesterday' }],
    ['unknown Packet type', { packetType: 'mystery-packet' }],
    ['non-SHA256 hash', { contentHash: 'not-a-hash' }],
  ])('rejects %s', (_name, change) => {
    expect(() => UniversalPacketEnvelopeSchema.parse({ ...validEnvelope(), ...change })).toThrow()
  })

  it('rejects unknown top-level and nested fields', () => {
    expect(() => UniversalPacketEnvelopeSchema.parse({
      ...validEnvelope(),
      liveAction: 'publish',
    })).toThrow()
    expect(() => UniversalPacketEnvelopeSchema.parse({
      ...validEnvelope(),
      to: { ...validEnvelope().to, unknownTarget: true },
    })).toThrow()
  })

  it('rejects duplicate acceptance criterion IDs', () => {
    const criterion = validEnvelope().acceptanceCriteria[0]
    expect(() => UniversalPacketEnvelopeSchema.parse({
      ...validEnvelope(),
      acceptanceCriteria: [criterion, criterion],
    })).toThrow(/criterionId/i)
  })

  it('enforces revision and supersedes invariants', () => {
    expect(() => UniversalPacketEnvelopeSchema.parse({
      ...validEnvelope(),
      supersedesPacketId: 'packet-prior',
    })).toThrow(/supersedes|revision/i)
    expect(() => UniversalPacketEnvelopeSchema.parse({
      ...validEnvelope(),
      revision: 2,
      supersedesPacketId: null,
    })).toThrow(/supersedes|revision/i)
    expect(() => UniversalPacketEnvelopeSchema.parse({
      ...validEnvelope(),
      revision: 2,
      supersedesPacketId: validEnvelope().packetId,
    })).toThrow(/supersedes|itself/i)
  })
})

describe('workspace Packet payload registry', () => {
  const registry = createWorkspacePacketPayloadSchemaRegistry({
    'execution-plan': z.object({ objective: z.string().min(1) }).strict(),
    opportunity: z.object({ candidateId: z.string().min(1) }).strict(),
  })

  it('selects payload validation by Packet type', () => {
    const parsed = parseWorkspacePacket(validEnvelope(), registry)
    expect(parsed.payload).toEqual({ objective: 'Validate the Packet core.' })

    const invalid = safeParseWorkspacePacket({
      ...validEnvelope(),
      payload: { candidateId: 'wrong-domain' },
    }, registry)
    expect(invalid.success).toBe(false)
  })

  it('returns field-level Zod issues without guessing', () => {
    const result = safeParseWorkspacePacket(rehash({
      ...validEnvelope(),
      payload: { objective: '' },
    }), registry)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'payload.objective')).toBe(true)
    }
  })
})
