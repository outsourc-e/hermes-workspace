export type ToolCallContent = {
  type: 'toolCall'
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  partialJson?: string
}

export type ToolResultContent = {
  type: 'toolResult'
  toolCallId?: string
  toolName?: string
  content?: Array<{ type?: string; text?: string }>
  details?: Record<string, unknown>
  isError?: boolean
}

export type TextContent = {
  type: 'text'
  text?: string
  textSignature?: string
}

export type ThinkingContent = {
  type: 'thinking'
  thinking?: string
  thinkingSignature?: string
}

export type MessageContent = TextContent | ToolCallContent | ThinkingContent

export type ChatAttachment = {
  id?: string
  name?: string
  contentType?: string
  size?: number
  url?: string
  dataUrl?: string
  previewUrl?: string
  width?: number
  height?: number
}

export type StreamingStatus = 'idle' | 'streaming' | 'complete' | 'error'

export type ChatMessage = {
  role?: string
  content?: Array<MessageContent>
  attachments?: Array<ChatAttachment>
  toolCallId?: string
  toolName?: string
  details?: Record<string, unknown>
  isError?: boolean
  timestamp?: number
  [key: string]: unknown
  __optimisticId?: string
  __streamingStatus?: StreamingStatus
  __streamingText?: string
  __streamingThinking?: string
}

export type SessionTitleStatus = 'idle' | 'generating' | 'ready' | 'error'
export type SessionTitleSource = 'auto' | 'manual'

export type SessionSummary = {
  key?: string
  label?: string
  title?: string
  derivedTitle?: string
  updatedAt?: number
  lastMessage?: ChatMessage | null
  friendlyId?: string
  titleStatus?: SessionTitleStatus
  titleSource?: SessionTitleSource
  titleError?: string | null
  preview?: string | null
}

export type SessionListResponse = {
  sessions?: Array<SessionSummary>
}

export type HistoryResponse = {
  sessionKey: string
  sessionId?: string
  messages: Array<ChatMessage>
}

export type SessionMeta = {
  key: string
  friendlyId: string
  title?: string
  derivedTitle?: string
  label?: string
  updatedAt?: number
  lastMessage?: ChatMessage | null
  titleStatus?: SessionTitleStatus
  titleSource?: SessionTitleSource
  titleError?: string | null
  preview?: string | null
}

export type PathsPayload = {
  agentId: string
  stateDir: string
  sessionsDir: string
  storePath: string
}
