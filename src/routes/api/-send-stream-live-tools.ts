export type SyntheticLiveToolTracker = {
  emittedPhaseByToolCallId: Map<string, 'calling' | 'complete' | 'error'>
}

type CollectSyntheticLiveToolEventsParams = {
  messages: Array<Record<string, unknown>>
  tracker: SyntheticLiveToolTracker
  sessionKey: string
  runId?: string
}

type SyntheticLiveToolEvent = {
  phase: 'calling' | 'complete' | 'error'
  name: string
  toolCallId: string
  args?: unknown
  result?: string
  sessionKey: string
  runId?: string
}

export const SYNTHETIC_LIVE_TOOL_ID_LIMIT = 128
export const SYNTHETIC_LIVE_TOOL_ID_MAX_BYTES = 256
export const SYNTHETIC_LIVE_TOOL_NAME_MAX_BYTES = 128
export const SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES = 16 * 1024
export const SYNTHETIC_LIVE_TOOL_RESULT_MAX_BYTES = 16 * 1024

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let result = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maxBytes) break
    result += character
    bytes += characterBytes
  }
  return result
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function readBoundedIdentifier(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string' || !value || value.trim() !== value) return ''
  if (containsControlCharacter(value)) return ''
  return Buffer.byteLength(value, 'utf8') <= maxBytes ? value : ''
}

function readBoundedName(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || containsControlCharacter(trimmed)) return ''
  return truncateUtf8(trimmed, SYNTHETIC_LIVE_TOOL_NAME_MAX_BYTES)
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function parseBoundedJsonIfPossible(value: unknown): unknown {
  if (typeof value !== 'string') {
    try {
      const serialized = JSON.stringify(value)
      if (
        Buffer.byteLength(serialized, 'utf8') <=
        SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES
      ) {
        return value
      }
    } catch {
      // Fall through to the bounded omission marker.
    }
    return { omitted: 'Tool arguments could not be persisted safely.' }
  }
  const trimmed = value.trim()
  if (!trimmed) return value
  if (Buffer.byteLength(trimmed, 'utf8') > SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES) {
    return { omitted: 'Tool arguments exceeded the persistence limit.' }
  }
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return truncateUtf8(value, SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES)
    }
  }
  return truncateUtf8(value, SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES)
}

function extractToolResultText(message: Record<string, unknown>): string {
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      const record = readRecord(part)
      return typeof record?.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function createSyntheticLiveToolTracker(): SyntheticLiveToolTracker {
  return {
    emittedPhaseByToolCallId: new Map(),
  }
}

export function collectSyntheticLiveToolEvents({
  messages,
  tracker,
  sessionKey,
  runId,
}: CollectSyntheticLiveToolEventsParams): Array<SyntheticLiveToolEvent> {
  const runToolCalls = new Map<string, Record<string, unknown>>()

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const toolCalls = (message.tool_calls ?? message.toolCalls) as
      | Array<Record<string, unknown>>
      | undefined
    if (!Array.isArray(toolCalls)) continue
    for (const toolCall of toolCalls) {
      const toolCallId =
        readBoundedIdentifier(toolCall.id, SYNTHETIC_LIVE_TOOL_ID_MAX_BYTES) ||
        readBoundedIdentifier(
          toolCall.tool_call_id,
          SYNTHETIC_LIVE_TOOL_ID_MAX_BYTES,
        )
      if (!toolCallId) continue
      const retained =
        runToolCalls.has(toolCallId) ||
        tracker.emittedPhaseByToolCallId.has(toolCallId)
      if (!retained && runToolCalls.size >= SYNTHETIC_LIVE_TOOL_ID_LIMIT) {
        continue
      }
      runToolCalls.set(toolCallId, toolCall)
    }
  }

  const resultByCallId = new Map<string, { text: string; isError: boolean }>()
  for (const message of messages) {
    if (message.role !== 'tool' && message.role !== 'tool_result') continue
    const callId =
      readBoundedIdentifier(
        message.tool_call_id,
        SYNTHETIC_LIVE_TOOL_ID_MAX_BYTES,
      ) ||
      readBoundedIdentifier(
        message.toolCallId,
        SYNTHETIC_LIVE_TOOL_ID_MAX_BYTES,
      )
    if (!callId || !runToolCalls.has(callId)) continue
    const isError = Boolean(message.is_error) || Boolean(message.isError)
    resultByCallId.set(callId, {
      text: isError
        ? 'Tool failed.'
        : truncateUtf8(
            extractToolResultText(message),
            SYNTHETIC_LIVE_TOOL_RESULT_MAX_BYTES,
          ),
      isError,
    })
  }

  const events: Array<SyntheticLiveToolEvent> = []
  for (const [toolCallId, toolCall] of runToolCalls) {
    const toolFunction = readRecord(toolCall.function)
    const name =
      readBoundedName(toolCall.tool_name) ||
      readBoundedName(toolCall.name) ||
      readBoundedName(toolFunction?.name) ||
      'tool'
    const args = parseBoundedJsonIfPossible(
      toolFunction?.arguments ?? toolCall.arguments,
    )
    const resultEntry = resultByCallId.get(toolCallId)
    const nextPhase = resultEntry
      ? resultEntry.isError
        ? 'error'
        : 'complete'
      : 'calling'
    const previousPhase = tracker.emittedPhaseByToolCallId.get(toolCallId)

    if (previousPhase === nextPhase) continue
    if (
      previousPhase &&
      (previousPhase === 'complete' || previousPhase === 'error')
    ) {
      continue
    }
    if (
      previousPhase === undefined &&
      tracker.emittedPhaseByToolCallId.size >= SYNTHETIC_LIVE_TOOL_ID_LIMIT
    ) {
      continue
    }

    tracker.emittedPhaseByToolCallId.set(toolCallId, nextPhase)
    events.push({
      phase: nextPhase,
      name,
      toolCallId,
      args,
      result: resultEntry?.text || undefined,
      sessionKey,
      runId,
    })
  }

  return events
}
