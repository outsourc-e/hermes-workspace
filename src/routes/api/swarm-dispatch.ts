import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { ragSearchSafe } from '../../server/rag-index'
import { notifyPhone } from '../../server/notify'
import { processVerification } from '../../server/swarm-verify'
import {
  newestCheckpointFromMessages,
  parseSwarmCheckpoint,
  type ParsedSwarmCheckpoint,
} from '../../server/swarm-checkpoints'
import { readWorkerMessages } from '../../server/swarm-chat-reader'
import {
  createOrUpdateMission,
  getSwarmMission,
  markMissionAssignmentDispatched,
  recordMissionAssignmentBlocked,
  recordMissionCheckpoint,
} from '../../server/swarm-missions'
import {
  appendSwarmMemoryEvent,
  buildSwarmStartupSnapshot,
} from '../../server/swarm-memory'
import {
  rosterByWorkerId,
  type SwarmRosterWorker,
} from '../../server/swarm-roster'
import { publishSwarmCheckpointNotification } from '../../server/swarm-notifications'
import {
  ensureSwarmProfileConfig,
  syncSwarmProfileModel,
} from '../../server/swarm-profile-config'
import { resolveSwarmModelLabel } from '../../server/swarm-model-resolver'
import { getSwarmUsage } from '../../server/swarm-usage'
import {
  TIER_MODELS,
  clampTier,
  demoteTier,
  escalateTier,
  routeTaskModel,
} from '../../server/swarm-model-router'
import type { SwarmModelTier } from '../../server/swarm-model-router'
import {
  lessonsForWorker,
  recordSwarmOutcome,
  tierCanDemote,
  tierNeedsEscalation,
} from '../../server/swarm-outcomes'
import {
  harvestSkillFromCheckpoint,
  matchSkillsForTask,
} from '../../server/swarm-skills'

const HERMES_BIN_CANDIDATES = [
  process.env.HERMES_CLI_BIN,
  join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
  join(homedir(), '.local', 'bin', 'hermes'),
  'hermes',
].filter((value): value is string => Boolean(value))

function resolveHermesBin(): string {
  for (const candidate of HERMES_BIN_CANDIDATES) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    return candidate
  }
  return 'hermes'
}

type AssignmentRequest = {
  workerId: string
  task: string
  rationale?: string
  assignmentId?: string
  dependsOn?: Array<string>
  reviewRequired?: boolean
  direct?: boolean
  oneshot?: boolean
}

type DispatchRequest = {
  workerIds?: unknown
  prompt?: unknown
  assignments?: unknown
  timeoutSeconds?: unknown
  waitForCheckpoint?: unknown
  allowAsync?: unknown
  checkpointPollSeconds?: unknown
  missionId?: unknown
  missionTitle?: unknown
  direct?: unknown
  notifySessionKey?: unknown
}

type WorkerResult = {
  workerId: string
  ok: boolean
  output: string
  error: string | null
  durationMs: number
  exitCode: number | null
  delivery?: 'tmux' | 'oneshot'
  checkpoint?: ParsedSwarmCheckpoint | null
  checkpointStatus?: 'checkpointed' | 'timeout' | 'not-requested'
}

type RuntimeCheckpointSnapshot = {
  checkpointStatus:
    | 'none'
    | 'in_progress'
    | 'done'
    | 'blocked'
    | 'handoff'
    | 'needs_input'
  state: string | null
  lastSummary: string | null
  lastResult: string | null
  nextAction: string | null
  blockedReason: string | null
  lastCheckIn: string | null
  lastOutputAt: number | null
  checkpointRaw: string | null
}

const MAX_PROMPT_CHARS = 32_000
const MAX_OUTPUT_CHARS = 200_000
const DEFAULT_TIMEOUT_S = 240
const MAX_TIMEOUT_S = 600

function getProfilesDir(): string {
  const base = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME
  if (base) {
    const parts = base.split('/').filter(Boolean)
    if (parts.length >= 2 && parts.at(-2) === 'profiles') {
      return base.split('/').slice(0, -1).join('/')
    }
    return join(base, 'profiles')
  }
  return join(homedir(), '.hermes', 'profiles')
}

function getWrapperPath(workerId: string): string {
  const worker = rosterByWorkerId([workerId]).get(workerId)
  const wrapperName = worker?.wrapper?.trim() || workerId
  return join(homedir(), '.local', 'bin', wrapperName)
}

function getProfilePath(workerId: string): string {
  return join(getProfilesDir(), workerId)
}

function validateWorkerId(workerId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)
}

const TMUX_BIN_CANDIDATES = [
  process.env.TMUX_BIN,
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux',
  join(homedir(), '.local', 'bin', 'tmux'),
  'tmux',
].filter((value): value is string => Boolean(value))

function resolveTmuxBin(): string | null {
  // Allow operators on non-standard installs (Docker, NixOS, custom
  // package layouts) to point Swarm at the right tmux binary without
  // patching this list. See #244.
  const override = process.env.HERMES_TMUX_BIN || process.env.CLAUDE_TMUX_BIN
  if (override) {
    if (existsSync(override)) return override
    // If the override looks like a bare command (no slashes), trust it
    // and let execFile resolve it via PATH.
    if (!override.includes('/')) return override
  }
  for (const candidate of TMUX_BIN_CANDIDATES) {
    if (candidate.includes('/')) {
      if (
        candidate === process.env.TMUX_BIN ||
        candidate === '/opt/homebrew/bin/tmux' ||
        candidate === '/usr/local/bin/tmux' ||
        existsSync(candidate)
      ) {
        return candidate
      }
      continue
    }
    return candidate
  }
  return null
}

function tmuxHasSession(tmuxBin: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(tmuxBin, ['has-session', '-t', name], (error) => {
      resolve(!error)
    })
  })
}

function execFileAsync(
  cmd: string,
  args: Array<string>,
  timeout = 8_000,
  input?: string,
): Promise<
  { ok: true; stdout: string; stderr: string } | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { timeout, maxBuffer: MAX_OUTPUT_CHARS },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            error: stderr?.toString().trim() || error.message,
          })
          return
        }
        resolve({
          ok: true,
          stdout: (stdout || '').toString(),
          stderr: (stderr || '').toString(),
        })
      },
    )
    if (input !== undefined) {
      child.stdin?.end(input)
    }
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sessionNameFor(workerId: string): string {
  return `swarm-${workerId}`
}

function resolveGithubToken(): string | null {
  const direct = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (direct && direct.trim()) return direct.trim()
  return null
}

