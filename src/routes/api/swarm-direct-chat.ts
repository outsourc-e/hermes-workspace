import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
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
import { parsePortableAttachmentDataUrl } from '../../screens/chat/attachment-envelope'
import {
  SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
  swarmDirectChatContentDigest,
} from '../../lib/swarm-direct-chat-delivery'
import type { SwarmChatMessage } from '../../server/swarm-chat-reader'
import type { SwarmDirectChatUserAcknowledgement } from '../../lib/swarm-direct-chat-delivery'

type DirectChatRequest = {
  workerId?: unknown
  clientId?: unknown
  prompt?: unknown
  attachments?: unknown
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
  userAcknowledgement?: SwarmDirectChatUserAcknowledgement
  error?: string | null
  fetchedAt: number
}

const MAX_OUTPUT_CHARS = 200_000
const DEFAULT_LIMIT = 30
const DEFAULT_TIMEOUT_MS = 90_000
const MAX_TIMEOUT_MS = 180_000
const MAX_REQUEST_BYTES = 4 * 1024 * 1024
const MAX_ATTACHMENT_COUNT = 8
const MAX_ATTACHMENT_ENCODED_CHARS = 2 * 1024 * 1024
const MAX_ATTACHMENT_DECODED_BYTES = (MAX_ATTACHMENT_ENCODED_CHARS / 4) * 3
const MAX_AGGREGATE_ATTACHMENT_DECODED_BYTES = 2 * 1024 * 1024
const ATTACHMENT_DIRECTORY = 'workspace-attachments'

type DirectChatAttachment = {
  name: string
  contentType: string
  bytes: Buffer
}

type PersistedDirectChatAttachment = DirectChatAttachment & {
  path: string
  created: boolean
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readBoundedJsonRequest(
  request: Request,
): Promise<{ value: unknown | null; tooLarge: boolean }> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { value: null, tooLarge: true }
  }
  const reader = request.body?.getReader()
  if (!reader) return { value: null, tooLarge: false }
  const chunks: Array<Uint8Array> = []
  let total = 0
  let result = await reader.read()
  while (!result.done) {
    const value = result.value
    total += value.byteLength
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined)
      return { value: null, tooLarge: true }
    }
    chunks.push(value)
    result = await reader.read()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return {
      value: JSON.parse(new TextDecoder().decode(bytes)),
      tooLarge: false,
    }
  } catch {
    return { value: null, tooLarge: false }
  }
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : null
}

function normalizeDirectChatAttachments(
  value: unknown,
): Array<DirectChatAttachment> | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENT_COUNT) return null
  const normalized: Array<DirectChatAttachment> = []
  let aggregateBytes = 0
  for (const attachment of value) {
    if (!record(attachment)) return null
    const name =
      typeof attachment.name === 'string' ? attachment.name.trim() : ''
    const contentType =
      typeof attachment.contentType === 'string'
        ? attachment.contentType.trim().toLowerCase()
        : ''
    const declaredSize = attachment.size
    const dataUrl = attachment.dataUrl
    if (
      !name ||
      name.length > 255 ||
      name.includes('\0') ||
      !contentType ||
      contentType.length > 127 ||
      !Number.isSafeInteger(declaredSize) ||
      (declaredSize as number) < 0 ||
      (declaredSize as number) > MAX_ATTACHMENT_DECODED_BYTES ||
      typeof dataUrl !== 'string'
    ) {
      return null
    }
    const parsed = parsePortableAttachmentDataUrl(dataUrl)
    if (
      !parsed ||
      parsed.contentType !== contentType ||
      parsed.base64.length > MAX_ATTACHMENT_ENCODED_CHARS
    ) {
      return null
    }
    const bytes = Buffer.from(parsed.base64, 'base64')
    if (
      bytes.byteLength !== declaredSize ||
      bytes.toString('base64') !== parsed.base64
    ) {
      return null
    }
    aggregateBytes += bytes.byteLength
    if (aggregateBytes > MAX_AGGREGATE_ATTACHMENT_DECODED_BYTES) return null
    normalized.push({ name, contentType, bytes })
  }
  return normalized
}

function attachmentFileName(
  clientId: string,
  index: number,
  name: string,
): string {
  const safeName = name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 160)
  return `${clientId}-${index}-${safeName || 'attachment'}`
}

