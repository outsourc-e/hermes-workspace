import { assertWarRoomAgentCanReceiveNewAssignment } from '../../war-room/body/worker-profiles'
import { canonicalizeWorkspacePacketContent, workspacePacketContentHash } from './canonical-json'
import { parseWorkspacePacket } from './schemas'
import { createWorkspacePacketRandomId } from './types'
import type { UniversalPacketEnvelope } from './types'

export type WorkspacePacketFactoryOptions = {
  createId?: () => string
  now?: () => Date
}

export type CreateWorkspacePacketInput<TPayload> = Omit<
  UniversalPacketEnvelope<TPayload>,
  'packetId' | 'packetLineageId' | 'revision' | 'supersedesPacketId' | 'createdAt' | 'contentHash'
> & {
  packetId?: string
  packetLineageId?: string
  createdAt?: string
}

type RevisableWorkspacePacketFields<TPayload> = Pick<
  UniversalPacketEnvelope<TPayload>,
  | 'schemaVersion'
  | 'sourceRefs'
  | 'evidenceRefs'
  | 'assumptions'
  | 'missingFields'
  | 'lockedActions'
  | 'approval'
  | 'acceptanceCriteria'
  | 'payload'
>

export type ReviseWorkspacePacketInput<TPayload> = Partial<RevisableWorkspacePacketFields<TPayload>> & {
  packetId?: string
  createdAt?: string
  idempotencyKey: string
}

function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalizeWorkspacePacketContent(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return Object.freeze(value)
}

export function assertWorkspacePacketRoutingAllowed(
  packet: Pick<UniversalPacketEnvelope, 'from' | 'to'>,
) {
  if (packet.from.agentId) assertWarRoomAgentCanReceiveNewAssignment(packet.from.agentId)
  if (packet.to.agentId) assertWarRoomAgentCanReceiveNewAssignment(packet.to.agentId)
}

function finalizedPacket<TPayload>(content: Omit<UniversalPacketEnvelope<TPayload>, 'contentHash'>) {
  const clonedContent = cloneCanonical(content)
  const contentHash = workspacePacketContentHash(clonedContent)
  const parsed = parseWorkspacePacket({ ...clonedContent, contentHash }) as UniversalPacketEnvelope<TPayload>
  return deepFreeze(parsed)
}

export function createWorkspacePacket<TPayload>(
  input: CreateWorkspacePacketInput<TPayload>,
  options: WorkspacePacketFactoryOptions = {},
): UniversalPacketEnvelope<TPayload> {
  assertWorkspacePacketRoutingAllowed(input)
  const {
    packetId: requestedPacketId,
    packetLineageId: requestedLineageId,
    createdAt: requestedCreatedAt,
    ...base
  } = input
  const packetId = requestedPacketId ?? options.createId?.() ?? createWorkspacePacketRandomId()
  const packetLineageId = requestedLineageId ?? packetId
  const createdAt = requestedCreatedAt ?? (options.now?.() ?? new Date()).toISOString()

  return finalizedPacket({
    ...base,
    packetId,
    packetLineageId,
    revision: 1,
    supersedesPacketId: null,
    createdAt,
  })
}

export function reviseWorkspacePacket<TPayload>(
  previous: UniversalPacketEnvelope<TPayload>,
  input: ReviseWorkspacePacketInput<TPayload>,
  options: WorkspacePacketFactoryOptions = {},
): UniversalPacketEnvelope<TPayload> {
  assertWorkspacePacketRoutingAllowed(previous)
  const packetId = input.packetId ?? options.createId?.() ?? createWorkspacePacketRandomId()
  const createdAt = input.createdAt ?? (options.now?.() ?? new Date()).toISOString()

  return finalizedPacket({
    packetId,
    packetLineageId: previous.packetLineageId,
    revision: previous.revision + 1,
    supersedesPacketId: previous.packetId,
    runId: previous.runId,
    schemaVersion: input.schemaVersion ?? previous.schemaVersion,
    packetType: previous.packetType,
    from: previous.from,
    to: previous.to,
    createdAt,
    sourceRefs: input.sourceRefs ?? previous.sourceRefs,
    evidenceRefs: input.evidenceRefs ?? previous.evidenceRefs,
    assumptions: input.assumptions ?? previous.assumptions,
    missingFields: input.missingFields ?? previous.missingFields,
    lockedActions: input.lockedActions ?? previous.lockedActions,
    approval: input.approval ?? previous.approval,
    acceptanceCriteria: input.acceptanceCriteria ?? previous.acceptanceCriteria,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload ?? previous.payload,
  })
}
