import { execFile, execFileSync, spawn } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { SWARM_MEMORY_ROOT } from './swarm-environment'
import { appendSwarmMemoryEvent } from './swarm-memory'
import { swarmMissionAssignmentAcceptsRuntimeMutation } from './swarm-missions'
import { mutateSwarmWorkerRuntime } from './swarm-runtime-reset'
import { resolveExactSessionCardOperationBinding } from './session-card-operation-binding'
import type { ChildProcess } from 'node:child_process'
import type { SessionCardOperationBinding } from './session-card-operation-binding'

export type SwarmContextState =
  | 'healthy'
  | 'watch'
  | 'handoff_required'
  | 'renew_required'

export type SwarmLifecyclePolicy = {
  softTokens: number
  handoffTokens: number
  hardTokens: number
}

export type SwarmLifecycleStatus = {
  workerId: string
  profilePath: string
  sessionId: string | null
  model: string | null
  title: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  messageTokens: number
  totalTokens: number
  contextState: SwarmContextState
  recommendedAction: string
  policy: SwarmLifecyclePolicy
  handoffPath: string
  handoffExists: boolean
  lastHandoffAt: number | null
}

const DEFAULT_POLICY: SwarmLifecyclePolicy = {
  softTokens: 250_000,
  handoffTokens: 400_000,
  hardTokens: 500_000,
}

const PYTHON_STATUS = `import json, sqlite3, sys
profile = sys.argv[1]
db = profile + '/state.db'
result = {"ok": False}
try:
    con = sqlite3.connect('file:' + db + '?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    sessions = con.execute("select * from sessions order by started_at desc limit 1").fetchall()
    if not sessions:
        print(json.dumps(result)); raise SystemExit
    s = sessions[0]
    session_id = s['id']
    msg_tokens = 0
    try:
        row = con.execute("select coalesce(sum(token_count), 0) as n from messages where session_id = ?", (session_id,)).fetchone()
        msg_tokens = int(row['n'] or 0)
    except Exception:
        msg_tokens = 0
    result = {
      "ok": True,
      "sessionId": session_id,
      "model": s['model'] if 'model' in s.keys() else None,
      "title": s['title'] if 'title' in s.keys() else None,
      "inputTokens": int(s['input_tokens'] or 0),
      "outputTokens": int(s['output_tokens'] or 0),
      "cacheReadTokens": int(s['cache_read_tokens'] or 0),
      "cacheWriteTokens": int(s['cache_write_tokens'] or 0),
      "reasoningTokens": int(s['reasoning_tokens'] or 0),
      "messageTokens": msg_tokens,
    }
    con.close()
except Exception as e:
    result = {"ok": False, "error": str(e)}
print(json.dumps(result))
`

function handoffPath(workerId: string): string {
  return join(
    SWARM_MEMORY_ROOT,
    'memory',
    'handoffs',
    'swarm',
    `${workerId}-latest.md`,
  )
}

function classify(
  totalTokens: number,
  policy: SwarmLifecyclePolicy,
): SwarmContextState {
  if (totalTokens >= policy.hardTokens) return 'renew_required'
  if (totalTokens >= policy.handoffTokens) return 'handoff_required'
  if (totalTokens >= policy.softTokens) return 'watch'
  return 'healthy'
}

function recommendedAction(state: SwarmContextState): string {
  switch (state) {
    case 'healthy':
      return 'Continue normally.'
    case 'watch':
      return 'Monitor context; request concise checkpoint soon.'
    case 'handoff_required':
      return 'Request durable handoff before assigning more work.'
    case 'renew_required':
      return 'Renew worker after handoff; avoid new work until restarted.'
  }
}

