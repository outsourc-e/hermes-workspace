import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as YAML from 'yaml'
import { z } from 'zod'
import { getLocalBinDir, getProfilesDir } from './claude-paths'

export const SwarmWorkerStateSchema = z.enum([
  'idle',
  'executing',
  'thinking',
  'writing',
  'waiting',
  'blocked',
  'syncing',
  'reviewing',
  'offline',
])

export const SwarmCheckpointStatusSchema = z.enum([
  'none',
  'in_progress',
  'done',
  'blocked',
  'handoff',
  'needs_input',
])

export const SwarmTerminalKindSchema = z.enum(['tmux', 'log-tail', 'shell', 'none'])
export const SwarmRuntimeSourceSchema = z.enum(['runtime.json', 'fallback'])
export const SwarmTaskSourceSchema = z.enum(['runtime', 'claude-api', 'plugin', 'inferred'])
export const SwarmArtifactKindSchema = z.enum(['file', 'diff', 'patch', 'build', 'log', 'report', 'preview'])
export const SwarmArtifactSourceSchema = z.enum(['runtime', 'workspace', 'plugin', 'inferred'])
export const SwarmPreviewSourceSchema = z.enum(['detected-port', 'plugin', 'runtime'])
export const SwarmPreviewStatusSchema = z.enum(['ready', 'unknown', 'down'])
export const SwarmHistorySourceSchema = z.enum(['state.db', 'local-cache', 'unavailable'])
export const SwarmSessionTransportSchema = z.enum(['tmux', 'oneshot', 'unknown'])
export const SwarmDispatchModeSchema = z.enum(['tmux', 'oneshot', 'none'])
export const SwarmPluginScopeSchema = z.enum([
  'worker-registry:read',
  'worker-runtime:read',
  'worker-runtime:write',
  'worker-dispatch:send',
  'worker-session:attach',
  'worker-artifacts:write',
  'worker-preview:publish',
  'workspace-files:read',
  'workspace-files:write',
  'workspace-ui:register',
  'workspace-routing:read',
])
export const SwarmPluginBoundarySchema = z.enum([
  'workspace-only',
  'runtime-readonly',
  'runtime-control',
  'hybrid',
])

const RuntimeTaskMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  source: SwarmTaskSourceSchema,
  priority: z.number().int().nullable().optional(),
  assignee: z.string().nullable().optional(),
  updatedAt: z.number().int().nullable().optional(),
  url: z.string().nullable().optional(),
})

const RuntimeArtifactMetadataSchema = z.object({
  id: z.string(),
  kind: SwarmArtifactKindSchema,
  label: z.string(),
  path: z.string().nullable().optional(),
  workerId: z.string(),
  updatedAt: z.number().int().nullable().optional(),
  source: SwarmArtifactSourceSchema,
  sizeBytes: z.number().int().nullable().optional(),
  contentType: z.string().nullable().optional(),
})

const RuntimePreviewMetadataSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
  source: SwarmPreviewSourceSchema,
  status: SwarmPreviewStatusSchema,
  workerId: z.string(),
  updatedAt: z.number().int().nullable().optional(),
})

const RuntimeBoundarySchema = z.object({
  workspaceRoot: z.string(),
  cwd: z.string().nullable(),
  insideWorkspace: z.boolean(),
  relativeCwd: z.string().nullable(),
  owner: z.enum(['workspace', 'external']),
})

