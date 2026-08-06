import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'
import { readWorkerMessages } from '../../server/swarm-chat-reader'
import { rosterByWorkerId } from '../../server/swarm-roster'
import type { SwarmChatMessage } from '../../server/swarm-chat-reader'

type DirectChatRequest = {
  workerId?: unknown
  prompt?: unknown
  cardBinding?: unknown
  limit?: unknown
  timeoutMs?: unknown
}

type DirectChatCardOwner = {
  kind: 'session-card-owner'
  cardId: string
  parentCardId: string | null
}

type DirectChatCardBinding = DirectChatCardOwner & {
  canonicalSource: 'local'
  canonicalSegmentKey: string
  canonicalTransport: 'tmux'
}

type DirectChatResponse = {
  ok: boolean
  cardOwner: DirectChatCardOwner
  delivered: boolean
  delivery?: 'tmux'
  error?: string | null
  fetchedAt: number
}

const MAX_OUTPUT_CHARS = 200_000
const DEFAULT_LIMIT = 30
const DEFAULT_TIMEOUT_MS = 90_000
const MAX_TIMEOUT_MS = 180_000

const TMUX_BIN_CANDIDATES = [
  join(homedir(), '.local', 'bin', 'tmux'),
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  'tmux',
]

function validateWorkerId(workerId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)
}

function parseDirectChatCardBinding(
  value: unknown,
  workerId: string,
): DirectChatCardBinding | null {
  return parseSessionCardOperationBinding(value, {
    source: 'local',
    transport: 'tmux',
    canonicalSegmentKey: `local:${workerId}`,
  }) as DirectChatCardBinding | null
}

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

function getProfilePath(workerId: string): string {
  return join(getProfilesDir(), workerId)
}

function getWrapperPath(workerId: string): string {
  const worker = rosterByWorkerId([workerId]).get(workerId)
  const wrapperName = worker?.wrapper?.trim() || workerId
  return join(homedir(), '.local', 'bin', wrapperName)
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

function sessionNameFor(workerId: string): string {
  return `swarm-${workerId}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
            error: stderr.toString().trim() || error.message,
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
    if (input !== undefined) child.stdin?.end(input)
  })
}

function tmuxHasSession(tmuxBin: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(tmuxBin, ['has-session', '-t', name], (error) => {
      resolve(!error)
    })
  })
}

async function ensureLiveTmuxSession(
  workerId: string,
  cardBinding: DirectChatCardBinding,
): Promise<
  | { ok: true; tmuxBin: string; sessionName: string }
  | { ok: false; error: string; staleBinding?: boolean }
> {
  const tmuxBin = resolveTmuxBin()
  if (!tmuxBin) return { ok: false, error: 'tmux not installed' }

  const sessionName = sessionNameFor(workerId)
  if (await tmuxHasSession(tmuxBin, sessionName)) {
    return { ok: true, tmuxBin, sessionName }
  }

  const profilePath = getProfilePath(workerId)
  const cwd = resolveWorkerCwd(workerId)
  if (!(await resolveExactSessionCardOperationBinding(cardBinding))) {
    return { ok: false, error: 'stale Card binding', staleBinding: true }
  }
  const started = await execFileAsync(tmuxBin, [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-c',
    cwd,
    `HERMES_HOME='${profilePath.replace(/'/g, `'\\''`)}' exec hermes chat --continue`,
  ])
  if (!started.ok) return { ok: false, error: started.error }
  await sleep(1200)
  return { ok: true, tmuxBin, sessionName }
}

async function sendPromptToLiveSession(
  workerId: string,
  prompt: string,
  cardBinding: DirectChatCardBinding,
): Promise<
  | { ok: true; delivery: 'tmux' }
  | { ok: false; error: string; staleBinding?: boolean }
> {
  const ensured = await ensureLiveTmuxSession(workerId, cardBinding)
  if (!ensured.ok) return ensured
  const { tmuxBin, sessionName } = ensured
  const bufferName = `swarm-direct-chat-${workerId}`
  const normalizedPrompt = prompt.replace(/\r\n/g, '\n')

  if (!(await resolveExactSessionCardOperationBinding(cardBinding))) {
    return { ok: false, error: 'stale Card binding', staleBinding: true }
  }

  const loaded = await execFileAsync(
    tmuxBin,
    ['load-buffer', '-b', bufferName, '-'],
    8_000,
    normalizedPrompt,
  )
  if (!loaded.ok) return { ok: false, error: loaded.error }

  // Session startup and buffer loading are awaitable setup. Re-resolve at the
  // first terminal-input edge so a worker/Card rollover cannot clear or paste
  // into a newly assigned runtime.
  if (!(await resolveExactSessionCardOperationBinding(cardBinding))) {
    return { ok: false, error: 'stale Card binding', staleBinding: true }
  }

  const cleared = await execFileAsync(tmuxBin, [
    'send-keys',
    '-t',
    sessionName,
    'C-u',
  ])
  if (!cleared.ok) return { ok: false, error: cleared.error }

  if (!(await resolveExactSessionCardOperationBinding(cardBinding))) {
    return { ok: false, error: 'stale Card binding', staleBinding: true }
  }

  const pasted = await execFileAsync(tmuxBin, [
    'paste-buffer',
    '-d',
    '-b',
    bufferName,
    '-t',
    sessionName,
  ])
  if (!pasted.ok) return { ok: false, error: pasted.error }

  await sleep(120)
  // Everything above is setup and may await long enough for the worker alias to
  // roll to another Card. Re-resolve the exact owner at the final delivery edge.
  if (!(await resolveExactSessionCardOperationBinding(cardBinding))) {
    return { ok: false, error: 'stale Card binding', staleBinding: true }
  }
  const entered = await execFileAsync(tmuxBin, [
    'send-keys',
    '-t',
    sessionName,
    'Enter',
  ])
  if (!entered.ok) return { ok: false, error: entered.error }

  return { ok: true, delivery: 'tmux' }
}

