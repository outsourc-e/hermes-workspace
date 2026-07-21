import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'

import {
  HANDOFF_ACK_OUTCOMES,
  acknowledgeWorkspacePacket,
} from '../../../../lib/workspace-kernel/packets/ack'
import { canonicalizeWorkspacePacketContent } from '../../../../lib/workspace-kernel/packets/canonical-json'
import { assertWorkspacePacketRoutingAllowed } from '../../../../lib/workspace-kernel/packets/factory'
import {
  createWorkspacePacketLifecycleEvent,
  workspacePacketStatusFromEvents,
} from '../../../../lib/workspace-kernel/packets/lifecycle'
import {
  WorkspacePacketStoreConflictError,
  loadWorkspacePacketStore,
  persistWorkspacePacketStore,
} from '../../../../lib/workspace-kernel/packets/packet-store'
import { isAuthenticated } from '../../../../server/auth-middleware'
import { mirrorWorkspacePacketStoreAfterLocalCommit } from '../../../../server/workspace-packet-db'
import type { HandoffAck, HandoffAckOutcome } from '../../../../lib/workspace-kernel/packets/ack'
import type { WorkspacePacketStoreState } from '../../../../lib/workspace-kernel/packets/packet-store'
import type { UniversalPacketEnvelope, WorkspacePacketEndpoint } from '../../../../lib/workspace-kernel/packets/types'

const noStoreHeaders = { 'cache-control': 'no-store' }
const MAX_REQUEST_BYTES = 256 * 1024
const SUPPORTED_SCHEMA_MAJORS = [1]
const EndpointSchema = z.object({
  roomId: z.string().trim().min(1),
  agentId: z.string().trim().min(1).nullable(),
}).strict()
const OfferRequestSchema = z.object({
  action: z.literal('offer'),
  packetId: z.string().trim().min(1),
  actor: EndpointSchema,
  createdAt: z.string().datetime({ offset: true }).optional(),
}).strict()
const AckRequestSchema = z.object({
  action: z.literal('ack'),
  packetId: z.string().trim().min(1),
  ackId: z.string().trim().min(1).optional(),
  eventId: z.string().trim().min(1).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  receiver: EndpointSchema,
  outcome: z.enum(HANDOFF_ACK_OUTCOMES),
  checkedCriteriaIds: z.array(z.string().trim().min(1)),
  missingFields: z.array(z.string().trim().min(1)),
  evidenceRefs: z.array(z.string().trim().min(1)),
  reason: z.string().trim().min(1).nullable(),
  acceptedContentHash: z.string().trim().min(1),
}).strict()
const localSafety = {
  localOnly: true,
  usageAllowed: false,
  workerSpawnAllowed: false,
  externalRequestsAllowed: false,
  liveActionsAllowed: false,
} as const

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; code: string; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is Array<string> {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isEndpoint(value: unknown): value is WorkspacePacketEndpoint {
  return isRecord(value)
    && isNonEmptyString(value.roomId)
    && (isNonEmptyString(value.agentId) || value.agentId === null)
}

function endpointMatches(left: WorkspacePacketEndpoint, right: WorkspacePacketEndpoint) {
  return left.roomId === right.roomId && left.agentId === right.agentId
}

function unique(values: Array<string>) {
  return [...new Set(values)]
}

function addMilliseconds(timestamp: string, milliseconds: number) {
  const value = Date.parse(timestamp)
  if (!Number.isFinite(value)) throw new Error('createdAt must be an ISO timestamp.')
  return new Date(value + milliseconds).toISOString()
}

async function readBoundedJson(request: Request): Promise<JsonBodyResult> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, code: 'REQUEST_TOO_LARGE', error: 'Request body is too large.' }
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, code: 'REQUEST_TOO_LARGE', error: 'Request body is too large.' }
  }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400, code: 'INVALID_JSON', error: 'Invalid JSON.' }
  }
}

function errorResponse(status: number, code: string, error: string) {
  return json({ ok: false, code, error, ...localSafety }, { status, headers: noStoreHeaders })
}