export const SwarmRuntimeSchema = z.object({
  workerId: z.string(),
  role: z.string(),
  state: SwarmWorkerStateSchema,
  phase: z.string(),
  currentTask: z.string().nullable(),
  activeTool: z.string().nullable(),
  cwd: z.string().nullable(),
  lastOutputAt: z.number().int().nullable(),
  startedAt: z.number().int().nullable(),
  lastCheckIn: z.string().nullable(),
  lastSummary: z.string().nullable(),
  needsHuman: z.boolean(),
  blockedReason: z.string().nullable(),
  checkpointStatus: SwarmCheckpointStatusSchema,
  nextAction: z.string().nullable(),
  lastResult: z.string().nullable(),
  assignedTaskCount: z.number().int().nonnegative(),
  cronJobCount: z.number().int().nonnegative(),
  sessionId: z.string().nullable(),
  sessionTitle: z.string().nullable(),
  historySource: SwarmHistorySourceSchema,
  transport: SwarmSessionTransportSchema,
  lastDispatchAt: z.number().int().nullable(),
  lastDispatchMode: SwarmDispatchModeSchema,
  lastDispatchResult: z.string().nullable(),
  tasks: z.array(RuntimeTaskMetadataSchema).default([]),
  artifacts: z.array(RuntimeArtifactMetadataSchema).default([]),
  previews: z.array(RuntimePreviewMetadataSchema).default([]),
  boundary: RuntimeBoundarySchema,
})

export const SwarmPluginManifestSchema = z.object({
  name: z.string().default(''),
  version: z.string().default(''),
  description: z.string().default(''),
  runtimeScopes: z.array(SwarmPluginScopeSchema).default([]),
  workspaceScopes: z.array(SwarmPluginScopeSchema).default([]),
  workerScopes: z.array(z.string()).default([]),
})

export type SwarmWorkerState = z.infer<typeof SwarmWorkerStateSchema>
export type SwarmCheckpointStatus = z.infer<typeof SwarmCheckpointStatusSchema>
export type SwarmTerminalKind = z.infer<typeof SwarmTerminalKindSchema>
export type SwarmRuntimeSource = z.infer<typeof SwarmRuntimeSourceSchema>
export type SwarmHistorySource = z.infer<typeof SwarmHistorySourceSchema>
export type SwarmSessionTransport = z.infer<typeof SwarmSessionTransportSchema>
export type SwarmDispatchMode = z.infer<typeof SwarmDispatchModeSchema>
export type SwarmTaskMetadata = z.infer<typeof RuntimeTaskMetadataSchema>
export type SwarmArtifactMetadata = z.infer<typeof RuntimeArtifactMetadataSchema>
export type SwarmPreviewMetadata = z.infer<typeof RuntimePreviewMetadataSchema>
export type SwarmBoundary = z.infer<typeof RuntimeBoundarySchema>
export type SwarmRuntime = z.infer<typeof SwarmRuntimeSchema>
export type SwarmPluginBoundary = z.infer<typeof SwarmPluginBoundarySchema>

export type SwarmSessionMetadata = {
  sessionId: string | null
  sessionTitle: string | null
  historySource: SwarmHistorySource
  transport: SwarmSessionTransport
  terminalKind: SwarmTerminalKind
  logPath: string | null
  recentLogTail: string | null
  lastSessionStartedAt: number | null
}

export type SwarmDispatchMetadata = {
  preferredDelivery: 'tmux' | 'oneshot'
  supportsLiveDispatch: boolean
  supportsOneShotDispatch: boolean
  lastDispatchAt: number | null
  lastDispatchMode: SwarmDispatchMode
  lastDispatchResult: string | null
}

export type SwarmLifecycleMetadata = {
  state: SwarmWorkerState
  phase: string
  checkpointStatus: SwarmCheckpointStatus
  needsHuman: boolean
  blockedReason: string | null
  startedAt: number | null
  lastOutputAt: number | null
  lastCheckIn: string | null
  lastSummary: string | null
  lastResult: string | null
  nextAction: string | null
  pid: number | null
  tmuxSession: string | null
  tmuxAttachable: boolean
  terminalKind: SwarmTerminalKind
}

