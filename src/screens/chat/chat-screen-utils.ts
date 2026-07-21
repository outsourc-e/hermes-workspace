import type { ChatAttachment, ChatMessage } from './types'

export type StickyStreamingTextState = {
  runId: string | null
  text: string
}

export type ResponseWaitSnapshot = {
  messageCount: number
  lastAssistantId: string | null
}

export function isTerminalActiveRunStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    ['complete', 'completed', 'failed', 'cancelled', 'error'].includes(status)
  )
}

function assistantMessageIdentity(message: ChatMessage): string {
  return String(
    message.__optimisticId ??
      message.id ??
      message.messageId ??
      message.__realtimeSequence ??
      '',
  )
}

export function createResponseWaitSnapshot(
  messages: Array<ChatMessage>,
): ResponseWaitSnapshot {
  const last = messages[messages.length - 1]
  return {
    messageCount: messages.length,
    lastAssistantId:
      last?.role === 'assistant' ? assistantMessageIdentity(last) : null,
  }
}

export function shouldClearWaitingForAssistantMessage(
  messages: Array<ChatMessage>,
  snapshot: ResponseWaitSnapshot,
): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return false
  if (last.__streamingStatus === 'streaming') return false

  if (messages.length > snapshot.messageCount) return true

  const currentId = assistantMessageIdentity(last)
  if (currentId.length > 0 && currentId !== (snapshot.lastAssistantId ?? '')) {
    return true
  }

  return snapshot.lastAssistantId === null
}

export function advanceStickyStreamingText(params: {
  isStreaming: boolean
  runId: string | null
  rawText: string
  smoothedText: string
  previousState: StickyStreamingTextState
}): StickyStreamingTextState {
  const { isStreaming, runId, rawText, smoothedText, previousState } = params

  if (!isStreaming) {
    return { runId: null, text: '' }
  }

  const nextRunId = runId ?? previousState.runId ?? 'streaming'
  const isNewRun = nextRunId !== previousState.runId
  const candidateText = smoothedText || rawText
  const nextText = candidateText.length > 0
    ? candidateText
    : isNewRun
      ? ''
      : previousState.text

  return {
    runId: nextRunId,
    text: nextText,
  }
}

type OptimisticMessagePayload = {
  clientId: string
  optimisticId: string
  optimisticMessage: ChatMessage
}

export function createOptimisticMessage(
  body: string,
  attachments: Array<ChatAttachment> = [],
): OptimisticMessagePayload {
  const clientId = crypto.randomUUID()
  const optimisticId = `opt-${clientId}`
  const timestamp = Date.now()
  const textContent =
    body.length > 0 ? [{ type: 'text' as const, text: body }] : []

  const optimisticMessage: ChatMessage = {
    role: 'user',
    content: textContent.length > 0 ? textContent : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    __optimisticId: optimisticId,
    __createdAt: timestamp,
    clientId,
    client_id: clientId,
    status: 'sending',
    timestamp,
  }

  return { clientId, optimisticId, optimisticMessage }
}
