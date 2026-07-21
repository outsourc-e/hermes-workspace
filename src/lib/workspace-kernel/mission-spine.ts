import { getWorkspaceBlueprintById } from './blueprints'
import { safeParseWorkspacePacket } from './packets/schemas'
import {
  attachWorkspaceArtifact,
  createWorkspaceApprovalForRun,
  createWorkspaceArtifactForRun,
  createWorkspaceRun,
  requestWorkspaceApproval,
} from './reducer'
import { createWorkspaceAction, routeWorkspaceActionToBlueprint } from './router'
import type { UniversalPacketEnvelope, WorkspacePacketStatus } from './packets/types'
import type { LivingV3AgentId, LivingV3RoomId, LivingV3StationId } from '../war-room/living-v3/living-v3-contract'
import type {
  WorkspaceBlueprintId,
  WorkspaceDomain,
  WorkspaceRun,
  WorkspaceWorkerProfileId,
} from './contracts'

export type WorkspaceMissionSpineStepId =
  | 'idea'
  | 'council'
  | 'hermes_brief'
  | 'routed_room'
  | 'agent_work'
  | 'approval'
  | 'readback'

export type WorkspaceMissionSpineStatus = 'done' | 'active' | 'waiting' | 'blocked' | 'pending' | 'optional'

export type WorkspaceMissionSpineStep = {
  stepId: WorkspaceMissionSpineStepId
  label: string
  status: WorkspaceMissionSpineStatus
  ownerAgentId?: LivingV3AgentId
  roomId?: LivingV3RoomId
  stationId?: LivingV3StationId
  summary: string
  packetId?: string
  dataSource: 'prompt' | 'council' | 'kernel-run' | 'kernel-artifact' | 'approval' | 'readback'
}

export type WorkspacePacketMissionResult = {
  packet: UniversalPacketEnvelope
  status: WorkspacePacketStatus
  missingFields: Array<string>
  statusReason: string | null
}

export type WorkspacePacketMissionRailItem = {
  packetId: string
  runId: string
  packetType: UniversalPacketEnvelope['packetType']
  sender: UniversalPacketEnvelope['from']
  receiver: UniversalPacketEnvelope['to']
  status: WorkspacePacketStatus
  tone: 'done' | 'active' | 'waiting' | 'blocked' | 'muted'
  summary: string
  missingFields: Array<string>
  nextRequiredAction: string
  contentHash: string
  createdAt: string
  approvalGatePersisted: boolean
  approvalStage: string | null
  statusReason: string | null
}