export type SwarmPluginDescriptor = {
  name: string
  version: string
  description: string
  source: 'user' | 'project'
  enabled: boolean
  manifestPath: string
  runtimeScopes: Array<string>
  workspaceScopes: Array<string>
  workerScopes: Array<string>
  boundary: SwarmPluginBoundary
  validationErrors: Array<string>
  error?: string
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readTransport(value: unknown): SwarmSessionTransport | null {
  return value === 'tmux' || value === 'oneshot' || value === 'unknown' ? value : null
}

function readDispatchMode(value: unknown): SwarmDispatchMode | null {
  return value === 'tmux' || value === 'oneshot' || value === 'none' ? value : null
}

function readHistorySource(value: unknown): SwarmHistorySource | null {
  return value === 'state.db' || value === 'local-cache' || value === 'unavailable' ? value : null
}

function readStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseTaskMetadata(workerId: string, value: unknown): Array<SwarmTaskMetadata> {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index) => {
      const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      return RuntimeTaskMetadataSchema.safeParse({
        id: readString(row.id) ?? `${workerId}-task-${index}`,
        title: readString(row.title) ?? readString(row.currentTask) ?? 'Untitled task',
        status: readString(row.status) ?? 'unknown',
        source: readString(row.source) ?? 'runtime',
        priority: readNumber(row.priority),
        assignee: readString(row.assignee),
        updatedAt: readNumber(row.updatedAt),
        url: readString(row.url),
      })
    })
    .flatMap((result) => (result.success ? [result.data] : []))
}

function parseArtifactMetadata(workerId: string, value: unknown): Array<SwarmArtifactMetadata> {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index) => {
      const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      return RuntimeArtifactMetadataSchema.safeParse({
        id: readString(row.id) ?? `${workerId}-artifact-${index}`,
        kind: readString(row.kind) ?? 'file',
        label: readString(row.label) ?? readString(row.path) ?? 'artifact',
        path: readString(row.path),
        workerId,
        updatedAt: readNumber(row.updatedAt),
        source: readString(row.source) ?? 'runtime',
        sizeBytes: readNumber(row.sizeBytes),
        contentType: readString(row.contentType),
      })
    })
    .flatMap((result) => (result.success ? [result.data] : []))
}

function parsePreviewMetadata(workerId: string, value: unknown): Array<SwarmPreviewMetadata> {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index) => {
      const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      return RuntimePreviewMetadataSchema.safeParse({
        id: readString(row.id) ?? `${workerId}-preview-${index}`,
        label: readString(row.label) ?? readString(row.url) ?? 'preview',
        url: readString(row.url) ?? '',
        source: readString(row.source) ?? 'runtime',
        status: readString(row.status) ?? 'unknown',
        workerId,
        updatedAt: readNumber(row.updatedAt),
      })
    })
    .flatMap((result) => (result.success ? [result.data] : []))
}

export function deriveSwarmBoundary(
  cwd: string | null,
  workspaceRoot = process.cwd(),
): SwarmBoundary {
  if (!cwd) {
    return {
      workspaceRoot,
      cwd: null,
      insideWorkspace: false,
      relativeCwd: null,
      owner: 'external',
    }
  }

  const normalizedWorkspace = path.resolve(workspaceRoot)
  const normalizedCwd = path.resolve(cwd)
  const relative = path.relative(normalizedWorkspace, normalizedCwd)
  const insideWorkspace =
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))

  return {
    workspaceRoot: normalizedWorkspace,
    cwd: normalizedCwd,
    insideWorkspace,
    relativeCwd: insideWorkspace ? (relative || '.') : null,
    owner: insideWorkspace ? 'workspace' : 'external',
  }
}

