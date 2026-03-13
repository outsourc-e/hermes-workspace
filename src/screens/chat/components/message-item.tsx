import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown01Icon,
  Idea01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  getMessageTimestamp,
  getToolCallsFromMessage,
  textFromMessage,
} from '../utils'
import { MessageActionsBar } from './message-actions-bar'
import type {
  GatewayAttachment,
  GatewayMessage,
  ToolCallContent,
} from '../types'
import type { ToolPart } from '@/components/prompt-kit/tool'
import { Message, MessageContent } from '@/components/prompt-kit/message'
import { AssistantAvatar, UserAvatar } from '@/components/avatars'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  selectChatProfileAvatarDataUrl,
  selectChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import { cn } from '@/lib/utils'


const WORDS_PER_TICK = 4
const TICK_INTERVAL_MS = 50
const STUCK_SENDING_THRESHOLD_MS = 30_000

function isWhitespaceCharacter(value: string): boolean {
  return /\s/.test(value)
}

function countWords(text: string): number {
  let count = 0
  let inWord = false

  for (const character of text) {
    if (isWhitespaceCharacter(character)) {
      if (inWord) {
        count += 1
        inWord = false
      }
      continue
    }
    inWord = true
  }

  if (inWord) {
    count += 1
  }

  return count
}

function getWordBoundaryIndex(text: string, wordCount: number): number {
  if (text.length === 0 || wordCount <= 0) return 0

  let count = 0
  let index = 0
  let inWord = false

  while (index < text.length) {
    const character = text[index] ?? ''
    if (isWhitespaceCharacter(character)) {
      if (inWord) {
        count += 1
        if (count >= wordCount) {
          return index
        }
        inWord = false
      }
    } else {
      inWord = true
    }
    index += 1
  }

  if (inWord) {
    count += 1
    if (count >= wordCount) {
      return text.length
    }
  }

  return text.length
}

type StreamToolCall = {
  id: string
  name: string
  phase: 'calling' | 'running' | 'done' | 'error'
  args?: unknown
  result?: string
}

type ExecNotification = {
  name: string
  exitCode: number | null
  ok: boolean | null
}

type MessageItemProps = {
  message: GatewayMessage
  attachedToolMessages?: Array<GatewayMessage>
  toolResultsByCallId?: Map<string, GatewayMessage>
  toolCalls?: Array<StreamToolCall>
  onRetryMessage?: (message: GatewayMessage) => void
  forceActionsVisible?: boolean
  wrapperRef?: React.RefObject<HTMLDivElement | null>
  wrapperClassName?: string
  wrapperDataMessageId?: string
  wrapperScrollMarginTop?: number
  bubbleClassName?: string
  isStreaming?: boolean
  streamingText?: string
  streamingThinking?: string
  simulateStreaming?: boolean
  streamingKey?: string | null
  expandAllToolSections?: boolean
  isLastAssistant?: boolean
}

type InlineToolSection = {
  key: string
  type: string
  input?: Record<string, unknown>
  outputText: string
  errorText?: string
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
}

function extractToolResultText(msg: GatewayMessage | undefined): string {
  if (!msg) return ''
  // Prefer text from content blocks (exec stdout, Read output, etc.)
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .filter((b: any) => b?.type === 'text' && b?.text)
      .map((b: any) => b.text as string)
      .join('\n')
    if (text.trim()) return text
  }
  // Fallback to details serialized
  if (msg.details && typeof msg.details === 'object') {
    return JSON.stringify(msg.details, null, 2)
  }
  return ''
}

function mapToolCallToToolPart(
  toolCall: ToolCallContent,
  resultMessage: GatewayMessage | undefined,
): ToolPart {
  const hasResult = resultMessage !== undefined
  const isError = resultMessage?.isError ?? false

  let state: ToolPart['state']
  if (!hasResult) {
    state = 'input-available'
  } else if (isError) {
    state = 'output-error'
  } else {
    state = 'output-available'
  }

  // Extract error text — check content first, then top-level text
  let errorText: string | undefined
  if (isError) {
    errorText = extractToolResultText(resultMessage) || 'Unknown error'
  }

  // Build output: prefer structured details, fall back to content text
  const outputText = extractToolResultText(resultMessage)
  const output: Record<string, unknown> | undefined =
    resultMessage?.details && Object.keys(resultMessage.details).length > 0
      ? resultMessage.details
      : outputText
        ? { output: outputText }
        : undefined

  return {
    type: toolCall.name || 'unknown',
    state,
    input: toolCall.arguments,
    output,
    toolCallId: toolCall.id,
    errorText,
  }
}

function toolCallsSignature(message: GatewayMessage): string {
  const toolCalls = getToolCallsFromMessage(message)
  return toolCalls
    .map((toolCall) => {
      const id = toolCall.id ?? ''
      const name = toolCall.name ?? ''
      const partialJson = toolCall.partialJson ?? ''
      const args = toolCall.arguments ? JSON.stringify(toolCall.arguments) : ''
      return `${id}|${name}|${partialJson}|${args}`
    })
    .join('||')
}

function toolResultSignature(result: GatewayMessage | undefined): string {
  if (!result) return 'missing'
  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
    .join('')
    .trim()
  const details = result.details ? JSON.stringify(result.details) : ''
  return `${result.toolCallId ?? ''}|${result.toolName ?? ''}|${result.isError ? '1' : '0'}|${text}|${details}`
}

function toolResultsSignature(
  message: GatewayMessage,
  toolResultsByCallId: Map<string, GatewayMessage> | undefined,
): string {
  if (!toolResultsByCallId) return ''
  const toolCalls = getToolCallsFromMessage(message)
  if (toolCalls.length === 0) return ''
  return toolCalls
    .map((toolCall) => {
      if (!toolCall.id) return 'missing'
      return toolResultSignature(toolResultsByCallId.get(toolCall.id))
    })
    .join('||')
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1_000_000_000_000) return value * 1000
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return null
}

