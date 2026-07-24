import { WORKSPACE_WORKER_PROFILES } from '../workspace-kernel'
import { etsyMarketLabStationOperatorId } from '../war-room/living-v3/etsy-station-apps'
import { livingV3AgentById } from '../war-room/living-v3/living-v3-contract'
import type {
  WorkspaceApproval,
  WorkspaceArtifact,
  WorkspaceArtifactKind,
  WorkspaceKernelState,
  WorkspaceRun,
  WorkspaceRunStatus,
} from '../workspace-kernel'
import type { LivingV3AgentId, LivingV3RoomId, LivingV3StationId } from '../war-room/living-v3/living-v3-contract'

export type WorkspaceCoreOpsSeverity = 'info' | 'success' | 'warning' | 'danger'
export type WorkspaceCoreOpsNotificationSource = 'run' | 'artifact' | 'approval'
export type WorkspaceCoreOpsNotificationStatus = 'unread' | 'read'

export type WorkspaceCoreOpsNotification = {
  notificationId: string
  source: WorkspaceCoreOpsNotificationSource
  severity: WorkspaceCoreOpsSeverity
  status: WorkspaceCoreOpsNotificationStatus
  title: string
  summary: string
  actorAgentId: LivingV3AgentId
  actorLabel: string
  actorShortLabel: string
  actorAccent: string
  actorPortraitPath: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  runId: string
  artifactId?: string
  approvalId?: string
  createdAtMs: number
}

export type WorkspaceCoreOpsApprovalRow = {
  approvalId: string
  runId: string
  status: WorkspaceApproval['status']
  riskClass: WorkspaceApproval['riskClass']
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  requestedAction: string
  targetSystem: string
  preview: string
  evidenceIds: Array<string>
  allowedNow: Array<string>
  lockedActions: Array<string>
  createdAtMs: number
}

export type WorkspaceCoreOpsArtifactRow = {
  artifactId: string
  runId: string
  kind: WorkspaceArtifact['kind']
  label: string
  summary: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  dataOrigin: WorkspaceArtifact['dataOrigin']
  evidenceIds: Array<string>
  sourceRecordIds: Array<string>
  missingFields: Array<string>
  lockedActions: Array<string>
  createdAtMs: number
}

export type WorkspaceCoreOpsSnapshot = {
  generatedAtMs: number
  source: 'workspace-kernel-local-state' | 'workspace-kernel-supabase-mirror'
  safety: {
    localOnly: true
    readOnly: true
    usageAllowed: false
    workerSpawnAllowed: false
    externalRequestsAllowed: false
    liveActionsAllowed: false
  }
  counts: {
    notifications: number
    waitingApprovals: number
    artifacts: number
    failedRuns: number
    blockedRuns: number
    completedRuns: number
  }
  notifications: Array<WorkspaceCoreOpsNotification>
  approvals: Array<WorkspaceCoreOpsApprovalRow>
  artifacts: Array<WorkspaceCoreOpsArtifactRow>
}

const WAITING_APPROVAL_STATUSES = new Set<WorkspaceApproval['status']>(['waiting_operator', 'needs_edit'])

const ARTIFACT_LABELS: Partial<Record<WorkspaceArtifactKind, string>> = {
  'product-candidate-packet': 'product packet',
  'live-product-candidate-packet': 'live research packet',
  'selected-product-packet': 'selected product packet',
  'shotlab-handoff-packet': 'ShotLab handoff',
  'seo-packet': 'SEO packet',
  'etsy-draft-preview-packet': 'draft preview',
  'supplier-proof-packet': 'supplier proof',
  'cad-design-packet': 'CAD design packet',
  'print-prep-packet': 'print prep packet',
  'news-brief-packet': 'news brief',
  'discord-readback-packet': 'Discord readback',
  'approval-packet': 'approval packet',
  'obsidian-context-packet': 'context packet',
  'generic-workspace-packet': 'workspace packet',
}

function sortNewest<T extends { createdAtMs: number }>(items: Array<T>) {
  return [...items].sort((left, right) => right.createdAtMs - left.createdAtMs)
}

function sortNotifications(items: Array<WorkspaceCoreOpsNotification>) {
  const priority = (item: WorkspaceCoreOpsNotification) => item.source === 'approval' ? 0 : 1
  return [...items].sort((left, right) => priority(left) - priority(right) || right.createdAtMs - left.createdAtMs)
}

function cleanSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function sentence(value: string | undefined, fallback: string, max = 132) {
  const text = cleanSpaces(value ?? '') || fallback
  const clipped = text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
  return clipped.replace(/\s*\.$/, '')
}

function labelFromId(value: string) {
  return cleanSpaces(value.replace(/[-_]+/g, ' '))
}

function artifactHumanLabel(artifact: Pick<WorkspaceArtifact, 'kind' | 'label'>) {
  return sentence(artifact.label, ARTIFACT_LABELS[artifact.kind] ?? labelFromId(artifact.kind), 64)
}

function runActionLabel(run: WorkspaceRun) {
  return sentence(run.actionSummary || run.nextAction || run.blueprintId, labelFromId(run.blueprintId), 72)
}

function runSeverity(status: WorkspaceRunStatus): WorkspaceCoreOpsSeverity {
  if (status === 'failed') return 'danger'
  if (status === 'blocked' || status === 'waiting_approval') return 'warning'
  if (status === 'completed') return 'success'
  return 'info'
}

function actorMeta(agentId: LivingV3AgentId) {
  const agent = livingV3AgentById(agentId) ?? livingV3AgentById('hermes')!
  return {
    actorAgentId: agent.id,
    actorLabel: agent.label,
    actorShortLabel: agent.shortLabel,
    actorAccent: agent.accent,
    actorPortraitPath: agent.portraitPath,
  }
}

function agentFromWorkerProfile(run: WorkspaceRun): LivingV3AgentId | null {
  const profile = WORKSPACE_WORKER_PROFILES.find((candidate) => candidate.profileId === run.assignedWorkerProfileId)
  return profile?.agentId && livingV3AgentById(profile.agentId) ? profile.agentId : null
}

function actorForRun(run: WorkspaceRun, stationId?: LivingV3StationId) {
  const stationAgent = stationId ? etsyMarketLabStationOperatorId(stationId) : null
  if (stationAgent && livingV3AgentById(stationAgent)) return actorMeta(stationAgent)
  return actorMeta(agentFromWorkerProfile(run) ?? 'hermes')
}

function approvalTitle() {
  return 'Needs your OK'
}

function approvalSummary(approval: WorkspaceApproval) {
  const action = sentence(approval.requestedAction, 'continue', 82)
  const preview = sentence(approval.preview, 'I paused before anything live or risky happens', 116)
  return `Approve before ${action}. ${preview}.`
}

function artifactTitle(artifact: WorkspaceArtifact) {
  const label = artifactHumanLabel(artifact)
  return artifact.missingFields.length > 0 ? `Check: ${label}` : `Ready: ${label}`
}

function artifactSummary(artifact: WorkspaceArtifact) {
  const label = artifactHumanLabel(artifact)
  const base = sentence(artifact.summary || artifact.label, `I prepared the ${label}`, 116)
  if (artifact.missingFields.length > 0) {
    return `I prepared ${label}. Still missing: ${sentence(artifact.missingFields.join(', '), 'review details', 90)}.`
  }
  return `I prepared ${label}. ${base}.`
}

function runTitle(run: WorkspaceRun) {
  const action = runActionLabel(run)
  switch (run.status) {
    case 'failed':
      return 'Something broke'
    case 'blocked':
      return 'I need your help'
    case 'waiting_approval':
      return 'Waiting for your OK'
    case 'completed':
      return `Done: ${action}`
    case 'cancelled':
      return `Stopped: ${action}`
    default:
      return `Update: ${action}`
  }
}

function runSummary(run: WorkspaceRun) {
  const action = runActionLabel(run)
  const readback = sentence(run.readback || run.nextAction || run.actionSummary, 'No extra details yet', 124)
  switch (run.status) {
    case 'failed':
      return `I tried ${action}, but it failed. ${readback}.`
    case 'blocked':
      return `I paused ${action}. ${readback}.`
    case 'waiting_approval':
      return `I paused ${action} until you approve the next step. ${readback}.`
    case 'completed':
      return `I finished ${action}. ${readback}.`
    case 'cancelled':
      return `I stopped ${action}. ${readback}.`
    default:
      return readback
  }
}

function normalizeRuns(state: WorkspaceKernelState | undefined): Array<WorkspaceRun> {
  return Array.isArray(state?.runs) ? state.runs : []
}