function persistDirectChatAttachments(
  profilePath: string,
  clientId: string,
  attachments: ReadonlyArray<DirectChatAttachment>,
): Array<PersistedDirectChatAttachment> | null {
  if (attachments.length === 0) return []
  const directory = join(profilePath, ATTACHMENT_DIRECTORY)
  const persisted: Array<PersistedDirectChatAttachment> = []
  try {
    mkdirSync(directory, { recursive: true })
    for (const [index, attachment] of attachments.entries()) {
      const path = join(
        directory,
        attachmentFileName(clientId, index, attachment.name),
      )
      let created = false
      try {
        writeFileSync(path, attachment.bytes, { flag: 'wx', mode: 0o600 })
        created = true
      } catch {
        const existing = existsSync(path) ? readFileSync(path) : null
        if (!Buffer.isBuffer(existing) || !existing.equals(attachment.bytes)) {
          throw new Error('Attachment persistence conflict')
        }
      }
      persisted.push({ ...attachment, path, created })
    }
    return persisted
  } catch {
    for (const attachment of persisted) {
      if (!attachment.created) continue
      try {
        rmSync(attachment.path, { force: true })
      } catch {
        // Best-effort rollback; no transport has happened yet.
      }
    }
    return null
  }
}

function removePersistedAttachments(
  attachments: ReadonlyArray<PersistedDirectChatAttachment>,
): void {
  for (const attachment of attachments) {
    if (!attachment.created) continue
    try {
      rmSync(attachment.path, { force: true })
    } catch {
      // Best-effort cleanup only. Delivery failure remains the public result.
    }
  }
}

function deliveryPrompt(
  prompt: string,
  attachments: ReadonlyArray<PersistedDirectChatAttachment>,
): string {
  const attachmentLines = attachments.map(
    (attachment) =>
      `[User attached file: ${attachment.path} (${attachment.contentType}, ${attachment.bytes.byteLength} bytes)]`,
  )
  return [...attachmentLines, prompt].filter(Boolean).join('\n')
}

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
  if (baselineLastId === null) return messages
  const baselineIndex = messages.findIndex(
    (message) => message.id === baselineLastId,
  )
  // Never acknowledge against a fallback window when its delivery baseline has
  // fallen out of view; an older equal turn could otherwise consume recovery.
  return baselineIndex >= 0 ? messages.slice(baselineIndex + 1) : []
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

function userAcknowledgementForMessages(
  messages: ReadonlyArray<SwarmChatMessage>,
  clientId: string,
  prompt: string,
): SwarmDirectChatUserAcknowledgement | undefined {
  const echo = messages.find(
    (message) =>
      message.role === 'user' && message.content.trim() === prompt.trim(),
  )
  if (!echo || !Number.isFinite(echo.timestamp)) return undefined
  return {
    version: SWARM_DIRECT_CHAT_ACKNOWLEDGEMENT_VERSION,
    clientId,
    observedAt: echo.timestamp!,
    contentDigest: swarmDirectChatContentDigest(echo.content),
  }
}

async function waitForReply(
  workerId: string,
  cardOwner: DirectChatCardOwner,
  baselineLastId: string | null,
  clientId: string,
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
      if (hasAssistantReply) {
        response.userAcknowledgement = userAcknowledgementForMessages(
          newMessages,
          clientId,
          prompt,
        )
        return response
      }
    }
    await sleep(1000)
  }

  const finalChat = readWorkerMessages(profilePath, limit)
  const finalMessages = messagesAfterBaseline(
    finalChat.messages,
    baselineLastId,
  )
  return {
    ok: finalChat.ok,
    cardOwner,
    delivered: true,
    delivery: 'tmux',
    userAcknowledgement: userAcknowledgementForMessages(
      finalMessages,
      clientId,
      prompt,
    ),
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

        const parsedRequest = await readBoundedJsonRequest(request)
        if (parsedRequest.tooLarge) {
          return json({ error: 'Request body too large' }, { status: 413 })
        }
        if (!record(parsedRequest.value)) {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const body = parsedRequest.value as DirectChatRequest

        const workerId =
          typeof body.workerId === 'string' &&
          body.workerId.trim() === body.workerId
            ? body.workerId
            : ''
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        const clientId = normalizeClientId(body.clientId)
        const attachments = normalizeDirectChatAttachments(body.attachments)
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
        if (!clientId) {
          return json({ error: 'Invalid clientId' }, { status: 400 })
        }
        if (!attachments) {
          return json({ error: 'Invalid attachments' }, { status: 400 })
        }
        if (!prompt && attachments.length === 0) {
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
        const persistedAttachments = persistDirectChatAttachments(
          profilePath,
          clientId,
          attachments,
        )
        if (!persistedAttachments) {
          return json(
            { error: 'Unable to persist attachments' },
            { status: 500 },
          )
        }
        const deliveredPrompt = deliveryPrompt(
          prompt || 'Please review the attached content.',
          persistedAttachments,
        )
        const baselineChat = readWorkerMessages(profilePath, limit)
        const baselineLastId = baselineChat.messages.at(-1)?.id ?? null

        const delivered = await sendPromptToLiveSession(
          workerId,
          deliveredPrompt,
          cardBinding,
        )
        if (!delivered.ok) {
          removePersistedAttachments(persistedAttachments)
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
          clientId,
          deliveredPrompt,
          limit,
          timeoutMs,
        )
        return json(reply)
      },
    },
  },
})