export function getSwarmLifecycleStatus(
  workerId: string,
  policy = DEFAULT_POLICY,
): SwarmLifecycleStatus {
  const profilePath = join(getProfilesDir(), workerId)
  let parsed: Record<string, unknown> = {}
  try {
    const raw = execFileSync('python3', ['-c', PYTHON_STATUS, profilePath], {
      encoding: 'utf8',
      timeout: 5_000,
    })
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    parsed = { ok: false }
  }
  const inputTokens = Number(parsed.inputTokens ?? 0) || 0
  const outputTokens = Number(parsed.outputTokens ?? 0) || 0
  const cacheReadTokens = Number(parsed.cacheReadTokens ?? 0) || 0
  const cacheWriteTokens = Number(parsed.cacheWriteTokens ?? 0) || 0
  const reasoningTokens = Number(parsed.reasoningTokens ?? 0) || 0
  const messageTokens = Number(parsed.messageTokens ?? 0) || 0
  const totalTokens = Math.max(
    inputTokens +
      outputTokens +
      cacheReadTokens +
      cacheWriteTokens +
      reasoningTokens,
    messageTokens,
  )
  const state = classify(totalTokens, policy)
  const hp = handoffPath(workerId)
  let lastHandoffAt: number | null = null
  if (existsSync(hp)) {
    try {
      lastHandoffAt = statSync(hp).mtimeMs
    } catch {
      lastHandoffAt = null
    }
  }
  return {
    workerId,
    profilePath,
    sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
    model: typeof parsed.model === 'string' ? parsed.model : null,
    title: typeof parsed.title === 'string' ? parsed.title : null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    messageTokens,
    totalTokens,
    contextState: state,
    recommendedAction: recommendedAction(state),
    policy,
    handoffPath: hp,
    handoffExists: existsSync(hp),
    lastHandoffAt,
  }
}

// ═══════════════════════════════════════════════════════════════
// Cross-platform worker process management
// Replaces tmux with native child_process.spawn so workers run on Windows.
// On Linux/macOS with tmux available, falls back to the tmux path.
// ═══════════════════════════════════════════════════════════════

// Active worker processes keyed by workerId
const workerProcesses = new Map<string, ChildProcess>()

type RuntimeMissionContext = {
  missionId: string | null
  assignmentId: string | null
}

function contextFromRuntime(
  runtime: Record<string, unknown>,
): RuntimeMissionContext {
  return {
    missionId:
      typeof runtime.currentMissionId === 'string'
        ? runtime.currentMissionId
        : null,
    assignmentId:
      typeof runtime.currentAssignmentId === 'string'
        ? runtime.currentAssignmentId
        : null,
  }
}

function sameRuntimeContext(
  left: RuntimeMissionContext,
  right: RuntimeMissionContext,
): boolean {
  return (
    left.missionId === right.missionId &&
    left.assignmentId === right.assignmentId
  )
}

function runtimeAllowsLifecycleMutation(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expected: RuntimeMissionContext,
  current: Record<string, unknown>,
): boolean {
  const actual = contextFromRuntime(current)
  if (
    !sameRuntimeContext(expected, actual) ||
    current.acceptsCheckpoints === false
  )
    return false
  if (!actual.missionId && !actual.assignmentId) return true
  if (!actual.missionId || !actual.assignmentId) return false
  return swarmMissionAssignmentAcceptsRuntimeMutation({
    missionId: actual.missionId,
    assignmentId: actual.assignmentId,
    workerId,
    binding: cardBinding,
  })
}

async function runAuthorizedTerminalMutation<T>(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expected: RuntimeMissionContext,
  mutation: () => T,
): Promise<T | null> {
  if (!(await resolveExactSessionCardOperationBinding(cardBinding))) return null
  const profilePath = join(getProfilesDir(), workerId)
  return mutateSwarmWorkerRuntime(profilePath, (current) => ({
    next: null,
    value: runtimeAllowsLifecycleMutation(
      workerId,
      cardBinding,
      expected,
      current,
    )
      ? mutation()
      : null,
  }))
}

async function recordLifecycleMemoryIfCurrent(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expected: RuntimeMissionContext,
  write: (context: RuntimeMissionContext) => void,
): Promise<boolean> {
  if (!(await resolveExactSessionCardOperationBinding(cardBinding)))
    return false
  return mutateSwarmWorkerRuntime(
    join(getProfilesDir(), workerId),
    (current) => {
      if (
        !runtimeAllowsLifecycleMutation(
          workerId,
          cardBinding,
          expected,
          current,
        )
      ) {
        return { next: null, value: false }
      }
      // The memory publication happens while reset is excluded by the same
      // runtime lock. A cancellation committed first makes this a no-op.
      write(contextFromRuntime(current))
      return { next: null, value: true }
    },
  )
}

