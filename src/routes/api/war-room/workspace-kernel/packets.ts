import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'

import {
  WorkspacePacketIdempotencyConflictError,
} from '../../../../lib/workspace-kernel/packets/ack'
import { createWorkspacePacket, reviseWorkspacePacket } from '../../../../lib/workspace-kernel/packets/factory'
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
import type {
  CreateWorkspacePacketInput,
  ReviseWorkspacePacketInput,
} from '../../../../lib/workspace-kernel/packets/factory'
import type { UniversalPacketEnvelope } from '../../../../lib/workspace-kernel/packets/types'

const noStoreHeaders = { 'cache-control': 'no-store' }
const MAX_REQUEST_BYTES = 256 * 1024
const CreatePacketRequestSchema = z.object({
  action: z.literal('create'),
  packet: z.unknown(),
  initialStatus: z.enum(['draft', 'ready']).optional(),
}).strict()
const RevisionSchema = z.object({
  packetId: z.string().trim().min(1).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().trim().min(1),
  schemaVersion: z.string().trim().min(1).optional(),
  sourceRefs: z.array(z.string()).optional(),
  evidenceRefs: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  missingFields: z.array(z.string()).optional(),
  lockedActions: z.array(z.string()).optional(),
  approval: z.unknown().optional(),
  acceptanceCriteria: z.unknown().optional(),
  payload: z.unknown().optional(),
}).strict()
const RevisePacketRequestSchema = z.object({
  action: z.literal('revise'),
  previousPacketId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  revision: RevisionSchema,
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
  if (error instanceof WorkspacePacketIdempotencyConflictError) {
    return errorResponse(409, error.code, error.message)
  }
  if (error instanceof WorkspacePacketStoreConflictError) {
    return errorResponse(409, error.code, error.message)
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return errorResponse(400, 'INVALID_PACKET', 'Packet failed schema validation.')
  }
  return errorResponse(400, 'INVALID_PACKET_OPERATION', error instanceof Error ? error.message : 'Invalid Packet operation.')
}

async function loadedStore() {
  const loaded = await loadWorkspacePacketStore()
  if (!loaded.ok) return null
  return loaded.state
}

function packetResult(packet: UniversalPacketEnvelope, state: Awaited<ReturnType<typeof loadedStore>>, replayed: boolean) {
  const latestAck = state?.acks.filter((ack) => ack.packetId === packet.packetId).at(-1)
  const latestEvent = state?.events.filter((event) => event.packetId === packet.packetId).at(-1)
  return {
    packet,
    status: workspacePacketStatusFromEvents(packet.packetId, state?.events ?? []),
    missingFields: [...new Set([...packet.missingFields, ...(latestAck?.missingFields ?? [])])],
    statusReason: latestEvent?.reason ?? null,
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

async function createPacket(body: z.infer<typeof CreatePacketRequestSchema>) {
  if (!isRecord(body.packet)) return errorResponse(400, 'INVALID_PACKET', 'A Packet object is required.')
  try {
    const packet = createWorkspacePacket(body.packet as CreateWorkspacePacketInput<unknown>)
    const state = await loadedStore()
    if (!state) return errorResponse(500, 'PACKET_STORE_UNAVAILABLE', 'Local Packet store is unavailable.')
    const existing = state.packets.find((candidate) => candidate.idempotencyKey === packet.idempotencyKey)
    if (existing) {
      if (existing.contentHash !== packet.contentHash) {
        throw new WorkspacePacketIdempotencyConflictError(
          packet.idempotencyKey,
          existing.contentHash,
          packet.contentHash,
        )
      }
      return json(successPayload(await mirroredPacketResult(existing, state, true)), { headers: noStoreHeaders })
    }
    const createdEvent = createWorkspacePacketLifecycleEvent(packet, state.events, {
      type: 'created',
      actor: packet.from,
      reason: null,
      payload: {},
    }, {
      eventId: `packet-created:${packet.packetId}`,
      createdAt: packet.createdAt,
    })
    const events = [createdEvent]
    if (body.initialStatus === 'ready') {
      events.push(createWorkspacePacketLifecycleEvent(packet, [...state.events, createdEvent], {
        type: 'ready',
        actor: packet.from,
        reason: null,
        payload: {},
      }, {
        eventId: `packet-ready:${packet.packetId}`,
        createdAt: new Date(Date.parse(packet.createdAt) + 1).toISOString(),
      }))
    }
    const saved = await persistWorkspacePacketStore({ packets: [packet], events })
    return json(successPayload(await mirroredPacketResult(packet, saved, false)), { status: 201, headers: noStoreHeaders })
  } catch (error) {
    return safeOperationError(error)
  }
}

async function revisePacket(body: z.infer<typeof RevisePacketRequestSchema>) {
  try {
    const state = await loadedStore()
    if (!state) return errorResponse(500, 'PACKET_STORE_UNAVAILABLE', 'Local Packet store is unavailable.')
    const previous = state.packets.find((packet) => packet.packetId === body.previousPacketId)
    if (!previous) return errorResponse(404, 'PACKET_NOT_FOUND', 'Packet was not found.')
    const packet = reviseWorkspacePacket(
      previous,
      body.revision as ReviseWorkspacePacketInput<unknown>,
    )
    const existing = state.packets.find((candidate) => candidate.idempotencyKey === packet.idempotencyKey)
    if (existing) {
      if (existing.contentHash !== packet.contentHash) {
        throw new WorkspacePacketIdempotencyConflictError(
          packet.idempotencyKey,
          existing.contentHash,
          packet.contentHash,
        )
      }
      return json(successPayload(await mirroredPacketResult(existing, state, true)), { headers: noStoreHeaders })
    }
    const previousStatus = workspacePacketStatusFromEvents(previous.packetId, state.events)
    if (!['ready', 'offered', 'accepted', 'blocked'].includes(previousStatus)) {
      return errorResponse(409, 'PACKET_REVISION_NOT_ALLOWED', `Cannot revise a Packet in ${previousStatus} status.`)
    }
    const supersededEvent = createWorkspacePacketLifecycleEvent(previous, state.events, {
      type: 'superseded',
      actor: previous.from,
      reason: body.reason,
      payload: { supersededByPacketId: packet.packetId },
    }, {
      eventId: `packet-superseded:${previous.packetId}:${packet.packetId}`,
      createdAt: packet.createdAt,
    })
    const createdEvent = createWorkspacePacketLifecycleEvent(packet, [...state.events, supersededEvent], {
      type: 'created',
      actor: packet.from,
      reason: null,
      payload: { supersedesPacketId: previous.packetId },
    }, {
      eventId: `packet-created:${packet.packetId}`,
      createdAt: packet.createdAt,
    })
    const saved = await persistWorkspacePacketStore({
      packets: [packet],
      events: [supersededEvent, createdEvent],
    })
    return json(successPayload(await mirroredPacketResult(packet, saved, false)), { status: 201, headers: noStoreHeaders })
  } catch (error) {
    return safeOperationError(error)
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/packets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized')
        }
        const searchParams = new URL(request.url).searchParams
        const packetId = searchParams.get('packetId')?.trim()
        const runId = searchParams.get('runId')?.trim()
        if (!packetId && !runId) return errorResponse(400, 'PACKET_QUERY_REQUIRED', 'packetId or runId is required.')
        if (packetId && runId) return errorResponse(400, 'PACKET_QUERY_AMBIGUOUS', 'Use packetId or runId, not both.')
        const state = await loadedStore()
        if (!state) return errorResponse(500, 'PACKET_STORE_UNAVAILABLE', 'Local Packet store is unavailable.')
        if (runId) {
          const packets = state.packets
            .filter((candidate) => candidate.runId === runId)
            .map((packet) => packetResult(packet, state, false))
          return json(successPayload({ runId, packets }), { headers: noStoreHeaders })
        }
        const packet = state.packets.find((candidate) => candidate.packetId === packetId)
        if (!packet) return errorResponse(404, 'PACKET_NOT_FOUND', 'Packet was not found.')
        return json(successPayload(packetResult(packet, state, false)), { headers: noStoreHeaders })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized')
        }
        const parsed = await readBoundedJson(request)
        if (!parsed.ok) return errorResponse(parsed.status, parsed.code, parsed.error)
        const createBody = CreatePacketRequestSchema.safeParse(parsed.value)
        if (createBody.success) return createPacket(createBody.data)
        const reviseBody = RevisePacketRequestSchema.safeParse(parsed.value)
        if (reviseBody.success) return revisePacket(reviseBody.data)
        return errorResponse(400, 'INVALID_BODY', 'Request body failed strict validation.')
      },
    },
  },
})