export function normalizeSwarmRuntime(
  workerId: string,
  raw: Record<string, unknown>,
  options?: { workspaceRoot?: string },
): SwarmRuntime {
  const cwd = readString(raw.cwd)
  const runtime = {
    workerId: readString(raw.workerId) ?? workerId,
    role: readString(raw.role) ?? 'swarm-worker',
    state: readString(raw.state) ?? 'idle',
    phase: readString(raw.phase) ?? 'unknown',
    currentTask: readString(raw.currentTask),
    activeTool: readString(raw.activeTool),
    cwd,
    lastOutputAt: readNumber(raw.lastOutputAt),
    startedAt: readNumber(raw.startedAt),
    lastCheckIn: readString(raw.lastCheckIn),
    lastSummary: readString(raw.lastSummary),
    needsHuman: readBoolean(raw.needsHuman) ?? false,
    blockedReason: readString(raw.blockedReason),
    checkpointStatus: readString(raw.checkpointStatus) ?? 'none',
    nextAction: readString(raw.nextAction),
    lastResult: readString(raw.lastResult),
    assignedTaskCount: readNumber(raw.assignedTaskCount) ?? 0,
    cronJobCount: readNumber(raw.cronJobCount) ?? 0,
    sessionId: readString(raw.sessionId),
    sessionTitle: readString(raw.sessionTitle),
    historySource: readHistorySource(raw.historySource) ?? 'unavailable',
    transport: readTransport(raw.transport) ?? 'unknown',
    lastDispatchAt: readNumber(raw.lastDispatchAt),
    lastDispatchMode: readDispatchMode(raw.lastDispatchMode) ?? 'none',
    lastDispatchResult: readString(raw.lastDispatchResult),
    tasks: parseTaskMetadata(workerId, raw.tasks),
    artifacts: parseArtifactMetadata(workerId, raw.artifacts),
    previews: parsePreviewMetadata(workerId, raw.previews),
    boundary: deriveSwarmBoundary(cwd, options?.workspaceRoot),
  }

  return SwarmRuntimeSchema.parse(runtime)
}

