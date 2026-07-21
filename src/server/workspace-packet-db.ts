import {
  HANDOFF_ACK_OUTCOMES,
  appendWorkspacePacketLifecycleEvent,
} from '../lib/workspace-kernel/packets'
import { ApprovalGrantRecordSchema } from '../lib/workspace-kernel/packets/approval-grant'
import { canonicalizeWorkspacePacketContent } from '../lib/workspace-kernel/packets/canonical-json'
import { safeParseWorkspacePacket } from '../lib/workspace-kernel/packets/schemas'
import {
  getWorkspaceSupabaseConfig,
  readWorkspaceDbEnv,
  redactWorkspaceDbSecrets,
  workspaceSupabaseJson,
} from './workspace-core-db'
import type { HandoffAck } from '../lib/workspace-kernel/packets/ack'
import type { ApprovalGrantRecord } from '../lib/workspace-kernel/packets/approval-grant'
import type { WorkspacePacketLifecycleEvent } from '../lib/workspace-kernel/packets/lifecycle'
import type { WorkspacePacketStoreState } from '../lib/workspace-kernel/packets/packet-store'
import type { UniversalPacketEnvelope } from '../lib/workspace-kernel/packets/types'
import type { SupabaseConfig } from './workspace-core-db'

export type WorkspacePacketPersistenceSnapshot = {
  provider: 'supabase' | 'local-file'
  enabled: boolean
  liveSource: boolean
  writebackAllowed: boolean
  status: 'connected' | 'fallback' | 'error' | 'conflict'
  readback: string
  packetCount: number
  eventCount: number
  ackCount: number
  grantCount: number
  stateVersion: string
  lastSyncedAtMs?: number
  error?: string
}

type WorkspacePacketRow = {
  packet_id: string
  packet_lineage_id: string
  revision: number
  supersedes_packet_id: string | null
  run_id: string
  schema_version: string
  packet_type: string
  from_room_id: string
  from_agent_id: string | null
  to_room_id: string
  to_agent_id: string | null
  created_at: string
  idempotency_key: string
  content_hash: string
  envelope: UniversalPacketEnvelope
}

type WorkspacePacketEventRow = {
  event_id: string
  packet_id: string
  event_type: string
  actor_room_id: string
  actor_agent_id: string | null
  created_at: string
  reason: string | null
  payload: Record<string, unknown>
  event_record: WorkspacePacketLifecycleEvent
}

type WorkspaceHandoffAckRow = {
  ack_id: string
  packet_id: string
  accepted_content_hash: string
  receiver_room_id: string
  receiver_agent_id: string | null
  outcome: string
  checked_criteria_ids: Array<string>
  missing_fields: Array<string>
  evidence_refs: Array<string>
  reason: string | null
  created_at: string
  ack_record: HandoffAck
}

type WorkspaceApprovalGrantRow = {
  grant_id: string
  run_id: string
  cost_risk_lock_packet_id: string
  cost_risk_lock_content_hash: string
  action_id: string
  action_type: string
  stage: string
  target: ApprovalGrantRecord['payload']['target']
  scope_id: string
  scope_hash: string
  currency: string
  maximum_minor_units: number
  status: ApprovalGrantRecord['status']
  issued_at: string
  expires_at: string
  consumed_at: string | null
  grant_record: ApprovalGrantRecord
}

export type WorkspacePacketMirrorRows = {
  packets: Array<WorkspacePacketRow>
  events: Array<WorkspacePacketEventRow>
  acks: Array<WorkspaceHandoffAckRow>
  grants: Array<WorkspaceApprovalGrantRow>
}

const EMPTY_COUNTS = {
  packetCount: 0,
  eventCount: 0,
  ackCount: 0,
  grantCount: 0,
}

function countsFor(state: WorkspacePacketStoreState, grants: ReadonlyArray<ApprovalGrantRecord>) {
  return {
    packetCount: state.packets.length,
    eventCount: state.events.length,
    ackCount: state.acks.length,
    grantCount: grants.length,
  }
}

function disabledSnapshot(stateVersion = 'local-only'): WorkspacePacketPersistenceSnapshot {
  return {
    provider: 'local-file',
    enabled: false,
    liveSource: false,
    writebackAllowed: false,
    status: 'fallback',
    readback: 'Workspace Packets are committed locally; the Supabase Packet mirror is disabled.',
    ...EMPTY_COUNTS,
    stateVersion,
  }
}