const WORKSPACE_PACKET_STATUSES: ReadonlyArray<WorkspacePacketStatus> = [
  'draft',
  'ready',
  'offered',
  'accepted',
  'blocked',
  'rejected',
  'superseded',
  'cancelled',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isWorkspacePacketStatus(value: unknown): value is WorkspacePacketStatus {
  return typeof value === 'string' && WORKSPACE_PACKET_STATUSES.includes(value as WorkspacePacketStatus)
}

function uniqueStrings(values: ReadonlyArray<unknown>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
}

export function parseWorkspacePacketMissionResults(value: unknown): Array<WorkspacePacketMissionResult> {
  if (!Array.isArray(value)) return []
  const parsed: Array<WorkspacePacketMissionResult> = []
  for (const candidate of value) {
    if (!isRecord(candidate) || !isWorkspacePacketStatus(candidate.status)) continue
    const packet = safeParseWorkspacePacket(candidate.packet)
    if (!packet.success) continue
    const resultMissingFields = Array.isArray(candidate.missingFields) ? candidate.missingFields : []
    parsed.push({
      packet: packet.data,
      status: candidate.status,
      missingFields: uniqueStrings([...packet.data.missingFields, ...resultMissingFields]),
      statusReason: typeof candidate.statusReason === 'string' && candidate.statusReason.trim()
        ? candidate.statusReason.trim()
        : null,
    })
  }
  return parsed
}

function workspacePacketMissionTone(status: WorkspacePacketStatus): WorkspacePacketMissionRailItem['tone'] {
  if (status === 'accepted') return 'done'
  if (status === 'offered') return 'active'
  if (status === 'blocked' || status === 'rejected') return 'blocked'
  if (status === 'draft' || status === 'ready') return 'waiting'
  return 'muted'
}

function workspacePacketNextRequiredAction(result: WorkspacePacketMissionResult) {
  const { packet, status, missingFields, statusReason } = result
  if (packet.approval.required && !packet.approval.grantId) {
    return `Persist the ${packet.approval.stage ?? 'required'} approval gate before any live action.`
  }
  if (missingFields.length > 0) return `Fill: ${missingFields.join(', ')}.`
  switch (status) {
    case 'draft': return 'Mark this Packet ready after its acceptance criteria are checked.'
    case 'ready': return `Offer this Packet to ${packet.to.agentId ?? packet.to.roomId}.`
    case 'offered': return `Receiver must ACK the exact hash ${packet.contentHash.slice(0, 10)}… or block with a reason.`
    case 'accepted': return packet.packetType === 'run-readback'
      ? 'Mission readback is complete.'
      : 'Continue with the next persisted Packet in this run.'
    case 'blocked': return statusReason ? `Resolve blocker: ${statusReason}` : 'Resolve the persisted blocker, then create a new revision.'
    case 'rejected': return statusReason ? `Rejected: ${statusReason}` : 'Create a corrected Packet revision if the mission continues.'
    case 'superseded': return 'Use the newer Packet revision.'
    case 'cancelled': return statusReason ? `Cancelled: ${statusReason}` : 'No action; this Packet was cancelled.'
  }
}

export function buildWorkspacePacketMissionRail(
  results: ReadonlyArray<WorkspacePacketMissionResult>,
): Array<WorkspacePacketMissionRailItem> {
  return [...results]
    .sort((left, right) => (
      Date.parse(left.packet.createdAt) - Date.parse(right.packet.createdAt)
      || left.packet.revision - right.packet.revision
      || left.packet.packetId.localeCompare(right.packet.packetId)
    ))
    .map((result) => {
      const { packet } = result
      const sender = packet.from.agentId ?? packet.from.roomId
      const receiver = packet.to.agentId ?? packet.to.roomId
      return {
        packetId: packet.packetId,
        runId: packet.runId,
        packetType: packet.packetType,
        sender: packet.from,
        receiver: packet.to,
        status: result.status,
        tone: workspacePacketMissionTone(result.status),
        summary: `${sender} → ${receiver}`,
        missingFields: result.missingFields,
        nextRequiredAction: workspacePacketNextRequiredAction(result),
        contentHash: packet.contentHash,
        createdAt: packet.createdAt,
        approvalGatePersisted: packet.approval.required && Boolean(packet.approval.grantId),
        approvalStage: packet.approval.stage,
        statusReason: result.statusReason,
      }
    })
}

export type WorkspaceAgentMindProfile = {
  mindId: string
  label: string
  agentId: LivingV3AgentId
  domain: WorkspaceDomain
  roomId: LivingV3RoomId
  stationIds: Array<LivingV3StationId>
  workerProfileIds: Array<WorkspaceWorkerProfileId>
  focus: string
  contextScope: 'private-focus' | 'shared-filtered' | 'approval-only'
  obsidianAnchors: Array<string>
  isolationRule: string
}

export type WorkspaceCouncilHandoffInput = {
  packetId: string
  topic: string
  verdict: string
  summary: string
  voteLine: string
  prompt: string
}

export const WORKSPACE_AGENT_MIND_PROFILES: Array<WorkspaceAgentMindProfile> = [
  {
    mindId: 'council-strategists',
    label: 'Council strategists',
    agentId: 'julius',
    domain: 'agent-ops',
    roomId: 'council-strategists',
    stationIds: ['council-table'],
    workerProfileIds: ['chatgpt-5-5-manager', 'chatgpt-5-3-fast-worker'],
    focus: 'separate strategic opinions before execution',
    contextScope: 'shared-filtered',
    obsidianAnchors: ['01 Projects/War Room', '06 Hermes/War Room Agents and Automation'],
    isolationRule: 'Council debates direction only; it does not mutate room workbenches or run live actions.',
  },
  {
    mindId: 'hermes-manager',
    label: 'Hermes mission manager',
    agentId: 'hermes',
    domain: 'command',
    roomId: 'olympus-command',
    stationIds: ['command-table', 'mission-router'],
    workerProfileIds: ['hermes-manager'],
    focus: 'turn natural language into a scoped mission brief and route',
    contextScope: 'shared-filtered',
    obsidianAnchors: ['01 Projects/War Room/Universal Workspace Action Wrapper - מקור אמת.md'],
    isolationRule: 'Hermes owns routing and readback; domain workers own execution packets.',
  },
  {
    mindId: 'poseidon-atlantis-vault',
    label: 'Poseidon Atlantis Vault',
    agentId: 'poseidon',
    domain: 'data-vault',
    roomId: 'atlantis-vault',
    stationIds: ['atlantis-index'],
    workerProfileIds: ['controlled-poseidon-vault-v1'],
    focus: 'DB/Obsidian catalog health, approved memory shelves, rejected-item memory, and cleanup readback',
    contextScope: 'shared-filtered',
    obsidianAnchors: ['09 System Snapshots/Discord Rollover/Discord Rollover Index', '01 Projects/War Room', '06 Hermes/War Room Agents and Automation'],
    isolationRule: 'Poseidon centralizes visibility and audit state only; domain workers read their own shelf anchors and do not route every action through him.',
  },
  {
    mindId: 'terra-3d-print',
    label: 'Terra 3D-print operator',
    agentId: 'terra',
    domain: 'cad-3d-print',
    roomId: 'terra-forge',
    stationIds: ['terra-modeling-studio', 'terra-model-hunt', 'terra-printer-control'],
    workerProfileIds: ['controlled-terra-v1', 'codex-ui-builder'],
    focus: '3D modeling, model hunt, slice planning, printer/QA readback',
    contextScope: 'private-focus',
    obsidianAnchors: ['06 Hermes/Terra Forge Workspace Memory.md'],
    isolationRule: 'Terra receives only 3D-print context packets; printer control remains approval-locked.',
  },
  {
    mindId: 'etsy-market-operators',
    label: 'Etsy market operators',
    agentId: 'loki',
    domain: 'etsy',
    roomId: 'etsy-market-lab',
    stationIds: ['etsy-loki-product-hunt', 'etsy-thor-seo-metrics', 'etsy-thor-shotlab-prep', 'etsy-odin-draft-approval'],
    workerProfileIds: ['controlled-hermes-v1', 'controlled-scout-v2'],
    focus: 'product discovery, SEO, ShotLab handoff, draft approval packets',
    contextScope: 'private-focus',
    obsidianAnchors: ['01 Projects/War Room/Etsy Market Lab - מקור אמת נוכחי'],
    isolationRule: 'Etsy operators do not consume Terra printer context and cannot publish/upload without approval.',
  },
  {
    mindId: 'approval-guardian',
    label: 'Approval guardian',
    agentId: 'odin',
    domain: 'approval',
    roomId: 'olympus-command',
    stationIds: ['approval-dais'],
    workerProfileIds: ['hermes-manager'],
    focus: 'money, account, customer, supplier, marketplace, and physical-action gates',
    contextScope: 'approval-only',
    obsidianAnchors: ['01 Projects/War Room/Universal Workspace Action Wrapper - מקור אמת.md'],
    isolationRule: 'Approval mind only previews and blocks/allows; it never performs the live action itself.',
  },
]

function uniqueMinds(minds: Array<WorkspaceAgentMindProfile>) {
  const seen = new Set<string>()
  return minds.filter((mind) => {
    if (seen.has(mind.mindId)) return false
    seen.add(mind.mindId)
    return true
  })
}

function councilPacketIdFor(run: WorkspaceRun | null | undefined) {
  const payload = run?.actionInput.payload
  return typeof payload?.councilPacketId === 'string' ? payload.councilPacketId : undefined
}

export function latestWorkspaceMissionRun(runs: Array<WorkspaceRun>): WorkspaceRun | null {
  if (runs.length === 0) return null
  return [...runs].sort((left, right) => right.updatedAtMs - left.updatedAtMs || right.createdAtMs - left.createdAtMs)[0]
}

export function workspaceAgentMindForBlueprint(blueprintId: WorkspaceBlueprintId) {
  switch (blueprintId) {
    case 'atlantis-vault-governance-v1':
      return WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'poseidon-atlantis-vault')!
    case 'cad-3d-print-design-v1':
      return WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'terra-3d-print')!
    case 'etsy-smart-product-intake-v1':
    case 'etsy-live-readonly-research-v1':
    case 'etsy-draft-prep-v1':
    case 'shotlab-media-prep-v1':
    case 'seo-alura-keyword-v1':
    case 'supplier-proof-v1':
      return WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'etsy-market-operators')!
    case 'approval-gate-v1':
      return WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'approval-guardian')!
    case 'daily-news-content-v1':
    case 'discord-readback-v1':
    case 'generic-project-status-v1':
    default:
      return WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'hermes-manager')!
  }
}