function approvalRowsForRun(run: WorkspaceRun): Array<WorkspaceCoreOpsApprovalRow> {
  return (run.approvals).map((approval) => ({
    approvalId: approval.approvalId,
    runId: run.runId,
    status: approval.status,
    riskClass: approval.riskClass,
    roomId: run.ownerRoomId,
    stationId: run.ownerStationId,
    requestedAction: approval.requestedAction,
    targetSystem: approval.targetSystem,
    preview: approval.preview,
    evidenceIds: approval.evidenceIds,
    allowedNow: approval.allowedNow,
    lockedActions: approval.lockedActions,
    createdAtMs: approval.createdAtMs,
  }))
}

function artifactRowsForRun(run: WorkspaceRun): Array<WorkspaceCoreOpsArtifactRow> {
  return (run.artifacts).map((artifact) => ({
    artifactId: artifact.artifactId,
    runId: run.runId,
    kind: artifact.kind,
    label: artifact.label,
    summary: artifact.summary,
    roomId: artifact.roomId,
    stationId: artifact.stationId,
    dataOrigin: artifact.dataOrigin,
    evidenceIds: artifact.evidenceIds,
    sourceRecordIds: artifact.sourceRecordIds,
    missingFields: artifact.missingFields,
    lockedActions: artifact.lockedActions,
    createdAtMs: artifact.createdAtMs,
  }))
}

function notificationsForRun(run: WorkspaceRun): Array<WorkspaceCoreOpsNotification> {
  const notifications: Array<WorkspaceCoreOpsNotification> = []

  if (['failed', 'blocked', 'waiting_approval', 'completed', 'cancelled'].includes(run.status)) {
    notifications.push({
      notificationId: `run:${run.runId}:${run.status}`,
      source: 'run',
      severity: runSeverity(run.status),
      status: 'unread',
      title: runTitle(run),
      summary: runSummary(run),
      ...actorForRun(run, run.ownerStationId),
      roomId: run.ownerRoomId,
      stationId: run.ownerStationId,
      runId: run.runId,
      createdAtMs: run.updatedAtMs,
    })
  }

  for (const approval of run.approvals) {
    if (!WAITING_APPROVAL_STATUSES.has(approval.status)) continue
    notifications.push({
      notificationId: `approval:${approval.approvalId}`,
      source: 'approval',
      severity: 'warning',
      status: 'unread',
      title: approvalTitle(),
      summary: approvalSummary(approval),
      ...actorMeta('odin'),
      roomId: run.ownerRoomId,
      stationId: run.ownerStationId,
      runId: run.runId,
      approvalId: approval.approvalId,
      createdAtMs: approval.createdAtMs,
    })
  }

  for (const artifact of run.artifacts) {
    notifications.push({
      notificationId: `artifact:${artifact.artifactId}`,
      source: 'artifact',
      severity: artifact.missingFields.length > 0 ? 'warning' : 'info',
      status: 'unread',
      title: artifactTitle(artifact),
      summary: artifactSummary(artifact),
      ...actorForRun(run, artifact.stationId),
      roomId: artifact.roomId,
      stationId: artifact.stationId,
      runId: run.runId,
      artifactId: artifact.artifactId,
      createdAtMs: artifact.createdAtMs,
    })
  }

  return notifications
}

export function buildWorkspaceCoreOpsSnapshot(
  state: WorkspaceKernelState | undefined,
  options: { nowMs?: number; limit?: number; source?: WorkspaceCoreOpsSnapshot['source'] } = {},
): WorkspaceCoreOpsSnapshot {
  const runs = normalizeRuns(state)
  const limit = options.limit ?? 80
  const approvals = sortNewest(runs.flatMap(approvalRowsForRun))
  const artifacts = sortNewest(runs.flatMap(artifactRowsForRun))
  const notifications = sortNotifications(runs.flatMap(notificationsForRun)).slice(0, limit)
  const waitingApprovals = approvals.filter((approval) => WAITING_APPROVAL_STATUSES.has(approval.status))

  return {
    generatedAtMs: options.nowMs ?? Date.now(),
    source: options.source ?? 'workspace-kernel-local-state',
    safety: {
      localOnly: true,
      readOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    },
    counts: {
      notifications: notifications.length,
      waitingApprovals: waitingApprovals.length,
      artifacts: artifacts.length,
      failedRuns: runs.filter((run) => run.status === 'failed').length,
      blockedRuns: runs.filter((run) => run.status === 'blocked').length,
      completedRuns: runs.filter((run) => run.status === 'completed').length,
    },
    notifications,
    approvals,
    artifacts,
  }
}
