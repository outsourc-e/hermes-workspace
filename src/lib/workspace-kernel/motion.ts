import { assertWarRoomAgentCanReceiveNewAssignment } from '../war-room/body/worker-profiles'
import { etsyMarketLabStationOperatorId } from '../war-room/living-v3/etsy-station-apps'
import { livingV3AgentById } from '../war-room/living-v3/living-v3-contract'
import { WORKSPACE_WORKER_PROFILES } from './blueprints'
import type { LivingV3AgentId, LivingV3BadgeKind, LivingV3RoomId, LivingV3StationId } from '../war-room/living-v3/living-v3-contract'
import type { LivingV3TaskKind } from '../war-room/living-v3/hermes-adapter'
import type {
  WorkspaceArtifactKind,
  WorkspaceBlueprintId,
  WorkspaceEvent,
  WorkspaceKernelPersistedState,
  WorkspaceRun,
  WorkspaceWorkerProfileId,
} from './contracts'

export type KernelAgentDisplayMode = 'idle' | 'walking' | 'working' | 'waiting_approval' | 'blocked'

export type KernelAgentDisplayState = {
  agentId: LivingV3AgentId
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  mode: KernelAgentDisplayMode
  currentRunId?: string
  currentArtifactKind?: WorkspaceArtifactKind
  readback: string
  lastEventId?: string
}

function fallbackAgentForBlueprint(blueprintId: WorkspaceBlueprintId): LivingV3AgentId {
  switch (blueprintId) {
    case 'etsy-smart-product-intake-v1':
      return 'loki'
    case 'etsy-draft-prep-v1':
      return 'odin'
    case 'seo-alura-keyword-v1':
    case 'shotlab-media-prep-v1':
    case 'supplier-proof-v1':
      return 'thor'
    case 'cad-3d-print-design-v1':
      return 'terra'
    case 'daily-news-content-v1':
    case 'discord-readback-v1':
      return 'heimdall'
    case 'approval-gate-v1':
      return 'odin'
    case 'generic-project-status-v1':
    default:
      return 'hermes'
  }
}

function workerProfileFor(profileId?: WorkspaceWorkerProfileId) {
  return WORKSPACE_WORKER_PROFILES.find((candidate) => candidate.profileId === profileId) ?? null
}

function agentFor(run: WorkspaceRun, event?: WorkspaceEvent): LivingV3AgentId {
  const profile = workerProfileFor(event?.workerProfileId ?? run.assignedWorkerProfileId)
  if (profile?.profileScope === 'council-general' && profile.agentId && livingV3AgentById(profile.agentId)) {
    assertWarRoomAgentCanReceiveNewAssignment(profile.agentId)
    return profile.agentId
  }
  if (run.ownerRoomId === 'etsy-market-lab' && run.ownerStationId) {
    return etsyMarketLabStationOperatorId(run.ownerStationId) ?? 'loki'
  }
  if (run.blueprintId === 'daily-news-content-v1' || run.blueprintId === 'discord-readback-v1') {
    return 'heimdall'
  }
  const profileAgent = profile?.agentId && livingV3AgentById(profile.agentId) ? profile.agentId : null
  if (profileAgent) {
    assertWarRoomAgentCanReceiveNewAssignment(profileAgent)
    return profileAgent
  }
  const fallback = fallbackAgentForBlueprint(run.blueprintId)
  assertWarRoomAgentCanReceiveNewAssignment(fallback)
  return livingV3AgentById(fallback) ? fallback : 'hermes'
}

function modeFor(event: WorkspaceEvent): KernelAgentDisplayMode {
  switch (event.type) {
    case 'run.created':
    case 'run.routed':
    case 'run.started':
    case 'station.focused':
      return 'walking'
    case 'artifact.created':
    case 'packet.routed':
    case 'packet.created':
    case 'packet.ready':
    case 'packet.offered':
    case 'packet.acknowledged':
    case 'packet.superseded':
    case 'tool.started':
    case 'worker.assigned':
      return 'working'
    case 'approval.requested':
      return 'waiting_approval'
    case 'approval.approved':
    case 'approval.rejected':
    case 'approval.needs_edit':
    case 'packet.blocked':
    case 'packet.rejected':
    case 'run.blocked':
    case 'run.failed':
    case 'run.cancelled':
      return 'blocked'
    case 'run.completed':
      return 'idle'
    default: {
      const _exhaustive: never = event.type
      return _exhaustive
    }
  }
}

function artifactKindForEvent(run: WorkspaceRun, event: WorkspaceEvent): WorkspaceArtifactKind | undefined {
  if (typeof event.payload?.artifactKind === 'string') return event.payload.artifactKind as WorkspaceArtifactKind
  if (event.artifactId) return run.artifacts.find((artifact) => artifact.artifactId === event.artifactId)?.kind
  return run.artifacts[0]?.kind
}

function displayFrom(run: WorkspaceRun, event: WorkspaceEvent): KernelAgentDisplayState {
  return {
    agentId: agentFor(run, event),
    roomId: event.roomId ?? run.ownerRoomId,
    stationId: event.stationId ?? run.ownerStationId,
    mode: modeFor(event),
    currentRunId: run.runId,
    currentArtifactKind: artifactKindForEvent(run, event),
    readback: event.message || run.readback,
    lastEventId: event.eventId,
  }
}

export function buildKernelAgentDisplayStates(state: Pick<WorkspaceKernelPersistedState, 'runs' | 'events'>) {
  const runsById = new Map(state.runs.map((run) => [run.runId, run]))
  const displayByAgent = new Map<LivingV3AgentId, KernelAgentDisplayState>()
  const events = [...(state.events ?? state.runs.flatMap((run) => run.events))]
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
  for (const event of events) {
    const run = runsById.get(event.runId)
    if (!run) continue
    const display = displayFrom(run, event)
    displayByAgent.set(display.agentId, display)
  }
  return [...displayByAgent.values()]
    .sort((left, right) => (right.lastEventId ?? '').localeCompare(left.lastEventId ?? ''))
    .slice(0, 4)
}

export function latestKernelAgentDisplayState(state: Pick<WorkspaceKernelPersistedState, 'runs' | 'events'>) {
  const events = [...(state.events ?? state.runs.flatMap((run) => run.events))]
    .sort((left, right) => right.createdAtMs - left.createdAtMs)
  const runsById = new Map(state.runs.map((run) => [run.runId, run]))
  for (const event of events) {
    const run = runsById.get(event.runId)
    if (run) return displayFrom(run, event)
  }
  return null
}

export function kernelAgentDisplayStateToLivingTask(display: KernelAgentDisplayState) {
  const blocked = display.mode === 'blocked'
  const waitingApproval = display.mode === 'waiting_approval'
  const kind: LivingV3TaskKind = waitingApproval || blocked ? 'approval' : display.mode === 'idle' ? 'move' : 'work'
  const badge: LivingV3BadgeKind = blocked ? 'blocked' : waitingApproval ? 'approval' : display.mode === 'idle' ? 'idle' : 'active-task'
  return {
    agentId: display.agentId,
    kind,
    label: display.readback,
    roomId: display.roomId,
    stationId: display.stationId,
    badge,
    packetLabel: display.currentArtifactKind ?? 'kernel event',
  }
}