function errorSnapshot(
  error: unknown,
  state: WorkspacePacketStoreState,
  grants: ReadonlyArray<ApprovalGrantRecord>,
): WorkspacePacketPersistenceSnapshot {
  const raw = error instanceof Error ? error.message : String(error)
  const message = redactWorkspaceDbSecrets(raw).slice(0, 500)
  const conflict = /(?:409|23505|duplicate|unique|idempotency|immutable|conflict)/i.test(message)
  return {
    provider: 'local-file',
    enabled: false,
    liveSource: false,
    writebackAllowed: false,
    status: conflict ? 'conflict' : 'error',
    readback: `${conflict ? 'Supabase Packet conflict' : 'Supabase Packet mirror unavailable'}; the committed local Packet state remains authoritative. ${message.slice(0, 220)}`,
    ...countsFor(state, grants),
    stateVersion: state.stateVersion,
    error: message,
  }
}

function packetRow(packet: UniversalPacketEnvelope): WorkspacePacketRow {
  return {
    packet_id: packet.packetId,
    packet_lineage_id: packet.packetLineageId,
    revision: packet.revision,
    supersedes_packet_id: packet.supersedesPacketId,
    run_id: packet.runId,
    schema_version: packet.schemaVersion,
    packet_type: packet.packetType,
    from_room_id: packet.from.roomId,
    from_agent_id: packet.from.agentId,
    to_room_id: packet.to.roomId,
    to_agent_id: packet.to.agentId,
    created_at: packet.createdAt,
    idempotency_key: packet.idempotencyKey,
    content_hash: packet.contentHash,
    envelope: packet,
  }
}

function eventRow(event: WorkspacePacketLifecycleEvent): WorkspacePacketEventRow {
  return {
    event_id: event.eventId,
    packet_id: event.packetId,
    event_type: event.type,
    actor_room_id: event.actorRoomId,
    actor_agent_id: event.actorAgentId,
    created_at: event.createdAt,
    reason: event.reason,
    payload: event.payload,
    event_record: event,
  }
}

function ackRow(ack: HandoffAck): WorkspaceHandoffAckRow {
  return {
    ack_id: ack.ackId,
    packet_id: ack.packetId,
    accepted_content_hash: ack.acceptedContentHash,
    receiver_room_id: ack.receiver.roomId,
    receiver_agent_id: ack.receiver.agentId,
    outcome: ack.outcome,
    checked_criteria_ids: ack.checkedCriteriaIds,
    missing_fields: ack.missingFields,
    evidence_refs: ack.evidenceRefs,
    reason: ack.reason,
    created_at: ack.createdAt,
    ack_record: ack,
  }
}

function grantRow(record: ApprovalGrantRecord): WorkspaceApprovalGrantRow {
  return {
    grant_id: record.payload.grantId,
    run_id: record.payload.runId,
    cost_risk_lock_packet_id: record.payload.costRiskLockPacketId,
    cost_risk_lock_content_hash: record.payload.costRiskLockContentHash,
    action_id: record.payload.actionId,
    action_type: record.payload.actionType,
    stage: record.payload.stage,
    target: record.payload.target,
    scope_id: record.payload.scopeId,
    scope_hash: record.payload.scopeHash,
    currency: record.payload.currency,
    maximum_minor_units: record.payload.maximumMinorUnits,
    status: record.status,
    issued_at: record.payload.issuedAt,
    expires_at: record.payload.expiresAt,
    consumed_at: record.consumedAt,
    grant_record: record,
  }
}

