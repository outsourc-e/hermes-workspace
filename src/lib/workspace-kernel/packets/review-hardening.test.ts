import { describe, expect, it } from 'vitest'

import { workspacePacketContentHash } from './canonical-json'
import {
  sourceRefsForTestContext,
  validAssetProductionPayloadFixture as validAssetProductionPayload,
  validRunReadbackPayloadFixture as validRunReadbackPayload,
  validTestContextPayload,
} from './test-fixtures'
import { createWorkspacePacket } from './factory'
import { createWorkspacePacketLifecycleEvent } from './lifecycle'
import { safeParseWorkspacePacket } from './schemas'
import type { UniversalPacketEnvelope } from './types'

function rehash(packet: UniversalPacketEnvelope): UniversalPacketEnvelope {
  const { contentHash: _contentHash, ...content } = packet
  return { ...content, contentHash: workspacePacketContentHash(content) }
}

function contextPacket() {
  const to = { roomId: 'agora-opportunity', agentId: 'goblin' }
  const payload = validTestContextPayload({ mission: 'Review hardening.', receiver: to })
  return createWorkspacePacket({
    packetId: 'packet-review-hardening-context',
    packetLineageId: 'lineage-review-hardening-context',
    createdAt: '2026-07-19T10:00:00.000Z',
    runId: 'run-review-hardening',
    schemaVersion: '1.0.0',
    packetType: 'context',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to,
    sourceRefs: sourceRefsForTestContext(payload),
    evidenceRefs: [], assumptions: [], missingFields: [], lockedActions: [],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{ criterionId: 'review-hardening', description: 'Hardening validates.', required: true }],
    idempotencyKey: 'review-hardening:context',
    payload,
  })
}

describe('Milestone C review hardening', () => {
  it('rejects an otherwise schema-valid Packet whose canonical content no longer matches contentHash', () => {
    const packet = contextPacket()
    const payload = packet.payload
    const tampered = {
      ...packet,
      payload: { ...payload, mission: 'Tampered after hash issuance.' },
    }
    expect(safeParseWorkspacePacket(tampered).success).toBe(false)
  })

  it('rejects contradictory universal approval metadata', () => {
    const packet = contextPacket()
    const contradictory = rehash({
      ...packet,
      approval: { required: false, stage: 'send', grantId: 'grant-impossible' },
    })
    expect(safeParseWorkspacePacket(contradictory).success).toBe(false)
  })

  it('requires every produced asset artifact ref in Envelope evidenceRefs', () => {
    const payload = validAssetProductionPayload()
    expect(() => createWorkspacePacket({
      packetId: 'packet-review-hardening-assets',
      packetLineageId: 'lineage-review-hardening-assets',
      createdAt: '2026-07-19T10:00:00.000Z',
      runId: 'run-review-hardening', schemaVersion: '1.0.0', packetType: 'asset-production',
      from: { roomId: 'terra-forge', agentId: 'terra' },
      to: { roomId: 'olympus-command', agentId: 'hermes' },
      sourceRefs: [payload.executionPlanPacketId, ...payload.items.flatMap((item) => item.provenanceRefs)],
      evidenceRefs: [...payload.setQa.evidenceRefs, ...payload.items.flatMap((item) => item.visualQa.evidenceRefs)],
      assumptions: [], missingFields: [], lockedActions: payload.liveActionsLocked,
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [{ criterionId: 'asset-ref', description: 'Artifact ref is bound.', required: true }],
      idempotencyKey: 'review-hardening:assets', payload,
    })).toThrow(/artifact|evidenceRef/i)
  })

  it('requires RunReadback approval, artifact, delivery, rollback and Step proof refs in Envelope metadata', () => {
    const payload = validRunReadbackPayload()
    expect(() => createWorkspacePacket({
      packetId: 'packet-review-hardening-readback',
      packetLineageId: 'lineage-review-hardening-readback',
      createdAt: '2026-07-19T10:00:00.000Z',
      runId: 'run-review-hardening', schemaVersion: '1.0.0', packetType: 'run-readback',
      from: { roomId: 'agora-opportunity', agentId: 'goblin' },
      to: { roomId: 'olympus-command', agentId: 'hermes' },
      sourceRefs: [payload.executionPlanPacketId], evidenceRefs: [],
      assumptions: [], missingFields: [], lockedActions: [],
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [{ criterionId: 'readback-refs', description: 'Proof refs are bound.', required: true }],
      idempotencyKey: 'review-hardening:readback', payload,
    })).toThrow(/sourceRef|evidenceRef/i)
  })

  it('blocks lifecycle ready when Envelope missingFields is non-empty', () => {
    const base = contextPacket()
    const packet = rehash({ ...base, missingFields: ['sourceNotes.required:missing'] })
    const created = createWorkspacePacketLifecycleEvent(packet, [], {
      type: 'created', actor: packet.from, reason: null, payload: {},
    }, { eventId: 'event-review-created', createdAt: '2026-07-19T10:00:00.000Z' })
    expect(() => createWorkspacePacketLifecycleEvent(packet, [created], {
      type: 'ready', actor: packet.from, reason: null, payload: {},
    }, { eventId: 'event-review-ready', createdAt: '2026-07-19T10:00:01.000Z' })).toThrow(/missing|block|ready/i)
  })
})