function successPayload(result: unknown) {
  return { ok: true, result, ...localSafety }
}

function safeOperationError(error: unknown) {
  if (error instanceof WorkspacePacketStoreConflictError) {
    return errorResponse(409, error.code, error.message)
  }
  return errorResponse(400, 'INVALID_HANDOFF_OPERATION', error instanceof Error ? error.message : 'Invalid handoff operation.')
}

async function loadedStore() {
  const loaded = await loadWorkspacePacketStore()
  if (!loaded.ok) return null
  return loaded.state
}

function packetEvents(packetId: string, events: WorkspacePacketStoreState['events']) {
  return events.filter((event) => event.packetId === packetId)
}

function packetResult(packet: UniversalPacketEnvelope, state: NonNullable<Awaited<ReturnType<typeof loadedStore>>>, replayed: boolean) {
  return {
    packet,
    status: workspacePacketStatusFromEvents(packet.packetId, state.events),
    events: packetEvents(packet.packetId, state.events),
    replayed,
  }
}

async function mirroredPacketResult(
  packet: UniversalPacketEnvelope,
  state: NonNullable<Awaited<ReturnType<typeof loadedStore>>>,
  replayed: boolean,
) {
  const mirror = await mirrorWorkspacePacketStoreAfterLocalCommit(state)
  return {
    ...packetResult(packet, state, replayed),
    persistence: mirror.persistence,
  }
}

async function offerPacket(body: z.infer<typeof OfferRequestSchema>) {
  try {
    const state = await loadedStore()
    if (!state) return errorResponse(500, 'PACKET_STORE_UNAVAILABLE', 'Local Packet store is unavailable.')
    const packet = state.packets.find((candidate) => candidate.packetId === body.packetId)
    if (!packet) return errorResponse(404, 'PACKET_NOT_FOUND', 'Packet was not found.')
    assertWorkspacePacketRoutingAllowed(packet)
    if (!endpointMatches(body.actor, packet.from)) {
      return errorResponse(400, 'INVALID_PACKET_SENDER', 'Offer must be created by the exact Packet sender.')
    }
    const status = workspacePacketStatusFromEvents(packet.packetId, state.events)
    if (status === 'offered') {
      return json(successPayload(await mirroredPacketResult(packet, state, true)), { headers: noStoreHeaders })
    }
    if (status !== 'draft' && status !== 'ready') {
      return errorResponse(409, 'PACKET_OFFER_NOT_ALLOWED', `Cannot offer a Packet in ${status} status.`)
    }
    const createdAt = body.createdAt ?? new Date().toISOString()
    const newEvents = []
    const projectedEvents = [...state.events]
    if (status === 'draft') {
      const ready = createWorkspacePacketLifecycleEvent(packet, projectedEvents, {
        type: 'ready',
        actor: body.actor,
        reason: null,
        payload: {},
      }, {
        eventId: `packet-ready:${packet.packetId}`,
        createdAt,
      })
      newEvents.push(ready)
      projectedEvents.push(ready)
    }
    const offeredAt = status === 'draft' ? addMilliseconds(createdAt, 1) : createdAt
    const offered = createWorkspacePacketLifecycleEvent(packet, projectedEvents, {
      type: 'offered',
      actor: body.actor,
      reason: null,
      payload: {},
    }, {
      eventId: `packet-offered:${packet.packetId}`,
      createdAt: offeredAt,
    })
    newEvents.push(offered)
    const saved = await persistWorkspacePacketStore({ events: newEvents })
    return json(successPayload(await mirroredPacketResult(packet, saved, false)), { headers: noStoreHeaders })
  } catch (error) {
    return safeOperationError(error)
  }
}

function schemaMajor(packet: UniversalPacketEnvelope) {
  return Number.parseInt(packet.schemaVersion.split('.')[0] ?? '', 10)
}