export function readSwarmRuntimeFile(
  profilePath: string,
  workerId: string,
  options?: { workspaceRoot?: string },
): { source: SwarmRuntimeSource; runtime: SwarmRuntime } {
  const runtimePath = path.join(profilePath, 'runtime.json')
  if (!fs.existsSync(runtimePath)) {
    return {
      source: 'fallback',
      runtime: normalizeSwarmRuntime(workerId, {}, options),
    }
  }

  try {
    const raw = JSON.parse(fs.readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
    return {
      source: 'runtime.json',
      runtime: normalizeSwarmRuntime(workerId, raw, options),
    }
  } catch {
    return {
      source: 'fallback',
      runtime: normalizeSwarmRuntime(workerId, {}, options),
    }
  }
}

export function listSwarmWorkerIds(options?: { swarmOnly?: boolean }): Array<string> {
  const profilesDir = getProfilesDir()
  if (!fs.existsSync(profilesDir)) return []
  const entries = fs.readdirSync(profilesDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => (options?.swarmOnly ?? false ? /^swarm\d+$/i.test(name) : true))
    .sort()
}

export function getSwarmProfilePath(workerId: string): string {
  return path.join(getProfilesDir(), workerId)
}

export function getSwarmWrapperPath(workerId: string): string {
  return path.join(getLocalBinDir(), workerId)
}

export function getSwarmTmuxSessionName(workerId: string): string {
  return `swarm-${workerId}`
}

export function inferSwarmHistorySource(profilePath: string): SwarmHistorySource {
  if (fs.existsSync(path.join(profilePath, 'state.db'))) return 'state.db'
  if (fs.existsSync(path.join(profilePath, 'sessions'))) return 'local-cache'
  return 'unavailable'
}

export function buildSwarmSessionMetadata(input: {
  workerId: string
  profilePath: string
  runtime: SwarmRuntime
  tmuxSession: string | null
  terminalKind: SwarmTerminalKind
  recentLogTail: string | null
  lastSessionStartedAt: number | null
  logPath: string | null
}): SwarmSessionMetadata {
  return {
    sessionId: input.runtime.sessionId ?? input.tmuxSession ?? input.workerId,
    sessionTitle:
      input.runtime.sessionTitle ??
      (input.tmuxSession ? `Claude worker ${input.workerId}` : null),
    historySource:
      input.runtime.historySource === 'unavailable'
        ? inferSwarmHistorySource(input.profilePath)
        : input.runtime.historySource,
    transport:
      input.runtime.transport !== 'unknown'
        ? input.runtime.transport
        : input.tmuxSession
          ? 'tmux'
          : 'unknown',
    terminalKind: input.terminalKind,
    logPath: input.logPath,
    recentLogTail: input.recentLogTail,
    lastSessionStartedAt: input.lastSessionStartedAt,
  }
}

export function buildSwarmDispatchMetadata(input: {
  runtime: SwarmRuntime
  tmuxAttachable: boolean
  wrapperExists: boolean
}): SwarmDispatchMetadata {
  return {
    preferredDelivery: input.tmuxAttachable ? 'tmux' : 'oneshot',
    supportsLiveDispatch: input.tmuxAttachable || input.wrapperExists,
    supportsOneShotDispatch: true,
    lastDispatchAt: input.runtime.lastDispatchAt,
    lastDispatchMode: input.runtime.lastDispatchMode,
    lastDispatchResult: input.runtime.lastDispatchResult,
  }
}

function normalizeScopeList(value: unknown): Array<string> {
  return readStringArray(value)
}

export function classifySwarmPluginBoundary(input: {
  runtimeScopes?: Array<string>
  workspaceScopes?: Array<string>
}): SwarmPluginBoundary {
  const runtimeScopes = input.runtimeScopes ?? []
  const workspaceScopes = input.workspaceScopes ?? []
  const runtimeWriteScopes = new Set([
    'worker-runtime:write',
    'worker-dispatch:send',
    'worker-session:attach',
    'worker-artifacts:write',
    'worker-preview:publish',
  ])
  const hasRuntime = runtimeScopes.length > 0
  const hasWorkspace = workspaceScopes.length > 0
  const hasRuntimeWrite = runtimeScopes.some((scope) => runtimeWriteScopes.has(scope))

  if (hasRuntimeWrite && hasWorkspace) return 'hybrid'
  if (hasRuntimeWrite) return 'runtime-control'
  if (hasRuntime) return 'runtime-readonly'
  return 'workspace-only'
}

export function parseSwarmPluginManifest(input: {
  manifestPath: string
  source: 'user' | 'project'
}): SwarmPluginDescriptor {
  const manifest = YAML.parse(fs.readFileSync(input.manifestPath, 'utf8'))
  const obj = manifest && typeof manifest === 'object' ? (manifest as Record<string, unknown>) : {}
  const runtimeScopes = normalizeScopeList(obj.runtimeScopes ?? obj.swarmRuntimeScopes)
  const workspaceScopes = normalizeScopeList(obj.workspaceScopes ?? obj.swarmWorkspaceScopes)
  const workerScopes = normalizeScopeList(obj.workerScopes)

  const validationErrors: Array<string> = []
  if (!readString(obj.name)) validationErrors.push('missing name')
  if (!readString(obj.version)) validationErrors.push('missing version')

  const parsed = SwarmPluginManifestSchema.parse({
    name: readString(obj.name) ?? path.basename(path.dirname(input.manifestPath)),
    version: readString(obj.version) ?? '',
    description: readString(obj.description) ?? '',
    runtimeScopes,
    workspaceScopes,
    workerScopes: workerScopes.length > 0 ? workerScopes : ['all'],
  })

  return {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    source: input.source,
    enabled: validationErrors.length === 0,
    manifestPath: input.manifestPath,
    runtimeScopes: parsed.runtimeScopes,
    workspaceScopes: parsed.workspaceScopes,
    workerScopes: parsed.workerScopes,
    boundary: classifySwarmPluginBoundary(parsed),
    validationErrors,
  }
}

export function getWorkspacePluginRoots(workspaceRoot = process.cwd()): Array<{
  root: string
  source: 'user' | 'project'
}> {
  const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude')
  return [
    { root: path.join(claudeHome, 'plugins'), source: 'user' },
    { root: path.join(workspaceRoot, '.claude', 'plugins'), source: 'project' },
  ]
}
