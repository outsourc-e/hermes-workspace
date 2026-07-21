import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  HANDOFF_ACK_OUTCOMES,
  WorkspacePacketIdempotencyConflictError,
} from './ack'
import { canonicalizeWorkspacePacketContent, sha256Hex, workspacePacketContentHash } from './canonical-json'
import { OpportunityPayloadSchema } from './domain/opportunity'
import { assertSingleRunReadbackLineage } from './domain/run-readback'
import {
  WORKSPACE_PACKET_LIFECYCLE_EVENT_TYPES,
  appendWorkspacePacketLifecycleEvent,
} from './lifecycle'
import { parseWorkspacePacket } from './schemas'
import type { WorkspacePacketLifecycleEvent } from './lifecycle'
import type { HandoffAck } from './ack'
import type { UniversalPacketEnvelope } from './types'

export const WORKSPACE_PACKET_STORE_SCHEMA_VERSION = 'workspace-packet-store-v1'
export const WORKSPACE_PACKET_STORE_DIR = path.join(process.cwd(), 'data', 'workspace-kernel')
export const WORKSPACE_PACKET_SNAPSHOT_FILE = 'packets-v1.json'
export const WORKSPACE_PACKET_EVENTS_FILE = 'packet-events-v1.jsonl'
export const WORKSPACE_PACKET_ACKS_FILE = 'handoff-acks-v1.jsonl'
const WORKSPACE_PACKET_STORE_LOCK_FILE = 'workspace-packet-store-v1.lock'
const WORKSPACE_PACKET_SIDECAR_HEADER = 'workspace-packet-sidecar-v1'
export const WORKSPACE_PACKET_MAX_PACKETS = 500
export const WORKSPACE_PACKET_MAX_EVENTS = 2_000
export const WORKSPACE_PACKET_MAX_ACKS = 1_000

export type WorkspacePacketStoreState = {
  schemaVersion: typeof WORKSPACE_PACKET_STORE_SCHEMA_VERSION
  stateVersion: string
  updatedAtMs: number
  activeRunIds: Array<string>
  packets: Array<UniversalPacketEnvelope>
  events: Array<WorkspacePacketLifecycleEvent>
  acks: Array<HandoffAck>
}

export type WorkspacePacketStoreDiagnostic = {
  code: 'CORRUPT_PACKET_STORE'
  path: string
  message: string
}

export type WorkspacePacketStoreLoadResult =
  | { ok: true; state: WorkspacePacketStoreState }
  | { ok: false; diagnostic: WorkspacePacketStoreDiagnostic }

export type WorkspacePacketStoreOptions = {
  rootDir?: string
  nowMs?: number
  maxPackets?: number
  maxEvents?: number
  maxAcks?: number
  lockTimeoutMs?: number
  retryDelayMs?: number
}

export type PersistWorkspacePacketStoreInput = {
  packets?: Array<UniversalPacketEnvelope>
  events?: Array<WorkspacePacketLifecycleEvent>
  acks?: Array<HandoffAck>
  activePacketIds?: Array<string>
  activateRunIds?: Array<string>
  deactivateRunIds?: Array<string>
}

export class WorkspacePacketStoreConflictError extends Error {
  readonly code = 'WORKSPACE_PACKET_STORE_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'WorkspacePacketStoreConflictError'
  }
}

export class WorkspacePacketStoreCorruptError extends Error {
  readonly code = 'CORRUPT_PACKET_STORE'
  readonly diagnostic: WorkspacePacketStoreDiagnostic

  constructor(diagnostic: WorkspacePacketStoreDiagnostic) {
    super(`Refusing to overwrite corrupt Workspace Packet store: ${diagnostic.message}`)
    this.name = 'WorkspacePacketStoreCorruptError'
    this.diagnostic = diagnostic
  }
}

function storeDir(options?: WorkspacePacketStoreOptions) {
  return options?.rootDir ?? process.env.WORKSPACE_PACKET_STORE_DIR ?? WORKSPACE_PACKET_STORE_DIR
}

function snapshotPath(options?: WorkspacePacketStoreOptions) {
  return path.join(storeDir(options), WORKSPACE_PACKET_SNAPSHOT_FILE)
}

