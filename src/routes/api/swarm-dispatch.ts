import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { newestCheckpointFromMessages, type ParsedSwarmCheckpoint } from '../../server/swarm-checkpoints'
import { readWorkerMessages } from '../../server/swarm-chat-reader'
import { createOrUpdateMission, markMissionAssignmentDispatched, recordMissionCheckpoint } from '../../server/swarm-missions'
import { appendSwarmMemoryEvent } from '../../server/swarm-memory'
import { rosterByWorkerId, type SwarmRosterWorker } from '../../server/swarm-roster'
import { publishSwarmCheckpointNotification } from '../../server/swarm-notifications'

type AssignmentRequest = {
  workerId: string
  task: string
  rationale?: string
  assignmentId?: string
  dependsOn?: Array<string>
  reviewRequired?: boolean
  direct?: boolean
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
  checkpointStatus: 'none' | 'in_progress' | 'done' | 'blocked' | 'handoff' | 'needs_input'
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
  return join(homedir(), '.local', 'bin', workerId)
}

function getProfilePath(workerId: string): string {
  return join(getProfilesDir(), workerId)
}

function validateWorkerId(workerId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)
}

const TMUX_BIN_CANDIDATES = [
  join(homedir(), '.local', 'bin', 'tmux'),
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  'tmux',
]

function resolveTmuxBin(): string | null {
  for (const candidate of TMUX_BIN_CANDIDATES) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
    } else {
      return candidate
    }
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
): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: MAX_OUTPUT_CHARS }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: stderr?.toString().trim() || error.message })
        return
      }
      resolve({
        ok: true,
        stdout: (stdout || '').toString(),
        stderr: (stderr || '').toString(),
      })
    })
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

function parseAssignments(value: unknown): Array<AssignmentRequest> {
  if (!Array.isArray(value)) return []
  const assignments: Array<AssignmentRequest> = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const workerId = typeof obj.workerId === 'string' ? obj.workerId.trim() : ''
    const task = typeof obj.task === 'string' ? obj.task.trim() : ''
    const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : undefined
    const dependsOn = Array.isArray(obj.dependsOn) ? obj.dependsOn.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : undefined
    const reviewRequired = typeof obj.reviewRequired === 'boolean' ? obj.reviewRequired : undefined
    const direct = typeof obj.direct === 'boolean' ? obj.direct : undefined
    if (!workerId || !task || !validateWorkerId(workerId)) continue
    assignments.push({ workerId, task, rationale, dependsOn, reviewRequired, direct })
  }
  return assignments
}

