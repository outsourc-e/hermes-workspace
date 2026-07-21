import { describe, expect, it } from 'vitest'
import { createWorkspacePacket } from './factory'
import {
  WorkspacePacketIdempotencyConflictError,
  acknowledgeWorkspacePacket,
  resolveWorkspacePacketIdempotency,
} from './ack'
import {
  appendWorkspacePacketLifecycleEvent,
  createWorkspacePacketLifecycleEvent,
} from './lifecycle'
import {
  sourceRefsForTestContext,
  validTestContextPayload,
} from './test-fixtures'
import type { WorkspacePacketLifecycleEvent } from './lifecycle'
import type { UniversalPacketEnvelope } from './types'

function packet(schemaVersion = '1.0.0') {
  const to = { roomId: 'agora-opportunity', agentId: 'goblin' }
  const payload = validTestContextPayload({
    mission: 'Validate ACK.',
    receiver: to,
    stepId: 'step-ack-validation',
  })
  return createWorkspacePacket({
    packetId: `packet-ack-${schemaVersion}`,
    packetLineageId: 'lineage-ack-1',
    createdAt: '2026-07-18T17:30:00.000Z',
    runId: 'run-ack-1',
    schemaVersion,
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
      { criterionId: 'required-1', description: 'Required proof.', required: true },
      { criterionId: 'optional-1', description: 'Optional proof.', required: false },
    ],
    idempotencyKey: 'run-ack-1:opportunity:1',
    payload,
  })
}

function rosterPacket() {
  const reporter = { roomId: 'pantheon-quarters', agentId: 'pantheon-roster' }
  const payload = {
    contractVersion: 'roster-availability-v1' as const,
    executionPlanPacketId: 'packet-plan-roster-ack',
    stepId: 'step-roster-ack',
    routingDecisionId: 'routing-decision-ack',
    observedAt: '2026-07-19T08:00:00.000Z',
    expiresAt: '2026-07-19T08:01:00.000Z',
    reporter,
    profiles: [{
      profileId: 'worker-roster-ack',
      availability: 'available' as const,
      observedAt: '2026-07-19T08:00:00.000Z',
      provenanceRefs: ['runtime://workers/worker-roster-ack'],
    }],
    assignmentAuthority: 'hermes' as const,
    reportsAvailabilityOnly: true as const,
  }
  return createWorkspacePacket({
    packetId: 'packet-roster-ack',
    packetLineageId: 'lineage-roster-ack',
    createdAt: '2026-07-18T17:30:00.000Z',
    runId: 'run-roster-ack',
    schemaVersion: '1.0.0',
    packetType: 'roster-availability',
    from: reporter,
    to: { roomId: 'olympus-command', agentId: 'hermes-command' },
    sourceRefs: [payload.executionPlanPacketId, ...payload.profiles[0].provenanceRefs],
    evidenceRefs: [], assumptions: [], missingFields: [], lockedActions: [],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{ criterionId: 'required-1', description: 'Fresh roster proof.', required: true }],
    idempotencyKey: 'run-roster-ack:roster:1',
    payload,
  })
}

function offeredEvents(subject: UniversalPacketEnvelope = packet()) {
  let events: Array<WorkspacePacketLifecycleEvent> = []
  for (const [index, type] of (['created', 'ready', 'offered'] as const).entries()) {
    const next = createWorkspacePacketLifecycleEvent(subject, events, {
      type,
      actor: subject.from,
      reason: null,
      payload: {},
    }, {
      eventId: `event-offer-${index}`,
      createdAt: `2026-07-18T17:${String(30 + index).padStart(2, '0')}:00.000Z`,
    })
    events = appendWorkspacePacketLifecycleEvent(events, next, subject)
  }
  return events
}

function acceptedInput(subject: UniversalPacketEnvelope = packet()) {
  return {
    receiver: subject.to,
    outcome: 'accepted' as const,
    acceptedContentHash: subject.contentHash,
    checkedCriteriaIds: ['required-1'],
    missingFields: [],
    evidenceRefs: ['evidence://receiver-check', 'test://workspace-packet/context-source'],
    reason: null,
  }
}