function eventsPath(options?: WorkspacePacketStoreOptions) {
  return path.join(storeDir(options), WORKSPACE_PACKET_EVENTS_FILE)
}

function acksPath(options?: WorkspacePacketStoreOptions) {
  return path.join(storeDir(options), WORKSPACE_PACKET_ACKS_FILE)
}

function lockPath(options?: WorkspacePacketStoreOptions) {
  return path.join(storeDir(options), WORKSPACE_PACKET_STORE_LOCK_FILE)
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isAlreadyExists(error: unknown) {
  return isObject(error) && error.code === 'EEXIST'
}

async function withWorkspacePacketStoreLock<T>(
  options: WorkspacePacketStoreOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const rootDir = storeDir(options)
  const filePath = lockPath(options)
  const token = randomUUID()
  const timeoutMs = options.lockTimeoutMs ?? 5_000
  const retryDelayMs = options.retryDelayMs ?? 20
  const startedAt = Date.now()
  await mkdir(rootDir, { recursive: true })
  let acquired = false
  while (!acquired) {
    try {
      const handle = await open(filePath, 'wx')
      try {
        await handle.writeFile(`${JSON.stringify({ token, pid: process.pid })}\n`, 'utf8')
      } finally {
        await handle.close()
      }
      acquired = true
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      if (Date.now() - startedAt >= timeoutMs) {
        throw new WorkspacePacketStoreConflictError('Timed out waiting for the Workspace Packet store lock.')
      }
      await sleep(retryDelayMs)
    }
  }
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  try {
    outcome = { ok: true, value: await operation() }
  } catch (error) {
    outcome = { ok: false, error }
  }
  let releaseError: unknown = null
  try {
    let ownsLock = false
    try {
      const lock = JSON.parse(await readFile(filePath, 'utf8')) as { token?: unknown }
      ownsLock = lock.token === token
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }
    if (!ownsLock) {
      throw new WorkspacePacketStoreConflictError('Workspace Packet store lock ownership changed before release.')
    }
    await unlink(filePath)
  } catch (error) {
    releaseError = error
  }
  if (!outcome.ok && releaseError) {
    throw new AggregateError([outcome.error, releaseError], 'Workspace Packet store operation and lock release both failed.')
  }
  if (!outcome.ok) throw outcome.error
  if (releaseError) throw releaseError
  return outcome.value
}

function stateVersion(nowMs: number) {
  return `${WORKSPACE_PACKET_STORE_SCHEMA_VERSION}:${nowMs}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function committedStateVersion(state: WorkspacePacketStoreState | Record<string, unknown>) {
  const { stateVersion: _stateVersion, ...committedContent } = state
  return `${WORKSPACE_PACKET_STORE_SCHEMA_VERSION}:sha256:${sha256Hex(
    canonicalizeWorkspacePacketContent(committedContent),
  )}`
}

function assertCommittedSnapshotStateVersion(raw: unknown) {
  if (!isObject(raw) || !isNonEmptyString(raw.stateVersion)) {
    throw new WorkspacePacketStoreConflictError('Workspace Packet snapshot is missing a committed stateVersion.')
  }
  const expected = committedStateVersion(raw)
  if (raw.stateVersion !== expected) {
    throw new WorkspacePacketStoreConflictError('Workspace Packet snapshot stateVersion does not match its canonical content.')
  }
}

function isMissingFile(error: unknown) {
  return isObject(error) && error.code === 'ENOENT'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is Array<string> {
  if (!Array.isArray(value)) return false
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isNonEmptyString(value[index])) return false
  }
  return true
}

function isFullIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
}

export function createEmptyWorkspacePacketStoreState(nowMs = Date.now()): WorkspacePacketStoreState {
  return {
    schemaVersion: WORKSPACE_PACKET_STORE_SCHEMA_VERSION,
    stateVersion: stateVersion(nowMs),
    updatedAtMs: nowMs,
    activeRunIds: [],
    packets: [],
    events: [],
    acks: [],
  }
}

function validatePacket(packet: unknown) {
  const parsed = parseWorkspacePacket(packet)
  const actualHash = workspacePacketContentHash(parsed)
  if (actualHash !== parsed.contentHash) {
    throw new WorkspacePacketStoreConflictError(`Packet ${parsed.packetId} contentHash does not match its content.`)
  }
  return parsed
}

function mergeWorkspacePackets(
  existing: ReadonlyArray<UniversalPacketEnvelope>,
  incoming: ReadonlyArray<UniversalPacketEnvelope>,
) {
  const merged: Array<UniversalPacketEnvelope> = []
  const byId = new Map<string, UniversalPacketEnvelope>()
  const byIdempotencyKey = new Map<string, UniversalPacketEnvelope>()
  const byLineageRevision = new Map<string, UniversalPacketEnvelope>()
  const byOpportunityCandidate = new Map<string, UniversalPacketEnvelope>()

  for (const rawPacket of [...existing, ...incoming]) {
    const packet = validatePacket(rawPacket)
    const sameId = byId.get(packet.packetId)
    if (sameId) {
      if (sameId.contentHash !== packet.contentHash) {
        throw new WorkspacePacketStoreConflictError(`Packet ID conflict: ${packet.packetId}.`)
      }
      continue
    }

    const sameIdempotencyKey = byIdempotencyKey.get(packet.idempotencyKey)
    if (sameIdempotencyKey) {
      if (sameIdempotencyKey.contentHash !== packet.contentHash) {
        throw new WorkspacePacketIdempotencyConflictError(
          packet.idempotencyKey,
          sameIdempotencyKey.contentHash,
          packet.contentHash,
        )
      }
      continue
    }

    const lineageRevisionKey = `${packet.packetLineageId}:${packet.revision}`
    const sameLineageRevision = byLineageRevision.get(lineageRevisionKey)
    if (sameLineageRevision) {
      throw new WorkspacePacketStoreConflictError(
        `Packet lineage/revision conflict: ${lineageRevisionKey} is already ${sameLineageRevision.packetId}.`,
      )
    }

    if (packet.packetType === 'run-readback') {
      assertSingleRunReadbackLineage(merged, packet)
    }
    if (packet.packetType === 'opportunity') {
      const payload = OpportunityPayloadSchema.parse(packet.payload)
      const candidateKey = `${payload.researchBatchId}:${payload.candidate.candidateId}`
      const sameCandidate = byOpportunityCandidate.get(candidateKey)
      if (sameCandidate && sameCandidate.packetLineageId !== packet.packetLineageId) {
        throw new WorkspacePacketStoreConflictError(
          `Opportunity candidate conflict: ${candidateKey} already belongs to lineage ${sameCandidate.packetLineageId}.`,
        )
      }
      if (!sameCandidate) byOpportunityCandidate.set(candidateKey, packet)
    }

    byId.set(packet.packetId, packet)
    byIdempotencyKey.set(packet.idempotencyKey, packet)
    byLineageRevision.set(lineageRevisionKey, packet)
    merged.push(packet)
  }

  for (const packet of merged) {
    if (packet.revision === 1) continue
    const parent = packet.supersedesPacketId ? byId.get(packet.supersedesPacketId) : undefined
    if (!parent) {
      throw new WorkspacePacketStoreConflictError(
        `Packet revision ${packet.packetId} references a missing parent: ${packet.supersedesPacketId ?? 'none'}.`,
      )
    }
    if (
      parent.packetLineageId !== packet.packetLineageId
      || parent.revision !== packet.revision - 1
      || parent.runId !== packet.runId
      || parent.packetType !== packet.packetType
    ) {
      throw new WorkspacePacketStoreConflictError(
        `Packet revision ${packet.packetId} does not directly supersede revision ${packet.revision - 1} in the same lineage, run, and type.`,
      )
    }
  }

  return merged
}

function retainPackets(
  packets: ReadonlyArray<UniversalPacketEnvelope>,
  activePacketIds: ReadonlyArray<string>,
  maxPackets: number,
) {
  const activeIds = new Set(activePacketIds)
  const byLineage = new Map<string, Array<UniversalPacketEnvelope>>()
  for (const packet of packets) {
    const lineage = byLineage.get(packet.packetLineageId) ?? []
    lineage.push(packet)
    byLineage.set(packet.packetLineageId, lineage)
  }
  const lineages = [...byLineage.values()].map((lineage) => (
    lineage.sort((left, right) => left.revision - right.revision)
  ))
  const activeLineages = lineages.filter((lineage) => lineage.some((packet) => activeIds.has(packet.packetId)))
  const inactiveNewestFirst = lineages
    .filter((lineage) => !lineage.some((packet) => activeIds.has(packet.packetId)))
    .sort((left, right) => (
      Date.parse(right.at(-1)?.createdAt ?? '') - Date.parse(left.at(-1)?.createdAt ?? '')
    ))
  const retained = activeLineages.flat()
  for (const lineage of inactiveNewestFirst) {
    if (retained.length + lineage.length > maxPackets) continue
    retained.push(...lineage)
  }
  return retained.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
}

function mergeEvents(
  events: ReadonlyArray<unknown>,
  packets: ReadonlyArray<UniversalPacketEnvelope>,
) {
  let merged: Array<WorkspacePacketLifecycleEvent> = []
  const packetById = new Map(packets.map((packet) => [packet.packetId, packet]))
  for (const rawEvent of events) {
    if (!isObject(rawEvent)
      || !isNonEmptyString(rawEvent.eventId)
      || !isNonEmptyString(rawEvent.packetId)
      || !WORKSPACE_PACKET_LIFECYCLE_EVENT_TYPES.includes(rawEvent.type as WorkspacePacketLifecycleEvent['type'])
      || !isNonEmptyString(rawEvent.actorRoomId)
      || !(isNonEmptyString(rawEvent.actorAgentId) || rawEvent.actorAgentId === null)
      || !isFullIsoTimestamp(rawEvent.createdAt)
      || !(isNonEmptyString(rawEvent.reason) || rawEvent.reason === null)
      || !isObject(rawEvent.payload)) {
      throw new WorkspacePacketStoreConflictError('Invalid Workspace Packet lifecycle event in store.')
    }
    const event = rawEvent as WorkspacePacketLifecycleEvent
    const packet = packetById.get(event.packetId)
    if (!packet) {
      throw new WorkspacePacketStoreConflictError(`Lifecycle event references unknown Packet: ${event.packetId}.`)
    }
    merged = appendWorkspacePacketLifecycleEvent(merged, event, packet)
  }
  return merged
}

function validateAck(raw: unknown): HandoffAck {
  if (!isObject(raw)
    || !isNonEmptyString(raw.ackId)
    || !isNonEmptyString(raw.packetId)
    || typeof raw.acceptedContentHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(raw.acceptedContentHash)
    || !isObject(raw.receiver)
    || !isNonEmptyString(raw.receiver.roomId)
    || !(isNonEmptyString(raw.receiver.agentId) || raw.receiver.agentId === null)
    || !HANDOFF_ACK_OUTCOMES.includes(raw.outcome as HandoffAck['outcome'])
    || !isStringArray(raw.checkedCriteriaIds)
    || !isStringArray(raw.missingFields)
    || !isStringArray(raw.evidenceRefs)
    || !(isNonEmptyString(raw.reason) || raw.reason === null)
    || !isFullIsoTimestamp(raw.createdAt)) {
    throw new WorkspacePacketStoreConflictError('Invalid Handoff ACK in store.')
  }
  return raw as HandoffAck
}

function mergeAcks(acks: ReadonlyArray<HandoffAck>) {
  const merged: Array<HandoffAck> = []
  const byId = new Map<string, HandoffAck>()
  for (const rawAck of acks) {
    const ack = validateAck(rawAck)
    const existing = byId.get(ack.ackId)
    if (existing) {
      if (canonicalizeWorkspacePacketContent(existing) !== canonicalizeWorkspacePacketContent(ack)) {
        throw new WorkspacePacketStoreConflictError(`Handoff ackId conflict: ${ack.ackId}.`)
      }
      continue
    }
    byId.set(ack.ackId, ack)
    merged.push(ack)
  }
  return merged
}

function validateAckEventBindings(
  packets: ReadonlyArray<UniversalPacketEnvelope>,
  events: ReadonlyArray<WorkspacePacketLifecycleEvent>,
  acks: ReadonlyArray<HandoffAck>,
) {
  const packetById = new Map(packets.map((packet) => [packet.packetId, packet]))
  const ackById = new Map(acks.map((ack) => [ack.ackId, ack]))
  const boundAckIds = new Set<string>()
  for (const ack of acks) {
    const packet = packetById.get(ack.packetId)
    if (!packet) throw new WorkspacePacketStoreConflictError(`Handoff ACK references unknown Packet: ${ack.packetId}.`)
    if (
      ack.acceptedContentHash !== packet.contentHash
      || ack.receiver.roomId !== packet.to.roomId
      || ack.receiver.agentId !== packet.to.agentId
    ) {
      throw new WorkspacePacketStoreConflictError(`Handoff ACK ${ack.ackId} is not bound to the exact Packet receiver and content hash.`)
    }
    if (ack.outcome === 'accepted') {
      const requiredCriteriaIds = packet.acceptanceCriteria
        .filter((criterion) => criterion.required)
        .map((criterion) => criterion.criterionId)
      if (
        packet.missingFields.length > 0
        || ack.missingFields.length > 0
        || requiredCriteriaIds.some((criterionId) => !ack.checkedCriteriaIds.includes(criterionId))
      ) {
        throw new WorkspacePacketStoreConflictError(`Accepted Handoff ACK ${ack.ackId} does not prove all required criteria.`)
      }
    } else if (!ack.reason?.trim()) {
      throw new WorkspacePacketStoreConflictError(`Handoff ACK ${ack.ackId} requires a reason.`)
    }
  }
  for (const event of events) {
    if (!HANDOFF_ACK_OUTCOMES.includes(event.type as HandoffAck['outcome'])) continue
    const ackId = event.payload.ackId
    const acceptedContentHash = event.payload.acceptedContentHash
    const ack = typeof ackId === 'string' ? ackById.get(ackId) : undefined
    if (!ack) {
      throw new WorkspacePacketStoreConflictError(`Lifecycle event ${event.eventId} references a missing Handoff ACK.`)
    }
    if (
      boundAckIds.has(ack.ackId)
      || ack.packetId !== event.packetId
      || ack.outcome !== event.type
      || ack.createdAt !== event.createdAt
      || ack.receiver.roomId !== event.actorRoomId
      || ack.receiver.agentId !== event.actorAgentId
      || acceptedContentHash !== ack.acceptedContentHash
    ) {
      throw new WorkspacePacketStoreConflictError(`Lifecycle event ${event.eventId} does not match Handoff ACK ${ack.ackId}.`)
    }
    boundAckIds.add(ack.ackId)
  }
  for (const ack of acks) {
    if (!boundAckIds.has(ack.ackId)) {
      throw new WorkspacePacketStoreConflictError(`Handoff ACK ${ack.ackId} has no matching lifecycle event.`)
    }
  }
}

function activePacketIdsForRuns(
  packets: ReadonlyArray<UniversalPacketEnvelope>,
  activeRunIds: ReadonlyArray<string>,
  explicitPacketIds: ReadonlyArray<string> = [],
) {
  const activeRuns = new Set(activeRunIds)
  return [...new Set([
    ...explicitPacketIds,
    ...packets.filter((packet) => activeRuns.has(packet.runId)).map((packet) => packet.packetId),
  ])]
}

function normalizeState(
  raw: unknown,
  nowMs: number,
  options: WorkspacePacketStoreOptions = {},
  activePacketIds: ReadonlyArray<string> = [],
): WorkspacePacketStoreState {
  if (!isObject(raw)
    || raw.schemaVersion !== WORKSPACE_PACKET_STORE_SCHEMA_VERSION
    || !isStringArray(raw.activeRunIds)
    || !Array.isArray(raw.packets)
    || !Array.isArray(raw.events)
    || !Array.isArray(raw.acks)) {
    throw new WorkspacePacketStoreConflictError('Snapshot is not workspace-packet-store-v1.')
  }

  const activeRunIds = [...new Set(raw.activeRunIds)]
  const mergedPackets = mergeWorkspacePackets([], raw.packets as Array<UniversalPacketEnvelope>)
  const retainedActivePacketIds = activePacketIdsForRuns(mergedPackets, activeRunIds, activePacketIds)
  const packets = retainPackets(
    mergedPackets,
    retainedActivePacketIds,
    options.maxPackets ?? WORKSPACE_PACKET_MAX_PACKETS,
  )
  const allEvents = mergeEvents(raw.events, mergedPackets)
  const allAcks = mergeAcks(raw.acks as Array<HandoffAck>)
  validateAckEventBindings(mergedPackets, allEvents, allAcks)
  const retainedPacketIds = new Set(packets.map((packet) => packet.packetId))
  const events = allEvents.filter((event) => retainedPacketIds.has(event.packetId))
  const acks = allAcks.filter((ack) => retainedPacketIds.has(ack.packetId))

  return {
    schemaVersion: WORKSPACE_PACKET_STORE_SCHEMA_VERSION,
    stateVersion: typeof raw.stateVersion === 'string' ? raw.stateVersion : stateVersion(nowMs),
    updatedAtMs: typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs) ? raw.updatedAtMs : nowMs,
    activeRunIds,
    packets,
    events,
    acks,
  }
}

function sidecarText(stateVersionValue: string, records: ReadonlyArray<unknown>) {
  const recordsHash = sha256Hex(canonicalizeWorkspacePacketContent(records))
  return [
    JSON.stringify({
      contractVersion: WORKSPACE_PACKET_SIDECAR_HEADER,
      stateVersion: stateVersionValue,
      recordsHash,
    }),
    ...records.map((record) => JSON.stringify(record)),
  ].join('\n') + '\n'
}

async function verifyCommittedSidecar(
  filePath: string,
  stateVersionValue: string,
  expectedRecords: ReadonlyArray<unknown>,
) {
  const text = await readFile(filePath, 'utf8')
  const rows = text.split('\n').filter((row) => row.trim().length > 0).map((row) => JSON.parse(row) as unknown)
  const first = rows[0]
  if (!isObject(first) || first.contractVersion !== WORKSPACE_PACKET_SIDECAR_HEADER) {
    if (canonicalizeWorkspacePacketContent(rows) !== canonicalizeWorkspacePacketContent(expectedRecords)) {
      throw new WorkspacePacketStoreConflictError(`Legacy Workspace Packet sidecar diverges from committed snapshot: ${filePath}.`)
    }
    return
  }
  if (first.stateVersion !== stateVersionValue) {
    throw new WorkspacePacketStoreConflictError(`Committed Workspace Packet sidecar stateVersion does not match snapshot: ${filePath}.`)
  }
  const records = rows.slice(1)
  const expectedHash = sha256Hex(canonicalizeWorkspacePacketContent(records))
  if (
    first.recordsHash !== expectedHash
    || canonicalizeWorkspacePacketContent(records) !== canonicalizeWorkspacePacketContent(expectedRecords)
  ) {
    throw new WorkspacePacketStoreConflictError(`Committed Workspace Packet sidecar diverges from snapshot: ${filePath}.`)
  }
}

export async function loadWorkspacePacketStore(
  options: WorkspacePacketStoreOptions = {},
): Promise<WorkspacePacketStoreLoadResult> {
  const nowMs = options.nowMs ?? Date.now()
  const filePath = snapshotPath(options)
  try {
    const text = await readFile(filePath, 'utf8')
    const raw = JSON.parse(text) as unknown
    assertCommittedSnapshotStateVersion(raw)
    const state = normalizeState(raw, nowMs, {
      ...options,
      maxPackets: Number.MAX_SAFE_INTEGER,
      maxEvents: Number.MAX_SAFE_INTEGER,
      maxAcks: Number.MAX_SAFE_INTEGER,
    })
    await verifyCommittedSidecar(eventsPath(options), state.stateVersion, state.events)
    await verifyCommittedSidecar(acksPath(options), state.stateVersion, state.acks)
    return { ok: true, state }
  } catch (error) {
    if (isMissingFile(error) && isObject(error) && error.path === filePath) {
      return { ok: true, state: createEmptyWorkspacePacketStoreState(nowMs) }
    }
    return {
      ok: false,
      diagnostic: {
        code: 'CORRUPT_PACKET_STORE',
        path: filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function atomicWriteText(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tempPath, value, 'utf8')
  await rename(tempPath, filePath)
}

async function saveWorkspacePacketStoreUnlocked(
  state: WorkspacePacketStoreState,
  options: WorkspacePacketStoreOptions,
  activePacketIds: ReadonlyArray<string> = [],
): Promise<WorkspacePacketStoreState> {
  const loaded = await loadWorkspacePacketStore(options)
  if (!loaded.ok) throw new WorkspacePacketStoreCorruptError(loaded.diagnostic)
  const nowMs = options.nowMs ?? Date.now()
  const normalizedState = normalizeState({
    ...state,
    schemaVersion: WORKSPACE_PACKET_STORE_SCHEMA_VERSION,
    stateVersion: stateVersion(nowMs),
    updatedAtMs: nowMs,
  }, nowMs, options, activePacketIds)
  const normalized = {
    ...normalizedState,
    stateVersion: committedStateVersion(normalizedState),
  }

  await atomicWriteText(eventsPath(options), sidecarText(normalized.stateVersion, normalized.events))
  await atomicWriteText(acksPath(options), sidecarText(normalized.stateVersion, normalized.acks))
  await atomicWriteText(snapshotPath(options), `${JSON.stringify(normalized, null, 2)}\n`)
  return normalized
}

export async function saveWorkspacePacketStore(
  state: WorkspacePacketStoreState,
  options: WorkspacePacketStoreOptions = {},
): Promise<WorkspacePacketStoreState> {
  return withWorkspacePacketStoreLock(options, () => (
    saveWorkspacePacketStoreUnlocked(state, options)
  ))
}

export async function persistWorkspacePacketStore(
  input: PersistWorkspacePacketStoreInput,
  options: WorkspacePacketStoreOptions = {},
): Promise<WorkspacePacketStoreState> {
  return withWorkspacePacketStoreLock(options, async () => {
    const loaded = await loadWorkspacePacketStore(options)
    if (!loaded.ok) throw new WorkspacePacketStoreCorruptError(loaded.diagnostic)

    const nowMs = options.nowMs ?? Date.now()
    const mergedPackets = mergeWorkspacePackets(loaded.state.packets, input.packets ?? [])
    const mergedEvents = mergeEvents([...loaded.state.events, ...(input.events ?? [])], mergedPackets)
    const mergedAcks = mergeAcks([...loaded.state.acks, ...(input.acks ?? [])])
    validateAckEventBindings(mergedPackets, mergedEvents, mergedAcks)
    const activeRunIds = new Set(loaded.state.activeRunIds)
    for (const runId of input.activateRunIds ?? []) activeRunIds.add(runId)
    for (const runId of input.deactivateRunIds ?? []) activeRunIds.delete(runId)
    const durableActiveRunIds = [...activeRunIds]
    const activePacketIds = activePacketIdsForRuns(
      mergedPackets,
      durableActiveRunIds,
      input.activePacketIds ?? [],
    )
    const packets = retainPackets(
      mergedPackets,
      activePacketIds,
      options.maxPackets ?? WORKSPACE_PACKET_MAX_PACKETS,
    )
    const retainedPacketIds = new Set(packets.map((packet) => packet.packetId))
    const events = mergedEvents.filter((event) => retainedPacketIds.has(event.packetId))
    const acks = mergedAcks.filter((ack) => retainedPacketIds.has(ack.packetId))

    return saveWorkspacePacketStoreUnlocked({
      schemaVersion: WORKSPACE_PACKET_STORE_SCHEMA_VERSION,
      stateVersion: stateVersion(nowMs),
      updatedAtMs: nowMs,
      activeRunIds: durableActiveRunIds,
      packets,
      events,
      acks,
    }, options, activePacketIds)
  })
}
