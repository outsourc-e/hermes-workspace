import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
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

function getHermesRoot(): string {
  return process.env.HERMES_HOME ?? path.join(homedir(), '.hermes')
}

const RUNS_ROOT = path.join(getHermesRoot(), 'webui-mvp', 'runs')

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
  await writeFile(
    runPath(run.sessionKey, run.runId),
    `${JSON.stringify(run, null, 2)}\n`,
    'utf8',
  )
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
  const current = await getPersistedRun(sessionKey, runId)
  if (!current) return null
  const next = updater(current)
  next.updatedAt = Date.now()
  await writeRun(next)
  return next
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

export async function getActiveRunForSession(
  sessionKey: string,
): Promise<PersistedRunState | null> {
  try {
    const dir = sessionDir(sessionKey)
    const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
    if (files.length === 0) return null
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
    const candidates = runs
      .filter((run): run is PersistedRunState => Boolean(run))
      .filter((run) => !['complete', 'error'].includes(run.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return candidates[0] ?? null
  } catch {
    return null
  }
}
