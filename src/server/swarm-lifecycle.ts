import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { getProfilesDir } from './claude-paths'
import { SWARM_MEMORY_ROOT } from './swarm-environment'
import { appendSwarmMemoryEvent } from './swarm-memory'

export type SwarmContextState = 'healthy' | 'watch' | 'handoff_required' | 'renew_required'

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
  return join(SWARM_MEMORY_ROOT, 'memory', 'handoffs', 'swarm', `${workerId}-latest.md`)
}

function classify(totalTokens: number, policy: SwarmLifecyclePolicy): SwarmContextState {
  if (totalTokens >= policy.hardTokens) return 'renew_required'
  if (totalTokens >= policy.handoffTokens) return 'handoff_required'
  if (totalTokens >= policy.softTokens) return 'watch'
  return 'healthy'
}

function recommendedAction(state: SwarmContextState): string {
  switch (state) {
    case 'healthy': return 'Continue normally.'
    case 'watch': return 'Monitor context; request concise checkpoint soon.'
    case 'handoff_required': return 'Request durable handoff before assigning more work.'
    case 'renew_required': return 'Renew worker after handoff; avoid new work until restarted.'
  }
}

export function getSwarmLifecycleStatus(workerId: string, policy = DEFAULT_POLICY): SwarmLifecycleStatus {
  const profilePath = join(getProfilesDir(), workerId)
  let parsed: Record<string, unknown> = {}
  try {
    const raw = execFileSync('python3', ['-c', PYTHON_STATUS, profilePath], { encoding: 'utf8', timeout: 5_000 })
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
  const totalTokens = Math.max(inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens, messageTokens)
  const state = classify(totalTokens, policy)
  const hp = handoffPath(workerId)
  let lastHandoffAt: number | null = null
  if (existsSync(hp)) {
    try { lastHandoffAt = statSync(hp).mtimeMs } catch { lastHandoffAt = null }
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

function tmuxBin(): string {
  const local = join(homedir(), '.local', 'bin', 'tmux')
  return existsSync(local) ? local : 'tmux'
}

function sendTmux(workerId: string, prompt: string): Promise<{ ok: boolean; error?: string }> {
  const session = `swarm-${workerId}`
  return new Promise((resolve) => {
    const tmux = tmuxBin()
    const child = execFile(tmux, ['load-buffer', '-b', `swarm-lifecycle-${workerId}`, '-'], (loadErr, _stdout, stderr) => {
      if (loadErr) return resolve({ ok: false, error: stderr?.toString() || loadErr.message })
      execFile(tmux, ['send-keys', '-t', session, 'C-u'], () => {
        execFile(tmux, ['paste-buffer', '-d', '-b', `swarm-lifecycle-${workerId}`, '-t', session], (pasteErr, _out2, err2) => {
          if (pasteErr) return resolve({ ok: false, error: err2?.toString() || pasteErr.message })
          setTimeout(() => execFile(tmux, ['send-keys', '-t', session, 'Enter'], (enterErr, _out3, err3) => {
            if (enterErr) return resolve({ ok: false, error: err3?.toString() || enterErr.message })
            resolve({ ok: true })
          }), 150)
        })
      })
    })
    child.stdin?.end(prompt)
  })
}

function readRuntimeMissionContext(workerId: string): { missionId: string | null; assignmentId: string | null } {
  const runtimePath = join(getProfilesDir(), workerId, 'runtime.json')
  if (!existsSync(runtimePath)) return { missionId: null, assignmentId: null }
  try {
    const json = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
    return {
      missionId: typeof json.currentMissionId === 'string' ? json.currentMissionId : null,
      assignmentId: typeof json.currentAssignmentId === 'string' ? json.currentAssignmentId : null,
    }
  } catch {
    return { missionId: null, assignmentId: null }
  }
}

export async function requestWorkerHandoff(workerId: string): Promise<{ ok: boolean; handoffPath: string; error?: string }> {
  const hp = handoffPath(workerId)
  mkdirSync(dirname(hp), { recursive: true })
  const localHandoff = join(getProfilesDir(), workerId, 'memory', 'handoffs', 'latest.md')
  const prompt = `CONTEXT_HANDOFF_REQUIRED. Stop current work and write a durable handoff.\n\nWrite the handoff to BOTH of these exact paths:\n${localHandoff}\n${hp}\n\nUse this template (fill it in, do not just copy):\n# Handoff — ${workerId} — <missionId>\n\nGenerated: <ISO timestamp>\n\n## Current state\n## Objective\n## Completed\n## In progress\n## Files touched\n## Commands run\n## Blockers\n## Next exact action\n## Resume prompt\nWhen this worker restarts, load this handoff and continue from \"Next exact action\".\n\nThen reply in the required checkpoint format:\nSTATE: HANDOFF\nFILES_CHANGED: exact files or none\nCOMMANDS_RUN: exact commands or none\nRESULT: concise current state and what landed\nBLOCKER: blocker or none\nNEXT_ACTION: exact next action after /new or restart\n\nDo not continue implementation until renewed.`
  const sent = await sendTmux(workerId, prompt)
  const ctx = readRuntimeMissionContext(workerId)
  try {
    appendSwarmMemoryEvent({
      workerId,
      missionId: ctx.missionId,
      assignmentId: ctx.assignmentId,
      type: 'handoff-requested',
      summary: 'Lifecycle requested durable handoff before compaction',
      event: { sharedHandoffPath: hp, localHandoffPath: localHandoff, ok: sent.ok },
    })
  } catch { /* memory write best-effort */ }
  return { ...sent, handoffPath: hp }
}

export function notifyHandoffWritten(workerId: string): void {
  const ctx = readRuntimeMissionContext(workerId)
  try {
    appendSwarmMemoryEvent({
      workerId,
      missionId: ctx.missionId,
      assignmentId: ctx.assignmentId,
      type: 'handoff-written',
      summary: 'Worker confirmed handoff written',
      event: { sharedHandoffPath: handoffPath(workerId) },
    })
  } catch { /* best-effort */ }
}

export function lifecycleHandoffPath(workerId: string): string {
  return handoffPath(workerId)
}

function tmuxKill(workerId: string): Promise<{ ok: boolean; error?: string }> {
  const session = `swarm-${workerId}`
  return new Promise((resolve) => {
    execFile(tmuxBin(), ['kill-session', '-t', session], (err, _out, stderr) => {
      if (err) return resolve({ ok: false, error: stderr?.toString() || err.message })
      resolve({ ok: true })
    })
  })
}

function tmuxStart(workerId: string): Promise<{ ok: boolean; error?: string }> {
  const session = `swarm-${workerId}`
  const wrapper = join(homedir(), '.local', 'bin', workerId)
  if (!existsSync(wrapper)) return Promise.resolve({ ok: false, error: `Wrapper not found: ${wrapper}` })
  return new Promise((resolve) => {
    execFile(tmuxBin(), ['new-session', '-d', '-s', session, wrapper], (err, _out, stderr) => {
      if (err) return resolve({ ok: false, error: stderr?.toString() || err.message })
      resolve({ ok: true })
    })
  })
}

export async function renewWorker(workerId: string): Promise<{ ok: boolean; restarted: boolean; resumeSent: boolean; error?: string; handoffPath: string }> {
  const hp = handoffPath(workerId)
  if (!existsSync(hp)) {
    return { ok: false, restarted: false, resumeSent: false, error: 'Handoff missing; request handoff first', handoffPath: hp }
  }
  const killed = await tmuxKill(workerId)
  if (!killed.ok) {
    // Session may already be gone; continue.
  }
  await new Promise((resolve) => setTimeout(resolve, 600))
  const started = await tmuxStart(workerId)
  if (!started.ok) return { ok: false, restarted: false, resumeSent: false, error: started.error, handoffPath: hp }
  // Wait for shell prompt to appear before sending the resume message.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const resumePrompt = `RESUME_AFTER_HANDOFF. Read your latest handoff at ${hp} and the local copy under ~/.claude/profiles/${workerId}/memory/handoffs/, plus your runtime.json, then continue from "Next exact action". Reply with a fresh checkpoint when you have re-grounded.`
  const sent = await sendTmux(workerId, resumePrompt)
  const ctx = readRuntimeMissionContext(workerId)
  try {
    appendSwarmMemoryEvent({
      workerId,
      missionId: ctx.missionId,
      assignmentId: ctx.assignmentId,
      type: 'resume',
      summary: 'Worker renewed after handoff and prompted to resume',
      event: { handoffPath: hp, started: started.ok, resumeSent: sent.ok },
    })
  } catch { /* best-effort */ }
  return { ok: started.ok && sent.ok, restarted: started.ok, resumeSent: sent.ok, error: sent.error, handoffPath: hp }
}

export async function autoSweepLifecycle(workerIds: Array<string>): Promise<Array<{ workerId: string; action: 'none' | 'request-handoff' | 'renew'; status: SwarmLifecycleStatus; result?: { ok: boolean; error?: string } }>> {
  const out: Array<{ workerId: string; action: 'none' | 'request-handoff' | 'renew'; status: SwarmLifecycleStatus; result?: { ok: boolean; error?: string } }> = []
  for (const workerId of workerIds) {
    const status = getSwarmLifecycleStatus(workerId)
    if (status.contextState === 'handoff_required') {
      const result = await requestWorkerHandoff(workerId)
      out.push({ workerId, action: 'request-handoff', status, result: { ok: result.ok, error: result.error } })
    } else if (status.contextState === 'renew_required' && status.handoffExists) {
      const result = await renewWorker(workerId)
      out.push({ workerId, action: 'renew', status, result: { ok: result.ok, error: result.error } })
    } else if (status.contextState === 'renew_required' && !status.handoffExists) {
      const result = await requestWorkerHandoff(workerId)
      out.push({ workerId, action: 'request-handoff', status, result: { ok: result.ok, error: result.error } })
    } else {
      out.push({ workerId, action: 'none', status })
    }
  }
  return out
}
