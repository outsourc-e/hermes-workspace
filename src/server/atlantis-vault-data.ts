import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  COUNCIL_DRAWING_BOARD_STATE_FILE,
  loadCouncilDrawingBoardStore,
} from '../lib/war-room/body/council-discussion-store'
import {
  SHARED_ETSY_ROOM_STATE_FILE,
  loadSharedEtsyRoomStore,
} from '../lib/war-room/body/etsy-room-shared-store'
import { livingV3AgentById } from '../lib/war-room/living-v3/living-v3-contract'
import type {
  AtlantisVaultFlowEdge,
  AtlantisVaultNodeState,
  AtlantisVaultObsidianNote,
  AtlantisVaultRecentArtifact,
  AtlantisVaultRecentRun,
  AtlantisVaultSnapshot,
  AtlantisVaultStoreNode,
} from '../lib/war-room/living-v3/atlantis-vault-contract'
import {
  WORKSPACE_KERNEL_EVENTS_FILE,
  WORKSPACE_KERNEL_STATE_FILE,
  loadWorkspaceKernelState,
} from '../lib/workspace-kernel/store'
import { WORKSPACE_KERNEL_LOCKED_ACTIONS } from '../lib/workspace-kernel/blueprints'
import { mergeWorkspaceKernelStateWithSupabase } from './workspace-core-db'
import {
  DEFAULT_WORKSPACE_OBSIDIAN_VAULT_DIR,
  OBSIDIAN_CONTEXT_NOTE_ALLOWLIST,
  loadAllowlistedObsidianContextSources,
} from '../lib/workspace-kernel/obsidian-context'
import type { WorkspaceArtifact, WorkspaceRun } from '../lib/workspace-kernel/contracts'

export type AtlantisVaultSnapshotOptions = {
  nowMs?: number
  projectRoot?: string
  workspaceKernelRootDir?: string
  etsyRoomRootDir?: string
  councilRootDir?: string
  obsidianVaultDir?: string
}

const POSEIDON_RUNTIME_FILES = [
  'portrait.png',
  'idle.png',
  'work-standing.png',
  'talk-standing.png',
  'carry-packet.png',
  'wait-approval.png',
  'sleep.png',
  'walk-north.png',
  'walk-north-east.png',
  'walk-east.png',
  'walk-south-east.png',
  'walk-south.png',
  'walk-south-west.png',
  'walk-west.png',
  'walk-north-west.png',
]

const SAFETY = {
  localOnly: true,
  readOnly: true,
  getOnly: true,
  liveActionsAllowed: false,
  externalRequestsAllowed: false,
  writebackAllowed: false,
  workerSpawnAllowed: false,
} as const

function fileUpdatedAtMs(filePath: string) {
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return null
  }
}

function storeState(recordCount: number, exists: boolean, warning = false): AtlantisVaultNodeState {
  if (warning) return 'warn'
  if (!exists || recordCount === 0) return 'empty'
  return 'ready'
}

function countFiles(root: string, predicate: (fileName: string) => boolean): number {
  if (!existsSync(root)) return 0
  let total = 0
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(next)
      else if (predicate(entry.name)) total += 1
    }
  }
  return total
}

function safeRecentRun(run: WorkspaceRun): AtlantisVaultRecentRun {
  return {
    runId: run.runId,
    blueprintId: run.blueprintId,
    status: run.status,
    roomId: run.ownerRoomId,
    stationId: run.ownerStationId,
    actionSummary: run.actionSummary,
    updatedAtMs: run.updatedAtMs,
  }
}

function safeRecentArtifact(artifact: WorkspaceArtifact): AtlantisVaultRecentArtifact {
  return {
    artifactId: artifact.artifactId,
    runId: artifact.runId,
    kind: artifact.kind,
    label: artifact.label,
    roomId: artifact.roomId,
    stationId: artifact.stationId,
    dataOrigin: artifact.dataOrigin,
    missingFields: artifact.missingFields,
    lockedActions: artifact.lockedActions,
    createdAtMs: artifact.createdAtMs,
  }
}

function noteReadback(note: Awaited<ReturnType<typeof loadAllowlistedObsidianContextSources>>[number]): AtlantisVaultObsidianNote {
  return {
    noteId: note.noteId,
    title: note.title,
    relativePath: note.relativePath,
    kind: note.kind,
    status: note.status,
    updatedAt: 'updatedAt' in note && typeof note.updatedAt === 'string' ? note.updatedAt : null,
  }
}