function assertUnique(values: ReadonlyArray<string>, label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Workspace Packet mirror contains duplicate ${label}.`)
}

function assertAckBinding(ack: HandoffAck, packet: UniversalPacketEnvelope) {
  if (
    ack.acceptedContentHash !== packet.contentHash
    || ack.receiver.roomId !== packet.to.roomId
    || ack.receiver.agentId !== packet.to.agentId
    || !HANDOFF_ACK_OUTCOMES.includes(ack.outcome)
  ) {
    throw new Error(`Handoff ACK ${ack.ackId} is not bound to the exact Packet receiver and content hash.`)
  }
  if (ack.outcome !== 'accepted' && !ack.reason?.trim()) {
    throw new Error(`Handoff ACK ${ack.ackId} requires a reason.`)
  }
}

export function workspacePacketMirrorRows(
  state: WorkspacePacketStoreState,
  grants: ReadonlyArray<ApprovalGrantRecord> = [],
): WorkspacePacketMirrorRows {
  const packets = state.packets.map((packet) => {
    const parsed = safeParseWorkspacePacket(packet)
    if (!parsed.success) throw new Error(`Packet ${packet.packetId} failed strict mirror validation.`)
    return parsed.data
  })
  assertUnique(packets.map((packet) => packet.packetId), 'Packet ID')
  assertUnique(packets.map((packet) => packet.idempotencyKey), 'Packet idempotency key')
  assertUnique(packets.map((packet) => `${packet.packetLineageId}:${packet.revision}`), 'Packet lineage revision')
  const packetById = new Map(packets.map((packet) => [packet.packetId, packet]))

  let checkedEvents: Array<WorkspacePacketLifecycleEvent> = []
  for (const event of state.events) {
    const packet = packetById.get(event.packetId)
    if (!packet) throw new Error(`Lifecycle event ${event.eventId} references an unknown Packet.`)
    checkedEvents = appendWorkspacePacketLifecycleEvent(checkedEvents, event, packet)
  }
  assertUnique(checkedEvents.map((event) => event.eventId), 'lifecycle event ID')

  for (const ack of state.acks) {
    const packet = packetById.get(ack.packetId)
    if (!packet) throw new Error(`Handoff ACK ${ack.ackId} references an unknown Packet.`)
    assertAckBinding(ack, packet)
  }
  assertUnique(state.acks.map((ack) => ack.ackId), 'ACK ID')

  const parsedGrants = grants.map((record) => ApprovalGrantRecordSchema.parse(record))
  assertUnique(parsedGrants.map((record) => record.payload.grantId), 'ApprovalGrant ID')
  for (const record of parsedGrants) {
    const packet = packetById.get(record.payload.costRiskLockPacketId)
    if (!packet || packet.contentHash !== record.payload.costRiskLockContentHash) {
      throw new Error(`ApprovalGrant ${record.payload.grantId} is not bound to an exact mirrored CostRiskLock Packet.`)
    }
  }

  return {
    packets: packets.map(packetRow),
    events: checkedEvents.map(eventRow),
    acks: state.acks.map(ackRow),
    grants: parsedGrants.map(grantRow),
  }
}

function workspacePacketMirrorConfig(): SupabaseConfig | null {
  if (readWorkspaceDbEnv('WORKSPACE_PACKET_SUPABASE_MIRROR_ENABLED') !== '1') return null
  return getWorkspaceSupabaseConfig()
}

async function upsertRows<TRow>(
  config: SupabaseConfig,
  table: string,
  conflictColumn: string,
  selectColumns: string,
  rows: ReadonlyArray<TRow>,
): Promise<Array<TRow>> {
  if (rows.length === 0) return []
  return workspaceSupabaseJson<TRow>(
    config,
    'workspace_core',
    `${table}?on_conflict=${conflictColumn}&select=${selectColumns}`,
    {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows),
    },
  )
}

function assertPacketReadback(expected: ReadonlyArray<WorkspacePacketRow>, actual: ReadonlyArray<WorkspacePacketRow>) {
  if (actual.length !== expected.length) throw new Error('Supabase Packet readback count does not match the local commit.')
  const actualById = new Map(actual.map((row) => [row.packet_id, row]))
  for (const expectedRow of expected) {
    const row = actualById.get(expectedRow.packet_id)
    const parsed = row ? safeParseWorkspacePacket(row.envelope) : null
    if (
      !row
      || !parsed?.success
      || row.idempotency_key !== expectedRow.idempotency_key
      || row.content_hash !== expectedRow.content_hash
      || parsed.data.packetId !== expectedRow.packet_id
      || parsed.data.contentHash !== expectedRow.content_hash
      || !canonicalRecordMatches(expectedRow.envelope, parsed.data)
    ) {
      throw new Error(`Supabase Packet readback diverged for ${expectedRow.packet_id}.`)
    }
  }
}

function canonicalRecordMatches(expected: unknown, actual: unknown) {
  try {
    return canonicalizeWorkspacePacketContent(expected) === canonicalizeWorkspacePacketContent(actual)
  } catch {
    return false
  }
}

function assertEventReadback(expected: ReadonlyArray<WorkspacePacketEventRow>, actual: ReadonlyArray<WorkspacePacketEventRow>) {
  if (actual.length !== expected.length) throw new Error('Supabase lifecycle-event readback count does not match the local commit.')
  const actualById = new Map(actual.map((row) => [row.event_id, row]))
  for (const expectedRow of expected) {
    const row = actualById.get(expectedRow.event_id)
    if (!row || !canonicalRecordMatches(expectedRow.event_record, row.event_record)) {
      throw new Error(`Supabase lifecycle-event readback diverged for ${expectedRow.event_id}.`)
    }
  }
}

function assertAckReadback(expected: ReadonlyArray<WorkspaceHandoffAckRow>, actual: ReadonlyArray<WorkspaceHandoffAckRow>) {
  if (actual.length !== expected.length) throw new Error('Supabase ACK readback count does not match the local commit.')
  const actualById = new Map(actual.map((row) => [row.ack_id, row]))
  for (const expectedRow of expected) {
    const row = actualById.get(expectedRow.ack_id)
    if (!row || !canonicalRecordMatches(expectedRow.ack_record, row.ack_record)) {
      throw new Error(`Supabase ACK readback diverged for ${expectedRow.ack_id}.`)
    }
  }
}

function assertGrantReadback(expected: ReadonlyArray<WorkspaceApprovalGrantRow>, actual: ReadonlyArray<WorkspaceApprovalGrantRow>) {
  if (actual.length !== expected.length) throw new Error('Supabase ApprovalGrant readback count does not match the local commit.')
  const actualById = new Map(actual.map((row) => [row.grant_id, row]))
  for (const expectedRow of expected) {
    const row = actualById.get(expectedRow.grant_id)
    const parsed = row ? ApprovalGrantRecordSchema.safeParse(row.grant_record) : null
    if (
      !row
      || !parsed?.success
      || row.status !== expectedRow.status
      || !canonicalRecordMatches(expectedRow.grant_record, parsed.data)
    ) {
      throw new Error(`Supabase ApprovalGrant readback diverged for ${expectedRow.grant_id}.`)
    }
  }
}

export async function mirrorWorkspacePacketStoreAfterLocalCommit(
  state: WorkspacePacketStoreState,
  grants: ReadonlyArray<ApprovalGrantRecord> = [],
): Promise<{ state: WorkspacePacketStoreState; persistence: WorkspacePacketPersistenceSnapshot }> {
  const config = workspacePacketMirrorConfig()
  if (!config) {
    return {
      state,
      persistence: {
        ...disabledSnapshot(state.stateVersion),
        ...countsFor(state, grants),
      },
    }
  }

  try {
    const rows = workspacePacketMirrorRows(state, grants)
    const packetReadback = await upsertRows(
      config,
      'packets',
      'packet_id',
      'packet_id,idempotency_key,content_hash,envelope',
      rows.packets,
    )
    assertPacketReadback(rows.packets, packetReadback)
    const eventReadback = await upsertRows(
      config,
      'packet_lifecycle_events',
      'event_id',
      'event_id,event_record',
      rows.events,
    )
    assertEventReadback(rows.events, eventReadback)
    const ackReadback = await upsertRows(config, 'handoff_acks', 'ack_id', 'ack_id,ack_record', rows.acks)
    assertAckReadback(rows.acks, ackReadback)
    const grantReadback = await upsertRows(
      config,
      'approval_grants',
      'grant_id',
      'grant_id,status,grant_record',
      rows.grants,
    )
    assertGrantReadback(rows.grants, grantReadback)

    return {
      state,
      persistence: {
        provider: 'supabase',
        enabled: true,
        liveSource: true,
        writebackAllowed: true,
        status: 'connected',
        readback: `Supabase Packet mirror verified ${rows.packets.length} Packet${rows.packets.length === 1 ? '' : 's'}, ${rows.events.length} lifecycle event${rows.events.length === 1 ? '' : 's'}, ${rows.acks.length} ACK${rows.acks.length === 1 ? '' : 's'} and ${rows.grants.length} ApprovalGrant${rows.grants.length === 1 ? '' : 's'}.`,
        ...countsFor(state, grants),
        stateVersion: state.stateVersion,
        lastSyncedAtMs: Date.now(),
      },
    }
  } catch (error) {
    return { state, persistence: errorSnapshot(error, state, grants) }
  }
}