function rawTimestamp(message: GatewayMessage): number | null {
  const candidates = [
    (message as any).createdAt,
    (message as any).created_at,
    (message as any).timestamp,
    (message as any).time,
    (message as any).ts,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeTimestamp(candidate)
    if (normalized) return normalized
  }
  return null
}

function thinkingFromMessage(msg: GatewayMessage): string | null {
  const parts = Array.isArray(msg.content) ? msg.content : []
  const thinkingPart = parts.find((part) => part.type === 'thinking')
  if (thinkingPart && 'thinking' in thinkingPart) {
    return String(thinkingPart.thinking ?? '')
  }
  return null
}

function normalizeStreamToolPhase(
  phase: unknown,
): 'calling' | 'running' | 'done' | 'error' {
  if (phase === 'calling') return 'calling'
  if (phase === 'running') return 'running'
  if (phase === 'done' || phase === 'result') return 'done'
  if (phase === 'error' || phase === 'failed' || phase === 'failure') {
    return 'error'
  }
  return 'running'
}

function readExecNotification(message: GatewayMessage): ExecNotification | null {
  const raw = (message as any).__execNotification as
    | Record<string, unknown>
    | undefined
  if (!raw || typeof raw !== 'object') return null
  const name = typeof raw.name === 'string' ? raw.name : ''
  const exitCode =
    typeof raw.exitCode === 'number' && Number.isFinite(raw.exitCode)
      ? raw.exitCode
      : null
  const ok = typeof raw.ok === 'boolean' ? raw.ok : null
  return {
    name: name || 'Exec',
    exitCode,
    ok,
  }
}

function readStringArg(
  args: Record<string, unknown> | undefined,
  ...keys: Array<string>
): string | null {
  if (!args) return null
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function fileNameFromPath(value: string): string {
  const normalized = value.trim().replace(/[\\/]+$/, '')
  if (!normalized) return value.trim()
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || normalized
}

function formatToolDisplayLabel(
  name: string,
  args?: Record<string, unknown>,
): string {
  const normalizedName = name.trim()
  const lowerName = normalizedName.toLowerCase()

  if (lowerName === 'read') {
    const filePath = readStringArg(args, 'file_path', 'path')
    return filePath ? `read ${fileNameFromPath(filePath)}` : 'read'
  }

  if (lowerName === 'edit') {
    const filePath = readStringArg(args, 'file_path', 'path')
    return filePath ? `edit ${fileNameFromPath(filePath)}` : 'edit'
  }

  if (lowerName === 'write') {
    const filePath = readStringArg(args, 'file_path', 'path')
    return filePath ? `write ${fileNameFromPath(filePath)}` : 'write'
  }

  if (lowerName === 'browser') {
    const action = readStringArg(args, 'action')
    return action ? `browser ${action}` : 'browser'
  }

  if (lowerName === 'exec') return 'exec'
  if (lowerName === 'memory_search') return 'memory search'
  if (lowerName === 'web_search') return 'web search'
  if (lowerName === 'web_fetch') return 'web fetch'

  return lowerName.replace(/_/g, ' ')
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readPercent(value: unknown): number | null {
  const numeric = readNumber(value)
  if (numeric === null) return null
  return Math.max(0, Math.min(numeric, 100))
}

function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value)
  if (absolute < 1000) return `${Math.round(value)}`
  if (absolute < 10_000) return `${(value / 1000).toFixed(1)}k`
  if (absolute < 100_000) return `${Math.round(value / 100) / 10}k`
  if (absolute < 1_000_000) return `${Math.round(value / 1000)}k`
  return `${Math.round(value / 100_000) / 10}m`
}

function shortenModelName(raw: string): string {
  if (!raw) return ''
  let name = raw
  const prefixes = [
    'openrouter/anthropic/',
    'openrouter/google/',
    'openrouter/openai/',
    'openrouter/',
    'anthropic/',
    'openai/',
    'google-antigravity/',
    'minimax/',
    'moonshot/',
  ]
  for (const prefix of prefixes) {
    if (name.toLowerCase().startsWith(prefix)) {
      name = name.slice(prefix.length)
      break
    }
  }
  return name
    .replace(/-(\d)/g, ' $1')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bGpt\b/g, 'GPT')
}

function messageMetadataSignature(message: GatewayMessage): string {
  const root = message as Record<string, unknown>
  return JSON.stringify({
    model: root.model ?? root.modelName ?? root.model_name ?? null,
    inputTokens:
      root.inputTokens ??
      root.input_tokens ??
      root.promptTokens ??
      root.prompt_tokens ??
      null,
    outputTokens:
      root.outputTokens ??
      root.output_tokens ??
      root.completionTokens ??
      root.completion_tokens ??
      null,
    cacheRead:
      root.cacheRead ??
      root.cache_read ??
      root.cacheReadTokens ??
      root.cache_read_tokens ??
      null,
    contextPercent: root.contextPercent ?? root.context_percent ?? root.context ?? null,
    usage:
      root.usage && typeof root.usage === 'object'
        ? root.usage
        : null,
  })
}

