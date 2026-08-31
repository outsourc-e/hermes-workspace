import { randomUUID } from 'node:crypto'
import { requestOpenClaw } from './openclaw-gateway-client'
import { loadRemoteHarnesses } from './remote-harness-config'
import type { ExternalAgentRuntime } from './aioncore-companion'
import type {
  ExternalConversation,
  ExternalConversationMessage,
} from './aioncore-conversations'
import type {
  RemoteHarnessConfig,
  RemoteHermesHarnessConfig,
  RemoteOpenClawHarnessConfig,
} from './remote-harness-config'

type HermesSessionRow = {
  id?: unknown
  title?: unknown
  model?: unknown
  source?: unknown
  status?: unknown
  started_at?: unknown
  last_active?: unknown
  ended_at?: unknown
}

type HermesMessageRow = {
  id?: unknown
  session_id?: unknown
  role?: unknown
  content?: unknown
  timestamp?: unknown
  tool_name?: unknown
  tool_calls?: unknown
  reasoning?: unknown
}

type OpenClawSessionRow = {
  key?: unknown
  status?: unknown
  updatedAt?: unknown
  startedAt?: unknown
  sessionId?: unknown
  modelProvider?: unknown
  model?: unknown
}

type OpenClawMessageRow = {
  id?: unknown
  runId?: unknown
  role?: unknown
  content?: unknown
  timestamp?: unknown
  createdAt?: unknown
  type?: unknown
}

const REMOTE_SEPARATOR = '__'
const HERMES_WORKSPACE_TITLE_PREFIX = 'Hermes Workspace · '

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object',
      )
    : []
}

function timestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : Math.round(value * 1000)
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return timestamp(numeric)
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<Record<string, unknown>> {
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/json')
  if (init?.body) headers.set('content-type', 'application/json')
  const apiToken = process.env.HERMES_API_TOKEN
  if (apiToken) headers.set('authorization', `Bearer ${apiToken}`)
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(
      readText(payload.detail) ||
        readText(payload.error) ||
        `Remote harness returned HTTP ${response.status}`,
    )
  }
  return payload
}

function externalId(harnessId: string, sessionId: string): string {
  return `${harnessId}${REMOTE_SEPARATOR}${sessionId}`
}

function parseRemoteId(
  rawId: string,
  harnesses: Array<RemoteHarnessConfig>,
): { harness: RemoteHarnessConfig; sessionId: string } | null {
  for (const harness of harnesses) {
    const prefix = `${harness.id}${REMOTE_SEPARATOR}`
    if (rawId.startsWith(prefix)) {
      const sessionId = rawId.slice(prefix.length)
      return sessionId ? { harness, sessionId } : null
    }
  }
  return null
}

function remoteRuntime(
  harness: RemoteHarnessConfig,
  online: boolean,
  latencyMs: number,
  error = '',
): ExternalAgentRuntime {
  const now = Date.now()
  return {
    id: harness.id,
    name: harness.name,
    description: harness.description,
    backend: harness.type === 'hermes' ? 'remote-hermes' : 'remote-openclaw',
    agentType: harness.type === 'hermes' ? 'remote-hermes' : 'remote-openclaw',
    source: 'tailscale',
    enabled: true,
    installed: true,
    command: '',
    args: [],
    teamCapable: true,
    status: online ? 'online' : 'offline',
    lastCheckStatus: online ? 'online' : 'offline',
    lastCheckErrorCode: online ? '' : 'REMOTE_UNAVAILABLE',
    lastCheckErrorMessage: error,
    lastCheckGuidance: online
      ? ''
      : 'Check that the remote Mac and Tailscale services are online.',
    lastCheckLatencyMs: latencyMs,
    lastCheckAt: now,
    lastSuccessAt: online ? now : null,
    lastFailureAt: online ? null : now,
  }
}

async function checkHarness(
  harness: RemoteHarnessConfig,
): Promise<ExternalAgentRuntime> {
  const started = Date.now()
  try {
    if (harness.type === 'hermes') {
      const health = await fetchJson(`${harness.baseUrl}/health`)
      if (readText(health.status).toLowerCase() !== 'ok') {
        throw new Error('Hermes health check did not return OK')
      }
    } else {
      await requestOpenClaw<Record<string, unknown>>(
        harness.gatewayUrl,
        'sessions.list',
        { includeGlobal: true, includeUnknown: true, limit: 1 },
        10_000,
      )
    }
    return remoteRuntime(harness, true, Date.now() - started)
  } catch (error) {
    return remoteRuntime(
      harness,
      false,
      Date.now() - started,
      error instanceof Error ? error.message : 'Remote harness is unavailable',
    )
  }
}

export async function getRemoteHarnessRuntimes(): Promise<
  Array<ExternalAgentRuntime>
> {
  const harnesses = await loadRemoteHarnesses()
  return Promise.all(harnesses.map(checkHarness))
}

