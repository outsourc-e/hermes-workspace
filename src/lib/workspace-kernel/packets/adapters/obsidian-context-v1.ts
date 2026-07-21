import { ContextPayloadSchema } from '../domain/context'
import { createWorkspacePacket } from '../factory'
import type { WorkspaceContextPacket } from '../../context-packet'
import type { ContextPayload, ContextRedaction } from '../domain/context'
import type { UniversalPacketEnvelope, WorkspacePacketEndpoint } from '../types'

export type ObsidianContextV1AdapterOptions = {
  runId: string
  executionPlanPacketId: string
  stepId: string
  receiverAgentId: string
  from: WorkspacePacketEndpoint
  packetId?: string
  packetLineageId?: string
}

export type ContextWorkspacePacket = UniversalPacketEnvelope & {
  packetType: 'context'
  payload: ContextPayload
}

const LEGACY_REDACTION: ContextRedaction = {
  state: 'pre_sanitized',
  detail: 'unknown',
}

function required(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required.`)
  return value.trim()
}

function legacyRef(packetId: string) {
  return `legacy-context://${packetId}`
}

function sourceRef(relativePath: string) {
  const value = required(relativePath, 'Obsidian relative path').replaceAll('\\', '/')
  let decoded: string
  try {
    decoded = decodeURIComponent(value).replaceAll('\\', '/')
  } catch {
    throw new Error('Obsidian relative path contains invalid percent encoding.')
  }
  const segments = decoded.split('/')
  if (
    decoded.startsWith('/')
    || /^[a-z]:\//i.test(decoded)
    || decoded.includes('\0')
    || segments.some((segment) => segment === '..' || segment === '.' || segment.length === 0)
  ) {
    throw new Error('Obsidian source path must be a safe vault-relative path.')
  }
  return `obsidian://${value}`
}

function legacyFreshness(observedAt?: string) {
  return {
    policy: 'revalidate_on_use' as const,
    observedAt: observedAt ?? null,
    expiresAt: null,
  }
}

function aggregateSourceId(packetId: string) {
  return `legacy-packet-${packetId}`
}

function aggregateItems(packet: WorkspaceContextPacket) {
  const aggregateFreshness = legacyFreshness(new Date(packet.createdAtMs).toISOString())
  const provenanceRefs = [legacyRef(packet.packetId)]
  const sourceIds = [aggregateSourceId(packet.packetId)]
  const entries = [
    ...packet.decisions.map((content) => ({ kind: 'decision' as const, content })),
    ...packet.safetyRails.map((content) => ({ kind: 'safety_rail' as const, content })),
    ...packet.allowedActions.map((content) => ({ kind: 'allowed_action' as const, content })),
    ...packet.forbiddenActions.map((content) => ({ kind: 'forbidden_action' as const, content })),
    ...packet.artifacts.map((content) => ({ kind: 'artifact' as const, content })),
    ...(packet.blocker ? [{ kind: 'blocker' as const, content: packet.blocker }] : []),
    { kind: 'next_action' as const, content: packet.nextAction },
  ]
  return entries.map((entry, index) => ({
    itemId: `legacy-${entry.kind}-${index + 1}`,
    kind: entry.kind,
    content: entry.content,
    sourceIds,
    provenanceRefs,
    freshness: aggregateFreshness,
    redaction: LEGACY_REDACTION,
  }))
}

export function obsidianContextV1ToWorkspacePacket(
  legacy: WorkspaceContextPacket,
  options: ObsidianContextV1AdapterOptions,
): ContextWorkspacePacket {
  const runId = required(options.runId, 'Run ID')
  const executionPlanPacketId = required(options.executionPlanPacketId, 'ExecutionPlan Packet ID')
  const stepId = required(options.stepId, 'ExecutionPlan Step ID')
  const receiverAgentId = required(options.receiverAgentId, 'Receiver agent ID')
  const createdAt = new Date(legacy.createdAtMs).toISOString()
  if (legacy.sourceNotes.length > 11) {
    throw new Error('Legacy Context adapter supports at most 11 note sources plus its aggregate Packet source.')
  }
  const sources = [
    {
      sourceId: aggregateSourceId(legacy.packetId),
      rank: 1,
      title: 'Legacy Context Packet aggregate',
      kind: 'hot-cache' as const,
      status: 'loaded' as const,
      excerpt: legacy.mission,
      provenanceRefs: [legacyRef(legacy.packetId)],
      freshness: legacyFreshness(createdAt),
      redaction: LEGACY_REDACTION,
    },
    ...legacy.sourceNotes.map((source, index) => ({
      sourceId: source.noteId,
      rank: index + 2,
      title: source.title,
      kind: source.kind,
      status: source.status,
      excerpt: source.excerpt,
      provenanceRefs: [sourceRef(source.relativePath)],
      freshness: legacyFreshness(source.updatedAt),
      redaction: LEGACY_REDACTION,
    })),
  ]
  const payload = ContextPayloadSchema.parse({
    contractVersion: 'context-v1',
    executionPlanPacketId,
    stepId,
    receiver: {
      roomId: legacy.targetRoomId,
      ...(legacy.targetStationId ? { stationId: legacy.targetStationId } : {}),
      agentId: receiverAgentId,
    },
    mission: legacy.mission,
    sources,
    contextItems: aggregateItems(legacy),
    contradictions: [],
    includedScope: legacy.allowedActions.length > 0 ? legacy.allowedActions : ['Legacy Context Packet local review'],
    excludedScope: legacy.forbiddenActions,
    localOnly: true,
    writebackAllowed: false,
  })
  const packet = createWorkspacePacket({
    packetId: options.packetId ?? `packet-${legacy.packetId}`,
    packetLineageId: options.packetLineageId ?? `lineage-${legacy.packetId}`,
    createdAt,
    runId,
    schemaVersion: '1.0.0',
    packetType: 'context',
    from: options.from,
    to: { roomId: legacy.targetRoomId, agentId: receiverAgentId },
    sourceRefs: [...new Set([
      executionPlanPacketId,
      ...sources.flatMap((source) => source.provenanceRefs),
      ...payload.contextItems.flatMap((item) => item.provenanceRefs),
    ])],
    evidenceRefs: sources.filter((source) => source.status === 'loaded').flatMap((source) => source.provenanceRefs),
    assumptions: ['Legacy redaction audit detail is unknown; revalidate context on use.'],
    missingFields: legacy.sourceNotes
      .filter((source) => source.status !== 'loaded')
      .map((source) => `sourceNotes.${source.noteId}:${source.status}`),
    lockedActions: legacy.forbiddenActions,
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'context-step-binding', description: 'Context binds one explicit ExecutionPlan Step and receiver.', required: true },
      { criterionId: 'context-local-only', description: 'Context remains local-only with vault writeback disabled.', required: true },
    ],
    idempotencyKey: `${runId}:context:${legacy.packetId}`,
    payload,
  })
  return packet as ContextWorkspacePacket
}
