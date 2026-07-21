import { canonicalizeWorkspacePacketContent } from './canonical-json'
import { createWorkspacePacketRandomId } from './types'
import type {
  UniversalPacketEnvelope,
  WorkspacePacketEndpoint,
  WorkspacePacketStatus,
} from './types'

export const WORKSPACE_PACKET_LIFECYCLE_EVENT_TYPES = [
  'created',
  'ready',
  'offered',
  'accepted',
  'blocked',
  'rejected',
  'superseded',
  'cancelled',
] as const

export type WorkspacePacketLifecycleEventType = (typeof WORKSPACE_PACKET_LIFECYCLE_EVENT_TYPES)[number]

export type WorkspacePacketLifecycleEvent = {
  eventId: string
  packetId: string
  type: WorkspacePacketLifecycleEventType
  actorRoomId: string
  actorAgentId: string | null
  createdAt: string
  reason: string | null
  payload: Record<string, unknown>
}

export type CreateWorkspacePacketLifecycleEventInput = {
  type: WorkspacePacketLifecycleEventType
  actor: WorkspacePacketEndpoint
  reason: string | null
  payload: Record<string, unknown>
}

export type WorkspacePacketLifecycleEventOptions = {
  eventId?: string
  createdAt?: string
}

const SENDER_EVENT_TYPES = new Set<WorkspacePacketLifecycleEventType>([
  'created',
  'ready',
  'offered',
  'superseded',
  'cancelled',
])
const RECEIVER_EVENT_TYPES = new Set<WorkspacePacketLifecycleEventType>([
  'accepted',
  'blocked',
  'rejected',
])
const REASON_REQUIRED_EVENT_TYPES = new Set<WorkspacePacketLifecycleEventType>([
  'blocked',
  'rejected',
  'superseded',
  'cancelled',
])
const ACK_REQUIRED_EVENT_TYPES = new Set<WorkspacePacketLifecycleEventType>([
  'accepted',
  'blocked',
  'rejected',
])
const TERMINAL_STATUSES = new Set<WorkspacePacketStatus>([
  'rejected',
  'superseded',
  'cancelled',
])

const ALLOWED_TRANSITIONS: Record<WorkspacePacketStatus, Array<WorkspacePacketLifecycleEventType>> = {
  draft: ['ready', 'cancelled'],
  ready: ['offered', 'superseded', 'cancelled'],
  offered: ['accepted', 'blocked', 'rejected', 'superseded', 'cancelled'],
  accepted: ['superseded'],
  blocked: ['superseded', 'cancelled'],
  rejected: [],
  superseded: [],
  cancelled: [],
}

function hasDomainReadinessBlockers(packet: UniversalPacketEnvelope) {
  if (packet.missingFields.length > 0) return true
  if (!packet.payload || typeof packet.payload !== 'object') return false
  const payload = packet.payload as Record<string, unknown>
  return payload.readiness === 'blocked'
    || (Array.isArray(payload.hardBlocks) && payload.hardBlocks.length > 0)
}

function assertDomainReadyForLifecycle(packet: UniversalPacketEnvelope, eventType: WorkspacePacketLifecycleEventType) {
  if (eventType === 'ready' && hasDomainReadinessBlockers(packet)) {
    throw new Error('Domain-blocked Packet cannot transition to lifecycle ready.')
  }
}

function endpointMatches(actor: WorkspacePacketEndpoint, expected: WorkspacePacketEndpoint) {
  return actor.roomId === expected.roomId && actor.agentId === expected.agentId
}

function packetEvents(packetId: string, events: ReadonlyArray<WorkspacePacketLifecycleEvent>) {
  return events.filter((event) => event.packetId === packetId)
}

function assertIsoTimestamp(value: string) {
  const fullIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
  if (!fullIsoTimestamp.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Lifecycle event createdAt must be a full ISO timestamp.')
  }
}

function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalizeWorkspacePacketContent(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return Object.freeze(value)
}

function freezeEvent(event: WorkspacePacketLifecycleEvent) {
  return deepFreeze(event)
}

export function workspacePacketStatusFromEvents(
  packetId: string,
  events: ReadonlyArray<WorkspacePacketLifecycleEvent>,
): WorkspacePacketStatus {
  const relevant = packetEvents(packetId, events)
  const latest = relevant.at(-1)
  if (!latest || latest.type === 'created') return 'draft'
  return latest.type
}