describe('Workspace Packet Handoff ACK', () => {
  it('accepts only the exact offered hash with all required criteria checked', () => {
    const subject = packet()
    const result = acknowledgeWorkspacePacket(subject, offeredEvents(subject), acceptedInput(subject), {
      ackId: 'ack-1',
      eventId: 'event-accepted-1',
      createdAt: '2026-07-18T17:40:00.000Z',
      nowMs: Date.parse('2026-07-18T17:40:00.000Z'),
      supportedSchemaMajors: [1],
    })

    expect(result.ack).toMatchObject({
      ackId: 'ack-1',
      packetId: subject.packetId,
      acceptedContentHash: subject.contentHash,
      receiver: subject.to,
      outcome: 'accepted',
    })
    expect(result.event.type).toBe('accepted')
  })

  it('rejects sender ACK, hash mismatch and missing required criteria', () => {
    const subject = packet()
    const events = offeredEvents(subject)
    const options = {
      ackId: 'ack-invalid',
      eventId: 'event-invalid',
      createdAt: '2026-07-18T17:40:00.000Z',
      nowMs: Date.parse('2026-07-18T17:40:00.000Z'),
      supportedSchemaMajors: [1],
    }

    expect(() => acknowledgeWorkspacePacket(subject, events, {
      ...acceptedInput(subject),
      receiver: subject.from,
    }, options)).toThrow(/receiver/i)
    expect(() => acknowledgeWorkspacePacket(subject, events, {
      ...acceptedInput(subject),
      acceptedContentHash: 'f'.repeat(64),
    }, options)).toThrow(/hash/i)
    expect(() => acknowledgeWorkspacePacket(subject, events, {
      ...acceptedInput(subject),
      checkedCriteriaIds: [],
    }, options)).toThrow(/criteria/i)
  })

  it('rejects Context acceptance without content-bound revalidation evidence', () => {
    const subject = packet()
    expect(() => acknowledgeWorkspacePacket(subject, offeredEvents(subject), {
      ...acceptedInput(subject),
      evidenceRefs: ['evidence://receiver-check'],
    }, {
      ackId: 'ack-context-without-revalidation',
      eventId: 'event-context-without-revalidation',
      nowMs: Date.parse('2026-07-18T17:40:00.000Z'),
      supportedSchemaMajors: [1],
    })).toThrow(/revalidation-required/i)
  })

  it('accepts Roster only during its trusted server-time window', () => {
    const subject = rosterPacket()
    const events = offeredEvents(subject)
    const invoke = (now: string) => acknowledgeWorkspacePacket(subject, events, acceptedInput(subject), {
      ackId: `ack-roster-${now}`,
      eventId: `event-roster-${now}`,
      nowMs: Date.parse(now),
      supportedSchemaMajors: [1],
    })

    expect(invoke('2026-07-19T08:00:30.000Z').ack.outcome).toBe('accepted')
    expect(() => invoke('2026-07-19T08:01:00.000Z')).toThrow(/stale|future-observed/i)
    expect(() => invoke('2026-07-19T07:59:59.999Z')).toThrow(/stale|future-observed/i)
  })

  it('returns a blocked ACK for an unsupported schema Major', () => {
    const subject = packet('2.0.0')
    const result = acknowledgeWorkspacePacket(subject, offeredEvents(subject), acceptedInput(subject), {
      ackId: 'ack-schema-blocked',
      eventId: 'event-schema-blocked',
      createdAt: '2026-07-18T17:40:00.000Z',
      supportedSchemaMajors: [1],
    })

    expect(result.ack.outcome).toBe('blocked')
    expect(result.ack.missingFields).toContain('schemaVersion')
    expect(result.ack.reason).toMatch(/unsupported schema major/i)
    expect(result.event.type).toBe('blocked')
  })
})

describe('Workspace Packet idempotency', () => {
  it('replays the original result for the same key and hash', () => {
    const subject = packet()
    const first = resolveWorkspacePacketIdempotency([], subject, () => ({ delivery: 'first' }))
    const replay = resolveWorkspacePacketIdempotency(first.records, subject, () => ({ delivery: 'second' }))

    expect(first.kind).toBe('created')
    expect(replay.kind).toBe('replayed')
    expect(replay.result).toEqual({ delivery: 'first' })
    expect(replay.records).toBe(first.records)
  })

  it('raises a typed conflict for the same key with different content', () => {
    const subject = packet()
    const first = resolveWorkspacePacketIdempotency([], subject, () => ({ delivery: 'first' }))

    expect(() => resolveWorkspacePacketIdempotency(first.records, {
      idempotencyKey: subject.idempotencyKey,
      contentHash: 'f'.repeat(64),
    }, () => ({ delivery: 'conflict' }))).toThrow(WorkspacePacketIdempotencyConflictError)
  })
})
