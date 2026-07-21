import {
  createWorkspacePacketLifecycleEvent,
  workspacePacketStatusFromEvents,
} from './lifecycle'
import { validateContextPayloadForUse } from './domain/context'
import { isRosterAvailabilityFresh } from './domain/roster-availability'
import { createWorkspacePacketRandomId } from './types'
import type { WorkspacePacketLifecycleEvent } from './lifecycle'
import type { UniversalPacketEnvelope, WorkspacePacketEndpoint } from './types'

export const HANDOFF_ACK_OUTCOMES = ['accepted', 'blocked', 'rejected'] as const
export type HandoffAckOutcome = (typeof HANDOFF_ACK_OUTCOMES)[number]

export type HandoffAck = {
  ackId: string
  packetId: string
  acceptedContentHash: string
  receiver: WorkspacePacketEndpoint
  outcome: HandoffAckOutcome
  checkedCriteriaIds: Array<string>
  missingFields: Array<string>
  evidenceRefs: Array<string>
  reason: string | null
  createdAt: string
}

export type AcknowledgeWorkspacePacketInput = Omit<HandoffAck, 'ackId' | 'packetId' | 'createdAt'>

export type AcknowledgeWorkspacePacketOptions = {
  ackId?: string
  eventId?: string
  createdAt?: string
  nowMs?: number
  supportedSchemaMajors: Array<number>
}

export type WorkspacePacketIdempotencyRecord<TResult> = {
  idempotencyKey: string
  contentHash: string
  result: TResult
}

export class WorkspacePacketIdempotencyConflictError extends Error {
  readonly code = 'WORKSPACE_PACKET_IDEMPOTENCY_CONFLICT'
  readonly idempotencyKey: string
  readonly expectedContentHash: string
  readonly receivedContentHash: string

  constructor(idempotencyKey: string, expectedContentHash: string, receivedContentHash: string) {
    super(`Idempotency key ${idempotencyKey} is already bound to a different content hash.`)
    this.name = 'WorkspacePacketIdempotencyConflictError'
    this.idempotencyKey = idempotencyKey
    this.expectedContentHash = expectedContentHash
    this.receivedContentHash = receivedContentHash
  }
}

function endpointMatches(actor: WorkspacePacketEndpoint, expected: WorkspacePacketEndpoint) {
  return actor.roomId === expected.roomId && actor.agentId === expected.agentId
}