function messagesAfterBaseline(
  messages: Array<SwarmChatMessage>,
  baselineLastId: string | null,
) {
  const baselineIndex = baselineLastId
    ? messages.findIndex((message) => message.id === baselineLastId)
    : -1
  return baselineIndex >= 0 ? messages.slice(baselineIndex + 1) : messages
}

function promptMatched(content: string, prompt: string): boolean {
  const trimmedContent = content.trim()
  const trimmedPrompt = prompt.trim()
  return (
    trimmedContent === trimmedPrompt ||
    trimmedContent.includes(trimmedPrompt) ||
    trimmedPrompt.includes(trimmedContent)
  )
}

async function waitForReply(
  workerId: string,
  cardOwner: DirectChatCardOwner,
  baselineLastId: string | null,
  prompt: string,
  limit: number,
  timeoutMs: number,
): Promise<DirectChatResponse> {
  const startedAt = Date.now()
  const profilePath = getProfilePath(workerId)

  while (Date.now() - startedAt < timeoutMs) {
    const chat = readWorkerMessages(profilePath, limit)
    const response: DirectChatResponse = {
      ok: chat.ok,
      cardOwner,
      delivered: true,
      delivery: 'tmux',
      error: chat.ok ? null : 'Worker reply is unavailable',
      fetchedAt: Date.now(),
    }
    if (chat.ok) {
      const newMessages = messagesAfterBaseline(chat.messages, baselineLastId)
      const userEchoIndex = newMessages.findIndex(
        (message) =>
          message.role === 'user' && promptMatched(message.content, prompt),
      )
      const hasAssistantReply = newMessages.some(
        (message, index) =>
          message.role === 'assistant' &&
          (userEchoIndex < 0 || index > userEchoIndex),
      )
      if (hasAssistantReply) return response
    }
    await sleep(1000)
  }

  const finalChat = readWorkerMessages(profilePath, limit)
  return {
    ok: finalChat.ok,
    cardOwner,
    delivered: true,
    delivery: 'tmux',
    error: finalChat.ok ? null : 'Worker reply is unavailable',
    fetchedAt: Date.now(),
  }
}

export const Route = createFileRoute('/api/swarm-direct-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: DirectChatRequest
        try {
          body = (await request.json()) as DirectChatRequest
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const workerId =
          typeof body.workerId === 'string' &&
          body.workerId.trim() === body.workerId
            ? body.workerId
            : ''
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        const limit =
          typeof body.limit === 'number' && Number.isFinite(body.limit)
            ? Math.max(1, Math.min(100, Math.floor(body.limit)))
            : DEFAULT_LIMIT
        const timeoutMs =
          typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs)
            ? Math.max(
                1_000,
                Math.min(MAX_TIMEOUT_MS, Math.floor(body.timeoutMs)),
              )
            : DEFAULT_TIMEOUT_MS

        if (!workerId || !validateWorkerId(workerId)) {
          return json({ error: 'Invalid workerId' }, { status: 400 })
        }
        if (!prompt) {
          return json({ error: 'Missing prompt' }, { status: 400 })
        }

        const cardBinding = parseDirectChatCardBinding(
          body.cardBinding,
          workerId,
        )
        if (!cardBinding) {
          return json(
            { error: 'Invalid Session Card delivery binding' },
            {
              status: 400,
            },
          )
        }
        const cardOwner =
          await resolveExactSessionCardOperationBinding(cardBinding)
        if (!cardOwner) {
          return json(
            { error: 'Session Card delivery binding is unavailable' },
            { status: 409 },
          )
        }

        const profilePath = getProfilePath(workerId)
        const baselineChat = readWorkerMessages(profilePath, limit)
        const baselineLastId = baselineChat.messages.at(-1)?.id ?? null

        const delivered = await sendPromptToLiveSession(
          workerId,
          prompt,
          cardBinding,
        )
        if (!delivered.ok) {
          return json(
            {
              ok: false,
              cardOwner,
              delivered: false,
              error: 'Unable to deliver the worker message',
              fetchedAt: Date.now(),
            } satisfies DirectChatResponse,
            { status: delivered.staleBinding ? 409 : 500 },
          )
        }

        const reply = await waitForReply(
          workerId,
          cardOwner,
          baselineLastId,
          prompt,
          limit,
          timeoutMs,
        )
        return json(reply)
      },
    },
  },
})