function isWindows(): boolean {
  return process.platform === 'win32'
}

function workerLogPath(workerId: string): string {
  const dir = join(getProfilesDir(), workerId, 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'worker.log')
}

function appendWorkerLog(workerId: string, text: string): void {
  try {
    appendFileSync(workerLogPath(workerId), text + '\n', 'utf8')
  } catch {
    // best-effort logging
  }
}

function tmuxBin(): string | null {
  if (isWindows()) return null
  const local = join(homedir(), '.local', 'bin', 'tmux')
  return existsSync(local) ? local : 'tmux'
}

function hasTmux(): boolean {
  if (isWindows()) return false
  try {
    const tmux = tmuxBin()
    if (!tmux) return false
    execFileSync(tmux, ['list-sessions'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Use native process spawn on Windows, tmux on Linux/macOS when available
function useNativeProcess(): boolean {
  return isWindows() || !hasTmux()
}

/** Send a prompt to a worker's stdin (native) or tmux pane (Unix fallback) */
export function sendToWorker(
  workerId: string,
  prompt: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  if (useNativeProcess()) {
    return sendToWorkerProcess(workerId, prompt, cardBinding, expectedContext)
  }
  return sendTmux(workerId, prompt, cardBinding, expectedContext)
}

async function sendToWorkerProcess(
  workerId: string,
  prompt: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  const expected = expectedContext ?? readRuntimeMissionContext(workerId)
  const started = await runAuthorizedTerminalMutation(
    workerId,
    cardBinding,
    expected,
    () => {
      const proc = workerProcesses.get(workerId)
      if (!proc || !proc.stdin?.writable) return null
      appendWorkerLog(workerId, `[dispatch] ${prompt}`)
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        proc.stdin!.write(prompt + '\n', (err) => {
          if (err) resolve({ ok: false, error: err.message })
          else resolve({ ok: true })
        })
      })
    },
  )
  if (!started) {
    return {
      ok: false,
      error: 'Worker process unavailable or lifecycle authority changed',
    }
  }
  return started
}

function execTmuxMutation(
  tmux: string,
  args: Array<string>,
  input?: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = execFile(tmux, args, (error, _stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: stderr.toString() || error.message })
        return
      }
      resolve({ ok: true })
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

async function sendTmux(
  workerId: string,
  prompt: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  const session = `swarm-${workerId}`
  const tmux = tmuxBin()
  if (!tmux) {
    return { ok: false, error: 'tmux not available on this platform' }
  }
  const mutations: Array<{ args: Array<string>; input?: string }> = [
    {
      args: ['load-buffer', '-b', `swarm-lifecycle-${workerId}`, '-'],
      input: prompt,
    },
    { args: ['send-keys', '-t', session, 'C-u'] },
    {
      args: [
        'paste-buffer',
        '-d',
        '-b',
        `swarm-lifecycle-${workerId}`,
        '-t',
        session,
      ],
    },
  ]
  const expected = expectedContext ?? readRuntimeMissionContext(workerId)
  for (const mutation of mutations) {
    const result = await runAuthorizedTerminalMutation(
      workerId,
      cardBinding,
      expected,
      () => execTmuxMutation(tmux, mutation.args, mutation.input),
    )
    if (!result) {
      return {
        ok: false,
        error: 'Session Card lifecycle or runtime authority changed',
      }
    }
    if (!result.ok) return result
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
  const submitted = await runAuthorizedTerminalMutation(
    workerId,
    cardBinding,
    expected,
    () => execTmuxMutation(tmux, ['send-keys', '-t', session, 'Enter']),
  )
  return (
    submitted ?? {
      ok: false,
      error: 'Session Card lifecycle or runtime authority changed',
    }
  )
}

export async function killWorkerProcess(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  const proc = workerProcesses.get(workerId)
  if (!proc) return { ok: false, error: 'No active process' }
  const expected = expectedContext ?? readRuntimeMissionContext(workerId)
  const termSent = await runAuthorizedTerminalMutation(
    workerId,
    cardBinding,
    expected,
    () => proc.kill('SIGTERM'),
  )
  if (termSent === null) {
    return {
      ok: false,
      error: 'Session Card lifecycle or runtime authority changed',
    }
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      const killed = await runAuthorizedTerminalMutation(
        workerId,
        cardBinding,
        expected,
        () => {
          try {
            proc.kill('SIGKILL')
          } catch {
            /* */
          }
          if (workerProcesses.get(workerId) === proc)
            workerProcesses.delete(workerId)
          return true
        },
      )
      if (killed === null) {
        resolve({
          ok: false,
          error: 'Session Card lifecycle or runtime authority changed',
        })
        return
      }
      resolve({ ok: true })
    }, 2000)
    proc.on('exit', () => {
      clearTimeout(timeout)
      if (workerProcesses.get(workerId) === proc)
        workerProcesses.delete(workerId)
      resolve({ ok: true })
    })
  })
}

