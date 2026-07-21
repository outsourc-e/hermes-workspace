import { describe, expect, it } from 'vitest'
import {
  createWorkspacePacket,
  reviseWorkspacePacket,
} from './factory'

import {
  sourceRefsForTestContext,
  validTestContextPayload,
} from './test-fixtures'

function createInput() {
  const to = { roomId: 'agora-opportunity', agentId: 'goblin' }
  const payload = validTestContextPayload({
    mission: 'Implement Packet contracts.',
    receiver: to,
    provenanceRef: 'obsidian://decision/packet-contracts',
  })
  return {
    packetId: 'packet-1',
    packetLineageId: 'lineage-1',
    createdAt: '2026-07-18T17:30:00.000Z',
    runId: 'run-1',
    schemaVersion: '1.0.0',
    packetType: 'context' as const,
    from: { roomId: 'olympus-command', agentId: 'hermes-command' },
    to,
    sourceRefs: sourceRefsForTestContext(payload),
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: ['external-action'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'criterion-1', description: 'Packet validates.', required: true },
    ],
    idempotencyKey: 'run-1:opportunity:1',
    payload,
  }
}

describe('workspace Packet factory', () => {
  it('creates a validated first immutable revision with a content hash', () => {
    const packet = createWorkspacePacket(createInput())

    expect(packet).toMatchObject({
      packetId: 'packet-1',
      packetLineageId: 'lineage-1',
      revision: 1,
      supersedesPacketId: null,
      createdAt: '2026-07-18T17:30:00.000Z',
      packetType: 'context',
    })
    expect(packet.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(packet)).toBe(true)
    expect(Object.isFrozen(packet.payload)).toBe(true)
  })

  it('creates a corrected revision without mutating the offered content', () => {
    const first = createWorkspacePacket(createInput())
    if (first.to.agentId === null) throw new Error('Expected the strict Context fixture receiver agent.')
    const receiverAgentId: string = first.to.agentId
    const second = reviseWorkspacePacket(first, {
      packetId: 'packet-2',
      createdAt: '2026-07-18T17:35:00.000Z',
      idempotencyKey: 'run-1:opportunity:2',
      evidenceRefs: ['evidence://proof-1'],
      payload: validTestContextPayload({
        mission: 'Implement and verify Packet contracts.',
        receiver: { roomId: first.to.roomId, agentId: receiverAgentId },
        provenanceRef: 'obsidian://decision/packet-contracts',
      }),
    })

    expect(second).toMatchObject({
      packetId: 'packet-2',
      packetLineageId: 'lineage-1',
      revision: 2,
      supersedesPacketId: 'packet-1',
      idempotencyKey: 'run-1:opportunity:2',
    })
    expect(second.contentHash).not.toBe(first.contentHash)
    expect(first.payload.mission).toBe('Implement Packet contracts.')
    expect(first.evidenceRefs).toEqual([])
  })

  it('rejects retired agent aliases at Packet creation for both sender and receiver', () => {
    expect(() => createWorkspacePacket({
      ...createInput(),
      to: { roomId: 'gateway-cockpit', agentId: 'signal-runner' },
    })).toThrow(/Retired agent alias signal-runner/)

    expect(() => createWorkspacePacket({
      ...createInput(),
      from: { roomId: 'archive-memory', agentId: 'athena-agent' },
    })).toThrow(/Retired agent alias athena-agent/)
  })

  it('rejects a new revision of a historical Packet routed through a retired alias', () => {
    const active = createWorkspacePacket(createInput())
    const historical = {
      ...active,
      to: { roomId: 'gateway-cockpit', agentId: 'signal-runner' },
    }

    expect(() => reviseWorkspacePacket(historical, {
      packetId: 'packet-retired-revision',
      createdAt: '2026-07-18T17:40:00.000Z',
      idempotencyKey: 'run-1:opportunity:retired-revision',
    })).toThrow(/Retired agent alias signal-runner/)
  })

  it('generates IDs and timestamps when deterministic values are not supplied', () => {
    const input = createInput()
    const packet = createWorkspacePacket({
      ...input,
      packetId: undefined,
      packetLineageId: undefined,
      createdAt: undefined,
    }, {
      createId: () => 'generated-packet-id',
      now: () => new Date('2026-07-18T18:00:00.000Z'),
    })

    expect(packet.packetId).toBe('generated-packet-id')
    expect(packet.packetLineageId).toBe('generated-packet-id')
    expect(packet.createdAt).toBe('2026-07-18T18:00:00.000Z')
  })
})
