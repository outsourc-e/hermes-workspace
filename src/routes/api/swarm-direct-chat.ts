import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { readWorkerMessages, type SwarmChatMessage } from '../../server/swarm-chat-reader'

type DirectChatRequest = {
  workerId?: unknown
  prompt?: unknown
  limit?: unknown
  timeoutMs?: unknown
}

type DirectChatResponse = {
  ok: boolean
  workerId: string
  delivered: boolean
  delivery?: 'tmux'
  error?: string | null
  sessionId: string | null
  sessionTitle: string | null
  messages: Array<SwarmChatMessage>
  source: 'state.db' | 'unavailable'
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

function getProfilesDir(): string {
  const base = process.env.CLAUDE_HOME ?? join(homedir(), '.claude')
  return join(base, 'profiles')
}

function getProfilePath(workerId: string): string {
  return join(getProfilesDir(), workerId)
}

function getWrapperPath(workerId: string): string {
  return join(homedir(), '.local', 'bin', workerId)
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

async function ensureLiveTmuxSession(workerId: string): Promise<{ ok: true; tmuxBin: string; sessionName: string } | { ok: false; error: string }> {
  const tmuxBin = resolveTmuxBin()
  if (!tmuxBin) return { ok: false, error: 'tmux not installed' }

  const sessionName = sessionNameFor(workerId)
  if (await tmuxHasSession(tmuxBin, sessionName)) {
    return { ok: true, tmuxBin, sessionName }
  }

  const profilePath = getProfilePath(workerId)
  const cwd = resolveWorkerCwd(workerId)
  const started = await execFileAsync(tmuxBin, [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-c',
    cwd,
    `CLAUDE_HOME='${profilePath.replace(/'/g, `'\\''`)}' exec claude`,
  ])
  if (!started.ok) return { ok: false, error: started.error }
  await sleep(1200)
  return { ok: true, tmuxBin, sessionName }
}

async function sendPromptToLiveSession(workerId: string, prompt: string): Promise<{ ok: true; delivery: 'tmux' } | { ok: false; error: string }> {
  const ensured = await ensureLiveTmuxSession(workerId)
  if (!ensured.ok) return { ok: false, error: ensured.error }
  const { tmuxBin, sessionName } = ensured
  const bufferName = `swarm-direct-chat-${workerId}`
  const normalizedPrompt = prompt.replace(/\r\n/g, '\n')

  const loaded = await execFileAsync(tmuxBin, ['load-buffer', '-b', bufferName, '-'], 8_000, normalizedPrompt)
  if (!loaded.ok) return { ok: false, error: loaded.error }

  const cleared = await execFileAsync(tmuxBin, ['send-keys', '-t', sessionName, 'C-u'])
  if (!cleared.ok) return { ok: false, error: cleared.error }

  const pasted = await execFileAsync(tmuxBin, ['paste-buffer', '-d', '-b', bufferName, '-t', sessionName])
  if (!pasted.ok) return { ok: false, error: pasted.error }

  await sleep(120)
  const entered = await execFileAsync(tmuxBin, ['send-keys', '-t', sessionName, 'Enter'])
  if (!entered.ok) return { ok: false, error: entered.error }

  return { ok: true, delivery: 'tmux' }
}

function messagesAfterBaseline(messages: Array<SwarmChatMessage>, baselineLastId: string | null) {
  const baselineIndex = baselineLastId
    ? messages.findIndex((message) => message.id === baselineLastId)
    : -1
  return baselineIndex >= 0 ? messages.slice(baselineIndex + 1) : messages
}

function promptMatched(content: string, prompt: string): boolean {
  const trimmedContent = content.trim()
  const trimmedPrompt = prompt.trim()
  return trimmedContent === trimmedPrompt || trimmedContent.includes(trimmedPrompt) || trimmedPrompt.includes(trimmedContent)
}

async function waitForReply(workerId: string, baselineLastId: string | null, prompt: string, limit: number, timeoutMs: number): Promise<DirectChatResponse> {
  const startedAt = Date.now()
  const profilePath = getProfilePath(workerId)

  while (Date.now() - startedAt < timeoutMs) {
    const chat = readWorkerMessages(profilePath, limit)
    const response: DirectChatResponse = {
      ok: chat.ok,
      workerId,
      delivered: true,
      delivery: 'tmux',
      error: chat.ok ? null : (chat.error ?? 'Failed to read worker messages'),
      sessionId: chat.sessionId,
      sessionTitle: chat.sessionTitle,
      messages: chat.messages,
      source: chat.ok ? 'state.db' : 'unavailable',
      fetchedAt: Date.now(),
    }
    if (chat.ok) {
      const newMessages = messagesAfterBaseline(chat.messages, baselineLastId)
      const userEchoIndex = newMessages.findIndex((message) =>
        message.role === 'user' && promptMatched(message.content, prompt),
      )
      const hasAssistantReply = newMessages.some((message, index) =>
        message.role === 'assistant' && (userEchoIndex < 0 || index > userEchoIndex),
      )
      if (hasAssistantReply) return response
    }
    await sleep(1000)
  }

  const finalChat = readWorkerMessages(profilePath, limit)
  return {
    ok: finalChat.ok,
    workerId,
    delivered: true,
    delivery: 'tmux',
    error: finalChat.ok ? null : (finalChat.error ?? 'Timed out waiting for worker reply'),
    sessionId: finalChat.sessionId,
    sessionTitle: finalChat.sessionTitle,
    messages: finalChat.messages,
    source: finalChat.ok ? 'state.db' : 'unavailable',
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

        const workerId = typeof body.workerId === 'string' ? body.workerId.trim() : ''
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.max(1, Math.min(100, Math.floor(body.limit))) : DEFAULT_LIMIT
        const timeoutMs = typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs) ? Math.max(1_000, Math.min(MAX_TIMEOUT_MS, Math.floor(body.timeoutMs))) : DEFAULT_TIMEOUT_MS

        if (!workerId || !validateWorkerId(workerId)) {
          return json({ error: 'Invalid workerId' }, { status: 400 })
        }
        if (!prompt) {
          return json({ error: 'Missing prompt' }, { status: 400 })
        }

        const profilePath = getProfilePath(workerId)
        const baselineChat = readWorkerMessages(profilePath, limit)
        const baselineLastId = baselineChat.messages.length ? baselineChat.messages[baselineChat.messages.length - 1].id : null

        const delivered = await sendPromptToLiveSession(workerId, prompt)
        if (!delivered.ok) {
          return json({
            ok: false,
            workerId,
            delivered: false,
            error: delivered.error,
            sessionId: baselineChat.sessionId,
            sessionTitle: baselineChat.sessionTitle,
            messages: baselineChat.messages,
            source: baselineChat.ok ? 'state.db' : 'unavailable',
            fetchedAt: Date.now(),
          } satisfies DirectChatResponse, { status: 500 })
        }

        const reply = await waitForReply(workerId, baselineLastId, prompt, limit, timeoutMs)
        return json(reply)
      },
    },
  },
})
