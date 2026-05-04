import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProfilesDir } from '../../server/claude-paths'
import {
  buildSwarmDispatchMetadata,
  buildSwarmSessionMetadata,
  getSwarmTmuxSessionName,
  getSwarmWrapperPath,
  listSwarmWorkerIds,
  readSwarmRuntimeFile,
  type SwarmArtifactMetadata,
  type SwarmBoundary,
  type SwarmCheckpointStatus,
  type SwarmDispatchMetadata,
  type SwarmLifecycleMetadata,
  type SwarmPreviewMetadata,
  type SwarmRuntimeSource,
  type SwarmSessionMetadata,
  type SwarmTaskMetadata,
  type SwarmTerminalKind,
  type SwarmWorkerState,
} from '../../server/swarm-foundation'
import { rosterByWorkerId } from '../../server/swarm-roster'
import { readSwarmMode, writeSwarmMode } from '../../server/swarm-mode'

type RuntimeEntry = {
  workerId: string
  displayName: string
  role: string
  source: SwarmRuntimeSource
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  currentTask: string | null
  activeTool: string | null
  state: SwarmWorkerState
  phase: string
  checkpointStatus: SwarmCheckpointStatus
  needsHuman: boolean
  blockedReason: string | null
  lastCheckIn: string | null
  lastSummary: string | null
  nextAction: string | null
  lastResult: string | null
  assignedTaskCount: number
  cronJobCount: number
  tmuxSession: string | null
  tmuxAttachable: boolean
  recentLogTail: string | null
  lastSessionStartedAt: number | null
  logPath: string | null
  terminalKind: SwarmTerminalKind
  profilePath: string
  wrapperPath: string | null
  boundary: SwarmBoundary
  lifecycle: SwarmLifecycleMetadata
  session: SwarmSessionMetadata
  dispatch: SwarmDispatchMetadata
  tasks: Array<SwarmTaskMetadata>
  artifacts: Array<SwarmArtifactMetadata>
  previews: Array<SwarmPreviewMetadata>
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function listWorkerIds(): string[] {
  return listSwarmWorkerIds()
}

function lastLogTail(
  profilePath: string,
  maxBytes = 4_000,
): { tail: string | null; lastSessionStartedAt: number | null; logPath: string | null } {
  const log = join(profilePath, 'logs', 'agent.log')
  if (!existsSync(log)) return { tail: null, lastSessionStartedAt: null, logPath: null }
  try {
    const stat = statSync(log)
    const buffer = readFileSync(log, 'utf-8')
    const tail = buffer.length > maxBytes ? buffer.slice(-maxBytes) : buffer
    const lines = tail.split('\n')
    const tailLines = lines.slice(-12).join('\n')
    return { tail: tailLines, lastSessionStartedAt: stat.mtimeMs, logPath: log }
  } catch {
    return { tail: null, lastSessionStartedAt: null, logPath: null }
  }
}

function tmuxHasSession(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tmux', ['has-session', '-t', name], (error) => resolve(!error))
  })
}

function tmuxIsInstalled(): Promise<boolean> {
  // Honour HERMES_TMUX_BIN so a custom-path install isn't reported as
  // 'tmux not installed' just because PATH doesn't include it. See #244.
  const bin =
    process.env.HERMES_TMUX_BIN || process.env.CLAUDE_TMUX_BIN || 'tmux'
  return new Promise((resolve) => {
    execFile(bin, ['-V'], (error) => resolve(!error))
  })
}

async function probeTmuxName(
  workerId: string,
  hint: string | null,
): Promise<string | null> {
  const candidates = [
    hint,
    getSwarmTmuxSessionName(workerId),
    workerId,
    `hermes-${workerId}`,
    `agent-${workerId}`,
  ].filter((value): value is string => Boolean(value))
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    if (await tmuxHasSession(candidate)) return candidate
  }
  return null
}