export function workspaceAgentMindsForRun(run: WorkspaceRun | null | undefined) {
  const council = WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'council-strategists')!
  const hermes = WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'hermes-manager')!
  const approval = WORKSPACE_AGENT_MIND_PROFILES.find((mind) => mind.mindId === 'approval-guardian')!
  if (!run) return [council, hermes]
  const minds = [
    ...(councilPacketIdFor(run) ? [council] : []),
    hermes,
    workspaceAgentMindForBlueprint(run.blueprintId),
    ...(run.approvals.length || run.status === 'waiting_approval' ? [approval] : []),
  ]
  return uniqueMinds(minds).slice(0, 4)
}

function approvalStatusFor(run: WorkspaceRun) {
  if (run.approvals.some((approval) => approval.status === 'waiting_operator')) return 'waiting'
  if (run.status === 'waiting_approval') return 'waiting'
  if (run.status === 'blocked' || run.status === 'failed') return 'blocked'
  return 'done'
}

function latestDomainPacketIdFor(run: WorkspaceRun) {
  const domainPacketRefs = (run.packetRefs ?? []).filter((packetId) => (
    packetId !== run.executionPlanPacketId && packetId !== run.runReadbackPacketId
  ))
  return domainPacketRefs.at(-1)
}

export function buildWorkspaceMissionSpine(input: {
  runs: Array<WorkspaceRun>
  prompt?: string
  hermesStatus?: string
}) {
  const run = latestWorkspaceMissionRun(input.runs)
  const prompt = input.prompt?.trim()
  const councilPacketId = councilPacketIdFor(run)
  const blueprint = run ? getWorkspaceBlueprintById(run.blueprintId) : undefined
  const targetMind = run ? workspaceAgentMindForBlueprint(run.blueprintId) : undefined
  const artifact = run?.artifacts[0]
  const hasPrompt = Boolean(prompt || run?.actionSummary)

  return [
    {
      stepId: 'idea',
      label: 'Idea',
      status: hasPrompt ? 'done' : 'pending',
      summary: run?.actionSummary ?? prompt ?? 'Waiting for an idea.',
      dataSource: 'prompt',
    },
    {
      stepId: 'council',
      label: 'Council',
      status: councilPacketId ? 'done' : 'optional',
      ownerAgentId: 'julius',
      roomId: 'council-strategists',
      stationId: 'council-table',
      summary: councilPacketId ? `Decision packet ${councilPacketId}` : 'Optional strategy round.',
      packetId: councilPacketId,
      dataSource: 'council',
    },
    {
      stepId: 'hermes_brief',
      label: 'Hermes',
      status: run ? 'done' : prompt ? 'active' : 'pending',
      ownerAgentId: 'hermes',
      roomId: 'olympus-command',
      stationId: 'command-table',
      summary: run ? `Brief normalized to ${blueprint?.label ?? run.blueprintId}.` : input.hermesStatus ?? 'Waiting for command brief.',
      packetId: run?.executionPlanPacketId,
      dataSource: 'kernel-run',
    },
    {
      stepId: 'routed_room',
      label: 'Route',
      status: run ? 'done' : 'pending',
      ownerAgentId: targetMind?.agentId,
      roomId: run?.ownerRoomId,
      stationId: run?.ownerStationId,
      summary: run ? `${blueprint?.domain ?? 'command'} → ${run.ownerRoomId}${run.ownerStationId ? ` / ${run.ownerStationId}` : ''}` : 'No route yet.',
      dataSource: 'kernel-run',
    },
    {
      stepId: 'agent_work',
      label: 'Worker',
      status: run?.status === 'blocked' || run?.status === 'failed' ? 'blocked' : artifact ? 'active' : run ? 'waiting' : 'pending',
      ownerAgentId: targetMind?.agentId,
      roomId: run?.ownerRoomId,
      stationId: run?.ownerStationId,
      summary: artifact ? `${artifact.kind}: ${artifact.summary}` : run?.nextAction ?? 'Waiting for routed worker.',
      packetId: run ? latestDomainPacketIdFor(run) ?? artifact?.artifactId : undefined,
      dataSource: artifact ? 'kernel-artifact' : 'kernel-run',
    },
    {
      stepId: 'approval',
      label: 'Approval',
      status: run ? approvalStatusFor(run) : 'pending',
      ownerAgentId: run?.approvals.length || run?.status === 'waiting_approval' ? 'odin' : undefined,
      roomId: run?.approvals.length || run?.status === 'waiting_approval' ? 'olympus-command' : undefined,
      stationId: run?.approvals.length || run?.status === 'waiting_approval' ? 'approval-dais' : undefined,
      summary: run?.approvals[0]?.preview ?? (run ? 'No live action allowed without a gate.' : 'No approval packet yet.'),
      packetId: run?.approvals[0]?.approvalId,
      dataSource: 'approval',
    },
    {
      stepId: 'readback',
      label: 'Readback',
      status: run?.readback ? 'done' : 'pending',
      ownerAgentId: 'hermes',
      roomId: run?.ownerRoomId,
      stationId: run?.ownerStationId,
      summary: run?.readback ?? 'Waiting for readback.',
      packetId: run?.runReadbackPacketId,
      dataSource: 'readback',
    },
  ] satisfies Array<WorkspaceMissionSpineStep>
}

