import {
  getAionCoreCompanionSnapshot,
  requestAionCoreJson,
} from './aioncore-companion'
import {
  createRemoteConversation,
  deleteRemoteConversation,
  getRemoteConversation,
  listRemoteConversations,
  listRemoteMessages,
  sendRemoteMessage,
} from './remote-harnesses'

type AionCoreEnvelope<T> = {
  success?: boolean
  data?: T
  error?: string
}

type AionCoreConversationRow = {
  id?: string
  name?: string
  name_source?: string
  type?: string
  status?: string
  source?: string
  pinned?: boolean
  created_at?: number
  modified_at?: number
  extra?: Record<string, unknown>
  runtime?: {
    state?: string
    can_send_message?: boolean
    is_processing?: boolean
    pending_confirmations?: number
    turn_id?: string | null
  }
}

type AionCoreMessageRow = {
  id?: string
  conversation_id?: string
  msg_id?: string | null
  type?: string
  content?: unknown
  position?: string
  status?: string
  hidden?: boolean
  created_at?: number
  backend_turn_id?: string
}

type PaginatedRows<T> = {
  items?: Array<T>
  total?: number
  has_more?: boolean
}

export type ExternalConversation = {
  id: string
  name: string
  nameSource: string
  agentType: string
  status: string
  source: string
  pinned: boolean
  runtimeId: string
  backend: string
  workspace: string
  createdAt: number
  modifiedAt: number
  runtime: {
    state: string
    canSendMessage: boolean
    isProcessing: boolean
    pendingConfirmations: number
    turnId: string | null
  } | null
}

export type ExternalConversationMessage = {
  id: string
  conversationId: string
  messageId: string
  type: string
  content: unknown
  position: 'left' | 'right' | 'unknown'
  status: string
  hidden: boolean
  createdAt: number
  backendTurnId: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function conversationId(value: unknown): string {
  const id = text(value)
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error('Invalid external conversation id')
  }
  return id
}

export function normalizeExternalConversation(
  row: AionCoreConversationRow,
): ExternalConversation | null {
  const id = text(row.id)
  if (!id) return null
  const extra = row.extra && typeof row.extra === 'object' ? row.extra : {}
  const runtime = row.runtime

  return {
    id,
    name: text(row.name) || 'Untitled session',
    nameSource: text(row.name_source),
    agentType: text(row.type) || 'unknown',
    status: text(row.status) || 'unknown',
    source: text(row.source),
    pinned: row.pinned === true,
    runtimeId: text(extra.agent_id),
    backend: text(extra.backend) || text(row.type),
    workspace: text(extra.workspace),
    createdAt: finiteNumber(row.created_at),
    modifiedAt: finiteNumber(row.modified_at),
    runtime: runtime
      ? {
          state: text(runtime.state) || 'unknown',
          canSendMessage: runtime.can_send_message === true,
          isProcessing: runtime.is_processing === true,
          pendingConfirmations: finiteNumber(runtime.pending_confirmations),
          turnId: text(runtime.turn_id) || null,
        }
      : null,
  }
}

export function normalizeExternalConversationMessage(
  row: AionCoreMessageRow,
): ExternalConversationMessage | null {
  const id = text(row.id)
  const ownerId = text(row.conversation_id)
  if (!id || !ownerId) return null
  const position = text(row.position)

  return {
    id,
    conversationId: ownerId,
    messageId: text(row.msg_id),
    type: text(row.type) || 'unknown',
    content: row.content ?? null,
    position:
      position === 'left' || position === 'right' ? position : 'unknown',
    status: text(row.status),
    hidden: row.hidden === true,
    createdAt: finiteNumber(row.created_at),
    backendTurnId: text(row.backend_turn_id),
  }
}

export async function listExternalConversations(): Promise<
  Array<ExternalConversation>
> {
  const [localResult, remoteResult] = await Promise.allSettled([
    requestAionCoreJson<
      AionCoreEnvelope<PaginatedRows<AionCoreConversationRow>>
    >('/api/conversations?limit=100'),
    listRemoteConversations(),
  ])
  const local =
    localResult.status === 'fulfilled' &&
    localResult.value.success !== false
      ? (localResult.value.data?.items ?? [])
          .map(normalizeExternalConversation)
          .filter(
            (conversation): conversation is ExternalConversation =>
              conversation !== null,
          )
      : []
  const remote =
    remoteResult.status === 'fulfilled' ? remoteResult.value : []
  if (
    !local.length &&
    !remote.length &&
    localResult.status === 'rejected' &&
    !(localResult.reason instanceof Error && /fetch failed/i.test(localResult.reason.message))
  ) {
    throw localResult.reason
  }
  return [...remote, ...local].sort(
    (left, right) => right.modifiedAt - left.modifiedAt,
  )
}

