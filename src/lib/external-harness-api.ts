export type ExternalRuntimeStatus =
  | 'online'
  | 'offline'
  | 'unchecked'
  | 'missing'
  | 'disabled'
  | 'unknown'

export type ExternalRuntime = {
  id: string
  name: string
  description: string
  backend: string
  agentType: string
  source: string
  enabled: boolean
  installed: boolean
  teamCapable: boolean
  status: ExternalRuntimeStatus
  lastCheckErrorMessage: string
}

export type ExternalHarnessSnapshot = {
  online: boolean
  version: string
  runtimes: Array<ExternalRuntime>
  error?: string
}

export type ExternalConversation = {
  id: string
  name: string
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

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload
}

export async function fetchExternalRuntimes(): Promise<ExternalHarnessSnapshot> {
  const response = await fetch('/api/external-agents', {
    headers: { accept: 'application/json' },
  })
  const payload = await readPayload<{
    ok: boolean
    companion: ExternalHarnessSnapshot
  }>(response)
  return payload.companion
}

export async function fetchExternalConversations(): Promise<
  Array<ExternalConversation>
> {
  const response = await fetch('/api/external-conversations', {
    headers: { accept: 'application/json' },
  })
  const payload = await readPayload<{
    ok: boolean
    conversations: Array<ExternalConversation>
  }>(response)
  return payload.conversations
}

export async function createExternalConversation(input: {
  runtimeId: string
  name?: string
}): Promise<ExternalConversation> {
  const response = await fetch('/api/external-conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await readPayload<{
    ok: boolean
    conversation: ExternalConversation
  }>(response)
  return payload.conversation
}

export async function fetchExternalConversation(
  conversationId: string,
): Promise<ExternalConversation> {
  const response = await fetch(
    `/api/external-conversations/${encodeURIComponent(conversationId)}`,
    { headers: { accept: 'application/json' } },
  )
  const payload = await readPayload<{
    ok: boolean
    conversation: ExternalConversation
  }>(response)
  return payload.conversation
}

export async function fetchExternalMessages(
  conversationId: string,
): Promise<Array<ExternalConversationMessage>> {
  const response = await fetch(
    `/api/external-conversations/${encodeURIComponent(conversationId)}/messages`,
    { headers: { accept: 'application/json' } },
  )
  const payload = await readPayload<{
    ok: boolean
    messages: Array<ExternalConversationMessage>
  }>(response)
  return payload.messages
}

export async function sendExternalMessage(
  conversationId: string,
  content: string,
): Promise<void> {
  const response = await fetch(
    `/api/external-conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  )
  await readPayload<{ ok: boolean }>(response)
}