function readRuntimeJson(profilePath: string): Record<string, unknown> {
  const runtimePath = join(profilePath, 'runtime.json')
  if (!existsSync(runtimePath)) return {}
  try {
    return JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeRuntimePatch(workerId: string, patch: Record<string, unknown>): void {
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

function cleanRuntimeCheckpointStatus(value: unknown): RuntimeCheckpointSnapshot['checkpointStatus'] {
  return value === 'in_progress' || value === 'done' || value === 'blocked' || value === 'handoff' || value === 'needs_input'
    ? value
    : 'none'
}

export function readRuntimeCheckpointSnapshot(profilePath: string): RuntimeCheckpointSnapshot {
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

export function runtimeCheckpointSignature(snapshot: RuntimeCheckpointSnapshot): string {
  return JSON.stringify(snapshot)
}

function isoToMs(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stateLabelForRuntimeSnapshot(snapshot: RuntimeCheckpointSnapshot): ParsedSwarmCheckpoint['stateLabel'] | null {
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
  if (state === 'executing' || state === 'thinking' || state === 'writing' || state === 'reviewing' || state === 'syncing') return 'IN_PROGRESS'
  if (state === 'idle') return 'DONE'
  return null
}

function runtimeSnapshotHasMeaningfulCheckpoint(snapshot: RuntimeCheckpointSnapshot): boolean {
  return Boolean(
    snapshot.checkpointRaw ||
    snapshot.lastSummary ||
    snapshot.lastResult ||
    snapshot.nextAction ||
    snapshot.blockedReason,
  )
}

export function runtimeSnapshotIsFresh(snapshot: RuntimeCheckpointSnapshot, baselineSignature: string, dispatchedAt: number): boolean {
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

export function checkpointFromRuntimeSnapshot(snapshot: RuntimeCheckpointSnapshot): ParsedSwarmCheckpoint | null {
  if (snapshot.checkpointRaw) {
    const parsed = newestCheckpointFromMessages([{ role: 'assistant', content: snapshot.checkpointRaw }])
    if (parsed) return parsed
  }
  const stateLabel = stateLabelForRuntimeSnapshot(snapshot)
  if (!stateLabel || !runtimeSnapshotHasMeaningfulCheckpoint(snapshot)) return null
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

function buildWorkerPrompt(input: {
  workerId: string
  task: string
  rationale?: string
  roster?: SwarmRosterWorker
  direct?: boolean
  missionId?: string | null
  taskTitle?: string | null
}): string {
  if (input.direct) return input.task
  const roster = input.roster
  const role = roster?.role || 'Worker'
  const skills = roster?.skills?.length ? roster.skills.join(', ') : 'swarm-worker-core'
  const capabilities = roster?.capabilities?.length ? roster.capabilities.join(', ') : 'not declared'
  const mission = roster?.mission || 'Execute assigned swarm tasks and checkpoint progress.'
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
    `Worker: ${input.workerId} — ${role}`,
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
  lines.push(
    '## Assigned Task',
    input.task,
    '',
    '## Operating Rules',
    '- Work in your persistent Hermes worker session and preserve your profile context.',
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

function markDispatchStarted(workerId: string, task: string, missionId?: string | null, assignmentId?: string | null, notifySessionKey?: string | null): void {
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
    nextAction: 'Worker should execute and return the required checkpoint format.',
    notifySessionKey: notifySessionKey ?? 'main',
  })
}

function markDispatchResult(workerId: string, result: WorkerResult): void {
  writeRuntimePatch(workerId, {
    lastDispatchAt: Date.now(),
    lastDispatchMode: result.delivery ?? 'none',
    lastDispatchResult: result.ok ? result.output.slice(0, 500) : (result.error ?? 'dispatch failed').slice(0, 500),
    state: result.ok ? 'executing' : 'blocked',
    checkpointStatus: result.ok ? 'in_progress' : 'blocked',
    blockedReason: result.ok ? null : result.error,
    lastCheckIn: new Date().toISOString(),
  })
}

function markCheckpointResult(workerId: string, checkpoint: ParsedSwarmCheckpoint, notifySessionKey?: string | null): void {
  writeRuntimePatch(workerId, {
    state: checkpoint.runtimeState,
    phase: checkpoint.stateLabel.toLowerCase(),
    checkpointStatus: checkpoint.checkpointStatus,
    lastCheckIn: new Date().toISOString(),
    lastOutputAt: Date.now(),
    lastSummary: checkpoint.result,
    lastResult: checkpoint.result,
    lastRealSummary: checkpoint.result,
    lastRealResult: checkpoint.result,
    lastControlMessage: null,
    nextAction: checkpoint.nextAction,
    blockedReason: checkpoint.stateLabel === 'BLOCKED' || checkpoint.stateLabel === 'NEEDS_INPUT' ? checkpoint.blocker : null,
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
    if (runtimeSnapshotIsFresh(runtimeSnapshot, baselineRuntimeSignature, dispatchedAt)) {
      const runtimeCheckpoint = checkpointFromRuntimeSnapshot(runtimeSnapshot)
      if (runtimeCheckpoint && runtimeCheckpoint.raw !== previousRaw) return runtimeCheckpoint
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
  return homedir()
}

async function ensureLiveTmuxSession(workerId: string): Promise<{ ok: true; tmuxBin: string; sessionName: string } | { ok: false; error: string }> {
  const tmuxBin = resolveTmuxBin()
  if (!tmuxBin) return { ok: false, error: 'tmux not installed' }

  const sessionName = sessionNameFor(workerId)
  if (await tmuxHasSession(tmuxBin, sessionName)) {
    return { ok: true, tmuxBin, sessionName }
  }

  const profilePath = getProfilePath(workerId)
  const cwd = resolveWorkerCwd(workerId)
  const ghToken = resolveGithubToken()
  const launchPrefix = [
    `HERMES_HOME='${shellEscapeSingle(profilePath)}'`,
    ghToken ? `GH_TOKEN='${shellEscapeSingle(ghToken)}'` : '',
    ghToken ? `GITHUB_TOKEN='${shellEscapeSingle(ghToken)}'` : '',
  ].filter(Boolean).join(' ')
  const started = await execFileAsync(tmuxBin, [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-c',
    cwd,
    `${launchPrefix} exec hermes chat --continue`,
  ])
  if (!started.ok) {
    return { ok: false, error: started.error }
  }

  // Give the agent a moment to render its prompt before sending keys.
  await sleep(1200)
  return { ok: true, tmuxBin, sessionName }
}

async function sendPromptToLiveSession(workerId: string, prompt: string): Promise<WorkerResult | null> {
  const startedAt = Date.now()
  const ensured = await ensureLiveTmuxSession(workerId)
  if (!ensured.ok) return null

  const { tmuxBin, sessionName } = ensured
  const normalizedPrompt = prompt.replace(/\r\n/g, '\n')

  // Use tmux paste-buffer instead of send-keys -l line-by-line. This is more
  // reliable for live TUI delivery because it preserves multiline content and
  // avoids key translation/terminal timing issues. Enter submits the composed
  // prompt after paste.
  const loaded = await execFileAsync(tmuxBin, [
    'load-buffer',
    '-b',
    `swarm-dispatch-${workerId}`,
    '-',
  ], 8_000, normalizedPrompt)
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
  const cleared = await execFileAsync(tmuxBin, ['send-keys', '-t', sessionName, 'C-u'])
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

  // Give the TUI a beat to ingest the paste before submitting. Some workers
  // render slower and otherwise keep the pasted text sitting at the prompt.
  await sleep(120)
  const enter = await execFileAsync(tmuxBin, ['send-keys', '-t', sessionName, 'Enter'])
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

function runWorker(assignment: AssignmentRequest, timeoutMs: number, roster: SwarmRosterWorker | undefined, options?: { waitForCheckpoint?: boolean; checkpointPollMs?: number; missionId?: string | null; notifySessionKey?: string | null }): Promise<WorkerResult> {
  return new Promise(async (resolve) => {
    const workerId = assignment.workerId
    const prompt = buildWorkerPrompt({
      workerId,
      task: assignment.task,
      rationale: assignment.rationale,
      roster,
      direct: assignment.direct,
      missionId: options?.missionId ?? null,
      taskTitle: assignment.task.slice(0, 120),
    })
    const profilePath = getProfilePath(workerId)
    const runtimeBeforeDispatch = readRuntimeCheckpointSnapshot(profilePath)
    const previousRaw = runtimeBeforeDispatch.checkpointRaw
    const baselineRuntimeSignature = runtimeCheckpointSignature(runtimeBeforeDispatch)
    markDispatchStarted(workerId, assignment.task, options?.missionId ?? null, assignment.assignmentId ?? null, options?.notifySessionKey ?? 'main')
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

    // Prefer the persistent live agent session when available/startable.
    const liveResult = await sendPromptToLiveSession(workerId, prompt)
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
          markCheckpointResult(workerId, checkpoint, options?.notifySessionKey ?? 'main')
          const updatedMission = recordMissionCheckpoint({
            missionId: options?.missionId,
            assignmentId: assignment.assignmentId ?? null,
            workerId,
            checkpoint,
            source: 'swarm-dispatch',
          })
          if (updatedMission?._completed) {
            try {
              for (const wId of new Set(updatedMission.assignments.map((a) => a.workerId))) {
                appendSwarmMemoryEvent({
                  workerId: wId,
                  missionId: updatedMission.id,
                  type: 'complete',
                  title: updatedMission.title,
                  summary: `Mission complete: ${updatedMission.title}`,
                })
              }
            } catch { /* memory write best-effort */ }
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
          liveResult.checkpoint = null
          liveResult.checkpointStatus = 'timeout'
          liveResult.output = `${liveResult.output}\nNo fresh checkpoint before poll timeout.`
        }
      } else {
        liveResult.checkpointStatus = 'not-requested'
      }
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
      resolve(result)
      return
    }

    const useWrapper = existsSync(wrapperPath)
    const cmd = useWrapper ? wrapperPath : 'hermes'
    const args = ['chat', '-q', prompt, '-Q', '--yolo', '--ignore-rules', '--source', 'swarm-dispatch']
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HERMES_HOME: profilePath,
    }
    const ghToken = resolveGithubToken()
    if (ghToken) {
      env.GH_TOKEN = ghToken
      env.GITHUB_TOKEN = ghToken
    }

    const proc = execFile(
      cmd,
      args,
      {
        env,
        cwd: homedir(),
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_CHARS,
        killSignal: 'SIGTERM',
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startedAt
        const stdoutStr = (stdout || '').toString()
        const stderrStr = (stderr || '').toString()
        const out = stdoutStr.length > MAX_OUTPUT_CHARS ? stdoutStr.slice(-MAX_OUTPUT_CHARS) : stdoutStr

        if (error) {
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
        markDispatchResult(workerId, result)
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
      resolve(result)
    })
  })
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

        let assignments = parseAssignments(body.assignments)
        const promptRaw = typeof body.prompt === 'string' ? body.prompt : ''
        const prompt = promptRaw.trim()
        if (assignments.length === 0) {
          const workerIdsRaw = Array.isArray(body.workerIds) ? body.workerIds : []
          const workerIds = workerIdsRaw
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter((value) => value.length > 0 && validateWorkerId(value))
          assignments = workerIds.map((workerId) => ({ workerId, task: prompt, rationale: 'Legacy broadcast dispatch.', direct: body.direct === true }))
        }

        if (assignments.length === 0) {
          return json({ error: 'assignments[] or workerIds[] required' }, { status: 400 })
        }
        if (assignments.length > 12) {
          return json({ error: 'Maximum 12 workers per dispatch' }, { status: 400 })
        }
        if (assignments.some((assignment) => assignment.task.length === 0)) {
          return json({ error: 'assignment task required' }, { status: 400 })
        }
        if (assignments.some((assignment) => assignment.task.length > MAX_PROMPT_CHARS)) {
          return json({ error: `assignment task exceeds ${MAX_PROMPT_CHARS} characters` }, { status: 400 })
        }

        const timeoutRaw = typeof body.timeoutSeconds === 'number' ? body.timeoutSeconds : DEFAULT_TIMEOUT_S
        const timeoutSeconds = Math.max(10, Math.min(MAX_TIMEOUT_S, Math.floor(timeoutRaw)))
        const timeoutMs = timeoutSeconds * 1000
        // Swarm2 control-plane dispatches should be observable by default:
        // wait for a fresh checkpoint so completion/blocker notifications can
        // be published and worker progress cards can resolve. Callers that
        // intentionally want fire-and-forget delivery must opt out with both
        // waitForCheckpoint:false and allowAsync:true.
        const waitForCheckpoint = !(body.waitForCheckpoint === false && body.allowAsync === true)
        const pollRaw = typeof body.checkpointPollSeconds === 'number' ? body.checkpointPollSeconds : 90
        const checkpointPollSeconds = Math.max(5, Math.min(300, Math.floor(pollRaw)))
        const notifySessionKey = typeof body.notifySessionKey === 'string' && body.notifySessionKey.trim() ? body.notifySessionKey.trim() : 'main'

        const requestedMissionId = typeof body.missionId === 'string' ? body.missionId.trim() : ''
        const hasExplicitMissionTitle = typeof body.missionTitle === 'string' && body.missionTitle.trim()
        const missionTitle = hasExplicitMissionTitle
          ? (body.missionTitle as string).trim()
          : requestedMissionId ? '' : assignments.length === 1 ? assignments[0].task.slice(0, 120) : `${assignments.length} assigned tasks` 
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
            } catch { /* memory write best-effort */ }
          }
        }

        const assignmentIdByKey = new Map(mission.assignments.map((item) => [`${item.workerId}\n${item.task}`, item.id]))
        assignments = assignments.map((assignment) => ({
          ...assignment,
          assignmentId: assignmentIdByKey.get(`${assignment.workerId}\n${assignment.task}`),
        }))

        const dispatchedAt = Date.now()
        const roster = rosterByWorkerId(assignments.map((assignment) => assignment.workerId))
        const results = await Promise.all(assignments.map((assignment) => runWorker(
          assignment,
          timeoutMs,
          roster.get(assignment.workerId),
          { waitForCheckpoint, checkpointPollMs: checkpointPollSeconds * 1000, missionId: mission.id, notifySessionKey },
        )))

        return json({
          dispatchedAt,
          completedAt: Date.now(),
          missionId: mission.id,
          mission,
          prompt: assignments.length === 1 ? assignments[0].task : `${assignments.length} assigned tasks`,
          assignments,
          timeoutSeconds,
          waitForCheckpoint,
          checkpointPollSeconds,
          notifySessionKey,
          results,
        })
      },
    },
  },
})