function normalizedAckForReplay(
  packet: UniversalPacketEnvelope,
  body: Record<string, unknown>,
  existing: HandoffAck,
): HandoffAck | null {
  if (!isNonEmptyString(body.ackId)
    || !isEndpoint(body.receiver)
    || !HANDOFF_ACK_OUTCOMES.includes(body.outcome as HandoffAckOutcome)
    || !isStringArray(body.checkedCriteriaIds)
    || !isStringArray(body.missingFields)
    || !isStringArray(body.evidenceRefs)
    || !isNonEmptyString(body.acceptedContentHash)
    || !(isNonEmptyString(body.reason) || body.reason === null)) {
    return null
  }
  const major = schemaMajor(packet)
  const supported = SUPPORTED_SCHEMA_MAJORS.includes(major)
  return {
    ackId: body.ackId,
    packetId: packet.packetId,
    acceptedContentHash: supported ? body.acceptedContentHash : packet.contentHash,
    receiver: body.receiver,
    outcome: supported ? body.outcome as HandoffAckOutcome : 'blocked',
    checkedCriteriaIds: unique(body.checkedCriteriaIds),
    missingFields: supported ? unique(body.missingFields) : unique([...body.missingFields, 'schemaVersion']),
    evidenceRefs: unique(body.evidenceRefs),
    reason: supported
      ? body.reason
      : `Unsupported schema Major ${major}; supported Majors: ${SUPPORTED_SCHEMA_MAJORS.join(', ') || 'none'}.`,
    createdAt: isNonEmptyString(body.createdAt) ? body.createdAt : existing.createdAt,
  }
}

async function acknowledgePacket(body: z.infer<typeof AckRequestSchema>) {
  try {
    const state = await loadedStore()
    if (!state) return errorResponse(500, 'PACKET_STORE_UNAVAILABLE', 'Local Packet store is unavailable.')
    const packet = state.packets.find((candidate) => candidate.packetId === body.packetId)
    if (!packet) return errorResponse(404, 'PACKET_NOT_FOUND', 'Packet was not found.')
    assertWorkspacePacketRoutingAllowed(packet)
    if (isNonEmptyString(body.ackId)) {
      const existing = state.acks.find((candidate) => candidate.ackId === body.ackId)
      if (existing) {
        const expected = normalizedAckForReplay(packet, body, existing)
        if (!expected || canonicalizeWorkspacePacketContent(expected) !== canonicalizeWorkspacePacketContent(existing)) {
          return errorResponse(409, 'HANDOFF_ACK_CONFLICT', 'ackId is already bound to different ACK content.')
        }
        return json(successPayload({
          ...(await mirroredPacketResult(packet, state, true)),
          ack: existing,
        }), { headers: noStoreHeaders })
      }
    }
    const { ack, event } = acknowledgeWorkspacePacket(packet, state.events, {
      acceptedContentHash: body.acceptedContentHash,
      receiver: body.receiver,
      outcome: body.outcome,
      checkedCriteriaIds: body.checkedCriteriaIds,
      missingFields: body.missingFields,
      evidenceRefs: body.evidenceRefs,
      reason: body.reason,
    }, {
      ackId: isNonEmptyString(body.ackId) ? body.ackId : undefined,
      eventId: isNonEmptyString(body.eventId) ? body.eventId : undefined,
      createdAt: isNonEmptyString(body.createdAt) ? body.createdAt : undefined,
      supportedSchemaMajors: SUPPORTED_SCHEMA_MAJORS,
    })
    const saved = await persistWorkspacePacketStore({ acks: [ack], events: [event] })
    return json(successPayload({
      ...(await mirroredPacketResult(packet, saved, false)),
      ack,
    }), { headers: noStoreHeaders })
  } catch (error) {
    return safeOperationError(error)
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/packet-handoff')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized')
        }
        const parsed = await readBoundedJson(request)
        if (!parsed.ok) return errorResponse(parsed.status, parsed.code, parsed.error)
        const offerBody = OfferRequestSchema.safeParse(parsed.value)
        if (offerBody.success) return offerPacket(offerBody.data)
        const ackBody = AckRequestSchema.safeParse(parsed.value)
        if (ackBody.success) return acknowledgePacket(ackBody.data)
        return errorResponse(400, 'INVALID_BODY', 'Request body failed strict validation.')
      },
    },
  },
})
