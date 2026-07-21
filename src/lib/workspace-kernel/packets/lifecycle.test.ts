import { describe, expect, it } from 'vitest'
import { createWorkspacePacket } from './factory'
import {
  appendWorkspacePacketLifecycleEvent,
  canMutateWorkspacePacketContent,
  createWorkspacePacketLifecycleEvent,
  workspacePacketStatusFromEvents,
} from './lifecycle'
import {
  evidenceRefsForTestAsset,
  sourceRefsForTestAsset,
  sourceRefsForTestContext,
  validTestBlockedAssetPayload,
  validTestContextPayload,
} from './test-fixtures'
import type { WorkspacePacketLifecycleEvent } from './lifecycle'

function packet() {
  const to = { roomId: 'agora-opportunity', agentId: 'goblin' }
  const payload = validTestContextPayload({
    mission: 'Validate lifecycle.',
    receiver: to,
    stepId: 'step-lifecycle-validation',
  })
  return createWorkspacePacket({
    packetId: 'packet-lifecycle-1',
    packetLineageId: 'lineage-lifecycle-1',
    createdAt: '2026-07-18T17:30:00.000Z',
    runId: 'run-1',
    schemaVersion: '1.0.0',
    packetType: 'context',
    from: { roomId: 'olympus-command', agentId: 'hermes-command' },
    to,
    sourceRefs: sourceRefsForTestContext(payload),
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: [],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'criterion-1', description: 'Validate the Packet.', required: true },
    ],
    idempotencyKey: 'run-1:lifecycle:1',
    payload,
  })
}

function event(
  current: Array<WorkspacePacketLifecycleEvent>,
  type: WorkspacePacketLifecycleEvent['type'],
  actor: { roomId: string; agentId: string | null },
  index: number,
  reason: string | null = null,
) {
  const receiverOutcome = type === 'accepted' || type === 'blocked' || type === 'rejected'
  return createWorkspacePacketLifecycleEvent(packet(), current, {
    type,
    actor,
    reason,
    payload: receiverOutcome ? { ackId: `ack-${index}` } : {},
  }, {
    eventId: `event-${index}`,
    createdAt: `2026-07-18T17:${String(30 + index).padStart(2, '0')}:00.000Z`,
  })
}

