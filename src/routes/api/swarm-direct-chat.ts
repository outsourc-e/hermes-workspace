import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {  openaiChat } from '../../server/openai-compat-api'
import {  readWorkerMessages } from '../../server/swarm-chat-reader'
import type {OpenAICompatMessage} from '../../server/openai-compat-api';
import type {SwarmChatMessage} from '../../server/swarm-chat-reader';

type DirectChatRequest = {
  workerId?: unknown
  prompt?: unknown
  limit?: unknown
  timeoutMs?: unknown
  roomLocalFirst?: unknown
}

type DirectChatResponse = {
  ok: boolean
  workerId: string
  delivered: boolean
  delivery?: 'tmux' | 'openai-compatible' | 'ollama-local' | 'room-local'
  error?: string | null
  sessionId: string | null
  sessionTitle: string | null
  messages: Array<SwarmChatMessage>
  source: 'state.db' | 'gateway' | 'ollama' | 'room-local' | 'unavailable'
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

const HERMES_BIN_CANDIDATES = [
  join(homedir(), '.hermes', 'hermes-agent-venv', 'bin', 'hermes'),
  join(homedir(), '.local', 'bin', 'hermes'),
  '/opt/homebrew/bin/hermes',
  '/usr/local/bin/hermes',
  'hermes',
]

function validateWorkerId(workerId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(workerId)
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
  if (workerId === 'workspace') {
    return process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? join(homedir(), '.hermes')
  }
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

function resolveHermesBin(): string | null {
  for (const candidate of HERMES_BIN_CANDIDATES) {
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
  const hermesBin = resolveHermesBin()
  if (!hermesBin) return { ok: false, error: 'hermes executable not found' }

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
    `HERMES_HOME='${profilePath.replace(/'/g, `'\\''`)}' exec '${hermesBin.replace(/'/g, `'\\''`)}' chat --continue`,
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

function hasAssistantReplyAfterBaseline(messages: Array<SwarmChatMessage>, baselineLastId: string | null, prompt: string): boolean {
  const newMessages = messagesAfterBaseline(messages, baselineLastId)
  const userEchoIndex = newMessages.findIndex((message) =>
    message.role === 'user' && promptMatched(message.content, prompt),
  )
  return newMessages.some((message, index) =>
    message.role === 'assistant' && (userEchoIndex < 0 || index > userEchoIndex),
  )
}

function directChatModel() {
  return process.env.HERMES_DIRECT_CHAT_MODEL
    || process.env.HERMES_DEFAULT_MODEL
    || process.env.CLAUDE_DEFAULT_MODEL
    || 'default'
}

function hasGatewayToken() {
  return Boolean(process.env.HERMES_API_TOKEN || process.env.CLAUDE_API_TOKEN)
}

async function answerWithGateway(
  workerId: string,
  prompt: string,
  reason: string,
  timeoutMs: number,
): Promise<DirectChatResponse> {
  if (!hasGatewayToken()) {
    throw new Error('HERMES_API_TOKEN/CLAUDE_API_TOKEN is not configured for gateway chat')
  }
  const messages: Array<OpenAICompatMessage> = [
    {
      role: 'system',
      content: [
        'You are a live Hermes Workspace room agent embedded in an operations-room UI.',
        'Answer naturally and directly as the selected agent persona from the user prompt.',
        'Do not claim that Etsy publishing, listing edits, supplier messages, purchases, paid generation, account changes, or any external mutation were performed.',
        'For those actions, explain the manual approval packet needed.',
        'Keep replies concise, practical, and specific to the room context.',
      ].join('\n'),
    },
    { role: 'user', content: prompt },
  ]
  const reply = await openaiChat(messages, {
    model: directChatModel(),
    temperature: 0.45,
    stream: false,
    signal: AbortSignal.timeout(Math.min(60_000, Math.max(8_000, timeoutMs))),
  })
  const content = reply.trim()
  if (!content) throw new Error('Gateway returned an empty agent reply')
  const now = Date.now()
  return {
    ok: true,
    workerId,
    delivered: true,
    delivery: 'openai-compatible',
    error: reason ? `Live worker fallback: ${reason}` : null,
    sessionId: null,
    sessionTitle: 'Etsy Ops live agent adapter',
    messages: [{
      id: `gateway:${workerId}:${now}`,
      role: 'assistant',
      content,
      timestamp: now,
    }],
    source: 'gateway',
    fetchedAt: now,
  }
}

type OllamaChatResponse = {
  message?: {
    role?: string
    content?: string
  }
  error?: string
}

function ollamaModel() {
  return process.env.HERMES_ROOM_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'llama3.1:8b'
}

async function answerWithOllama(workerId: string, prompt: string, reason: string, timeoutMs: number): Promise<DirectChatResponse> {
  const model = ollamaModel()
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: 'system',
          content: [
            'You are a Hermes Workspace AI agent inside a top-down Etsy Ops room.',
            'Use the persona and current room context provided by the user prompt.',
            'Answer as the selected agent, with practical operational judgment.',
            'Never claim external Etsy/supplier/paid/account actions were performed.',
            'For external actions, explain the manual approval packet needed.',
            'Keep the reply concise and useful.',
          ].join('\n'),
        },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(Math.min(30_000, Math.max(8_000, timeoutMs))),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Ollama ${model}: ${response.status} ${text}`)
  }
  const data = await response.json() as OllamaChatResponse
  if (data.error) throw new Error(`Ollama ${model}: ${data.error}`)
  const content = data.message?.content?.trim()
  if (!content) throw new Error(`Ollama ${model} returned an empty agent reply`)
  const now = Date.now()
  return {
    ok: true,
    workerId,
    delivered: true,
    delivery: 'ollama-local',
    error: reason ? `Local AI fallback: ${reason}` : null,
    sessionId: null,
    sessionTitle: `Etsy Ops local AI adapter (${model})`,
    messages: [{
      id: `ollama:${workerId}:${now}`,
      role: 'assistant',
      content,
      timestamp: now,
    }],
    source: 'ollama',
    fetchedAt: now,
  }
}

function extractPromptLine(prompt: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = prompt.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'mi'))
  return match?.[1]?.trim() || null
}

function extractOperatorMessage(prompt: string): string {
  return extractPromptLine(prompt, 'Operator message') ?? prompt.trim().slice(-500)
}

function answerTextFromRoomContext(workerId: string, prompt: string, reason: string): string {
  const operator = extractOperatorMessage(prompt)
  const product = extractPromptLine(prompt, 'Selected product')?.replace(/\s*\\([^)]*\\)\s*$/, '') ?? 'the selected product'
  const keywords = extractPromptLine(prompt, 'Keywords')
  const lower = operator.toLowerCase()
  const backendNote = reason ? `\n\nBackend note: live provider is not available right now (${reason}). I am answering from the room context and local Product Intelligence snapshot.` : ''

  if (workerId.includes('seo') || prompt.includes('Athena')) {
    if (lower.includes('worth') || lower.includes('push') || lower.includes('product')) {
      return [
        `I would push ${product} only if the supplier proof and margin check stay clean.`,
        keywords
          ? `The angle should stay narrow: lead with the strongest buyer-intent keywords I see here (${keywords.split(',').slice(0, 4).join(', ')}), not broad jewelry language.`
          : 'The next step is keyword validation against buyer intent, not broad volume.',
        'Before ShotLab, I want proof for material, shipping reliability, and at least one real source image path. If those are missing, I would hold the product instead of spending generation time.',
      ].join(' ') + backendNote
    }
    if (lower.includes('keyword') || lower.includes('seo')) {
      return `The keyword risk is weak intent: tags that sound pretty but do not prove a buyer is ready to purchase. Keep the title specific, avoid unsupported material claims, and require supplier proof before ShotLab.${backendNote}`
    }
    return `My read: protect the queue. Validate demand, supplier evidence, and margin before anyone spends time on visuals. ${product} can move forward only after those gates are clean.${backendNote}`
  }

  if (workerId.includes('asset') || prompt.includes('Hephaestus')) {
    if (lower.includes('image') || lower.includes('shotlab') || lower.includes('mockup') || lower.includes('media')) {
      return `For ShotLab I need real source images or an approved empty state. I can prepare a brief, prompt pack, and QA checklist for ${product}, but paid generation stays locked until you approve the packet.${backendNote}`
    }
    return `I can forge the media workflow, but only from real inputs: source image path, supplier proof, desired mockup style, and QA rules. No illustrated fake products should enter the listing preview.${backendNote}`
  }

  if (workerId.includes('warroom') || prompt.includes('Caesar')) {
    if (lower.includes('approval') || lower.includes('publish') || lower.includes('blocked')) {
      return `The live gates remain locked: Etsy publish/edit, supplier messages, purchases, and paid generation all become manual approval packets. I can summarize the packet and stage the decision, but I will not execute it without you.${backendNote}`
    }
    return `Command view: draft locally, verify margin, attach evidence, then route to DLV approval. I can coordinate the handoff for ${product}, but external actions stay manual.${backendNote}`
  }

  return `I can answer from the Etsy Ops room context, but I do not have a dedicated live worker for this profile right now. Tell me the decision you want, and I will keep it local unless it needs a manual approval packet.${backendNote}`
}

function answerWithRoomContext(workerId: string, prompt: string, reason: string): DirectChatResponse {
  const now = Date.now()
  return {
    ok: true,
    workerId,
    delivered: true,
    delivery: 'room-local',
    error: reason ? `Live provider fallback: ${reason}` : null,
    sessionId: null,
    sessionTitle: 'Etsy Ops room-local agent adapter',
    messages: [{
      id: `room-local:${workerId}:${now}`,
      role: 'assistant',
      content: answerTextFromRoomContext(workerId, prompt, reason),
      timestamp: now,
    }],
    source: 'room-local',
    fetchedAt: now,
  }
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
      if (hasAssistantReplyAfterBaseline(chat.messages, baselineLastId, prompt)) return response
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
        const roomLocalFirst = body.roomLocalFirst === true

        if (!workerId || !validateWorkerId(workerId)) {
          return json({ error: 'Invalid workerId' }, { status: 400 })
        }
        if (!prompt) {
          return json({ error: 'Missing prompt' }, { status: 400 })
        }

        const profilePath = getProfilePath(workerId)
        const baselineChat = readWorkerMessages(profilePath, limit)
        const baselineLastId = baselineChat.messages.length ? baselineChat.messages[baselineChat.messages.length - 1].id : null

        if (roomLocalFirst) {
          const gatewayReason = 'room-local-first requested a direct room chat adapter'
          if (hasGatewayToken()) {
            try {
              return json(await answerWithGateway(workerId, prompt, gatewayReason, Math.min(timeoutMs, 12_000)))
            } catch {
              /* try local AI next */
            }
          }
          try {
            return json(await answerWithOllama(workerId, prompt, hasGatewayToken() ? 'gateway fallback failed' : 'gateway token is not configured', Math.min(timeoutMs, 20_000)))
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'local AI unavailable'
            return json(answerWithRoomContext(workerId, prompt, reason))
          }
        }

        const delivered = await sendPromptToLiveSession(workerId, prompt)
        if (!delivered.ok) {
          try {
            return json(await answerWithGateway(workerId, prompt, delivered.error, timeoutMs))
          } catch (error) {
            const reason = error instanceof Error ? `${delivered.error}; gateway fallback failed: ${error.message}` : delivered.error
            return json(answerWithRoomContext(workerId, prompt, reason))
          }
        }

        const reply = await waitForReply(workerId, baselineLastId, prompt, limit, timeoutMs)
        if (reply.ok && hasAssistantReplyAfterBaseline(reply.messages, baselineLastId, prompt)) {
          return json(reply)
        }
        try {
          return json(await answerWithGateway(workerId, prompt, 'live worker did not produce a new assistant reply before timeout', timeoutMs))
        } catch (error) {
          const reason = error instanceof Error
            ? `live worker did not produce a new assistant reply before timeout; gateway fallback failed: ${error.message}`
            : 'live worker did not produce a new assistant reply before timeout'
          return json(answerWithRoomContext(workerId, prompt, reason))
        }
        return json(reply)
      },
    },
  },
})