async function startWorkerProcess(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  if (useNativeProcess()) {
    return startWorkerProcessNative(workerId, cardBinding, expectedContext)
  }
  return tmuxStart(workerId, cardBinding, expectedContext)
}

async function stopWorkerProcess(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  if (useNativeProcess()) {
    return killWorkerProcess(workerId, cardBinding, expectedContext)
  }
  return tmuxKill(workerId, cardBinding, expectedContext)
}

export async function startWorkerProcessNative(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  if (workerProcesses.has(workerId)) {
    return {
      ok: false,
      error: `Worker ${workerId} already has an active process`,
    }
  }

  const profilesDir = getProfilesDir()
  const profilePath = join(profilesDir, workerId)
  if (!existsSync(profilePath)) {
    return { ok: false, error: `Profile not found: ${profilePath}` }
  }

  // Build wrapper command: use hermes-agent CLI with the worker profile
  const hermesCmd = process.env.HERMES_CLI_PATH || 'hermes'
  const args = ['--tui', '--profile', workerId]

  const logPath = workerLogPath(workerId)
  const logDir = join(profilePath, 'logs')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  const expected = expectedContext ?? readRuntimeMissionContext(workerId)
  const proc = await runAuthorizedTerminalMutation(
    workerId,
    cardBinding,
    expected,
    () =>
      spawn(hermesCmd, args, {
        cwd: profilePath,
        env: {
          ...process.env,
          HERMES_PROFILE: workerId,
        },
        detached: isWindows(), // Windows needs detached for independent process tree
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: isWindows(), // Don't show terminal window on Windows
      }),
  )
  if (!proc) {
    return {
      ok: false,
      error: 'Session Card lifecycle or runtime authority changed',
    }
  }

  if (!proc.pid) {
    return { ok: false, error: 'Failed to spawn worker process' }
  }

  workerProcesses.set(workerId, proc)

  // Log stdout/stderr
  proc.stdout.on('data', (data: Buffer) => {
    appendWorkerLog(workerId, `[stdout] ${data.toString().trimEnd()}`)
  })
  proc.stderr.on('data', (data: Buffer) => {
    appendWorkerLog(workerId, `[stderr] ${data.toString().trimEnd()}`)
  })

  proc.on('exit', (code, signal) => {
    appendWorkerLog(workerId, `[exit] code=${code} signal=${signal}`)
    if (workerProcesses.get(workerId) === proc) workerProcesses.delete(workerId)
  })

  proc.on('error', (err) => {
    appendWorkerLog(workerId, `[error] ${err.message}`)
    if (workerProcesses.get(workerId) === proc) workerProcesses.delete(workerId)
  })

  return { ok: true }
}

function readRuntimeMissionContext(workerId: string): {
  missionId: string | null
  assignmentId: string | null
} {
  const runtimePath = join(getProfilesDir(), workerId, 'runtime.json')
  if (!existsSync(runtimePath)) return { missionId: null, assignmentId: null }
  try {
    const json = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<
      string,
      unknown
    >
    return {
      missionId:
        typeof json.currentMissionId === 'string'
          ? json.currentMissionId
          : null,
      assignmentId:
        typeof json.currentAssignmentId === 'string'
          ? json.currentAssignmentId
          : null,
    }
  } catch {
    return { missionId: null, assignmentId: null }
  }
}

