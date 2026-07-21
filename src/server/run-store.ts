import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getHermesRoot } from './claude-paths'

export type PersistedRunToolCall = {
  id: string
  name: string
  phase: string
  args?: unknown
  preview?: string
  result?: string
}

export type PersistedRunLifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

export type PersistedRunState = {
  runId: string
  sessionKey: string
  friendlyId: string
  status: 'accepted' | 'active' | 'handoff' | 'stalled' | 'complete' | 'error'
  createdAt: number
  updatedAt: number
  lastEventAt: number
  assistantText: string
  thinkingText: string
  toolCalls: Array<PersistedRunToolCall>
  lifecycleEvents: Array<PersistedRunLifecycleEvent>
  errorMessage?: string
}

const RUNS_ROOT = path.join(getHermesRoot(), 'webui-mvp', 'runs')
const runUpdateQueues = new Map<string, Promise<void>>()

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey || 'main')
}

function sessionDir(sessionKey: string): string {
  return path.join(RUNS_ROOT, encodeSessionKey(sessionKey))
}

function runPath(sessionKey: string, runId: string): string {
  return path.join(sessionDir(sessionKey), `${runId}.json`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function writeRun(run: PersistedRunState): Promise<void> {
  const dir = sessionDir(run.sessionKey)
  await ensureDir(dir)
  const targetPath = runPath(run.sessionKey, run.runId)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  await writeFile(tempPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  await rename(tempPath, targetPath)
}

async function enqueueRunUpdate<T>(
  sessionKey: string,
  runId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${encodeSessionKey(sessionKey)}:${runId}`
  const previous = runUpdateQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(work)
  const marker = current.then(
    () => undefined,
    () => undefined,
  )
  runUpdateQueues.set(key, marker)
  try {
    return await current
  } finally {
    if (runUpdateQueues.get(key) === marker) {
      runUpdateQueues.delete(key)
    }
  }
}

export async function createPersistedRun(input: {
  runId: string
  sessionKey: string
  friendlyId?: string
}): Promise<PersistedRunState> {
  const now = Date.now()
  const run: PersistedRunState = {
    runId: input.runId,
    sessionKey: input.sessionKey,
    friendlyId: input.friendlyId || input.sessionKey,
    status: 'accepted',
    createdAt: now,
    updatedAt: now,
    lastEventAt: now,
    assistantText: '',
    thinkingText: '',
    toolCalls: [],
    lifecycleEvents: [],
  }
  await writeRun(run)
  return run
}

export async function getPersistedRun(
  sessionKey: string,
  runId: string,
): Promise<PersistedRunState | null> {
  try {
    const raw = await readFile(runPath(sessionKey, runId), 'utf8')
    return JSON.parse(raw) as PersistedRunState
  } catch {
    return null
  }
}

export async function updatePersistedRun(
  sessionKey: string,
  runId: string,
  updater: (run: PersistedRunState) => PersistedRunState,
): Promise<PersistedRunState | null> {
  return enqueueRunUpdate(sessionKey, runId, async () => {
    const current = await getPersistedRun(sessionKey, runId)
    if (!current) return null
    const next = updater(current)
    next.updatedAt = Date.now()
    await writeRun(next)
    return next
  })
}

export async function appendRunText(
  sessionKey: string,
  runId: string,
  text: string,
  options?: { replace?: boolean },
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    assistantText: options?.replace ? text : `${run.assistantText}${text}`,
  }))
}

export async function setRunThinking(
  sessionKey: string,
  runId: string,
  thinkingText: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    thinkingText,
  }))
}

export async function upsertRunToolCall(
  sessionKey: string,
  runId: string,
  toolCall: PersistedRunToolCall,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    const nextToolCalls = [...run.toolCalls]
    const idx = nextToolCalls.findIndex((entry) => entry.id === toolCall.id)
    if (idx >= 0) nextToolCalls[idx] = { ...nextToolCalls[idx], ...toolCall }
    else nextToolCalls.push(toolCall)
    return {
      ...run,
      status: toolCall.phase === 'error' ? 'error' : 'active',
      lastEventAt: Date.now(),
      toolCalls: nextToolCalls,
      ...(toolCall.phase === 'error' && toolCall.result
        ? { errorMessage: toolCall.result }
        : {}),
    }
  })
}

export async function addRunLifecycleEvent(
  sessionKey: string,
  runId: string,
  event: PersistedRunLifecycleEvent,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    lastEventAt: Date.now(),
    lifecycleEvents: [...run.lifecycleEvents, event].slice(-40),
  }))
}

export async function markRunStatus(
  sessionKey: string,
  runId: string,
  status: PersistedRunState['status'],
  errorMessage?: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status,
    lastEventAt: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  }))
}

// A run that hasn't been touched in this long is considered orphaned (e.g.
// the agent process crashed, the network dropped silently, or the user
// navigated away during a `handoff` that never resolved). Treating these as
// "active" makes every chat re-open show a phantom "Thinking…" indicator
// until the 120s client-side failsafe clears it.
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000

async function readRunsInDir(dir: string): Promise<Array<PersistedRunState>> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  if (files.length === 0) return []
  const runs = await Promise.all(
    files.map(async (name) => {
      try {
        const raw = await readFile(path.join(dir, name), 'utf8')
        return JSON.parse(raw) as PersistedRunState
      } catch {
        return null
      }
    }),
  )
  return runs.filter((run): run is PersistedRunState => Boolean(run))
}

export async function getActiveRunForSession(
  sessionKey: string,
): Promise<PersistedRunState | null> {
  try {
    const runs = await readRunsInDir(sessionDir(sessionKey))
    const now = Date.now()
    const candidates = runs
      .filter((run) => !['complete', 'error'].includes(run.status))
      .filter((run) => now - run.updatedAt < STALE_RUN_THRESHOLD_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return candidates[0] ?? null
  } catch {
    return null
  }
}

// Lists every non-complete/error run across all sessions, regardless of
// staleness. Powers the "Background runs" panel so users can inspect and
// abandon orphans that the staleness filter hides from the chat UI.
export async function listAllActiveRuns(): Promise<Array<PersistedRunState>> {
  try {
    const entries = await readdir(RUNS_ROOT, { withFileTypes: true })
    const sessionDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(RUNS_ROOT, entry.name))
    const runsBySession = await Promise.all(sessionDirs.map(readRunsInDir))
    return runsBySession
      .flat()
      .filter((run) => !['complete', 'error'].includes(run.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}