function getMessageUsageMetadata(message: GatewayMessage): {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  contextPercent: number | null
  modelLabel: string | null
} {
  const root = message as Record<string, unknown>
  const usage =
    root.usage && typeof root.usage === 'object'
      ? (root.usage as Record<string, unknown>)
      : null

  // Gateway may store step/cost data in message.details (from chat.history)
  const details =
    root.details && typeof root.details === 'object'
      ? (root.details as Record<string, unknown>)
      : null

  const inputTokens = readNumber(
    root.inputTokens ??
      root.input_tokens ??
      root.promptTokens ??
      root.prompt_tokens ??
      usage?.inputTokens ??
      usage?.input_tokens ??
      usage?.input ??
      usage?.promptTokens ??
      usage?.prompt_tokens ??
      usage?.prompt ??
      details?.inputTokens ??
      details?.input_tokens ??
      details?.tokens_in,
  )
  const outputTokens = readNumber(
    root.outputTokens ??
      root.output_tokens ??
      root.completionTokens ??
      root.completion_tokens ??
      usage?.outputTokens ??
      usage?.output_tokens ??
      usage?.output ??
      usage?.completionTokens ??
      usage?.completion_tokens ??
      usage?.completion ??
      details?.outputTokens ??
      details?.output_tokens ??
      details?.tokens_out,
  )
  const cacheReadTokens = readNumber(
    root.cacheRead ??
      root.cache_read ??
      root.cacheReadTokens ??
      root.cache_read_tokens ??
      usage?.cacheRead ??
      usage?.cache_read ??
      usage?.cacheReadTokens ??
      usage?.cache_read_tokens ??
      details?.cacheRead ??
      details?.cache_read ??
      details?.cache_read_input_tokens,
  )
  const cacheWriteTokens = readNumber(
    root.cacheWrite ??
      root.cache_write ??
      root.cacheWriteTokens ??
      root.cache_write_tokens ??
      root.cache_creation_input_tokens ??
      usage?.cacheWrite ??
      usage?.cache_write ??
      usage?.cacheWriteTokens ??
      usage?.cache_write_tokens ??
      usage?.cache_creation_input_tokens ??
      details?.cacheWrite ??
      details?.cache_write ??
      details?.cache_creation_input_tokens,
  )
  const contextPercent = readPercent(
    root.contextPercent ??
      root.context_percent ??
      root.context ??
      usage?.contextPercent ??
      usage?.context_percent ??
      usage?.context,
  )
  const rawModel =
    root.model ??
    root.modelName ??
    root.model_name ??
    usage?.model ??
    usage?.modelName ??
    usage?.model_name ??
    details?.model ??
    details?.modelName
  const modelLabel =
    typeof rawModel === 'string' && rawModel.trim()
      ? shortenModelName(rawModel.trim())
      : null

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    contextPercent,
    modelLabel,
  }
}

function parseToolNameFromMessageText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'tool'
  const match = trimmed.match(/^([a-zA-Z0-9_:-]+)\s*\(/)
  return match?.[1]?.trim() || trimmed.split(/\s+/)[0] || 'tool'
}

function readToolArgs(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object') return undefined
  const candidates = [
    details.args,
    details.arguments,
    details.input,
    details.parameters,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  return undefined
}

/** Extract the most useful single argument to display in a tool pill */
function keyArgLabel(name: string, args?: Record<string, unknown>): string | null {
  if (!args) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  switch (name) {
    case 'exec':
      return str(args.command)
    case 'Read':
    case 'read':
      return str(args.file_path) ?? str(args.path)
    case 'Write':
    case 'write':
    case 'Edit':
    case 'edit':
      return str(args.file_path) ?? str(args.path) ?? str(args.old_string ? args.file_path : null)
    case 'web_search':
      return str(args.query)
    case 'memory_search':
      return str(args.query)
    case 'memory_get':
      return str(args.path)
    case 'browser':
      return str(args.url) ?? str(args.action)
    case 'image':
      return str(args.prompt)
    default: {
      // generic: first string value
      const first = Object.values(args).find((v) => typeof v === 'string' && (v as string).trim())
      return str(first)
    }
  }
}

function ToolCallPill({ toolCall }: { toolCall: StreamToolCall }) {
  const icons: Record<string, string> = {
    web_search: '🔍',
    Read: '📖',
    exec: '⚡',
    memory_search: '🧠',
    memory_get: '🧠',
    Write: '✏️',
    Edit: '✏️',
    browser: '🌐',
    image: '🖼️',
  }

  const icon = icons[toolCall.name] ?? '🔧'
  const isDone = toolCall.phase === 'done'
  const isError = toolCall.phase === 'error'
  const label = keyArgLabel(toolCall.name, toolCall.args as Record<string, unknown> | undefined)
  const displayName = formatToolDisplayLabel(
    toolCall.name,
    toolCall.args as Record<string, unknown> | undefined,
  )
  // Truncate long paths/commands to keep pill readable
  const truncated = label && label.length > 60 ? `${label.slice(0, 57)}…` : label

  const pill = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium font-mono max-w-full',
        isDone
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
          : isError
            ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400'
            : 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="shrink-0 not-italic">{displayName}</span>
      {truncated && truncated !== displayName && (
        <span className="opacity-60 truncate">{truncated}</span>
      )}
      {isDone && <span className="shrink-0 opacity-70">✓</span>}
      {isError && <span className="shrink-0 opacity-70">✗</span>}
    </span>
  )

  if (isDone && toolCall.result) {
    return (
      <details className="inline-block max-w-full">
        <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
          {pill}
        </summary>
        <pre className="mt-1 max-h-40 overflow-y-auto rounded-md bg-neutral-900 px-2 py-1.5 text-xs font-mono text-neutral-200 whitespace-pre-wrap break-words">
          {toolCall.result}
        </pre>
      </details>
    )
  }

  return pill
}

function attachmentSource(attachment: GatewayAttachment | undefined): string {
  if (!attachment) return ''
  const candidates = [attachment.previewUrl, attachment.dataUrl, attachment.url]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }
  return ''
}

function attachmentExtension(attachment: GatewayAttachment): string {
  const name = typeof attachment.name === 'string' ? attachment.name : ''
  const fromName = name.split('.').pop()?.trim().toLowerCase() || ''
  if (fromName) return fromName

  const source = attachmentSource(attachment)
  const fileName = source.split('?')[0]?.split('#')[0]?.split('/').pop() || ''
  return fileName.split('.').pop()?.trim().toLowerCase() || ''
}

function isImageAttachment(attachment: GatewayAttachment): boolean {
  const contentType =
    typeof attachment.contentType === 'string'
      ? attachment.contentType.trim().toLowerCase()
      : ''
  if (contentType.startsWith('image/')) return true

  const ext = attachmentExtension(attachment)
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)
}

