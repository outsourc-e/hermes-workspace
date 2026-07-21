import type { LivingV3RoomId, LivingV3StationId } from './living-v3-contract'
import type { WorkspaceArtifactKind, WorkspaceBlueprintId, WorkspaceRunStatus } from '../../workspace-kernel/contracts'

export type AtlantisVaultNodeState = 'ready' | 'empty' | 'warn' | 'blocked' | 'fail'

export type AtlantisVaultStoreKind =
  | 'workspace-kernel'
  | 'etsy-room'
  | 'council-board'
  | 'obsidian-allowlist'
  | 'poseidon-asset'
  | 'supabase-foundation'

export type AtlantisVaultStoreNode = {
  id: string
  kind: AtlantisVaultStoreKind
  label: string
  state: AtlantisVaultNodeState
  recordCount: number
  updatedAtMs: number | null
  detail: string
  path?: string
  proof: Array<string>
}

export type AtlantisVaultFlowEdge = {
  id: string
  from: string
  to: string
  label: string
  value: number
  state: AtlantisVaultNodeState
}

export type AtlantisVaultObsidianNote = {
  noteId: string
  title: string
  relativePath: string
  kind: string
  status: 'loaded' | 'missing' | 'blocked'
  updatedAt: string | null
}

export type AtlantisVaultRecentRun = {
  runId: string
  blueprintId: WorkspaceBlueprintId
  status: WorkspaceRunStatus
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  actionSummary: string
  updatedAtMs: number
}

export type AtlantisVaultRecentArtifact = {
  artifactId: string
  runId: string
  kind: WorkspaceArtifactKind
  label: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  dataOrigin: string
  missingFields: Array<string>
  lockedActions: Array<string>
  createdAtMs: number
}

export type AtlantisVaultDatabaseReadback = {
  activeTruthStore: 'local-json' | 'supabase-workspace-core'
  supabaseRuntimeConnected: boolean
  supabaseFoundationPresent: boolean
  supabaseMigrationFiles: number
  localStoreFiles: number
  workspaceCoreProvider: 'supabase' | 'local-file'
  workspaceCoreStatus: 'connected' | 'fallback' | 'error'
  workspaceCoreRunCount: number
  workspaceCoreApprovalCount: number
  statement: string
}

export type AtlantisVaultSnapshot = {
  ok: true
  schemaVersion: 'atlantis-vault-status-v1'
  generatedAtMs: number
  source: 'server-real-readback'
  poseidon: {
    agentId: 'poseidon'
    roomId: 'atlantis-vault'
    stationId: 'atlantis-index'
    portraitPath: string
    visualStatus: 'poseidon-sea-pet-runtime-final'
    role: string
  }
  database: AtlantisVaultDatabaseReadback
  counts: {
    stores: number
    storesReady: number
    storesEmpty: number
    warnings: number
    blocked: number
    runs: number
    events: number
    artifacts: number
    approvalsWaiting: number
    etsyCandidates: number
    rejectedCandidates: number
    councilDiscussions: number
    obsidianLoadedNotes: number
    obsidianMissingNotes: number
    obsidianBlockedNotes: number
    poseidonRuntimeFiles: number
  }
  stores: Array<AtlantisVaultStoreNode>
  flow: Array<AtlantisVaultFlowEdge>
  obsidian: {
    vaultDir: string
    allowlistedNotes: number
    notes: Array<AtlantisVaultObsidianNote>
  }
  recentRuns: Array<AtlantisVaultRecentRun>
  recentArtifacts: Array<AtlantisVaultRecentArtifact>
  safety: {
    localOnly: boolean
    readOnly: true
    getOnly: true
    liveActionsAllowed: false
    externalRequestsAllowed: false
    writebackAllowed: false
    workerSpawnAllowed: false
  }
  lockedActions: Array<string>
}