function schemaMajor(schemaVersion: string) {
  const value = Number.parseInt(schemaVersion.split('.')[0] ?? '', 10)
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid schemaVersion: ${schemaVersion}.`)
  return value
}

function unique(values: ReadonlyArray<string>) {
  return [...new Set(values)]
}

function freezeAck(ack: HandoffAck) {
  Object.freeze(ack.receiver)
  Object.freeze(ack.checkedCriteriaIds)
  Object.freeze(ack.missingFields)
  Object.freeze(ack.evidenceRefs)
  return Object.freeze(ack)
}

function assertPacketFreshAtAcceptance(
  packet: UniversalPacketEnvelope,
  revalidationEvidenceRefs: ReadonlyArray<string>,
  nowMs: number,
) {
  const now = new Date(nowMs).toISOString()
  if (packet.packetType === 'context') {
    validateContextPayloadForUse(packet.payload, {
      now,
      revalidatedProvenanceRefs: revalidationEvidenceRefs,
    })
  }
  if (packet.packetType === 'roster-availability' && !isRosterAvailabilityFresh(packet.payload, now)) {
    throw new Error('Roster availability is stale or future-observed at the receiver acceptance boundary.')
  }
}

export function acknowledgeWorkspacePacket(
  packet: UniversalPacketEnvelope,
  events: ReadonlyArray<WorkspacePacketLifecycleEvent>,
  input: AcknowledgeWorkspacePacketInput,
  options: AcknowledgeWorkspacePacketOptions,
): { ack: HandoffAck; event: WorkspacePacketLifecycleEvent } {
  if (workspacePacketStatusFromEvents(packet.packetId, events) !== 'offered') {
    throw new Error('Workspace Packet must be offered before receiver ACK.')
  }
  if (!endpointMatches(input.receiver, packet.to)) {
    throw new Error('Handoff ACK must be created by the exact Packet receiver.')
  }

  const nowMs = options.nowMs ?? Date.now()
  if (!Number.isFinite(nowMs)) throw new Error('Handoff ACK nowMs must be finite trusted server time.')
  const createdAt = options.createdAt ?? new Date(nowMs).toISOString()
  const ackId = options.ackId ?? createWorkspacePacketRandomId()
  if (!ackId.trim()) throw new Error('Handoff ackId is required.')
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Handoff ACK createdAt must be an ISO timestamp.')

  const major = schemaMajor(packet.schemaVersion)
  const supported = options.supportedSchemaMajors.includes(major)
  const outcome: HandoffAckOutcome = supported ? input.outcome : 'blocked'
  const reason = supported
    ? input.reason
    : `Unsupported schema Major ${major}; supported Majors: ${options.supportedSchemaMajors.join(', ') || 'none'}.`
  const missingFields = supported ? unique(input.missingFields) : unique([...input.missingFields, 'schemaVersion'])
  const acceptedContentHash = supported ? input.acceptedContentHash : packet.contentHash
  const checkedCriteriaIds = unique(input.checkedCriteriaIds)

  if (supported && acceptedContentHash !== packet.contentHash) {
    throw new Error('Handoff ACK content hash does not match the offered Packet hash.')
  }
  if (outcome === 'accepted') {
    const requiredCriteriaIds = packet.acceptanceCriteria
      .filter((criterion) => criterion.required)
      .map((criterion) => criterion.criterionId)
    const unchecked = requiredCriteriaIds.filter((criterionId) => !checkedCriteriaIds.includes(criterionId))
    if (unchecked.length > 0) throw new Error(`Handoff ACK is missing required criteria: ${unchecked.join(', ')}.`)
    if (packet.missingFields.length > 0 || missingFields.length > 0) {
      throw new Error('Handoff ACK cannot accept a Packet with missing fields.')
    }
    assertPacketFreshAtAcceptance(packet, input.evidenceRefs, nowMs)
  } else if (!reason?.trim()) {
    throw new Error(`Handoff ACK outcome ${outcome} requires a reason.`)
  }

  const ack = freezeAck({
    ackId,
    packetId: packet.packetId,
    acceptedContentHash,
    receiver: { ...input.receiver },
    outcome,
    checkedCriteriaIds,
    missingFields,
    evidenceRefs: unique(input.evidenceRefs),
    reason,
    createdAt,
  })
  const event = createWorkspacePacketLifecycleEvent(packet, events, {
    type: outcome,
    actor: input.receiver,
    reason,
    payload: {
      ackId: ack.ackId,
      acceptedContentHash: ack.acceptedContentHash,
    },
  }, {
    eventId: options.eventId,
    createdAt,
  })

  return Object.freeze({ ack, event })
}

export function resolveWorkspacePacketIdempotency<TResult>(
  records: ReadonlyArray<WorkspacePacketIdempotencyRecord<TResult>>,
  packet: { idempotencyKey: string; contentHash: string },
  createResult: () => TResult,
): {
  kind: 'created' | 'replayed'
  result: TResult
  records: ReadonlyArray<WorkspacePacketIdempotencyRecord<TResult>>
} {
  const existing = records.find((record) => record.idempotencyKey === packet.idempotencyKey)
  if (existing) {
    if (existing.contentHash !== packet.contentHash) {
      throw new WorkspacePacketIdempotencyConflictError(
        packet.idempotencyKey,
        existing.contentHash,
        packet.contentHash,
      )
    }
    return { kind: 'replayed', result: existing.result, records }
  }

  const result = createResult()
  const record = Object.freeze({
    idempotencyKey: packet.idempotencyKey,
    contentHash: packet.contentHash,
    result,
  })
  return {
    kind: 'created',
    result,
    records: Object.freeze([...records, record]),
  }
}