function shellEscapeSingle(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

export function buildHermesTmuxLaunchCommand(input: {
  profilePath: string
  hermesBin: string
  ghToken?: string | null
}): string {
  const launchPrefix = [
    `HERMES_HOME='${shellEscapeSingle(input.profilePath)}'`,
    `HERMES_CLI_BIN='${shellEscapeSingle(input.hermesBin)}'`,
    input.ghToken ? `GH_TOKEN='${shellEscapeSingle(input.ghToken)}'` : '',
    input.ghToken ? `GITHUB_TOKEN='${shellEscapeSingle(input.ghToken)}'` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const hermesBin = shellEscapeSingle(input.hermesBin)

  // Do not exec the Hermes process. Keeping the parent shell alive means a
  // failed worker startup leaves a readable tmux pane instead of destroying the
  // session and turning the real error into "can't find pane".
  // NOTE: `hermes_status`, not `status` — zsh reserves `status` as a
  // read-only alias of `$?`, and this command runs inside the pane's default
  // shell. Also export a PATH that includes ~/.local/bin: when the workspace
  // server is spawned by launchd its minimal PATH propagates into the tmux
  // server, and the Hermes TUI needs `node` (symlinked in ~/.local/bin).
  return `export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"; ${launchPrefix} '${hermesBin}' chat --tui; hermes_status=$?; printf '\n[Hermes worker exited with status %s]\n' "$hermes_status"`
}

function parseAssignments(value: unknown): Array<AssignmentRequest> {
  if (!Array.isArray(value)) return []
  const assignments: Array<AssignmentRequest> = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const workerId = typeof obj.workerId === 'string' ? obj.workerId.trim() : ''
    const task = typeof obj.task === 'string' ? obj.task.trim() : ''
    const rationale =
      typeof obj.rationale === 'string' ? obj.rationale.trim() : undefined
    const dependsOn = Array.isArray(obj.dependsOn)
      ? obj.dependsOn.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : undefined
    const reviewRequired =
      typeof obj.reviewRequired === 'boolean' ? obj.reviewRequired : undefined
    const direct = typeof obj.direct === 'boolean' ? obj.direct : undefined
    const oneshot = typeof obj.oneshot === 'boolean' ? obj.oneshot : undefined
    if (!workerId || !task || !validateWorkerId(workerId)) continue
    assignments.push({
      workerId,
      task,
      rationale,
      dependsOn,
      reviewRequired,
      direct,
      oneshot,
    })
  }
  return assignments
}

function readRuntimeJson(profilePath: string): Record<string, unknown> {
  const runtimePath = join(profilePath, 'runtime.json')
  if (!existsSync(runtimePath)) return {}
  try {
    return JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return {}
  }
}

function writeRuntimePatch(
  workerId: string,
  patch: Record<string, unknown>,
): void {
  const profilePath = getProfilePath(workerId)
  mkdirSync(profilePath, { recursive: true })
  const runtimePath = join(profilePath, 'runtime.json')
  const current = readRuntimeJson(profilePath)
  const next = {
    ...current,
    workerId,
    ...patch,
  }
  writeFileSync(runtimePath, JSON.stringify(next, null, 2) + '\n')
}

function cleanRuntimeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function cleanRuntimeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function cleanRuntimeCheckpointStatus(
  value: unknown,
): RuntimeCheckpointSnapshot['checkpointStatus'] {
  return value === 'in_progress' ||
    value === 'done' ||
    value === 'blocked' ||
    value === 'handoff' ||
    value === 'needs_input'
    ? value
    : 'none'
}

export function readRuntimeCheckpointSnapshot(
  profilePath: string,
): RuntimeCheckpointSnapshot {
  const raw = readRuntimeJson(profilePath)
  return {
    checkpointStatus: cleanRuntimeCheckpointStatus(raw.checkpointStatus),
    state: cleanRuntimeText(raw.state),
    lastSummary: cleanRuntimeText(raw.lastSummary),
    lastResult: cleanRuntimeText(raw.lastResult),
    nextAction: cleanRuntimeText(raw.nextAction),
    blockedReason: cleanRuntimeText(raw.blockedReason),
    lastCheckIn: cleanRuntimeText(raw.lastCheckIn),
    lastOutputAt: cleanRuntimeNumber(raw.lastOutputAt),
    checkpointRaw: cleanRuntimeText(raw.checkpointRaw),
  }
}

export function runtimeCheckpointSignature(
  snapshot: RuntimeCheckpointSnapshot,
): string {
  return JSON.stringify(snapshot)
}

function isoToMs(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stateLabelForRuntimeSnapshot(
  snapshot: RuntimeCheckpointSnapshot,
): ParsedSwarmCheckpoint['stateLabel'] | null {
  switch (snapshot.checkpointStatus) {
    case 'done':
      return 'DONE'
    case 'blocked':
      return 'BLOCKED'
    case 'needs_input':
      return 'NEEDS_INPUT'
    case 'handoff':
      return 'HANDOFF'
    case 'in_progress':
      return 'IN_PROGRESS'
    default:
      break
  }
  const state = snapshot.state?.toLowerCase()
  if (state === 'blocked') return 'BLOCKED'
  if (state === 'waiting') return 'NEEDS_INPUT'
  if (
    state === 'executing' ||
    state === 'thinking' ||
    state === 'writing' ||
    state === 'reviewing' ||
    state === 'syncing'
  )
    return 'IN_PROGRESS'
  if (state === 'idle') return 'DONE'
  return null
}

function runtimeSnapshotHasMeaningfulCheckpoint(
  snapshot: RuntimeCheckpointSnapshot,
): boolean {
  return Boolean(
    snapshot.checkpointRaw ||
    snapshot.lastSummary ||
    snapshot.lastResult ||
    snapshot.nextAction ||
    snapshot.blockedReason,
  )
}

export function runtimeSnapshotIsFresh(
  snapshot: RuntimeCheckpointSnapshot,
  baselineSignature: string,
  dispatchedAt: number,
): boolean {
  const changed = runtimeCheckpointSignature(snapshot) !== baselineSignature
  if (!changed) return false
  const outputAt = snapshot.lastOutputAt
  const checkInAt = isoToMs(snapshot.lastCheckIn)
  return Boolean(
    (typeof outputAt === 'number' && outputAt >= dispatchedAt) ||
    (typeof checkInAt === 'number' && checkInAt >= dispatchedAt),
  )
}

function formatRuntimeCheckpointRaw(checkpoint: ParsedSwarmCheckpoint): string {
  return [
    `STATE: ${checkpoint.stateLabel}`,
    `FILES_CHANGED: ${checkpoint.filesChanged ?? 'none'}`,
    `COMMANDS_RUN: ${checkpoint.commandsRun ?? 'none'}`,
    `RESULT: ${checkpoint.result ?? 'none'}`,
    `BLOCKER: ${checkpoint.blocker ?? 'none'}`,
    `NEXT_ACTION: ${checkpoint.nextAction ?? 'none'}`,
  ].join('\n')
}

export function checkpointFromRuntimeSnapshot(
  snapshot: RuntimeCheckpointSnapshot,
): ParsedSwarmCheckpoint | null {
  if (snapshot.checkpointRaw) {
    const parsed = newestCheckpointFromMessages([
      { role: 'assistant', content: snapshot.checkpointRaw },
    ])
    if (parsed) return parsed
  }
  const stateLabel = stateLabelForRuntimeSnapshot(snapshot)
  if (!stateLabel || !runtimeSnapshotHasMeaningfulCheckpoint(snapshot))
    return null
  const result = snapshot.lastResult ?? snapshot.lastSummary
  const blocker = snapshot.blockedReason
  const checkpoint: ParsedSwarmCheckpoint = {
    stateLabel,
    runtimeState:
      stateLabel === 'DONE' || stateLabel === 'HANDOFF'
        ? 'idle'
        : stateLabel === 'BLOCKED'
          ? 'blocked'
          : stateLabel === 'NEEDS_INPUT'
            ? 'waiting'
            : 'executing',
    checkpointStatus:
      stateLabel === 'DONE'
        ? 'done'
        : stateLabel === 'BLOCKED'
          ? 'blocked'
          : stateLabel === 'NEEDS_INPUT'
            ? 'needs_input'
            : stateLabel === 'HANDOFF'
              ? 'handoff'
              : 'in_progress',
    filesChanged: null,
    commandsRun: null,
    result,
    blocker,
    nextAction: snapshot.nextAction,
    raw: '',
  }
  checkpoint.raw = formatRuntimeCheckpointRaw(checkpoint)
  return checkpoint
}

export function buildWorkerPrompt(input: {
  workerId: string
  task: string
  rationale?: string
  roster?: SwarmRosterWorker
  direct?: boolean
  raw?: boolean
  missionId?: string | null
  taskTitle?: string | null
  lessons?: Array<string>
  skillHints?: Array<{ title: string; snippet: string }>
}): string {
  if (input.direct && input.raw) return input.task
  const roster = input.roster
  const displayName = roster?.name?.trim() || input.workerId
  const role = roster?.role || 'Worker'
  const humanLabel = `${displayName} — ${role}`
  const skills = roster?.skills?.length
    ? roster.skills.join(', ')
    : 'swarm-worker-core'
  const capabilities = roster?.capabilities?.length
    ? roster.capabilities.join(', ')
    : 'not declared'
  const mission =
    roster?.mission || 'Execute assigned swarm tasks and checkpoint progress.'
  const specialty = roster?.specialty || 'General execution'

  let snapshotSection = ''
  try {
    const snapshot = buildSwarmStartupSnapshot({
      workerId: input.workerId,
      role,
      specialty,
      rosterMission: mission,
      taskTitle: input.taskTitle ?? null,
      missionId: input.missionId ?? null,
    })
    snapshotSection = snapshot.rendered
  } catch {
    snapshotSection = ''
  }

  const lines: Array<string> = [
    '## Swarm Orchestrator Dispatch',
    `Worker: ${humanLabel}`,
    `Machine ID: ${input.workerId}`,
    `Specialty: ${specialty}`,
    `Mission: ${mission}`,
    `Skills: ${skills}`,
    `Capabilities: ${capabilities}`,
    input.rationale ? `Routing rationale: ${input.rationale}` : '',
    '',
  ]
  if (snapshotSection) {
    lines.push(snapshotSection)
    lines.push('')
  }
  if (input.lessons?.length) {
    lines.push('## Lessons From Your Recent Failures')
    for (const lesson of input.lessons) lines.push(`- ${lesson}`)
    lines.push('')
  }
  if (input.skillHints?.length) {
    lines.push(
      '## Relevant Skills (harvested from previously successful tasks)',
    )
    for (const hint of input.skillHints) {
      lines.push(`### ${hint.title}`, hint.snippet, '')
    }
  }
  lines.push(
    '## Assigned Task',
    input.task,
    '',
    '## Operating Rules',
    '- Work in your persistent Hermes worker session and preserve your profile context.',
    '- NEVER run git checkout, switch, reset, rebase, or branch -f inside the live workspace repo (~/hermes-workspace). It serves the running app and the operator works there. If a task needs a branch, create an isolated worktree first: git -C ~/hermes-workspace worktree add ~/workspace/worker-trees/<task> -b <branch>, and do all work inside that worktree.',
    `- The Worker Startup Memory Snapshot above is your authoritative starting context. If you have filesystem tools, also read \`~/.\u0068\u0065\u0072\u006d\u0065\u0073/profiles/${input.workerId}/MEMORY.md\`, \`SOUL.md\`, \`USER.md\`, and \`memory/IDENTITY.md\` for full detail.`,
    `- Search your own memory before starting if relevant: GET /api/swarm-memory/search?workerId=${input.workerId}&q=<term>.`,
    '- Do not blame a generic sandbox for missing access. Assume repo/filesystem/network are available unless a command proves otherwise. If auth or tools fail, report the exact failing command and exact missing token/tool/env.',
    '- Produce concrete artifacts or a concrete checkpoint; avoid vague status updates.',
    '- If you are blocked, say exactly what is missing and the smallest unblock action.',
    '- If this is part of a larger workflow, stop after your checkpoint and wait for orchestrator continuation.',
    '- If context pressure is high, write a structured handoff to your handoffs/ directory before /new and continue from it on resume.',
    '',
    '## Required Checkpoint Format',
    'STATE: DONE | BLOCKED | NEEDS_INPUT | HANDOFF | IN_PROGRESS',
    'FILES_CHANGED: exact paths or none',
    'COMMANDS_RUN: exact commands or none',
    'RESULT: concrete result/proof',
    'BLOCKER: blocker or none',
    'NEXT_ACTION: exact recommended next action',
  )
  return lines.filter(Boolean).join('\n')
}

function markDispatchStarted(
  workerId: string,
  task: string,
  missionId?: string | null,
  assignmentId?: string | null,
  notifySessionKey?: string | null,
): void {
  const controlMessage = `Dispatched task: ${task.slice(0, 180)}`
  writeRuntimePatch(workerId, {
    state: 'executing',
    phase: 'dispatched',
    currentTask: task,
    currentMissionId: missionId ?? null,
    currentAssignmentId: assignmentId ?? null,
    checkpointStatus: 'in_progress',
    needsHuman: false,
    blockedReason: null,
    lastDispatchAt: Date.now(),
    lastDispatchMode: 'tmux',
    lastDispatchResult: 'Dispatch queued',
    lastCheckIn: new Date().toISOString(),
    lastSummary: controlMessage,
    lastControlMessage: controlMessage,
    nextAction:
      'Worker should execute and return the required checkpoint format.',
    notifySessionKey: notifySessionKey ?? 'main',
  })
}

function markDispatchResult(workerId: string, result: WorkerResult): void {
  writeRuntimePatch(workerId, {
    lastDispatchAt: Date.now(),
    lastDispatchMode: result.delivery ?? 'none',
    lastDispatchResult: result.ok
      ? result.output.slice(0, 500)
      : (result.error ?? 'dispatch failed').slice(0, 500),
    state: result.ok ? 'executing' : 'blocked',
    checkpointStatus: result.ok ? 'in_progress' : 'blocked',
    blockedReason: result.ok ? null : result.error,
    lastCheckIn: new Date().toISOString(),
  })
}

export function dispatchBlockReason(
  result: Pick<WorkerResult, 'ok' | 'error' | 'output' | 'checkpointStatus'>,
): string | null {
  // Only a genuine failure blocks. A successful dispatch that simply didn't
  // emit a structured checkpoint is NOT a block — previously any checkpoint
  // poll timeout marked the assignment "blocked / session timed out" even
  // though the worker ran the task to completion (process exited 0, files
  // written). That produced false blocks on successful work.
  if (!result.ok)
    return (
      result.error?.trim() ||
      result.output?.trim() ||
      'Dispatch failed before a worker checkpoint was recorded.'
    )
  return null
}

type DispatchOutcomeMeta = {
  tier: SwarmModelTier | null
  model: string | null
  mode: 'tmux' | 'oneshot'
}

// Blocked workers are important but can cluster; at most one push per 10 min.
let lastBlockedPushAt = 0
function notifyBlockedThrottled(workerId: string, reason: string): void {
  const now = Date.now()
  if (now - lastBlockedPushAt < 10 * 60 * 1000) return
  lastBlockedPushAt = now
  notifyPhone({
    title: `Worker blocked: ${workerId}`,
    message: reason.slice(0, 300),
    priority: 4,
    tags: ['no_entry'],
  })
}

/**
 * Terminal bookkeeping for every dispatch: append the outcome record
 * (feeds the scoreboard, router learning and prompt lessons), harvest a
 * vault skill from a DONE checkpoint with evidence, then apply the
 * existing block handling. All best-effort — never affects the result.
 */
function finalizeDispatch(
  workerId: string,
  assignment: AssignmentRequest,
  result: WorkerResult,
  meta: DispatchOutcomeMeta,
  options?: { missionId?: string | null },
): void {
  const blockReason = dispatchBlockReason(result)
  if (blockReason) notifyBlockedThrottled(workerId, blockReason)
  try {
    recordSwarmOutcome({
      workerId,
      task: assignment.task,
      tier: meta.tier,
      model: meta.model,
      mode: meta.mode,
      ok: result.ok,
      blocked: blockReason !== null,
      blockReason,
      checkpointStatus: result.checkpointStatus ?? null,
      durationMs: result.durationMs,
    })
  } catch {
    /* outcome memory is best-effort */
  }
  if (result.checkpoint) {
    try {
      harvestSkillFromCheckpoint({
        workerId,
        task: assignment.task,
        checkpoint: result.checkpoint,
      })
    } catch {
      /* skill harvest is best-effort */
    }
  }
  // Trust-but-verify: queue adversarial review of fresh DONE work; alert on
  // refuted verdicts coming back from the verifier.
  processVerification({
    workerId,
    task: assignment.task,
    ok: result.ok,
    checkpoint: result.checkpoint,
  })
  recordDispatchBlock(workerId, assignment, result, options)
}

function recordDispatchBlock(
  workerId: string,
  assignment: AssignmentRequest,
  result: WorkerResult,
  options?: { missionId?: string | null },
): void {
  const reason = dispatchBlockReason(result)
  if (!reason) return
  recordMissionAssignmentBlocked({
    missionId: options?.missionId,
    assignmentId: assignment.assignmentId ?? null,
    workerId,
    reason,
    source: 'swarm-dispatch',
  })
  writeRuntimePatch(workerId, {
    state: 'blocked',
    phase: 'blocked',
    checkpointStatus: 'blocked',
    blockedReason: reason,
    lastDispatchResult: reason,
    lastCheckIn: new Date().toISOString(),
    lastOutputAt: Date.now(),
  })
}

function markCheckpointResult(
  workerId: string,
  checkpoint: ParsedSwarmCheckpoint,
  notifySessionKey?: string | null,
): void {
  // When the checkpoint reaches any terminal status (anything other than
  // 'in_progress' — i.e. done/blocked/needs_input/handoff) the worker is no
  // longer running this task, so clear currentTask the same way conductor-stop
  // resets it. While still in_progress we omit the key entirely so
  // writeRuntimePatch keeps the existing currentTask untouched.
  const clearCurrentTask = checkpoint.checkpointStatus !== 'in_progress'
  writeRuntimePatch(workerId, {
    state: checkpoint.runtimeState,
    phase: checkpoint.stateLabel.toLowerCase(),
    checkpointStatus: checkpoint.checkpointStatus,
    ...(clearCurrentTask ? { currentTask: null } : {}),
    lastCheckIn: new Date().toISOString(),
    lastOutputAt: Date.now(),
    lastSummary: checkpoint.result,
    lastResult: checkpoint.result,
    lastRealSummary: checkpoint.result,
    lastRealResult: checkpoint.result,
    lastControlMessage: null,
    nextAction: checkpoint.nextAction,
    blockedReason:
      checkpoint.stateLabel === 'BLOCKED' ||
      checkpoint.stateLabel === 'NEEDS_INPUT'
        ? checkpoint.blocker
        : null,
    needsHuman: checkpoint.stateLabel === 'NEEDS_INPUT',
    checkpointRaw: checkpoint.raw,
    checkpointFilesChanged: checkpoint.filesChanged,
    checkpointCommandsRun: checkpoint.commandsRun,
    notifySessionKey: notifySessionKey ?? 'main',
  })
}

async function waitForFreshCheckpoint(
  workerId: string,
  previousRaw: string | null,
  baselineRuntimeSignature: string,
  dispatchedAt: number,
  timeoutMs: number,
): Promise<ParsedSwarmCheckpoint | null> {
  const started = Date.now()
  const profilePath = getProfilePath(workerId)
  while (Date.now() - started < timeoutMs) {
    const runtimeSnapshot = readRuntimeCheckpointSnapshot(profilePath)
    if (
      runtimeSnapshotIsFresh(
        runtimeSnapshot,
        baselineRuntimeSignature,
        dispatchedAt,
      )
    ) {
      const runtimeCheckpoint = checkpointFromRuntimeSnapshot(runtimeSnapshot)
      if (runtimeCheckpoint && runtimeCheckpoint.raw !== previousRaw)
        return runtimeCheckpoint
    }

    const chat = readWorkerMessages(profilePath, 50)
    if (chat.ok) {
      const checkpoint = newestCheckpointFromMessages(chat.messages)
      if (checkpoint && checkpoint.raw !== previousRaw) return checkpoint
    }
    await sleep(2_000)
  }
  return null
}

function resolveWorkerCwd(workerId: string): string {
  const wrapperPath = getWrapperPath(workerId)
  if (existsSync(wrapperPath)) {
    try {
      const text = readFileSync(wrapperPath, 'utf8')
      const m = text.match(/cd\s+([^\n]+?)\s+\|\|\s+exit\s+1/)
      if (m?.[1]) {
        const raw = m[1].trim().replace(/^['"]|['"]$/g, '')
        if (raw && existsSync(raw)) return raw
      }
    } catch {
      /* noop */
    }
  }
  return defaultWorkspaceRoot()
}

/**
 * Shared workspace root for agent file output. Mirrors the Files-page
 * fallback chain (env override, then ~/workspace) so worker output is always
 * visible in the built-in file browser instead of scattering across $HOME.
 */
function defaultWorkspaceRoot(): string {
  const env =
    process.env.HERMES_WORKSPACE_DIR?.trim() ||
    process.env.CLAUDE_WORKSPACE_DIR?.trim()
  if (env && existsSync(env)) return env
  const shared = join(homedir(), 'workspace')
  if (!existsSync(shared)) {
    try {
      mkdirSync(shared, { recursive: true })
    } catch {
      return homedir()
    }
  }
  return shared
}

async function captureTmuxPane(
  tmuxBin: string,
  sessionName: string,
): Promise<string> {
  const captured = await execFileAsync(
    tmuxBin,
    ['capture-pane', '-p', '-t', sessionName, '-S', '-200'],
    8_000,
  )
  return captured.ok ? captured.stdout.trim() : ''
}

/**
 * Best-effort completion detection for the live-TUI path. When a dispatch's
 * checkpoint poll times out, the agent may either still be working OR have
 * finished silently (no structured checkpoint emitted). Read the pane: if the
 * TUI is back at an idle `ready` status line with no active-work markers, the
 * task finished — return a short reply summary so the caller can synthesize a
 * DONE checkpoint. Return null when the agent still looks busy (leave the
 * assignment `executing`).
 */
async function readIdleTuiReply(
  tmuxBin: string,
  sessionName: string,
): Promise<string | null> {
  const pane = await captureTmuxPane(tmuxBin, sessionName)
  if (!pane) return null
  // Active-work markers → still running; do not mark done.
  if (
    /esc to interrupt|thinking…|thinking\b|running…|working…|generating…|▐|▌|◐|◓|◑|◒/i.test(
      pane,
    )
  ) {
    return null
  }
  // Require an idle `ready │ …` status line (the TUI footer when not working).
  if (!/(?:^|\n)\s*[─-].*\bready\b\s*│/i.test(pane)) return null

  // Pull the last few non-empty content lines above the status footer as a
  // rough reply summary. The exact text isn't critical — the point is to move
  // the assignment out of the `executing` limbo into DONE.
  const lines = pane
    .split('\n')
    .map((l) => l.replace(/[│┃╰╭╮╯─┊•]/g, '').trim())
    .filter(
      (l) =>
        l &&
        !/\bready\b\s*│/i.test(l) &&
        !/^❯|❯$/.test(l) &&
        !/Try ["“]/.test(l) &&
        !/\/help for commands/i.test(l),
    )
  const summary = lines.slice(-6).join(' ').slice(-500).trim()
  return summary || 'Completed (live session returned to idle).'
}

/** workerId-based wrapper: resolve tmux bin + session and read idle reply. */
async function readIdleTuiSummary(workerId: string): Promise<string | null> {
  const tmuxBin = resolveTmuxBin()
  if (!tmuxBin) return null
  const sessionName = sessionNameFor(workerId)
  if (!(await tmuxHasSession(tmuxBin, sessionName))) return null
  try {
    return await readIdleTuiReply(tmuxBin, sessionName)
  } catch {
    return null
  }
}

// A tmux session can outlive its agent: when `hermes chat --tui` exits, the
// wrapper's parent shell stays up (bare zsh/bash) with an exit sentinel in the
// scrollback. Treat the pane as alive only when the foreground process is the
// Python TUI and no exit sentinel is present. Conservative on failure (assume
// alive) so a transient tmux hiccup doesn't needlessly recycle a good worker.
async function agentPaneIsAlive(
  tmuxBin: string,
  sessionName: string,
): Promise<boolean> {
  const cmd = await execFileAsync(tmuxBin, [
    'display-message',
    '-p',
    '-t',
    sessionName,
    '#{pane_current_command}',
  ])
  if (!cmd.ok) return true
  const current = cmd.stdout.trim().toLowerCase()
  const looksLikeShell = /^(-?zsh|-?bash|-?sh|fish|login)$/.test(current)
  if (looksLikeShell) return false

  const pane = await captureTmuxPane(tmuxBin, sessionName)
  if (/(?:^|\n)\[Hermes worker exited with status/.test(pane)) return false
  return true
}

function redactStartupOutput(output: string): string {
  return output
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, '[REDACTED]')
    .replace(/(gh[pousr]_[A-Za-z0-9_]{12,})/g, '[REDACTED]')
}

async function ensureLiveTmuxSession(
  workerId: string,
): Promise<
  | { ok: true; tmuxBin: string; sessionName: string }
  | { ok: false; error: string }
> {
  const tmuxBin = resolveTmuxBin()
  if (!tmuxBin) return { ok: false, error: 'tmux not installed' }

  const sessionName = sessionNameFor(workerId)
  if (await tmuxHasSession(tmuxBin, sessionName)) {
    // The session name existing is NOT proof the agent is alive. When
    // `hermes chat --tui` exits, the wrapper keeps the parent shell alive (so
    // the error is readable) — leaving a bare shell pane. Dispatching into that
    // dead shell delivers the prompt to zsh, the agent never checkpoints, and
    // the orchestrator re-dispatches forever (the "stuck in a loop" symptom).
    // Detect the dead pane and rebuild the session instead of returning ok.
    if (await agentPaneIsAlive(tmuxBin, sessionName)) {
      return { ok: true, tmuxBin, sessionName }
    }
    await execFileAsync(tmuxBin, ['kill-session', '-t', sessionName])
  }

  const profilePath = getProfilePath(workerId)
  ensureSwarmProfileConfig(profilePath)
  const cwd = resolveWorkerCwd(workerId)
  const hermesBin = resolveHermesBin()
  const launchCommand = buildHermesTmuxLaunchCommand({
    profilePath,
    hermesBin,
    ghToken: resolveGithubToken(),
  })

  const started = await execFileAsync(tmuxBin, [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-c',
    cwd,
  ])
  if (!started.ok) {
    return { ok: false, error: started.error }
  }

  const launched = await execFileAsync(tmuxBin, [
    'send-keys',
    '-t',
    sessionName,
    launchCommand,
    'C-m',
  ])
  if (!launched.ok) {
    return { ok: false, error: launched.error }
  }

  // Wait until the TUI is actually READY before anyone pastes a prompt into
  // the pane. A cold TUI start can spend 30-60s+ on "Installing TUI
  // dependencies…" — the old fixed 1.2s wait returned ok while the pane was
  // still booting, the pasted prompt vanished into the installer, no
  // checkpoint ever arrived, and the dispatch surfaced as "session timed out"
  // (classic right after Clear All kills every warm session). Poll for the
  // ready prompt line or the exit sentinel, up to 90s.
  const READY_PATTERN = /(?:^|\n)\s*[─-].*\bready\b\s*│|❯/
  const exitedPatternEarly = /(?:^|\n)\[Hermes worker exited with status/
  let startupOutput = ''
  const startupDeadline = Date.now() + 90_000
  for (;;) {
    await sleep(1500)
    if (!(await tmuxHasSession(tmuxBin, sessionName))) {
      return {
        ok: false,
        error: `Hermes worker tmux session ${sessionName} exited during startup`,
      }
    }
    startupOutput = await captureTmuxPane(tmuxBin, sessionName)
    if (exitedPatternEarly.test(startupOutput)) break // handled below
    if (READY_PATTERN.test(startupOutput)) break
    if (Date.now() > startupDeadline) {
      return {
        ok: false,
        error: `Hermes worker TUI in ${sessionName} did not become ready within 90s (still starting up). Falling back to oneshot.`,
      }
    }
  }
  // Match only at the start of a line so the echoed shell command's printf
  // format string doesn't trigger a false positive startup-failure sentinel.
  const exitedPattern = /(?:^|\n)\[Hermes worker exited with status/
  if (exitedPattern.test(startupOutput)) {
    const sanitizedOutput = redactStartupOutput(startupOutput).slice(-4_000)
    const logsDir = join(profilePath, 'logs')
    mkdirSync(logsDir, { recursive: true })
    const startupLogPath = join(logsDir, 'swarm-dispatch-startup.log')
    writeFileSync(
      startupLogPath,
      `${new Date().toISOString()} ${sanitizedOutput}
`,
      { flag: 'a' },
    )
    return {
      ok: false,
      error: `Hermes worker failed to start in tmux session ${sessionName}. Startup output saved to ${startupLogPath}: ${sanitizedOutput}`,
    }
  }

  return { ok: true, tmuxBin, sessionName }
}

async function sendPromptToLiveSession(
  workerId: string,
  prompt: string,
  routedModel?: string | null,
): Promise<WorkerResult | null> {
  const startedAt = Date.now()
  const ensured = await ensureLiveTmuxSession(workerId)
  if (!ensured.ok) return null

  const { tmuxBin, sessionName } = ensured
  const normalizedPrompt = prompt.replace(/\r\n/g, '\n')

  // Model router: switch the live TUI to the tier-appropriate model before
  // delivering the prompt. `/model <id>` is a plain single-line TUI command;
  // send-keys -l is safe here (no multiline concerns). Best-effort: if the
  // TUI rejects the model the command just echoes an error and the prompt
  // still executes on the session's current model.
  if (routedModel) {
    await execFileAsync(tmuxBin, ['send-keys', '-t', sessionName, 'C-u'])
    await execFileAsync(tmuxBin, [
      'send-keys',
      '-l',
      '-t',
      sessionName,
      `/model ${routedModel}`,
    ])
    await execFileAsync(tmuxBin, ['send-keys', '-t', sessionName, 'Enter'])
    await sleep(700)
  }

  // Use tmux paste-buffer instead of send-keys -l line-by-line. This is more
  // reliable for live TUI delivery because it preserves multiline content and
  // avoids key translation/terminal timing issues. Enter submits the composed
  // prompt after paste.
  const loaded = await execFileAsync(
    tmuxBin,
    ['load-buffer', '-b', `swarm-dispatch-${workerId}`, '-'],
    8_000,
    normalizedPrompt,
  )
  if (!loaded.ok) {
    return {
      workerId,
      ok: false,
      output: '',
      error: loaded.error,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      delivery: 'tmux',
    }
  }

  // Ensure we are sending a fresh prompt, not appending onto a partially typed
  // line left in the agent TUI. Ctrl-U clears readline-style input in the
  // current prompt without disrupting the session.
  const cleared = await execFileAsync(tmuxBin, [
    'send-keys',
    '-t',
    sessionName,
    'C-u',
  ])
  if (!cleared.ok) {
    return {
      workerId,
      ok: false,
      output: '',
      error: cleared.error,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      delivery: 'tmux',
    }
  }

  const pasted = await execFileAsync(tmuxBin, [
    'paste-buffer',
    '-d',
    '-b',
    `swarm-dispatch-${workerId}`,
    '-t',
    sessionName,
  ])
  if (!pasted.ok) {
    return {
      workerId,
      ok: false,
      output: '',
      error: pasted.error,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      delivery: 'tmux',
    }
  }

  // Give the TUI enough time to ingest the paste before submitting. The Hermes
  // prompt can visually contain the pasted text before prompt_toolkit is ready
  // to accept Enter; sending a confirmation Enter shortly after the first one
  // prevents the user-visible failure mode where the task sits at the prompt.
  await sleep(2000)
  const enter = await execFileAsync(tmuxBin, [
    'send-keys',
    '-t',
    sessionName,
    'C-m',
  ])
  if (!enter.ok) {
    return {
      workerId,
      ok: false,
      output: '',
      error: enter.error,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      delivery: 'tmux',
    }
  }
  await sleep(1000)
  const confirmEnter = await execFileAsync(tmuxBin, [
    'send-keys',
    '-t',
    sessionName,
    'C-m',
  ])
  if (!confirmEnter.ok) {
    return {
      workerId,
      ok: false,
      output: '',
      error: confirmEnter.error,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      delivery: 'tmux',
    }
  }

  return {
    workerId,
    ok: true,
    output: `Delivered to live tmux session ${sessionName}`,
    error: null,
    durationMs: Date.now() - startedAt,
    exitCode: 0,
    delivery: 'tmux',
  }
}

export function buildHermesChatQueryArgs(
  prompt: string,
  opts?: { model?: string | null; bypassApprovals?: boolean },
): string[] {
  // `hermes chat -q` requires the query as the *immediate* next argv item.
  // Keeping the prompt adjacent to -q prevents argparse from interpreting
  // following flags (for example -Q) as a missing query and failing with:
  // "argument -q/--query: expected one argument".
  //
  // `--source swarm-dispatch` goes FIRST (before the huge -q prompt) so it
  // stays inside macOS pkill's ~4KB command-line window — Clear All kills
  // in-flight dispatches by matching that marker, which was invisible when it
  // trailed a multi-thousand-char prompt.
  const args = [
    'chat',
    '--source',
    'swarm-dispatch',
    '-q',
    prompt,
    '-Q',
    '--ignore-rules',
  ]
  // Honor the worker's permission mode: only bypass Hermes approvals when the
  // profile is in auto/yolo mode (default true preserves prior behavior for
  // profiles with no approvals config).
  if (opts?.bypassApprovals !== false) args.push('--yolo')
  if (opts?.model) args.push('-m', opts.model)
  return args
}

/**
 * Read a worker profile's `approvals.mode`. Only explicit 'ask' keeps Hermes'
 * approval prompts on dispatched work (operator wants to gate every action).
 * 'smart'/'auto'/'yolo'/missing all bypass: an unattended oneshot has no UI
 * attached, so a pending approval prompt would just hang until timeout.
 * Persistent TUI sessions still honor the profile's own mode natively.
 */
export function workerBypassesApprovals(profilePath: string): boolean {
  try {
    const raw = readFileSync(join(profilePath, 'config.yaml'), 'utf8')
    const m = raw.match(
      /^approvals:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+mode:[ \t]*(\S+)/m,
    )
    return m?.[1]?.toLowerCase() !== 'ask'
  } catch {
    return true
  }
}

function runWorker(
  assignment: AssignmentRequest,
  timeoutMs: number,
  roster: SwarmRosterWorker | undefined,
  options?: {
    waitForCheckpoint?: boolean
    checkpointPollMs?: number
    missionId?: string | null
    notifySessionKey?: string | null
  },
): Promise<WorkerResult> {
  return new Promise(async (resolve) => {
    const workerId = assignment.workerId
    // Outcome memory: recent failure lessons + harvested skills matching
    // this task are injected into the prompt so the worker doesn't repeat
    // known failure modes and reuses approaches that already worked.
    let lessons: Array<string> = []
    let skillHints: Array<{ title: string; snippet: string }> = []
    try {
      lessons = lessonsForWorker(workerId)
      skillHints = matchSkillsForTask(assignment.task).map((m) => ({
        title: m.title,
        snippet: m.snippet,
      }))
      // Semantic memory: bounded RAG lookup over vault/playbook/outcomes.
      // Skip sources already covered by keyword skill matches above.
      const seen = new Set(skillHints.map((h) => h.title))
      for (const hit of await ragSearchSafe(assignment.task, 2)) {
        const title = `Memory (${hit.source}): ${hit.path.split('/').pop()}`
        if (seen.has(title)) continue
        skillHints.push({ title, snippet: hit.snippet })
        if (skillHints.length >= 4) break
      }
    } catch {
      /* best-effort */
    }
    const prompt = buildWorkerPrompt({
      workerId,
      task: assignment.task,
      rationale: assignment.rationale,
      roster,
      direct: assignment.direct,
      missionId: options?.missionId ?? null,
      taskTitle: assignment.task.slice(0, 120),
      lessons,
      skillHints,
    })
    const profilePath = getProfilePath(workerId)
    // Self-heal recurring provider drift: hermes-agent's CLI rewrites a
    // worker's config.yaml to `provider: deepseek` + api.deepseek.com (no key)
    // based on the model name, which then silently falls back. Re-assert the
    // roster model's canonical provider (ollama-cloud) on every dispatch.
    const resolvedModel = resolveSwarmModelLabel(roster?.model ?? null)
    if (resolvedModel) {
      try {
        syncSwarmProfileModel(profilePath, resolvedModel)
      } catch {
        /* best-effort — never wedge a dispatch on a config heal */
      }
    }
    const runtimeBeforeDispatch = readRuntimeCheckpointSnapshot(profilePath)
    const previousRaw = runtimeBeforeDispatch.checkpointRaw
    const baselineRuntimeSignature = runtimeCheckpointSignature(
      runtimeBeforeDispatch,
    )
    markDispatchStarted(
      workerId,
      assignment.task,
      options?.missionId ?? null,
      assignment.assignmentId ?? null,
      options?.notifySessionKey ?? 'main',
    )
    if (options?.missionId) {
      markMissionAssignmentDispatched({
        missionId: options.missionId,
        workerId,
        task: assignment.task,
        source: 'swarm-dispatch',
        author: 'aurora',
      })
    }
    appendSwarmMemoryEvent({
      workerId,
      missionId: options?.missionId ?? null,
      assignmentId: assignment.assignmentId ?? null,
      type: 'dispatch',
      summary: `Dispatched task: ${assignment.task.slice(0, 240)}`,
      event: {
        task: assignment.task,
        rationale: assignment.rationale ?? null,
        direct: assignment.direct ?? false,
        deliveryTarget: 'tmux',
      },
    })
    const startedAt = Date.now()
    const wrapperPath = getWrapperPath(workerId)

    // Model router: pick a tier-appropriate model for this task instead of
    // always paying the worker's roster-default price. Applied to both the
    // live TUI path (/model command) and the oneshot fallback (-m flag).
    let routed = routeTaskModel({
      task: assignment.task,
      allowedTiers: roster?.modelTiers,
    })
    // Router learning: if this worker has been failing repeatedly at the
    // chosen tier recently, escalate one tier up-front (still clamped to
    // the worker's allowed band) instead of paying for a doomed attempt.
    if (routed && tierNeedsEscalation(workerId, routed.tier)) {
      const bumped = escalateTier(routed.tier)
      if (bumped) {
        const clamped = clampTier(bumped, roster?.modelTiers)
        if (clamped !== routed.tier) {
          routed = { tier: clamped, model: TIER_MODELS[clamped] }
        }
      }
    } else if (routed) {
      // Cost right-sizing: when this worker's record at the tier below is
      // deep and strong, demote one tier. Escalation always wins; reasoning
      // tasks never demote (see demoteTier).
      const lower = demoteTier(routed.tier)
      if (lower && tierCanDemote(workerId, lower)) {
        const clamped = clampTier(lower, roster?.modelTiers)
        if (clamped !== routed.tier) {
          routed = { tier: clamped, model: TIER_MODELS[clamped] }
        }
      }
    }

    // Prefer the persistent live agent session when available/startable.
    // assignment.oneshot forces the direct CLI path — callers that need the
    // full answer synchronously (goal planning) can't use the live TUI,
    // whose first checkpoint is often just an ack.
    const liveResult = assignment.oneshot
      ? null
      : await sendPromptToLiveSession(workerId, prompt, routed?.model ?? null)
    if (liveResult) {
      markDispatchResult(workerId, liveResult)
      if (options?.waitForCheckpoint && liveResult.ok) {
        const checkpoint = await waitForFreshCheckpoint(
          workerId,
          previousRaw,
          baselineRuntimeSignature,
          startedAt,
          options.checkpointPollMs ?? 90_000,
        )
        if (checkpoint) {
          markCheckpointResult(
            workerId,
            checkpoint,
            options?.notifySessionKey ?? 'main',
          )
          const updatedMission = recordMissionCheckpoint({
            missionId: options?.missionId,
            assignmentId: assignment.assignmentId ?? null,
            workerId,
            checkpoint,
            source: 'swarm-dispatch',
          })
          if (updatedMission?._completed) {
            try {
              for (const wId of new Set(
                updatedMission.assignments.map((a) => a.workerId),
              )) {
                appendSwarmMemoryEvent({
                  workerId: wId,
                  missionId: updatedMission.id,
                  type: 'complete',
                  title: updatedMission.title,
                  summary: `Mission complete: ${updatedMission.title}`,
                })
              }
            } catch {
              /* memory write best-effort */
            }
          }
          appendSwarmMemoryEvent({
            workerId,
            missionId: options?.missionId ?? null,
            assignmentId: assignment.assignmentId ?? null,
            type: 'checkpoint',
            summary: checkpoint.result ?? `Checkpoint ${checkpoint.stateLabel}`,
            checkpoint,
            event: {
              stateLabel: checkpoint.stateLabel,
              filesChanged: checkpoint.filesChanged,
              commandsRun: checkpoint.commandsRun,
              blocker: checkpoint.blocker,
              nextAction: checkpoint.nextAction,
            },
          })
          publishSwarmCheckpointNotification({
            workerId,
            missionId: options?.missionId ?? null,
            assignmentId: assignment.assignmentId ?? null,
            checkpoint,
            notifySessionKey: options?.notifySessionKey ?? 'main',
          })
          liveResult.checkpoint = checkpoint
          liveResult.checkpointStatus = 'checkpointed'
          liveResult.output = `${liveResult.output}\nCheckpoint ${checkpoint.stateLabel}: ${checkpoint.result ?? 'no result'}`
        } else {
          // No structured checkpoint in the poll window. Peek at the pane: if
          // the TUI is back at idle-ready the task actually finished (agent
          // just didn't emit a checkpoint) → synthesize DONE so the assignment
          // leaves `executing`. If still busy, keep the soft timeout.
          const idleReply = await readIdleTuiSummary(workerId)
          if (idleReply) {
            const synthetic: ParsedSwarmCheckpoint = {
              stateLabel: 'DONE',
              runtimeState: 'idle',
              checkpointStatus: 'done',
              filesChanged: null,
              commandsRun: null,
              result: idleReply,
              blocker: null,
              nextAction: null,
              raw: idleReply,
            }
            markCheckpointResult(
              workerId,
              synthetic,
              options?.notifySessionKey ?? 'main',
            )
            recordMissionCheckpoint({
              missionId: options?.missionId,
              assignmentId: assignment.assignmentId ?? null,
              workerId,
              checkpoint: synthetic,
              source: 'swarm-dispatch',
            })
            liveResult.checkpoint = synthetic
            liveResult.checkpointStatus = 'checkpointed'
            liveResult.output = `${liveResult.output}\nCompleted (idle): ${idleReply}`
          } else {
            // Still working async in the pane — NOT a failure or block. The
            // lifecycle sweep / next dispatch picks up the eventual checkpoint.
            liveResult.checkpoint = null
            liveResult.checkpointStatus = 'timeout'
            liveResult.output = `${liveResult.output}\nDelivered; worker still running (no checkpoint yet).`
          }
        }
      } else {
        liveResult.checkpointStatus = 'not-requested'
      }
      finalizeDispatch(
        workerId,
        assignment,
        liveResult,
        {
          tier: routed?.tier ?? null,
          model: routed?.model ?? null,
          mode: 'tmux',
        },
        options,
      )
      resolve(liveResult)
      return
    }

    if (!existsSync(profilePath)) {
      const result: WorkerResult = {
        workerId,
        ok: false,
        output: '',
        error: `Profile not found at ${profilePath}`,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        delivery: 'oneshot',
      }
      markDispatchResult(workerId, result)
      finalizeDispatch(
        workerId,
        assignment,
        result,
        {
          tier: routed?.tier ?? null,
          model: routed?.model ?? null,
          mode: 'oneshot',
        },
        options,
      )
      resolve(result)
      return
    }

    const useWrapper = existsSync(wrapperPath)
    const cmd = useWrapper ? wrapperPath : resolveHermesBin()
    // One automatic escalation to the next tier if the first attempt errors.
    let currentTier = routed?.tier ?? null
    let escalationLeft = routed ? 1 : 0
    const bypassApprovals = workerBypassesApprovals(profilePath)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HERMES_HOME: profilePath,
    }
    const ghToken = resolveGithubToken()
    if (ghToken) {
      env.GH_TOKEN = ghToken
      env.GITHUB_TOKEN = ghToken
    }

    const launchOneshot = (modelArg: string | null): void => {
      const proc = execFile(
        cmd,
        buildHermesChatQueryArgs(prompt, {
          model: modelArg,
          bypassApprovals,
        }),
        {
          env,
          // Run oneshot workers in the shared workspace root (not $HOME) so any
          // files an agent writes land in the Files-page root instead of
          // scattering project output across the home directory.
          cwd: defaultWorkspaceRoot(),
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_CHARS,
          killSignal: 'SIGTERM',
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startedAt
          const stdoutStr = (stdout || '').toString()
          const stderrStr = (stderr || '').toString()
          const out =
            stdoutStr.length > MAX_OUTPUT_CHARS
              ? stdoutStr.slice(-MAX_OUTPUT_CHARS)
              : stdoutStr

          if (error) {
            // Router escalation: one retry on the next tier up before
            // surfacing the failure (light task that turned out hard, model
            // refused/context blown, transient provider error).
            if (escalationLeft > 0 && currentTier) {
              const nextTier = escalateTier(currentTier)
              if (nextTier) {
                escalationLeft -= 1
                currentTier = nextTier
                launchOneshot(TIER_MODELS[nextTier])
                return
              }
            }
            const code = (error as { code?: number | null }).code ?? null
            const result: WorkerResult = {
              workerId,
              ok: false,
              output: out,
              error: stderrStr.trim() || error.message,
              durationMs,
              exitCode: typeof code === 'number' ? code : null,
              delivery: 'oneshot',
            }
            markDispatchResult(workerId, result)
            finalizeDispatch(
              workerId,
              assignment,
              result,
              {
                tier: currentTier,
                model: currentTier ? TIER_MODELS[currentTier] : null,
                mode: 'oneshot',
              },
              options,
            )
            resolve(result)
            return
          }

          const result: WorkerResult = {
            workerId,
            ok: true,
            output: out,
            error: stderrStr.trim() || null,
            durationMs,
            exitCode: 0,
            delivery: 'oneshot',
          }
          if (options?.waitForCheckpoint) {
            const checkpoint = parseSwarmCheckpoint(out)
            if (checkpoint) {
              markCheckpointResult(
                workerId,
                checkpoint,
                options?.notifySessionKey ?? 'main',
              )
              recordMissionCheckpoint({
                missionId: options?.missionId,
                assignmentId: assignment.assignmentId ?? null,
                workerId,
                checkpoint,
                source: 'swarm-dispatch',
              })
              appendSwarmMemoryEvent({
                workerId,
                missionId: options?.missionId ?? null,
                assignmentId: assignment.assignmentId ?? null,
                type: 'checkpoint',
                summary:
                  checkpoint.result ?? `Checkpoint ${checkpoint.stateLabel}`,
                checkpoint,
                event: {
                  stateLabel: checkpoint.stateLabel,
                  filesChanged: checkpoint.filesChanged,
                  commandsRun: checkpoint.commandsRun,
                  blocker: checkpoint.blocker,
                  nextAction: checkpoint.nextAction,
                },
              })
              publishSwarmCheckpointNotification({
                workerId,
                missionId: options?.missionId ?? null,
                assignmentId: assignment.assignmentId ?? null,
                checkpoint,
                notifySessionKey: options?.notifySessionKey ?? 'main',
              })
              result.checkpoint = checkpoint
              result.checkpointStatus = 'checkpointed'
            } else {
              // A oneshot that exited 0 ran to completion — the agent just
              // didn't emit the structured checkpoint block. Synthesize a DONE
              // checkpoint from its output so the assignment is recorded as
              // completed instead of hanging as a false timeout/block.
              const synthetic: ParsedSwarmCheckpoint = {
                stateLabel: 'DONE',
                runtimeState: 'idle',
                checkpointStatus: 'done',
                filesChanged: null,
                commandsRun: null,
                result:
                  out.trim().slice(-500) ||
                  'Completed (no structured checkpoint).',
                blocker: null,
                nextAction: null,
                raw: out.trim().slice(-2000),
              }
              markCheckpointResult(
                workerId,
                synthetic,
                options?.notifySessionKey ?? 'main',
              )
              recordMissionCheckpoint({
                missionId: options?.missionId,
                assignmentId: assignment.assignmentId ?? null,
                workerId,
                checkpoint: synthetic,
                source: 'swarm-dispatch',
              })
              result.checkpoint = synthetic
              result.checkpointStatus = 'checkpointed'
            }
          } else {
            result.checkpointStatus = 'not-requested'
          }
          markDispatchResult(workerId, result)
          finalizeDispatch(
            workerId,
            assignment,
            result,
            {
              tier: currentTier,
              model: currentTier ? TIER_MODELS[currentTier] : null,
              mode: 'oneshot',
            },
            options,
          )
          resolve(result)
        },
      )

      proc.on('error', (error) => {
        const result: WorkerResult = {
          workerId,
          ok: false,
          output: '',
          error: error.message,
          durationMs: Date.now() - startedAt,
          exitCode: null,
          delivery: 'oneshot',
        }
        markDispatchResult(workerId, result)
        finalizeDispatch(
          workerId,
          assignment,
          result,
          {
            tier: currentTier,
            model: currentTier ? TIER_MODELS[currentTier] : null,
            mode: 'oneshot',
          },
          options,
        )
        resolve(result)
      })
    }
    launchOneshot(routed?.model ?? null)
  })
}

export type SpendCapStatus = {
  enabled: boolean
  capTokens: number
  spentTokens: number
  remainingTokens: number
  exceeded: boolean
}

/**
 * Evaluate the daily token spend cap. Disabled (never exceeded) unless
 * HERMES_SWARM_DAILY_TOKEN_CAP is a positive number. Spend = sum of today's
 * total tokens across all workers (from the usage aggregator). Best-effort:
 * a usage read failure never blocks dispatch.
 */
export async function evaluateSpendCap(): Promise<SpendCapStatus> {
  const capRaw = Number(process.env.HERMES_SWARM_DAILY_TOKEN_CAP ?? '')
  const capTokens = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0
  if (capTokens === 0) {
    return {
      enabled: false,
      capTokens: 0,
      spentTokens: 0,
      remainingTokens: Infinity,
      exceeded: false,
    }
  }
  let spentTokens = 0
  try {
    const usage = await getSwarmUsage()
    spentTokens = usage.workers.reduce(
      (sum, w) => sum + (w.today.total || 0),
      0,
    )
  } catch {
    // Can't read usage → fail open (don't wedge the swarm on a stats error).
    return {
      enabled: true,
      capTokens,
      spentTokens: 0,
      remainingTokens: capTokens,
      exceeded: false,
    }
  }
  return {
    enabled: true,
    capTokens,
    spentTokens,
    remainingTokens: Math.max(0, capTokens - spentTokens),
    exceeded: spentTokens >= capTokens,
  }
}

export class SwarmDispatchError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SwarmDispatchError'
    this.status = status
  }
}

export async function dispatchSwarmAssignments(body: DispatchRequest) {
  let assignments = parseAssignments(body.assignments)
  const promptRaw = typeof body.prompt === 'string' ? body.prompt : ''
  const prompt = promptRaw.trim()
  if (assignments.length === 0) {
    const workerIdsRaw = Array.isArray(body.workerIds) ? body.workerIds : []
    const workerIds = workerIdsRaw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && validateWorkerId(value))
    assignments = workerIds.map((workerId) => ({
      workerId,
      task: prompt,
      rationale: 'Legacy broadcast dispatch.',
      direct: body.direct === true,
    }))
  }

  if (assignments.length === 0) {
    throw new SwarmDispatchError('assignments[] or workerIds[] required')
  }
  if (assignments.length > 12) {
    throw new SwarmDispatchError('Maximum 12 workers per dispatch')
  }
  if (assignments.some((assignment) => assignment.task.length === 0)) {
    throw new SwarmDispatchError('assignment task required')
  }
  if (
    assignments.some((assignment) => assignment.task.length > MAX_PROMPT_CHARS)
  ) {
    throw new SwarmDispatchError(
      `assignment task exceeds ${MAX_PROMPT_CHARS} characters`,
    )
  }

  const timeoutRaw =
    typeof body.timeoutSeconds === 'number'
      ? body.timeoutSeconds
      : DEFAULT_TIMEOUT_S
  const timeoutSeconds = Math.max(
    10,
    Math.min(MAX_TIMEOUT_S, Math.floor(timeoutRaw)),
  )
  const timeoutMs = timeoutSeconds * 1000
  const waitForCheckpoint = !(
    body.waitForCheckpoint === false && body.allowAsync === true
  )
  const pollRaw =
    typeof body.checkpointPollSeconds === 'number'
      ? body.checkpointPollSeconds
      : 90
  const checkpointPollSeconds = Math.max(5, Math.min(300, Math.floor(pollRaw)))
  const notifySessionKey =
    typeof body.notifySessionKey === 'string' && body.notifySessionKey.trim()
      ? body.notifySessionKey.trim()
      : 'main'

  const requestedMissionId =
    typeof body.missionId === 'string' ? body.missionId.trim() : ''
  const hasExplicitMissionTitle =
    typeof body.missionTitle === 'string' && body.missionTitle.trim()
  const missionTitle = hasExplicitMissionTitle
    ? (body.missionTitle as string).trim()
    : requestedMissionId
      ? ''
      : assignments.length === 1
        ? assignments[0].task.slice(0, 120)
        : `${assignments.length} assigned tasks`
  const mission = createOrUpdateMission({
    missionId: requestedMissionId || null,
    title: missionTitle,
    assignments,
  })
  if (mission._created) {
    for (const workerId of new Set(assignments.map((a) => a.workerId))) {
      try {
        appendSwarmMemoryEvent({
          workerId,
          missionId: mission.id,
          type: 'mission-start',
          title: mission.title,
          summary: `Mission started: ${mission.title}`,
          event: { workers: [...new Set(assignments.map((a) => a.workerId))] },
        })
      } catch {}
    }
  }

  const assignmentIdByKey = new Map(
    mission.assignments.map((item) => [
      `${item.workerId}\n${item.task}`,
      item.id,
    ]),
  )
  assignments = assignments.map((assignment) => ({
    ...assignment,
    assignmentId: assignmentIdByKey.get(
      `${assignment.workerId}\n${assignment.task}`,
    ),
  }))

  const dispatchedAt = Date.now()
  const roster = rosterByWorkerId(
    assignments.map((assignment) => assignment.workerId),
  )
  const results = await Promise.all(
    assignments.map((assignment) =>
      runWorker(assignment, timeoutMs, roster.get(assignment.workerId), {
        waitForCheckpoint,
        checkpointPollMs: checkpointPollSeconds * 1000,
        missionId: mission.id,
        notifySessionKey,
      }),
    ),
  )

  const latestMission = getSwarmMission(mission.id) ?? mission

  return {
    dispatchedAt,
    completedAt: Date.now(),
    missionId: mission.id,
    mission: latestMission,
    prompt:
      assignments.length === 1
        ? assignments[0].task
        : `${assignments.length} assigned tasks`,
    assignments,
    timeoutSeconds,
    waitForCheckpoint,
    checkpointPollSeconds,
    notifySessionKey,
    results,
  }
}

export const Route = createFileRoute('/api/swarm-dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: DispatchRequest
        try {
          body = (await request.json()) as DispatchRequest
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        // Spend cap: refuse new dispatches once the day's token spend crosses
        // the configured ceiling, so a runaway loop can't rack up cloud cost.
        const cap = await evaluateSpendCap()
        if (cap.exceeded) {
          return json(
            {
              error: `Daily swarm token cap reached (${cap.spentTokens.toLocaleString()} / ${cap.capTokens.toLocaleString()}). Dispatch paused until tomorrow or raise HERMES_SWARM_DAILY_TOKEN_CAP.`,
              spendCap: cap,
            },
            { status: 429 },
          )
        }

        try {
          return json(await dispatchSwarmAssignments(body))
        } catch (error) {
          if (error instanceof SwarmDispatchError) {
            return json({ error: error.message }, { status: error.status })
          }
          return json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          )
        }
      },
    },
  },
})