export function createCouncilHandoffWorkspaceRun(handoff: WorkspaceCouncilHandoffInput, nowMs = Date.now()) {
  const route = routeWorkspaceActionToBlueprint(createWorkspaceAction({
    actionId: `council-handoff-${handoff.packetId}`,
    createdAtMs: nowMs,
    source: 'hermes',
    intent: `${handoff.topic}\n${handoff.summary}\n${handoff.prompt}`,
    summary: `${handoff.verdict}: ${handoff.summary}`,
    input: {
      text: handoff.prompt,
      payload: {
        councilPacketId: handoff.packetId,
        topic: handoff.topic,
        verdict: handoff.verdict,
        voteLine: handoff.voteLine,
        missionSpine: 'council-hermes-routed-v1',
      },
    },
  }, nowMs))
  const run = createWorkspaceRun(route.action, route.blueprint, nowMs)
  const rawArtifact = createWorkspaceArtifactForRun(run, route.blueprint, nowMs + 2)
  const artifact = {
    ...rawArtifact,
    label: `${route.blueprint.label} · Council handoff`,
    summary: `Council ${handoff.packetId} routed through Hermes to ${route.blueprint.label}.`,
    sourceRecordIds: Array.from(new Set([...rawArtifact.sourceRecordIds, handoff.packetId])),
    payload: {
      ...rawArtifact.payload,
      councilPacketId: handoff.packetId,
      councilTopic: handoff.topic,
      councilVerdict: handoff.verdict,
      councilSummary: handoff.summary,
      voteLine: handoff.voteLine,
      missionSpine: 'council-hermes-routed-v1',
    },
  }
  let state = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
  if (route.requiresApproval) {
    state = requestWorkspaceApproval(
      state,
      run.runId,
      createWorkspaceApprovalForRun(state.runs[0], route.blueprint, nowMs + 3),
    )
  }
  const nextRun = state.runs[0]
  return {
    ...nextRun,
    nextAction: route.blueprint.defaultNextStep,
    readback: `Council packet ${handoff.packetId} → Hermes → ${route.blueprint.label}. ${route.blueprint.defaultNextStep}`,
  }
}
