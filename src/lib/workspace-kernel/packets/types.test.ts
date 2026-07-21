import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  WORKSPACE_PACKET_STATUSES,
  WORKSPACE_PACKET_TYPES,
} from './types'
import type {
  UniversalPacketEnvelope,
  WorkspacePacketStatus,
  WorkspacePacketType,
} from './types'

describe('workspace Packet core types', () => {
  it('locks the eight lifecycle statuses', () => {
    expect(WORKSPACE_PACKET_STATUSES).toEqual([
      'draft',
      'ready',
      'offered',
      'accepted',
      'blocked',
      'rejected',
      'superseded',
      'cancelled',
    ])
    expectTypeOf<(typeof WORKSPACE_PACKET_STATUSES)[number]>().toEqualTypeOf<WorkspacePacketStatus>()
  })

  it('locks all fifteen canonical Packet types', () => {
    expect(WORKSPACE_PACKET_TYPES).toEqual([
      'execution-plan',
      'opportunity',
      'evidence-allowed-claims',
      'supplier-evidence',
      'listing-ready-draft',
      'asset-production',
      'print-ready',
      'context',
      'cost-risk-lock',
      'roster-availability',
      'code-automation',
      'strategic-decision',
      'delivery-request',
      'delivery-readback',
      'run-readback',
    ])
    expectTypeOf<(typeof WORKSPACE_PACKET_TYPES)[number]>().toEqualTypeOf<WorkspacePacketType>()
  })

  it('keeps lifecycle state outside the immutable Universal Envelope', () => {
    const packet = {
      packetId: 'packet-1',
      packetLineageId: 'lineage-1',
      revision: 1,
      supersedesPacketId: null,
      runId: 'run-1',
      schemaVersion: '1.0.0',
      packetType: 'execution-plan',
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
      contentHash: 'a'.repeat(64),
      payload: { objective: 'Validate the Packet core.' },
    } satisfies UniversalPacketEnvelope<{ objective: string }>

    expect(packet.packetType).toBe('execution-plan')
    expect(packet).not.toHaveProperty('status')
    expect(packet).not.toHaveProperty('readback')
  })
})