function flowEdge(input: AtlantisVaultFlowEdge): AtlantisVaultFlowEdge {
  return input
}

export async function getAtlantisVaultSnapshot(options: AtlantisVaultSnapshotOptions = {}): Promise<AtlantisVaultSnapshot> {
  const nowMs = options.nowMs ?? Date.now()
  const projectRoot = options.projectRoot ?? process.cwd()
  const workspaceKernelRootDir = options.workspaceKernelRootDir ?? path.join(projectRoot, 'data', 'workspace-kernel')
  const etsyRoomRootDir = options.etsyRoomRootDir ?? path.join(projectRoot, 'data', 'war-room', 'etsy-room')
  const councilRootDir = options.councilRootDir ?? path.join(projectRoot, 'data', 'war-room-council')
  const obsidianVaultDir = options.obsidianVaultDir ?? process.env.WORKSPACE_OBSIDIAN_VAULT_DIR ?? DEFAULT_WORKSPACE_OBSIDIAN_VAULT_DIR

  const [localKernel, etsy, council, obsidianSources] = await Promise.all([
    loadWorkspaceKernelState({ rootDir: workspaceKernelRootDir, nowMs }),
    loadSharedEtsyRoomStore({ rootDir: etsyRoomRootDir, nowMs }),
    loadCouncilDrawingBoardStore({ rootDir: councilRootDir, nowMs }),
    loadAllowlistedObsidianContextSources({ vaultDir: obsidianVaultDir }),
  ])
  const kernelMirror = await mergeWorkspaceKernelStateWithSupabase(localKernel)
  const kernel = kernelMirror.state
  const workspaceCorePersistence = kernelMirror.persistence
  const workspaceCoreConnected = workspaceCorePersistence.provider === 'supabase' && workspaceCorePersistence.status === 'connected'

  const kernelStatePath = path.join(workspaceKernelRootDir, WORKSPACE_KERNEL_STATE_FILE)
  const kernelEventsPath = path.join(workspaceKernelRootDir, WORKSPACE_KERNEL_EVENTS_FILE)
  const etsyStatePath = path.join(etsyRoomRootDir, SHARED_ETSY_ROOM_STATE_FILE)
  const councilStatePath = path.join(councilRootDir, COUNCIL_DRAWING_BOARD_STATE_FILE)
  const poseidonLiveDir = path.join(projectRoot, 'public', 'war-room', 'living-v3', 'agents', 'poseidon')
  const supabaseDir = path.join(projectRoot, 'supabase')

  const artifacts = kernel.runs.flatMap((run) => run.artifacts ?? [])
  const approvalsWaiting = kernel.runs.flatMap((run) => run.approvals ?? []).filter((approval) => approval.status === 'waiting_operator' || approval.status === 'needs_edit').length
  const etsyCandidates = etsy.roomState.candidates.length
  const rejectedCandidates = etsy.roomState.events.filter((event) => event.type === 'etsy.candidate.rejected').length
  const selectedCandidate = etsy.roomState.selectedCandidateId ? 1 : 0
  const loadedNotes = obsidianSources.filter((note) => note.status === 'loaded').length
  const missingNotes = obsidianSources.filter((note) => note.status === 'missing').length
  const blockedNotes = obsidianSources.filter((note) => note.status === 'blocked').length
  const poseidonRuntimeFiles = POSEIDON_RUNTIME_FILES.filter((fileName) => existsSync(path.join(poseidonLiveDir, fileName))).length
  const supabaseMigrationFiles = countFiles(supabaseDir, (fileName) => fileName.endsWith('.sql'))
  const supabaseFoundationPresent = existsSync(supabaseDir) && supabaseMigrationFiles > 0

  const stores: Array<AtlantisVaultStoreNode> = [
    {
      id: 'workspace-kernel',
      kind: 'workspace-kernel',
      label: 'Workspace Kernel',
      state: storeState(kernel.runs.length + (kernel.events?.length ?? 0), existsSync(kernelStatePath)),
      recordCount: kernel.runs.length + (kernel.events?.length ?? 0),
      updatedAtMs: fileUpdatedAtMs(kernelStatePath) ?? kernel.updatedAtMs ?? null,
      detail: `${kernel.runs.length} runs · ${kernel.events?.length ?? 0} events · ${artifacts.length} packets`,
      path: kernelStatePath,
      proof: [kernelStatePath, kernelEventsPath].filter((filePath) => existsSync(filePath)),
    },
    {
      id: 'etsy-room-store',
      kind: 'etsy-room',
      label: 'Etsy Room Store',
      state: storeState(etsyCandidates + selectedCandidate + etsy.roomState.events.length, existsSync(etsyStatePath)),
      recordCount: etsyCandidates + selectedCandidate + etsy.roomState.events.length,
      updatedAtMs: fileUpdatedAtMs(etsyStatePath) ?? etsy.updatedAtMs ?? null,
      detail: `${etsyCandidates} candidates · ${selectedCandidate ? '1 selected' : '0 selected'} · ${rejectedCandidates} rejected events`,
      path: etsyStatePath,
      proof: existsSync(etsyStatePath) ? [etsyStatePath] : [],
    },
    {
      id: 'council-board-store',
      kind: 'council-board',
      label: 'Council Drawing Board',
      state: storeState(council.discussions.length, existsSync(councilStatePath)),
      recordCount: council.discussions.length,
      updatedAtMs: fileUpdatedAtMs(councilStatePath) ?? council.updatedAtMs ?? null,
      detail: `${council.discussions.length} discussions · ${council.activeDiscussionId ? 'active thread present' : 'no active thread'}`,
      path: councilStatePath,
      proof: existsSync(councilStatePath) ? [councilStatePath] : [],
    },
    {
      id: 'obsidian-allowlist',
      kind: 'obsidian-allowlist',
      label: 'Obsidian Context Shelf',
      state: blockedNotes > 0 ? 'blocked' : missingNotes > 0 ? 'warn' : loadedNotes > 0 ? 'ready' : 'empty',
      recordCount: loadedNotes,
      updatedAtMs: null,
      detail: `${loadedNotes} loaded · ${missingNotes} missing · ${blockedNotes} blocked`,
      path: obsidianVaultDir,
      proof: obsidianSources.filter((note) => note.status === 'loaded').map((note) => path.join(obsidianVaultDir, note.relativePath)),
    },
    {
      id: 'poseidon-asset',
      kind: 'poseidon-asset',
      label: 'Poseidon Runtime Asset',
      state: poseidonRuntimeFiles >= POSEIDON_RUNTIME_FILES.length ? 'ready' : poseidonRuntimeFiles > 0 ? 'warn' : 'empty',
      recordCount: poseidonRuntimeFiles,
      updatedAtMs: fileUpdatedAtMs(path.join(poseidonLiveDir, 'ASSET_LIFECYCLE.json')),
      detail: `${poseidonRuntimeFiles}/${POSEIDON_RUNTIME_FILES.length} live runtime files`,
      path: poseidonLiveDir,
      proof: POSEIDON_RUNTIME_FILES.map((fileName) => path.join(poseidonLiveDir, fileName)).filter((filePath) => existsSync(filePath)),
    },
    {
      id: 'supabase-foundation',
      kind: 'supabase-foundation',
      label: workspaceCoreConnected ? 'Supabase Workspace Core' : 'Supabase Foundation',
      state: workspaceCoreConnected ? 'ready' : supabaseFoundationPresent ? 'warn' : 'empty',
      recordCount: workspaceCoreConnected ? workspaceCorePersistence.runCount + workspaceCorePersistence.approvalCount : supabaseMigrationFiles,
      updatedAtMs: fileUpdatedAtMs(supabaseDir),
      detail: workspaceCoreConnected
        ? `${workspaceCorePersistence.runCount} Action Runs · ${workspaceCorePersistence.approvalCount} approvals mirrored in workspace_core.`
        : supabaseFoundationPresent
          ? `${supabaseMigrationFiles} migration files found; Workspace Core mirror is using local fallback here.`
          : 'No Supabase migration files found in this checkout.',
      path: supabaseDir,
      proof: existsSync(supabaseDir) ? [supabaseDir] : [],
    },
  ]

  const notes = obsidianSources.map(noteReadback)
  const warnings = stores.filter((store) => store.state === 'warn').length
  const blocked = stores.filter((store) => store.state === 'blocked' || store.state === 'fail').length
  const flow = [
    flowEdge({ id: 'kernel-to-poseidon', from: 'Workspace Kernel', to: 'Poseidon', label: 'runs / packets', value: kernel.runs.length + artifacts.length, state: stores[0].state }),
    flowEdge({ id: 'workspace-core-to-approval-spine', from: workspaceCoreConnected ? 'Supabase Core' : 'Local Kernel', to: 'Approval spine', label: workspaceCoreConnected ? 'DB runs / approvals' : 'fallback store', value: workspaceCorePersistence.runCount + workspaceCorePersistence.approvalCount, state: stores[5].state }),
    flowEdge({ id: 'etsy-to-vault', from: 'Etsy Room Store', to: 'Atlantis index', label: 'candidates / rejections', value: etsyCandidates + rejectedCandidates, state: stores[1].state }),
    flowEdge({ id: 'obsidian-to-vault', from: 'Obsidian Shelf', to: 'Context packet', label: 'loaded notes', value: loadedNotes, state: stores[3].state }),
    flowEdge({ id: 'poseidon-asset-to-room', from: 'Poseidon asset', to: 'Atlantis room', label: 'runtime files', value: poseidonRuntimeFiles, state: stores[4].state }),
  ]
  const poseidon = livingV3AgentById('poseidon')

  return {
    ok: true,
    schemaVersion: 'atlantis-vault-status-v1',
    generatedAtMs: nowMs,
    source: 'server-real-readback',
    poseidon: {
      agentId: 'poseidon',
      roomId: 'atlantis-vault',
      stationId: 'atlantis-index',
      portraitPath: poseidon?.portraitPath ?? '/war-room/living-v3/agents/poseidon/portrait.png',
      visualStatus: 'poseidon-sea-pet-runtime-final',
      role: poseidon?.role ?? 'Atlantis Vault manager',
    },
    database: {
      activeTruthStore: workspaceCoreConnected ? 'supabase-workspace-core' : 'local-json',
      supabaseRuntimeConnected: workspaceCoreConnected,
      supabaseFoundationPresent,
      supabaseMigrationFiles,
      localStoreFiles: [kernelStatePath, etsyStatePath, councilStatePath].filter((filePath) => existsSync(filePath)).length,
      workspaceCoreProvider: workspaceCorePersistence.provider,
      workspaceCoreStatus: workspaceCorePersistence.status,
      workspaceCoreRunCount: workspaceCorePersistence.runCount,
      workspaceCoreApprovalCount: workspaceCorePersistence.approvalCount,
      statement: workspaceCoreConnected
        ? workspaceCorePersistence.readback
        : 'Atlantis is reading the local Workspace fallback. Supabase Workspace Core is not active for this readback.',
    },
    counts: {
      stores: stores.length,
      storesReady: stores.filter((store) => store.state === 'ready').length,
      storesEmpty: stores.filter((store) => store.state === 'empty').length,
      warnings,
      blocked,
      runs: kernel.runs.length,
      events: kernel.events?.length ?? 0,
      artifacts: artifacts.length,
      approvalsWaiting,
      etsyCandidates,
      rejectedCandidates,
      councilDiscussions: council.discussions.length,
      obsidianLoadedNotes: loadedNotes,
      obsidianMissingNotes: missingNotes,
      obsidianBlockedNotes: blockedNotes,
      poseidonRuntimeFiles,
    },
    stores,
    flow,
    obsidian: {
      vaultDir: obsidianVaultDir,
      allowlistedNotes: OBSIDIAN_CONTEXT_NOTE_ALLOWLIST.length,
      notes,
    },
    recentRuns: [...kernel.runs].sort((left, right) => right.updatedAtMs - left.updatedAtMs).slice(0, 8).map(safeRecentRun),
    recentArtifacts: [...artifacts].sort((left, right) => right.createdAtMs - left.createdAtMs).slice(0, 8).map(safeRecentArtifact),
    safety: {
      ...SAFETY,
      localOnly: !workspaceCoreConnected,
    },
    lockedActions: [
      ...WORKSPACE_KERNEL_LOCKED_ACTIONS,
      'DB writes require DLV approval',
      'Obsidian writes require DLV approval',
      'cleanup/delete/migration require approval and readback',
    ],
  }
}

export async function getAtlantisVaultSnapshotForApi() {
  return getAtlantisVaultSnapshot()
}