export async function requestWorkerHandoff(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
): Promise<{ ok: boolean; handoffPath: string; error?: string }> {
  const hp = handoffPath(workerId)
  mkdirSync(dirname(hp), { recursive: true })
  const localHandoff = join(
    getProfilesDir(),
    workerId,
    'memory',
    'handoffs',
    'latest.md',
  )
  const prompt = `CONTEXT_HANDOFF_REQUIRED. Stop current work and write a durable handoff.\n\nWrite the handoff to BOTH of these exact paths:\n${localHandoff}\n${hp}\n\nUse this template (fill it in, do not just copy):\n# Handoff — ${workerId} — <missionId>\n\nGenerated: <ISO timestamp>\n\n## Current state\n## Objective\n## Completed\n## In progress\n## Files touched\n## Commands run\n## Blockers\n## Next exact action\n## Resume prompt\nWhen this worker restarts, load this handoff and continue from "Next exact action".\n\nThen reply in the required checkpoint format:\nSTATE: HANDOFF\nFILES_CHANGED: exact files or none\nCOMMANDS_RUN: exact commands or none\nRESULT: concise current state and what landed\nBLOCKER: blocker or none\nNEXT_ACTION: exact next action after /new or restart\n\nDo not continue implementation until renewed.`
  const expected = readRuntimeMissionContext(workerId)
  const sent = await sendToWorker(workerId, prompt, cardBinding, expected)
  if (!sent.ok) return { ...sent, handoffPath: hp }
  const recorded = await recordLifecycleMemoryIfCurrent(
    workerId,
    cardBinding,
    expected,
    (ctx) => {
      try {
        appendSwarmMemoryEvent({
          workerId,
          missionId: ctx.missionId,
          assignmentId: ctx.assignmentId,
          type: 'handoff-requested',
          summary: 'Lifecycle requested durable handoff before compaction',
          event: {
            sharedHandoffPath: hp,
            localHandoffPath: localHandoff,
            ok: true,
          },
        })
      } catch {
        // Memory is best effort, but stale/failed delivery is never recorded.
      }
    },
  )
  if (!recorded) {
    return {
      ok: false,
      error: 'Session Card lifecycle or runtime authority changed',
      handoffPath: hp,
    }
  }
  return { ...sent, handoffPath: hp }
}

export async function notifyHandoffWritten(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
): Promise<boolean> {
  const expected = readRuntimeMissionContext(workerId)
  return recordLifecycleMemoryIfCurrent(
    workerId,
    cardBinding,
    expected,
    (ctx) => {
      try {
        appendSwarmMemoryEvent({
          workerId,
          missionId: ctx.missionId,
          assignmentId: ctx.assignmentId,
          type: 'handoff-written',
          summary: 'Worker confirmed handoff written',
          event: { sharedHandoffPath: handoffPath(workerId) },
        })
      } catch {
        // Preserve the prior best-effort memory contract.
      }
    },
  )
}

export function lifecycleHandoffPath(workerId: string): string {
  return handoffPath(workerId)
}

async function tmuxKill(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  const session = `swarm-${workerId}`
  const tmux = tmuxBin()
  if (!tmux) {
    return Promise.resolve({
      ok: false,
      error: 'tmux not available on this platform',
    })
  }
  const expected = expectedContext ?? readRuntimeMissionContext(workerId)
  const killed = await runAuthorizedTerminalMutation(
    workerId,
    cardBinding,
    expected,
    () => execTmuxMutation(tmux, ['kill-session', '-t', session]),
  )
  return (
    killed ?? {
      ok: false,
      error: 'Session Card lifecycle or runtime authority changed',
    }
  )
}

async function tmuxStart(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
  expectedContext?: RuntimeMissionContext,
): Promise<{ ok: boolean; error?: string }> {
  const session = `swarm-${workerId}`
  const wrapper = join(homedir(), '.local', 'bin', workerId)
  if (!existsSync(wrapper))
    return Promise.resolve({
      ok: false,
      error: `Wrapper not found: ${wrapper}`,
    })
  const tmux = tmuxBin()
  if (!tmux) {
    return Promise.resolve({
      ok: false,
      error: 'tmux not available on this platform',
    })
  }
  const expected = expectedContext ?? readRuntimeMissionContext(workerId)
  const started = await runAuthorizedTerminalMutation(
    workerId,
    cardBinding,
    expected,
    () => execTmuxMutation(tmux, ['new-session', '-d', '-s', session, wrapper]),
  )
  return (
    started ?? {
      ok: false,
      error: 'Session Card lifecycle or runtime authority changed',
    }
  )
}