function hermesConversation(
  harness: RemoteHermesHarnessConfig,
  row: HermesSessionRow,
): ExternalConversation | null {
  const sessionId = readText(row.id)
  if (!sessionId) return null
  const createdAt = timestamp(row.started_at)
  const modifiedAt = timestamp(row.last_active) || timestamp(row.ended_at)
  const status = readText(row.status).toLowerCase()
  const isProcessing = status === 'running' || status === 'active'
  const title = readText(row.title)
  return {
    id: externalId(harness.id, sessionId),
    name: title.startsWith(HERMES_WORKSPACE_TITLE_PREFIX)
      ? title.slice(HERMES_WORKSPACE_TITLE_PREFIX.length)
      : title || harness.name,
    nameSource: 'remote-hermes',
    agentType: 'remote-hermes',
    status: status || 'ready',
    source: 'tailscale',
    pinned: false,
    runtimeId: harness.id,
    backend: `Hermes · ${readText(row.model) || harness.model}`,
    workspace: 'Remote MacBook',
    createdAt,
    modifiedAt: modifiedAt || createdAt,
    runtime: {
      state: isProcessing ? 'running' : 'ready',
      canSendMessage: !isProcessing,
      isProcessing,
      pendingConfirmations: 0,
      turnId: null,
    },
  }
}

function openClawConversation(
  harness: RemoteOpenClawHarnessConfig,
  row?: OpenClawSessionRow,
): ExternalConversation {
  const status = readText(row?.status).toLowerCase()
  const isProcessing = status === 'running' || status === 'active'
  const model = [readText(row?.modelProvider), readText(row?.model)]
    .filter(Boolean)
    .join('/')
  return {
    id: externalId(harness.id, 'main'),
    name: harness.name,
    nameSource: 'remote-openclaw',
    agentType: 'remote-openclaw',
    status: status || 'ready',
    source: 'tailscale',
    pinned: false,
    runtimeId: harness.id,
    backend: `OpenClaw · ${model || harness.model}`,
    workspace: 'Remote MacBook',
    createdAt: timestamp(row?.startedAt),
    modifiedAt: timestamp(row?.updatedAt),
    runtime: {
      state: isProcessing ? 'running' : 'ready',
      canSendMessage: !isProcessing,
      isProcessing,
      pendingConfirmations: 0,
      turnId: null,
    },
  }
}

async function listHermesSessions(
  harness: RemoteHermesHarnessConfig,
): Promise<Array<ExternalConversation>> {
  const payload = await fetchJson(`${harness.baseUrl}/api/sessions?limit=100`)
  const rows = readArray(payload.items ?? payload.data)
  return rows
    .filter(
      (row) =>
        readText(row.id).startsWith('hw_') ||
        readText(row.title).startsWith(HERMES_WORKSPACE_TITLE_PREFIX),
    )
    .map((row) => hermesConversation(harness, row))
    .filter(
      (conversation): conversation is ExternalConversation =>
        conversation !== null,
    )
}

async function readOpenClawSession(
  harness: RemoteOpenClawHarnessConfig,
): Promise<OpenClawSessionRow | undefined> {
  const payload = await requestOpenClaw<Record<string, unknown>>(
    harness.gatewayUrl,
    'sessions.list',
    { includeGlobal: true, includeUnknown: true, limit: 100 },
  )
  return readArray(payload.sessions ?? payload.items).find(
    (row) => readText(row.key) === harness.sessionKey,
  )
}

export async function listRemoteConversations(): Promise<
  Array<ExternalConversation>
> {
  const harnesses = await loadRemoteHarnesses()
  const groups = await Promise.all(
    harnesses.map(async (harness) => {
      try {
        if (harness.type === 'hermes') return listHermesSessions(harness)
        return [openClawConversation(harness, await readOpenClawSession(harness))]
      } catch {
        return []
      }
    }),
  )
  return groups.flat().sort((left, right) => right.modifiedAt - left.modifiedAt)
}

export async function getRemoteConversation(
  rawId: string,
): Promise<ExternalConversation | null> {
  const harnesses = await loadRemoteHarnesses()
  const parsed = parseRemoteId(rawId, harnesses)
  if (!parsed) return null
  if (parsed.harness.type === 'openclaw') {
    return openClawConversation(
      parsed.harness,
      await readOpenClawSession(parsed.harness),
    )
  }
  const payload = await fetchJson(
    `${parsed.harness.baseUrl}/api/sessions/${encodeURIComponent(parsed.sessionId)}`,
  )
  const row =
    payload.session && typeof payload.session === 'object'
      ? (payload.session as HermesSessionRow)
      : (payload as HermesSessionRow)
  return hermesConversation(parsed.harness, row)
}