export async function getExternalConversation(
  rawId: string,
): Promise<ExternalConversation> {
  const id = conversationId(rawId)
  const remote = await getRemoteConversation(id)
  if (remote) return remote
  const payload = await requestAionCoreJson<
    AionCoreEnvelope<AionCoreConversationRow>
  >(`/api/conversations/${encodeURIComponent(id)}`)
  if (payload.success === false || !payload.data) {
    throw new Error(payload.error || 'External conversation was not found')
  }
  const conversation = normalizeExternalConversation(payload.data)
  if (!conversation) throw new Error('External conversation is invalid')
  return conversation
}

export async function createExternalConversation(input: {
  runtimeId: string
  name?: string
}): Promise<ExternalConversation> {
  const runtimeId = conversationId(input.runtimeId)
  const remote = await createRemoteConversation(runtimeId, input.name)
  if (remote) return remote
  const snapshot = await getAionCoreCompanionSnapshot()
  if (!snapshot.online) {
    throw new Error(snapshot.error || 'AionCore companion is unavailable')
  }
  const runtime = snapshot.runtimes.find((item) => item.id === runtimeId)
  if (!runtime || !runtime.enabled || !runtime.installed) {
    throw new Error('Agent runtime is not installed and enabled')
  }
  if (runtime.agentType !== 'acp' && runtime.agentType !== 'aionrs') {
    throw new Error('This runtime does not expose conversational sessions')
  }

  const extra: Record<string, unknown> = {}
  if (runtime.agentType === 'acp') {
    extra.agent_id = runtime.id
    extra.backend = runtime.backend
  }
  const payload = await requestAionCoreJson<
    AionCoreEnvelope<AionCoreConversationRow>
  >(
    '/api/conversations',
    {
      method: 'POST',
      body: JSON.stringify({
        type: runtime.agentType,
        name: text(input.name) || `${runtime.name} session`,
        source: 'aionui',
        extra,
      }),
    },
    30_000,
  )
  if (payload.success === false || !payload.data) {
    throw new Error(payload.error || 'Could not create external conversation')
  }
  const conversation = normalizeExternalConversation(payload.data)
  if (!conversation) throw new Error('Created conversation is invalid')
  return conversation
}

export async function deleteExternalConversation(rawId: string): Promise<void> {
  const id = conversationId(rawId)
  if (await deleteRemoteConversation(id)) return
  const payload = await requestAionCoreJson<AionCoreEnvelope<unknown>>(
    `/api/conversations/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  if (payload.success === false) {
    throw new Error(payload.error || 'Could not delete external conversation')
  }
}

export async function listExternalConversationMessages(
  rawId: string,
): Promise<Array<ExternalConversationMessage>> {
  const id = conversationId(rawId)
  const remote = await listRemoteMessages(id)
  if (remote) return remote
  const payload = await requestAionCoreJson<
    AionCoreEnvelope<PaginatedRows<AionCoreMessageRow>>
  >(
    `/api/conversations/${encodeURIComponent(id)}/messages?limit=200&content_mode=full`,
  )
  if (payload.success === false) {
    throw new Error(payload.error || 'External messages are unavailable')
  }
  return (payload.data?.items ?? [])
    .map(normalizeExternalConversationMessage)
    .filter(
      (message): message is ExternalConversationMessage => message !== null,
    )
    .filter((message) => !message.hidden)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function sendExternalConversationMessage(
  rawId: string,
  content: string,
): Promise<{ messageId: string; turnId: string }> {
  const id = conversationId(rawId)
  const message = content.trim()
  if (!message || message.length > 200_000) {
    throw new Error('Message must be between 1 and 200,000 characters')
  }
  const remote = await sendRemoteMessage(id, message)
  if (remote) return remote
  const payload = await requestAionCoreJson<
    AionCoreEnvelope<{ msg_id?: string; turn_id?: string }>
  >(
    `/api/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: message,
        files: [],
        sessions: [],
        inject_skills: [],
        hidden: false,
      }),
    },
    30_000,
  )
  if (payload.success === false || !payload.data) {
    throw new Error(payload.error || 'Could not send external message')
  }
  return {
    messageId: text(payload.data.msg_id),
    turnId: text(payload.data.turn_id),
  }
}