async function buildEntry(
  workerId: string,
  tmuxAvailable: boolean,
): Promise<RuntimeEntry> {
  const profilePath = join(getProfilesDir(), workerId)
  const { source, runtime } = readSwarmRuntimeFile(profilePath, workerId, {
    workspaceRoot: process.cwd(),
  })
  const roster = rosterByWorkerId([workerId]).get(workerId)
  const { tail, lastSessionStartedAt, logPath } = lastLogTail(profilePath)
  const matched = tmuxAvailable
    ? await probeTmuxName(workerId, getSwarmTmuxSessionName(workerId))
    : null
  const tmuxAttachable = Boolean(matched)
  let terminalKind: SwarmTerminalKind = 'none'
  if (tmuxAttachable) terminalKind = 'tmux'
  else if (runtime.cwd) terminalKind = 'shell'
  else if (logPath) terminalKind = 'log-tail'

  const wrapperPath = getSwarmWrapperPath(workerId)
  const resolvedWrapperPath = existsSync(wrapperPath) ? wrapperPath : null
  const session = buildSwarmSessionMetadata({
    workerId,
    profilePath,
    runtime,
    tmuxSession: matched,
    terminalKind,
    recentLogTail: tail,
    lastSessionStartedAt,
    logPath,
  })
  const dispatch = buildSwarmDispatchMetadata({
    runtime,
    tmuxAttachable,
    wrapperExists: Boolean(resolvedWrapperPath),
  })
  const lifecycle: SwarmLifecycleMetadata = {
    state: runtime.state,
    phase: runtime.phase,
    checkpointStatus: runtime.checkpointStatus,
    needsHuman: runtime.needsHuman,
    blockedReason: runtime.blockedReason,
    startedAt: runtime.startedAt,
    lastOutputAt: runtime.lastOutputAt,
    lastCheckIn: runtime.lastCheckIn,
    lastSummary: runtime.lastSummary,
    lastResult: runtime.lastResult,
    nextAction: runtime.nextAction,
    pid: readPid(profilePath),
    tmuxSession: matched,
    tmuxAttachable,
    terminalKind,
  }

  return {
    workerId,
    displayName: roster?.name || titleCase(workerId),
    role: roster?.role || runtime.role,
    source,
    pid: lifecycle.pid,
    startedAt: runtime.startedAt,
    lastOutputAt: runtime.lastOutputAt,
    cwd: runtime.cwd,
    currentTask: runtime.currentTask,
    activeTool: runtime.activeTool,
    state: runtime.state,
    phase: runtime.phase,
    checkpointStatus: runtime.checkpointStatus,
    needsHuman: runtime.needsHuman,
    blockedReason: runtime.blockedReason,
    lastCheckIn: runtime.lastCheckIn,
    lastSummary: runtime.lastSummary,
    nextAction: runtime.nextAction,
    lastResult: runtime.lastResult,
    assignedTaskCount: runtime.assignedTaskCount,
    cronJobCount: runtime.cronJobCount,
    tmuxSession: matched,
    tmuxAttachable,
    recentLogTail: tail,
    lastSessionStartedAt,
    logPath,
    terminalKind,
    profilePath,
    wrapperPath: resolvedWrapperPath,
    boundary: runtime.boundary,
    lifecycle,
    session,
    dispatch,
    tasks: runtime.tasks,
    artifacts: runtime.artifacts,
    previews: runtime.previews,
  }
}

function readPid(profilePath: string): number | null {
  const runtimePath = join(profilePath, 'runtime.json')
  if (!existsSync(runtimePath)) return null
  try {
    const raw = JSON.parse(readFileSync(runtimePath, 'utf-8')) as Record<string, unknown>
    return typeof raw.pid === 'number' ? raw.pid : null
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/swarm-runtime')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const ids = listWorkerIds()
        const tmuxAvailable = await tmuxIsInstalled()
        const entries = await Promise.all(ids.map((id) => buildEntry(id, tmuxAvailable)))
        return json({
          checkedAt: Date.now(),
          registryVersion: 1,
          workspaceRoot: process.cwd(),
          tmuxAvailable,
          entries,
          mode: readSwarmMode(),
        })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        let body: { mode?: unknown }
        try {
          body = (await request.json()) as { mode?: unknown }
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        if (body.mode !== 'auto' && body.mode !== 'manual') {
          return json({ error: 'mode must be auto or manual' }, { status: 400 })
        }
        return json({ ok: true, mode: writeSwarmMode(body.mode) })
      },
    },
  },
})