export async function createRemoteConversation(
  runtimeId: string,
  name?: string,
): Promise<ExternalConversation | null> {
  const harnesses = await loadRemoteHarnesses()
  const harness = harnesses.find((item) => item.id === runtimeId)
  if (!harness) return null
  if (harness.type === 'openclaw') {
    return openClawConversation(harness, await readOpenClawSession(harness))
  }
  const sessionId = `hw_${Date.now()}_${randomUUID().slice(0, 8)}`
  const requestedName = readText(name) || 'New chat'
  const title = requestedName.startsWith(HERMES_WORKSPACE_TITLE_PREFIX)
    ? requestedName
    : `${HERMES_WORKSPACE_TITLE_PREFIX}${requestedName}`
  const payload = await fetchJson(`${harness.baseUrl}/api/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      id: sessionId,
      title,
      model: harness.model,
    }),
  })
  const row =
    payload.session && typeof payload.session === 'object'
      ? (payload.session as HermesSessionRow)
      : (payload as HermesSessionRow)
  return hermesConversation(harness, row)
}

export async function deleteRemoteConversation(
  rawId: string,
): Promise<boolean> {
  const harnesses = await loadRemoteHarnesses()
  const parsed = parseRemoteId(rawId, harnesses)
  if (!parsed) return false
  if (parsed.harness.type === 'openclaw') {
    await requestOpenClaw(parsed.harness.gatewayUrl, 'sessions.delete', {
      key: parsed.harness.sessionKey,
      deleteTranscript: true,
    })
    return true
  }
  await fetchJson(
    `${parsed.harness.baseUrl}/api/sessions/${encodeURIComponent(parsed.sessionId)}`,
    { method: 'DELETE' },
  )
  return true
}

function hermesMessage(
  conversationId: string,
  row: HermesMessageRow,
  index: number,
): ExternalConversationMessage {
  const role = readText(row.role).toLowerCase()
  const createdAt = timestamp(row.timestamp)
  const rawId = row.id
  const id =
    typeof rawId === 'number' || typeof rawId === 'string'
      ? String(rawId)
      : `hermes-${createdAt}-${index}`
  return {
    id: `${conversationId}-${id}`,
    conversationId,
    messageId: id,
    type: readText(row.tool_name)
      ? 'tool_call'
      : row.content == null && row.reasoning
        ? 'thinking'
        : 'text',
    content: row.content ?? row.reasoning ?? row.tool_calls ?? '',
    position: role === 'user' ? 'right' : 'left',
    status: 'complete',
    hidden: false,
    createdAt,
    backendTurnId: '',
  }
}

function openClawMessage(
  conversationId: string,
  row: OpenClawMessageRow,
  index: number,
): ExternalConversationMessage {
  const role = readText(row.role).toLowerCase()
  const createdAt = timestamp(row.timestamp) || timestamp(row.createdAt)
  const rawId = readText(row.id) || readText(row.runId)
  const id = rawId || `openclaw-${createdAt}-${index}`
  const declaredType = readText(row.type).toLowerCase()
  return {
    id: `${conversationId}-${id}-${index}`,
    conversationId,
    messageId: id,
    type:
      declaredType === 'thinking' || role === 'assistant/analysis'
        ? 'thinking'
        : declaredType === 'tool' || role === 'tool'
          ? 'tool_call'
          : 'text',
    content: row.content ?? '',
    position: role === 'user' ? 'right' : 'left',
    status: 'complete',
    hidden: false,
    createdAt,
    backendTurnId: readText(row.runId),
  }
}

export async function listRemoteMessages(
  rawId: string,
): Promise<Array<ExternalConversationMessage> | null> {
  const harnesses = await loadRemoteHarnesses()
  const parsed = parseRemoteId(rawId, harnesses)
  if (!parsed) return null
  if (parsed.harness.type === 'openclaw') {
    const payload = await requestOpenClaw<Record<string, unknown>>(
      parsed.harness.gatewayUrl,
      'chat.history',
      { sessionKey: parsed.harness.sessionKey, limit: 200 },
    )
    return readArray(payload.messages ?? payload.items).map((row, index) =>
      openClawMessage(rawId, row, index),
    )
  }
  const payload = await fetchJson(
    `${parsed.harness.baseUrl}/api/sessions/${encodeURIComponent(parsed.sessionId)}/messages`,
  )
  return readArray(payload.items ?? payload.data ?? payload.messages).map(
    (row, index) => hermesMessage(rawId, row, index),
  )
}

export async function sendRemoteMessage(
  rawId: string,
  content: string,
): Promise<{ messageId: string; turnId: string } | null> {
  const harnesses = await loadRemoteHarnesses()
  const parsed = parseRemoteId(rawId, harnesses)
  if (!parsed) return null
  const requestId = randomUUID()
  if (parsed.harness.type === 'openclaw') {
    const payload = await requestOpenClaw<Record<string, unknown>>(
      parsed.harness.gatewayUrl,
      'chat.send',
      {
        sessionKey: parsed.harness.sessionKey,
        message: content,
        deliver: false,
        idempotencyKey: requestId,
      },
      30_000,
    )
    return {
      messageId: readText(payload.messageId) || requestId,
      turnId: readText(payload.runId) || requestId,
    }
  }
  const payload = await fetchJson(
    `${parsed.harness.baseUrl}/api/sessions/${encodeURIComponent(parsed.sessionId)}/chat`,
    {
      method: 'POST',
      body: JSON.stringify({ message: content, model: parsed.harness.model }),
    },
    10 * 60_000,
  )
  return {
    messageId: readText(payload.message_id) || requestId,
    turnId: readText(payload.turn_id) || requestId,
  }
}