export function canMutateWorkspacePacketContent(
  packetId: string,
  events: ReadonlyArray<WorkspacePacketLifecycleEvent>,
) {
  const status = workspacePacketStatusFromEvents(packetId, events)
  return status === 'draft' || status === 'ready'
}

export function createWorkspacePacketLifecycleEvent(
  packet: UniversalPacketEnvelope,
  events: ReadonlyArray<WorkspacePacketLifecycleEvent>,
  input: CreateWorkspacePacketLifecycleEventInput,
  options: WorkspacePacketLifecycleEventOptions = {},
): WorkspacePacketLifecycleEvent {
  const relevant = packetEvents(packet.packetId, events)
  const status = workspacePacketStatusFromEvents(packet.packetId, events)
  assertDomainReadyForLifecycle(packet, input.type)

  if (SENDER_EVENT_TYPES.has(input.type) && !endpointMatches(input.actor, packet.from)) {
    throw new Error(`Lifecycle event ${input.type} requires the Packet sender.`)
  }
  if (RECEIVER_EVENT_TYPES.has(input.type) && !endpointMatches(input.actor, packet.to)) {
    throw new Error(`Lifecycle event ${input.type} requires the Packet receiver.`)
  }
  if (REASON_REQUIRED_EVENT_TYPES.has(input.type) && !input.reason?.trim()) {
    throw new Error(`Lifecycle event ${input.type} requires a reason.`)
  }
  if (ACK_REQUIRED_EVENT_TYPES.has(input.type) && typeof input.payload.ackId !== 'string') {
    throw new Error(`Lifecycle event ${input.type} requires an ACK payload.`)
  }

  if (relevant.length === 0) {
    if (input.type !== 'created') throw new Error(`Invalid lifecycle transition: uncreated → ${input.type}.`)
  } else {
    if (TERMINAL_STATUSES.has(status)) throw new Error(`Packet lifecycle status ${status} is terminal.`)
    if (!ALLOWED_TRANSITIONS[status].includes(input.type)) {
      throw new Error(`Invalid lifecycle transition: ${status} → ${input.type}.`)
    }
  }

  const eventId = options.eventId ?? createWorkspacePacketRandomId()
  const createdAt = options.createdAt ?? new Date().toISOString()
  if (!eventId.trim()) throw new Error('Lifecycle eventId is required.')
  assertIsoTimestamp(createdAt)
  const latest = relevant.at(-1)
  if (latest && Date.parse(createdAt) < Date.parse(latest.createdAt)) {
    throw new Error('Lifecycle event timestamp cannot move backwards.')
  }

  return freezeEvent({
    eventId,
    packetId: packet.packetId,
    type: input.type,
    actorRoomId: input.actor.roomId,
    actorAgentId: input.actor.agentId,
    createdAt,
    reason: input.reason,
    payload: cloneCanonical(input.payload),
  })
}

export function appendWorkspacePacketLifecycleEvent(
  events: Array<WorkspacePacketLifecycleEvent>,
  event: WorkspacePacketLifecycleEvent,
  packet: UniversalPacketEnvelope,
): Array<WorkspacePacketLifecycleEvent> {
  const existing = events.find((candidate) => candidate.eventId === event.eventId)
  if (existing) {
    if (canonicalizeWorkspacePacketContent(existing) === canonicalizeWorkspacePacketContent(event)) return events
    throw new Error(`Lifecycle eventId conflict: ${event.eventId}.`)
  }
  if (event.packetId !== packet.packetId) {
    throw new Error(`Lifecycle event Packet mismatch: ${event.packetId}.`)
  }
  const validated = createWorkspacePacketLifecycleEvent(packet, events, {
    type: event.type,
    actor: { roomId: event.actorRoomId, agentId: event.actorAgentId },
    reason: event.reason,
    payload: event.payload,
  }, {
    eventId: event.eventId,
    createdAt: event.createdAt,
  })
  if (canonicalizeWorkspacePacketContent(validated) !== canonicalizeWorkspacePacketContent(event)) {
    throw new Error(`Lifecycle event validation drift: ${event.eventId}.`)
  }
  return Object.freeze([...events, validated]) as unknown as Array<WorkspacePacketLifecycleEvent>
}