describe('Workspace Packet lifecycle', () => {
  it('projects draft → ready → offered from append-only sender events', () => {
    const subject = packet()
    let events: Array<WorkspacePacketLifecycleEvent> = []
    events = appendWorkspacePacketLifecycleEvent(events, event(events, 'created', subject.from, 0), subject)
    expect(workspacePacketStatusFromEvents(subject.packetId, events)).toBe('draft')
    expect(canMutateWorkspacePacketContent(subject.packetId, events)).toBe(true)

    events = appendWorkspacePacketLifecycleEvent(events, event(events, 'ready', subject.from, 1), subject)
    events = appendWorkspacePacketLifecycleEvent(events, event(events, 'offered', subject.from, 2), subject)

    expect(workspacePacketStatusFromEvents(subject.packetId, events)).toBe('offered')
    expect(canMutateWorkspacePacketContent(subject.packetId, events)).toBe(false)
  })

  it('enforces sender and receiver authority', () => {
    const subject = packet()
    expect(() => event([], 'created', subject.to, 0)).toThrow(/sender/i)

    const created = event([], 'created', subject.from, 0)
    const events = [created]
    expect(() => event(events, 'ready', subject.to, 1)).toThrow(/sender/i)
    expect(() => event(events, 'accepted', subject.from, 1)).toThrow(/receiver/i)
  })

  it('rejects invalid and terminal transitions', () => {
    const subject = packet()
    const created = event([], 'created', subject.from, 0)
    expect(() => event([created], 'offered', subject.from, 1)).toThrow(/transition/i)

    const ready = event([created], 'ready', subject.from, 1)
    const offered = event([created, ready], 'offered', subject.from, 2)
    const rejected = event([created, ready, offered], 'rejected', subject.to, 3, 'Payload is outside receiver scope.')
    expect(() => event([created, ready, offered, rejected], 'cancelled', subject.from, 4, 'Too late.')).toThrow(/terminal/i)
  })

  it('deduplicates an exact event ID and rejects conflicting reuse', () => {
    const subject = packet()
    const created = event([], 'created', subject.from, 0)
    const once = appendWorkspacePacketLifecycleEvent([], created, subject)
    expect(appendWorkspacePacketLifecycleEvent(once, created, subject)).toBe(once)
    expect(() => appendWorkspacePacketLifecycleEvent(once, {
      ...created,
      reason: 'conflicting replay',
    }, subject)).toThrow(/eventId/i)
  })

  it('blocks lifecycle ready when the domain payload declares blockers', () => {
    const blockedPayload = validTestBlockedAssetPayload()
    const subject = createWorkspacePacket({
      packetId: 'packet-domain-blocked-1',
      packetLineageId: 'lineage-domain-blocked-1',
      createdAt: '2026-07-18T17:30:00.000Z',
      runId: 'run-domain-blocked-1',
      schemaVersion: '1.0.0',
      packetType: 'asset-production',
      from: { roomId: 'cad-foundry', agentId: 'terra' },
      to: { roomId: 'olympus-command', agentId: 'hermes-command' },
      sourceRefs: sourceRefsForTestAsset(blockedPayload),
      evidenceRefs: evidenceRefsForTestAsset(blockedPayload),
      assumptions: [],
      missingFields: blockedPayload.hardBlocks,
      lockedActions: blockedPayload.liveActionsLocked,
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [
        { criterionId: 'criterion-domain-ready', description: 'Domain blockers are resolved.', required: true },
      ],
      idempotencyKey: 'run-domain-blocked-1:asset-production:1',
      payload: blockedPayload,
    })
    const created = createWorkspacePacketLifecycleEvent(subject, [], {
      type: 'created',
      actor: subject.from,
      reason: null,
      payload: {},
    }, {
      eventId: 'event-domain-blocked-created',
      createdAt: '2026-07-18T17:30:00.000Z',
    })
    expect(() => createWorkspacePacketLifecycleEvent(subject, [created], {
      type: 'ready',
      actor: subject.from,
      reason: null,
      payload: {},
    })).toThrow(/domain|block|ready/i)
  })

  it('requires a full ISO timestamp for lifecycle evidence', () => {
    const subject = packet()
    expect(() => createWorkspacePacketLifecycleEvent(subject, [], {
      type: 'created',
      actor: subject.from,
      reason: null,
      payload: {},
    }, {
      eventId: 'event-invalid-time',
      createdAt: '2026-07-18',
    })).toThrow(/ISO|timestamp/i)
  })

  it('canonically clones and deeply freezes nested lifecycle payload evidence', () => {
    const subject = packet()
    const inputPayload = {
      proof: {
        refs: ['evidence://one'],
      },
    }
    const created = createWorkspacePacketLifecycleEvent(subject, [], {
      type: 'created',
      actor: subject.from,
      reason: null,
      payload: inputPayload,
    }, {
      eventId: 'event-deep-freeze',
      createdAt: '2026-07-18T17:30:00.000Z',
    })
    const proof = created.payload.proof as { refs: Array<string> }

    expect(created.payload).not.toBe(inputPayload)
    expect(proof).not.toBe(inputPayload.proof)
    expect(proof.refs).not.toBe(inputPayload.proof.refs)
    expect(Object.isFrozen(created)).toBe(true)
    expect(Object.isFrozen(created.payload)).toBe(true)
    expect(Object.isFrozen(proof)).toBe(true)
    expect(Object.isFrozen(proof.refs)).toBe(true)
    expect(() => proof.refs.push('evidence://tampered')).toThrow()
    expect(proof.refs).toEqual(['evidence://one'])
    expect(inputPayload.proof.refs).toEqual(['evidence://one'])
  })
})