export async function renewWorker(
  workerId: string,
  cardBinding: SessionCardOperationBinding,
): Promise<{
  ok: boolean
  restarted: boolean
  resumeSent: boolean
  error?: string
  handoffPath: string
}> {
  const hp = handoffPath(workerId)
  if (!existsSync(hp)) {
    return {
      ok: false,
      restarted: false,
      resumeSent: false,
      error: 'Handoff missing; request handoff first',
      handoffPath: hp,
    }
  }
  const expected = readRuntimeMissionContext(workerId)
  const killed = await stopWorkerProcess(workerId, cardBinding, expected)
  if (!killed.ok) {
    return {
      ok: false,
      restarted: false,
      resumeSent: false,
      error: killed.error,
      handoffPath: hp,
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 600))
  const started = await startWorkerProcess(workerId, cardBinding, expected)
  if (!started.ok)
    return {
      ok: false,
      restarted: false,
      resumeSent: false,
      error: started.error,
      handoffPath: hp,
    }
  // Wait for shell prompt to appear before sending the resume message.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const resumePrompt = `RESUME_AFTER_HANDOFF. Read your latest handoff at ${hp} and the local copy under ~/.hermes/profiles/${workerId}/memory/handoffs/, plus your runtime.json, then continue from "Next exact action". Reply with a fresh checkpoint when you have re-grounded.`
  const sent = await sendToWorker(workerId, resumePrompt, cardBinding, expected)
  if (!sent.ok) {
    return {
      ok: false,
      restarted: true,
      resumeSent: false,
      error: sent.error,
      handoffPath: hp,
    }
  }
  const recorded = await recordLifecycleMemoryIfCurrent(
    workerId,
    cardBinding,
    expected,
    (ctx) => {
      try {
        appendSwarmMemoryEvent({
          workerId,
          missionId: ctx.missionId,
          assignmentId: ctx.assignmentId,
          type: 'resume',
          summary: 'Worker renewed after handoff and prompted to resume',
          event: { handoffPath: hp, started: true, resumeSent: true },
        })
      } catch {
        // Preserve the prior best-effort memory contract.
      }
    },
  )
  if (!recorded) {
    return {
      ok: false,
      restarted: true,
      resumeSent: true,
      error: 'Session Card lifecycle or runtime authority changed',
      handoffPath: hp,
    }
  }
  return {
    ok: true,
    restarted: true,
    resumeSent: true,
    handoffPath: hp,
  }
}

export async function autoSweepLifecycle(
  targets: Array<{
    workerId: string
    cardBinding: SessionCardOperationBinding
  }>,
): Promise<
  Array<{
    workerId: string
    action: 'none' | 'request-handoff' | 'renew'
    status: SwarmLifecycleStatus
    result?: { ok: boolean; error?: string }
  }>
> {
  const out: Array<{
    workerId: string
    action: 'none' | 'request-handoff' | 'renew'
    status: SwarmLifecycleStatus
    result?: { ok: boolean; error?: string }
  }> = []
  for (const { workerId, cardBinding } of targets) {
    const status = getSwarmLifecycleStatus(workerId)
    if (status.contextState === 'handoff_required') {
      const result = await requestWorkerHandoff(workerId, cardBinding)
      out.push({
        workerId,
        action: 'request-handoff',
        status,
        result: { ok: result.ok, error: result.error },
      })
    } else if (
      status.contextState === 'renew_required' &&
      status.handoffExists
    ) {
      const result = await renewWorker(workerId, cardBinding)
      out.push({
        workerId,
        action: 'renew',
        status,
        result: { ok: result.ok, error: result.error },
      })
    } else if (
      status.contextState === 'renew_required' &&
      !status.handoffExists
    ) {
      const result = await requestWorkerHandoff(workerId, cardBinding)
      out.push({
        workerId,
        action: 'request-handoff',
        status,
        result: { ok: result.ok, error: result.error },
      })
    } else {
      out.push({ workerId, action: 'none', status })
    }
  }
  return out
}