function InlineToolSectionItem({
  toolSection,
  index,
  forceOpen,
}: {
  toolSection: InlineToolSection
  index: number
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  return renderInlineToolSection(toolSection, index, open, setOpen)
}

function renderInlineToolSection(
  toolSection: InlineToolSection,
  index: number,
  toolCallsOpen: boolean,
  setToolCallsOpen: (open: boolean) => void,
) {
  const icons: Record<string, string> = {
    exec: '⚡',
    Read: '📖',
    read: '📖',
    Write: '✏️',
    write: '✏️',
    Edit: '✏️',
    edit: '✏️',
    web_search: '🔍',
    memory_search: '🧠',
    memory_get: '🧠',
    browser: '🌐',
    image: '🖼️',
  }
  const icon = icons[toolSection.type] ?? '🔧'
  const isError = toolSection.state === 'output-error'
  const headerArg = toolSection.input
    ? keyArgLabel(toolSection.type, toolSection.input)
    : null
  const toolDisplayLabel = formatToolDisplayLabel(
    toolSection.type,
    toolSection.input,
  )
  const headerArgTruncated =
    headerArg && headerArg.length > 80
      ? `${headerArg.slice(0, 77)}…`
      : headerArg

  return (
    <Collapsible
      key={toolSection.key || `${toolSection.type}-${index}`}
      open={toolCallsOpen}
      onOpenChange={setToolCallsOpen}
    >
      <CollapsibleTrigger className={cn(
        'w-full justify-start gap-1.5 rounded-md bg-transparent px-2 py-1.5 text-[11px] font-mono',
        'hover:bg-primary-50 dark:hover:bg-primary-800/60',
        'data-panel-open:bg-primary-50/60 dark:data-panel-open:bg-primary-800/40',
        isError
          ? 'text-red-500 dark:text-red-400'
          : 'text-neutral-500 dark:text-neutral-400',
      )}>
        <span className="shrink-0 transition-transform duration-150 group-data-panel-open:rotate-90">▶</span>
        <span className="shrink-0">{icon} {toolDisplayLabel}</span>
        {headerArgTruncated && headerArgTruncated !== toolDisplayLabel ? (
          <span className="truncate opacity-50">{headerArgTruncated}</span>
        ) : null}
        {isError ? <span className="ml-auto shrink-0 text-red-400">✗ error</span> : null}
        {!isError && toolSection.state === 'output-available' ? (
          <span className="ml-auto shrink-0 opacity-40">✓</span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="mt-0.5 ml-2 flex flex-col gap-1.5 pb-1">
          {toolSection.type === 'exec' && headerArg ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-neutral-800 px-2 py-1 text-[11px] font-mono text-amber-300 dark:bg-neutral-950">
              $ {headerArg}
            </pre>
          ) : null}
          {isError && toolSection.errorText ? (
            <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap break-words rounded bg-red-950/40 p-2 text-xs font-mono text-red-300">
              {toolSection.errorText}
            </pre>
          ) : toolSection.outputText ? (
            <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 text-xs font-mono text-neutral-200 dark:bg-neutral-950">
              {toolSection.outputText}
            </pre>
          ) : toolSection.state === 'input-available' ? (
            <span className="text-xs italic text-neutral-400">running…</span>
          ) : (
            <span className="text-xs italic text-neutral-400">no output</span>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  )
}

function MessageItemComponent({
  message,
  attachedToolMessages = [],
  toolResultsByCallId,
  toolCalls: streamToolCalls = [],
  onRetryMessage,
  forceActionsVisible = false,
  wrapperRef,
  wrapperClassName,
  wrapperDataMessageId,
  wrapperScrollMarginTop,
  bubbleClassName,
  isStreaming = false,
  streamingText,
  streamingThinking,
  simulateStreaming: _simulateStreaming = false,
  streamingKey: _streamingKey,
  expandAllToolSections = false,
  isLastAssistant = false,
}: MessageItemProps) {
  const role = message.role || 'assistant'
  const profileDisplayName = useChatSettingsStore(selectChatProfileDisplayName)
  const profileAvatarDataUrl = useChatSettingsStore(
    selectChatProfileAvatarDataUrl,
  )

  const messageStreamingText =
    typeof message.__streamingText === 'string'
      ? message.__streamingText
      : undefined
  const messageStreamingThinking =
    typeof message.__streamingThinking === 'string'
      ? message.__streamingThinking
      : undefined
  const remoteStreamingText =
    streamingText !== undefined ? streamingText : messageStreamingText
  const remoteStreamingThinking =
    streamingThinking !== undefined
      ? streamingThinking
      : messageStreamingThinking
  // Only treat as streaming if explicitly passed isStreaming prop (active stream)
  // Ignore stale __streamingStatus from history
  const remoteStreamingActive = isStreaming === true

  const fullText = useMemo(() => textFromMessage(message), [message])
  const initialDisplayText = remoteStreamingActive
    ? (remoteStreamingText ?? fullText)
    : fullText
  const [displayText, setDisplayText] = useState(() => initialDisplayText)
  const [revealedWordCount, setRevealedWordCount] = useState(() =>
    remoteStreamingActive || _simulateStreaming
      ? 0
      : countWords(initialDisplayText),
  )
  const [revealedText, setRevealedText] = useState(() =>
    remoteStreamingActive || _simulateStreaming ? '' : initialDisplayText,
  )
  const revealTimerRef = useRef<number | null>(null)
  const targetWordCountRef = useRef(countWords(initialDisplayText))
  const previousTextRef = useRef(initialDisplayText)
  const previousTextLengthRef = useRef(initialDisplayText.length)

  // Track if this is a newly appeared message (for fade-in animation)
  const isNewRef = useRef(true)
  const [isNew, setIsNew] = useState(true)
  useEffect(() => {
    if (!isNewRef.current) return
    isNewRef.current = false
    const timer = window.setTimeout(() => setIsNew(false), 600)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (remoteStreamingActive) {
      setDisplayText(remoteStreamingText ?? fullText)
      return
    }

    setDisplayText((current) => (current === fullText ? current : fullText))
  }, [remoteStreamingActive, remoteStreamingText, fullText])

  // Reset word count when simulate streaming starts for a new message
  useEffect(() => {
    if (_simulateStreaming && !remoteStreamingActive) {
      setRevealedWordCount(0)
    }
  }, [_streamingKey, _simulateStreaming, remoteStreamingActive])

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearInterval(revealTimerRef.current)
      }
    }
  }, [])

  // Simulate streaming is only active while words are still being revealed
  const totalWords = countWords(displayText)
  const revealComplete = revealedWordCount >= totalWords && totalWords > 0
  const effectiveIsStreaming =
    remoteStreamingActive || (_simulateStreaming && !revealComplete)
  const assistantDisplayText = effectiveIsStreaming ? revealedText : displayText

  useEffect(() => {
    const totalWords = countWords(displayText)
    const previousText = previousTextRef.current
    const previousLength = previousTextLengthRef.current
    const textGrew =
      displayText.length > previousLength &&
      displayText.startsWith(previousText)
    const textChanged = displayText !== previousText

    targetWordCountRef.current = totalWords
    previousTextRef.current = displayText
    previousTextLengthRef.current = displayText.length

    if (!effectiveIsStreaming) {
      if (revealTimerRef.current !== null) {
        window.clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
      }
      setRevealedWordCount(totalWords)
      return
    }

    if (textChanged && !textGrew) {
      setRevealedWordCount(totalWords)
      return
    }

    if (revealTimerRef.current !== null) {
      return
    }

    // Don't start animation if already fully revealed
    setRevealedWordCount((currentWordCount) => {
      if (currentWordCount >= totalWords) {
        return currentWordCount
      }

      function tick() {
        setRevealedWordCount((currentWordCount) => {
          const targetWordCount = targetWordCountRef.current
          if (currentWordCount >= targetWordCount) {
            if (revealTimerRef.current !== null) {
              window.clearInterval(revealTimerRef.current)
              revealTimerRef.current = null
            }
            return currentWordCount
          }

          const nextWordCount = Math.min(
            targetWordCount,
            currentWordCount + WORDS_PER_TICK,
          )

          if (
            nextWordCount >= targetWordCount &&
            revealTimerRef.current !== null
          ) {
            window.clearInterval(revealTimerRef.current)
            revealTimerRef.current = null
          }

          return nextWordCount
        })
      }

      revealTimerRef.current = window.setInterval(tick, TICK_INTERVAL_MS)
      return currentWordCount
    })
  }, [displayText, effectiveIsStreaming])

  useEffect(() => {
    if (!effectiveIsStreaming) {
      setRevealedText((currentText) =>
        currentText === displayText ? currentText : displayText,
      )
      return
    }

    const boundaryIndex = getWordBoundaryIndex(displayText, revealedWordCount)
    const nextRevealedText = displayText.slice(0, boundaryIndex)
    setRevealedText((currentText) =>
      currentText === nextRevealedText ? currentText : nextRevealedText,
    )
  }, [displayText, effectiveIsStreaming, revealedWordCount])

  const thinking =
    remoteStreamingActive && remoteStreamingThinking !== undefined
      ? remoteStreamingThinking
      : thinkingFromMessage(message)
  const isUser = role === 'user'
  const execNotification = isUser ? readExecNotification(message) : null
  const timestamp = getMessageTimestamp(message)
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.filter(
        (attachment) => attachmentSource(attachment).length > 0,
      )
    : []
  const hasAttachments = attachments.length > 0

  // Extract inline images from content array (gateway sends images as content blocks)
  const inlineImages = useMemo(() => {
    const parts = Array.isArray(message.content) ? message.content : []
    return parts
      .filter((p: any) => p.type === 'image' && p.source)
      .map((p: any, i: number) => {
        const src =
          p.source?.type === 'base64' && p.source?.data
            ? `data:${p.source.media_type || 'image/jpeg'};base64,${p.source.data}`
            : p.source?.url || p.url || ''
        return { id: `inline-img-${i}`, src }
      })
      .filter((img) => img.src.length > 0)
  }, [message.content])
  const hasInlineImages = inlineImages.length > 0

  const hasText = displayText.length > 0
  const hasRevealedText = effectiveIsStreaming ? assistantDisplayText.length > 0 : hasText
  const canRetryMessage = isUser && (hasText || hasAttachments || hasInlineImages)

  // Get tool calls from this message (for assistant messages)
  const toolCalls = role === 'assistant' ? getToolCallsFromMessage(message) : []
  const embeddedStreamToolCalls = useMemo(() => {
    const value = (message as any).__streamToolCalls
    if (!Array.isArray(value)) return []
    return value
      .map((entry: any) => ({
        id: typeof entry?.id === 'string' ? entry.id : '',
        name: typeof entry?.name === 'string' ? entry.name : 'tool',
        phase: normalizeStreamToolPhase(entry?.phase),
        args: entry?.args,
        result: typeof entry?.result === 'string' ? entry.result : undefined,
      }))
      .filter((entry: any) => entry.id.length > 0)
  }, [message])
  const effectiveStreamToolCalls =
    streamToolCalls.length > 0 ? streamToolCalls : embeddedStreamToolCalls
  const hasStreamToolCalls = effectiveStreamToolCalls.length > 0
  const activeStreamToolLabels = useMemo(() => {
    const labels: string[] = []
    const seen = new Set<string>()

    for (const toolCall of effectiveStreamToolCalls) {
      if (toolCall.phase !== 'calling' && toolCall.phase !== 'running') continue
      const label = formatToolDisplayLabel(
        toolCall.name,
        toolCall.args as Record<string, unknown> | undefined,
      )
      if (!label || seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }

    return labels
  }, [effectiveStreamToolCalls])
  const thinkingStatusLabel =
    activeStreamToolLabels.length > 0
      ? `⚡ Running ${activeStreamToolLabels.join(', ')}...`
      : '💭 Thinking...'
  const [thinkingElapsedSeconds, setThinkingElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!thinking || hasText) {
      setThinkingElapsedSeconds(0)
      return
    }

    const startedAt = rawTimestamp(message) ?? Date.now()
    const tick = () => {
      const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - startedAt) / 1000),
      )
      setThinkingElapsedSeconds(elapsedSeconds)
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [hasText, message, thinking, thinkingStatusLabel])
  const toolParts = useMemo(() => {
    return toolCalls.map((toolCall) => {
      const resultMessage = toolCall.id
        ? toolResultsByCallId?.get(toolCall.id)
        : undefined
      return mapToolCallToToolPart(toolCall, resultMessage)
    })
  }, [toolCalls, toolResultsByCallId])
  const attachedToolSections = useMemo<Array<InlineToolSection>>(
    () =>
      attachedToolMessages.map((toolMessage, index) => {
        const messageText = textFromMessage(toolMessage)
        const outputText = extractToolResultText(toolMessage) || messageText
        const errorText = toolMessage.isError ? outputText || 'Unknown error' : undefined
        const toolType =
          (typeof toolMessage.toolName === 'string' && toolMessage.toolName.trim()) ||
          parseToolNameFromMessageText(messageText)
        return {
          key:
            (typeof (toolMessage as any).id === 'string' && (toolMessage as any).id) ||
            (typeof toolMessage.toolCallId === 'string' && toolMessage.toolCallId) ||
            `${toolType}-${index}`,
          type: toolType,
          input: readToolArgs(toolMessage.details),
          outputText,
          errorText,
          state: toolMessage.isError ? 'output-error' : 'output-available',
        }
      }),
    [attachedToolMessages],
  )
  const inlineToolSections = useMemo<Array<InlineToolSection>>(
    () => [
      ...toolParts.map((toolPart, index) => {
        const rawOutput = toolPart.output
        let outputText = ''
        if (rawOutput) {
          if (typeof rawOutput.output === 'string') {
            outputText = rawOutput.output
          } else {
            outputText = JSON.stringify(rawOutput, null, 2)
          }
        }

        return {
          key: toolPart.toolCallId || `${toolPart.type}-${index}`,
          type: toolPart.type,
          input: toolPart.input as Record<string, unknown> | undefined,
          outputText,
          errorText: toolPart.errorText,
          state: toolPart.state,
        }
      }),
      ...attachedToolSections,
    ],
    [attachedToolSections, toolParts],
  )
  const hasToolCalls = inlineToolSections.length > 0

  // 'queued' = delivered to gateway, waiting for response (busy/backlogged)
  // 'sending' = still in flight to the gateway API (should clear in <1s)
  // 'error'   = gateway rejected or network failed → show retry
  const isQueued = message.status === 'queued'
  const isFailed = message.status === 'error'
  const usageMetadata = useMemo(
    () => getMessageUsageMetadata(message),
    [message],
  )
  const hasAssistantMetadata =
    !isUser &&
    !effectiveIsStreaming &&
    isLastAssistant &&
    (usageMetadata.inputTokens !== null ||
      usageMetadata.outputTokens !== null ||
      usageMetadata.cacheReadTokens !== null ||
      usageMetadata.contextPercent !== null ||
      usageMetadata.modelLabel !== null)

  // Only show retry for messages genuinely stuck in 'sending' (API call hasn't
  // returned yet after 30s). 'queued' messages are delivered — never show retry.
  const [isStuckSending, setIsStuckSending] = useState(false)
  useEffect(() => {
    if (!isUser || message.status !== 'sending') {
      setIsStuckSending(false)
      return
    }
    const ts = rawTimestamp(message)
    const elapsed = ts ? Date.now() - ts : 0
    const remaining = Math.max(0, STUCK_SENDING_THRESHOLD_MS - elapsed)
    // Already past 30s threshold
    if (remaining === 0) {
      setIsStuckSending(true)
      return
    }
    const timer = window.setTimeout(() => setIsStuckSending(true), remaining)
    return () => window.clearTimeout(timer)
  }, [isUser, message, message.status])

  if (execNotification) {
    const isSuccess =
      execNotification.ok ?? (execNotification.exitCode === 0)
    const statusIcon = isSuccess ? '✓' : '✗'
    const exitLabel = `exit ${execNotification.exitCode ?? '—'}`
    return (
      <div
        ref={wrapperRef}
        data-chat-message-role={role}
        data-chat-message-id={wrapperDataMessageId}
        style={
          typeof wrapperScrollMarginTop === 'number'
            ? { scrollMarginTop: `${wrapperScrollMarginTop}px` }
            : undefined
        }
        className={cn(
          'flex items-center justify-center gap-2 py-1 text-xs text-primary-300',
          wrapperClassName,
        )}
      >
        <span className="font-semibold">{statusIcon}</span>
        <span className="font-medium">{execNotification.name}</span>
        <span className="text-primary-400">{exitLabel}</span>
      </div>
    )
  }

  // System message — minimal styled row, no bubble/avatar
  if (role === 'system') {
    return (
      <div
        ref={wrapperRef}
        data-chat-message-role={role}
        data-chat-message-id={wrapperDataMessageId}
        style={
          typeof wrapperScrollMarginTop === 'number'
            ? { scrollMarginTop: `${wrapperScrollMarginTop}px` }
            : undefined
        }
        className={cn(
          'text-xs text-neutral-500 italic text-center py-1',
          wrapperClassName,
        )}
      >
        {fullText}
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      data-chat-message-role={role}
      data-chat-message-id={wrapperDataMessageId}
      style={
        typeof wrapperScrollMarginTop === 'number'
          ? { scrollMarginTop: `${wrapperScrollMarginTop}px` }
          : undefined
      }
      className={cn(
        'group relative flex flex-col',
        hasText || hasAttachments ? 'gap-0.5 md:gap-1' : 'gap-0',
        wrapperClassName,
        isUser ? 'items-end' : 'items-start',
        !isUser && isNew && 'animate-[message-fade-in_0.4s_ease-out]',
      )}
    >

      {/* Bridge gap: thinking done but first text token not yet arrived */}
      {effectiveIsStreaming && !thinking && !hasText && (
        <div className="flex items-center gap-1.5 px-1 py-1">
          <span className="size-1.5 animate-bounce rounded-full bg-primary-400 [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-primary-400 [animation-delay:150ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-primary-400 [animation-delay:300ms]" />
        </div>
      )}

      {thinking && !hasText && (
        <div className="w-full max-w-[900px]">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-fit">
              <HugeiconsIcon
                icon={Idea01Icon}
                size={20}
                strokeWidth={1.5}
                className="opacity-70"
              />
              <span>{thinkingStatusLabel}</span>
              {thinkingElapsedSeconds > 0 ? (
                <span className="text-xs tabular-nums text-primary-400">
                  {thinkingElapsedSeconds >= 60
                    ? `${Math.floor(thinkingElapsedSeconds / 60)}m ${thinkingElapsedSeconds % 60}s`
                    : `${thinkingElapsedSeconds}s`}
                </span>
              ) : null}
              {effectiveIsStreaming ? (
                <span className="flex items-center gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-primary-400 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-primary-400 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-primary-400 [animation-delay:300ms]" />
                </span>
              ) : null}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={20}
                strokeWidth={1.5}
                className="opacity-60 transition-transform duration-150 group-data-panel-open:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="rounded-md border border-primary-200 bg-primary-50 p-3">
                <p className="text-sm text-primary-700 whitespace-pre-wrap text-pretty">
                  {thinking}
                </p>
              </div>
            </CollapsiblePanel>
          </Collapsible>
        </div>
      )}
      {/* Narration messages (tool-call activity) — compact collapsible row */}
      {!isUser && (message as any).__isNarration && hasText && (
        <div className="w-full max-w-[900px]">
          <details className="group/narration rounded-lg border border-primary-200/50 bg-primary-50/30 hover:bg-primary-50 dark:hover:bg-primary-800/50 transition-colors">
            <summary className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 list-none [&::-webkit-details-marker]:hidden">
              <span className="size-6 flex items-center justify-center rounded-full bg-accent-500/15 shrink-0">
                <span className="text-xs">⚡</span>
              </span>
              <span className="text-xs font-medium truncate flex-1 text-primary-700">
                {displayText.slice(0, 120)}
                {displayText.length > 120 ? '...' : ''}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={16}
                strokeWidth={1.5}
                className="text-primary-400 shrink-0 transition-transform group-open/narration:rotate-180"
              />
            </summary>
            <div className="px-3 pb-3 pt-1 text-[13px] text-primary-600 whitespace-pre-wrap text-pretty max-h-[400px] overflow-y-auto">
              {displayText}
            </div>
          </details>
        </div>
      )}
      {(hasText || hasAttachments || hasInlineImages || effectiveIsStreaming) &&
        !(message as any).__isNarration && (
          <Message className={cn('gap-2 md:gap-3', isUser ? 'flex-row-reverse' : '')}>
            {isUser ? (
              <UserAvatar
                size={24}
                className="mt-0.5"
                src={profileAvatarDataUrl}
                alt={profileDisplayName}
              />
            ) : (
              <AssistantAvatar size={24} className="mt-0.5" />
            )}
            <div
              data-chat-message-bubble={isUser ? 'true' : undefined}
              className={cn(
                'break-words whitespace-normal min-w-0 flex flex-col gap-2 px-3 py-2 max-w-[80%]',
                '',
                !isUser
                  ? 'bg-primary-50 border border-primary-200 rounded-2xl rounded-tl-sm text-primary-900'
                  : 'bg-accent-500 text-white rounded-2xl rounded-tr-sm',
                isQueued && isUser && !isFailed && 'opacity-70',
                isFailed && isUser && 'bg-red-50/50 border border-red-300',
                bubbleClassName,
              )}
            >
              {hasAttachments && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => {
                    const source = attachmentSource(attachment)
                    const ext = attachmentExtension(attachment)
                    const imageAttachment = isImageAttachment(attachment)

                    if (imageAttachment) {
                      return (
                        <a
                          key={attachment.id}
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border border-primary-200 hover:border-primary-400 transition-colors max-w-full"
                        >
                          <img
                            src={source}
                            alt={attachment.name || 'Attached image'}
                            className="max-h-64 w-auto max-w-full object-contain"
                            loading="lazy"
                          />
                        </a>
                      )
                    }

                    return (
                      <a
                        key={attachment.id}
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:border-primary-400"
                      >
                        <span>📄</span>
                        <span className="truncate">{attachment.name || 'Attachment'}</span>
                        <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] uppercase text-primary-600">
                          {ext || 'file'}
                        </span>
                      </a>
                    )
                  })}
                </div>
              )}
              {hasInlineImages && (
                <div className="flex flex-wrap gap-2">
                  {inlineImages.map((img) => (
                    <a
                      key={img.id}
                      href={img.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-primary-200 hover:border-primary-400 transition-colors max-w-full"
                    >
                      <img
                        src={img.src}
                        alt="Shared image"
                        className="max-h-64 w-auto max-w-full object-contain"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
              {hasText &&
                (isUser ? (
                  <span className="text-pretty">
                    {displayText}
                  </span>
                ) : hasRevealedText ? (
                  <div className="relative">
                    <MessageContent
                      markdown
                      className={cn(
                        'text-primary-900 bg-transparent w-full text-pretty transition-all duration-100',
                        effectiveIsStreaming && 'chat-streaming-content',
                        isUser && 'text-white',
                      )}
                    >
                      {assistantDisplayText}
                    </MessageContent>
                    {effectiveIsStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500 align-text-bottom" />
                    )}
                  </div>
                ) : null)}
              {!isUser && hasStreamToolCalls ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {effectiveStreamToolCalls.map((toolCall) => (
                    <ToolCallPill key={toolCall.id} toolCall={toolCall} />
                  ))}
                </div>
              ) : effectiveIsStreaming && !hasRevealedText ? (
                <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
                  <span className="animate-pulse">⚡</span>
                  <span>Working...</span>
                </div>
              ) : null}
              {/* Sent indicator — message delivered, waiting for response */}
              {isUser && isQueued && (
                <span className="text-[10px] text-white/60 self-end">Sent</span>
              )}

              {effectiveIsStreaming && !hasRevealedText && (
                <div className="flex items-center gap-1 px-1 py-0.5">
                  <span className="size-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:0ms]" />
                  <span className="size-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:150ms]" />
                  <span className="size-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
          </Message>
        )}
        {hasAssistantMetadata ? (
          <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 pl-10 pr-1 mt-0.5 font-mono text-[10px] tabular-nums text-primary-400 leading-relaxed">
            {usageMetadata.inputTokens !== null && (
              <span>↑{formatCompactNumber(usageMetadata.inputTokens)}</span>
            )}
            {usageMetadata.outputTokens !== null && (
              <span>↓{formatCompactNumber(usageMetadata.outputTokens)}</span>
            )}
            {usageMetadata.cacheReadTokens !== null && (
              <span>R{formatCompactNumber(usageMetadata.cacheReadTokens)}</span>
            )}
            {usageMetadata.cacheWriteTokens !== null && (
              <span>W{formatCompactNumber(usageMetadata.cacheWriteTokens)}</span>
            )}
            {usageMetadata.modelLabel && (
              <span className="opacity-60">{usageMetadata.modelLabel}</span>
            )}
          </div>
        ) : null}

      {/* Render tool calls — one collapsible card per tool with independent open state */}
      {hasToolCalls && (
        <div className="w-full max-w-[900px] mt-1 flex flex-col gap-1">
          {inlineToolSections.map((toolSection, index) => (
            <InlineToolSectionItem
              key={toolSection.key || `${toolSection.type}-${index}`}
              toolSection={toolSection}
              index={index}
              forceOpen={expandAllToolSections}
            />
          ))}
        </div>
      )}

      {(!hasToolCalls || hasText) && (
        <MessageActionsBar
          text={fullText}
          timestamp={timestamp}
          align={isUser ? 'end' : 'start'}
          forceVisible={forceActionsVisible}
          isQueued={isUser && isQueued && !isFailed}
          isFailed={isUser && (isFailed || isStuckSending)}
          onRetry={
            // Only show Retry for actual failures — never for queued (delivered, just waiting)
            canRetryMessage && (isFailed || isStuckSending) && onRetryMessage
              ? () => onRetryMessage(message)
              : undefined
          }
        />
      )}
    </div>
  )
}

function areMessagesEqual(
  prevProps: MessageItemProps,
  nextProps: MessageItemProps,
): boolean {
  if (prevProps.forceActionsVisible !== nextProps.forceActionsVisible) {
    return false
  }
  if (prevProps.wrapperClassName !== nextProps.wrapperClassName) return false
  if (prevProps.onRetryMessage !== nextProps.onRetryMessage) return false
  if (prevProps.toolCalls !== nextProps.toolCalls) return false
  if (prevProps.wrapperDataMessageId !== nextProps.wrapperDataMessageId) {
    return false
  }
  if (prevProps.wrapperRef !== nextProps.wrapperRef) return false
  if (prevProps.wrapperScrollMarginTop !== nextProps.wrapperScrollMarginTop) {
    return false
  }
  if (prevProps.bubbleClassName !== nextProps.bubbleClassName) return false
  // Check streaming state
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false
  }
  if (prevProps.streamingText !== nextProps.streamingText) {
    return false
  }
  if (prevProps.streamingThinking !== nextProps.streamingThinking) {
    return false
  }
  if (prevProps.simulateStreaming !== nextProps.simulateStreaming) {
    return false
  }
  if (prevProps.streamingKey !== nextProps.streamingKey) {
    return false
  }
  if (prevProps.expandAllToolSections !== nextProps.expandAllToolSections) {
    return false
  }
  if (
    prevProps.message.__streamingStatus !== nextProps.message.__streamingStatus
  ) {
    return false
  }
  if (prevProps.message.__streamingText !== nextProps.message.__streamingText) {
    return false
  }
  if (
    prevProps.message.__streamingThinking !==
    nextProps.message.__streamingThinking
  ) {
    return false
  }
  if (
    (prevProps.message.role || 'assistant') !==
    (nextProps.message.role || 'assistant')
  ) {
    return false
  }
  if (
    textFromMessage(prevProps.message) !== textFromMessage(nextProps.message)
  ) {
    return false
  }
  if (
    thinkingFromMessage(prevProps.message) !==
    thinkingFromMessage(nextProps.message)
  ) {
    return false
  }
  if (
    messageMetadataSignature(prevProps.message) !==
    messageMetadataSignature(nextProps.message)
  ) {
    return false
  }
  if (
    toolCallsSignature(prevProps.message) !==
    toolCallsSignature(nextProps.message)
  ) {
    return false
  }
  if (
    toolResultsSignature(prevProps.message, prevProps.toolResultsByCallId) !==
    toolResultsSignature(nextProps.message, nextProps.toolResultsByCallId)
  ) {
    return false
  }
  if (rawTimestamp(prevProps.message) !== rawTimestamp(nextProps.message)) {
    return false
  }
  // Check attachments
  const prevAttachments = Array.isArray(prevProps.message.attachments)
    ? prevProps.message.attachments
    : []
  const nextAttachments = Array.isArray(nextProps.message.attachments)
    ? nextProps.message.attachments
    : []
  if (prevAttachments.length !== nextAttachments.length) {
    return false
  }
  // Check message status — required so that optimistic "sending" → "queued"
  // transitions re-render the component and clear the isStuckSending timer.
  const prevStatus = (prevProps.message as Record<string, unknown>).status
  const nextStatus = (nextProps.message as Record<string, unknown>).status
  if (prevStatus !== nextStatus) {
    return false
  }
  // No need to check settings here as the hook will cause a re-render
  // and areMessagesEqual is for props only.
  // However, memo components with hooks will re-render if the hook state changes.
  return true
}

const MemoizedMessageItem = memo(MessageItemComponent, areMessagesEqual)

export { MemoizedMessageItem as MessageItem }
