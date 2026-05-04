import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown01Icon, Idea01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  getMessageTimestamp,
  getToolCallsFromMessage,
  textFromMessage,
} from '../utils'
import { MessageActionsBar } from './message-actions-bar'
import type { ChatAttachment, ChatMessage, ToolCallContent } from '../types'
import type { ToolPart } from '@/components/prompt-kit/tool'
import { AssistantAvatar, UserAvatar } from '@/components/avatars'
import { CodeBlock } from '@/components/prompt-kit/code-block'
import { Markdown } from '@/components/prompt-kit/markdown'
import { Message, MessageContent } from '@/components/prompt-kit/message'
import { Button } from '@/components/ui/button'
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
import {
  buildHermesActivitySummary,
  shouldAutoExpandHermesActivityCard,
} from './streaming-activity-ui'
import { TuiActivityCard } from './tui-activity-card'

const WORDS_PER_TICK = 4
const TICK_INTERVAL_MS = 50
const STUCK_SENDING_THRESHOLD_MS = 120_000

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
  phase:
    | 'calling'
    | 'running'
    | 'done'
    | 'complete'
    | 'completed'
    | 'result'
    | 'error'
  args?: unknown
  preview?: string
  result?: string
}

type ExecNotification = {
  name: string
  exitCode: number | null
  ok: boolean | null
}

type LifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

type MessageItemProps = {
  message: ChatMessage
  attachedToolMessages?: Array<ChatMessage>
  toolResultsByCallId?: Map<string, ChatMessage>
  toolCalls?: Array<StreamToolCall>
  lifecycleEvents?: Array<LifecycleEvent>
  onRetryMessage?: (message: ChatMessage) => void
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
  preview?: string
  outputText: string
  errorText?: string
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
}

export type InlineRenderPlanItem =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; section: InlineToolSection }

export type CompactInlineRenderPlanItem =
  | { kind: 'text'; text: string }
  | { kind: 'tools'; sections: Array<InlineToolSection> }

export function buildInlineToolRenderPlan(
  message: ChatMessage,
  toolSections: Array<InlineToolSection>,
): Array<InlineRenderPlanItem> {
  const parts = Array.isArray(message.content) ? message.content : []
  if (parts.length === 0) {
    return toolSections.map((section) => ({ kind: 'tool' as const, section }))
  }

  const toolSectionsById = new Map(
    toolSections.map((section) => [section.key, section] as const),
  )
  const usedKeys = new Set<string>()
  const plan: Array<InlineRenderPlanItem> = []

  for (const part of parts) {
    if (part.type === 'text') {
      const text = typeof part.text === 'string' ? part.text : ''
      if (text.length > 0) {
        plan.push({ kind: 'text', text })
      }
      continue
    }

    if (part.type === 'toolCall') {
      const toolId = typeof part.id === 'string' ? part.id : ''
      const matchingSection = toolId ? toolSectionsById.get(toolId) : undefined
      if (matchingSection) {
        usedKeys.add(matchingSection.key)
        plan.push({ kind: 'tool', section: matchingSection })
      }
    }
  }

  const trailingSections = toolSections.filter(
    (section) => !usedKeys.has(section.key),
  )
  for (const section of trailingSections) {
    plan.push({ kind: 'tool', section })
  }

  return plan
}

export function compactInlineToolRenderPlan(
  plan: Array<InlineRenderPlanItem>,
): Array<CompactInlineRenderPlanItem> {
  const compactPlan: Array<CompactInlineRenderPlanItem> = []
  let pendingToolSections: Array<InlineToolSection> = []

  const flushTools = () => {
    if (pendingToolSections.length === 0) return
    compactPlan.push({ kind: 'tools', sections: pendingToolSections })
    pendingToolSections = []
  }

  for (const item of plan) {
    if (item.kind === 'tool') {
      pendingToolSections.push(item.section)
      continue
    }

    flushTools()
    compactPlan.push(item)
  }

  flushTools()
  return compactPlan
}

function extractToolResultText(msg: ChatMessage | undefined): string {
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
  resultMessage: ChatMessage | undefined,
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

function toolCallsSignature(message: ChatMessage): string {
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

function toolResultSignature(result: ChatMessage | undefined): string {
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
  message: ChatMessage,
  toolResultsByCallId: Map<string, ChatMessage> | undefined,
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

function rawTimestamp(message: ChatMessage): number | null {
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

function thinkingFromMessage(msg: ChatMessage): string | null {
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
  if (phase === 'calling' || phase === 'start' || phase === 'started')
    return 'calling'
  if (phase === 'running') return 'running'
  if (
    phase === 'done' ||
    phase === 'result' ||
    phase === 'complete' ||
    phase === 'completed'
  )
    return 'done'
  if (phase === 'error' || phase === 'failed' || phase === 'failure') {
    return 'error'
  }
  return 'running'
}

export type AssistantCorruptionWarning = {
  kind: 'role-prefix' | 'divider-loop'
  label: string
  detail: string
}

export function detectAssistantCorruptionWarning(
  role: string,
  text: string,
): AssistantCorruptionWarning | null {
  if (role !== 'assistant') return null
  const trimmed = text.trimStart()
  const roleMatch = /^(user|assistant|system)\s*(?:\n|:)/i.exec(trimmed)
  if (roleMatch) {
    return {
      kind: 'role-prefix',
      label: 'Assistant output contains raw transcript role text',
      detail: `Stored role is assistant, but the content begins with "${roleMatch[1]}". Treat this as generated text, not a real ${roleMatch[1]} turn.`,
    }
  }

  if (text.length > 20_000) {
    const dividerMatches =
      text.match(/(?:^|\n)\s*(?:[-_=*]{8,}|[─━]{8,})\s*(?=\n|$)/g) ?? []
    if (dividerMatches.length >= 20) {
      return {
        kind: 'divider-loop',
        label: 'Assistant output looks corrupted',
        detail:
          'This very large assistant message contains repeated divider-like lines and may be a generation loop.',
      }
    }
  }

  return null
}

function readExecNotification(message: ChatMessage): ExecNotification | null {
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

const TOOL_DISPLAY_LABELS: Record<string, string> = {
  browser_click: '🖱 Click Element',
  browser_type: '⌨ Type Text',
  browser_press: '⏎ Press Key',
  browser_scroll: '↕ Scroll',
  browser_back: '← Back',
  browser_get_images: '🖼 Get Images',
  browser_vision: '👁 Vision Capture',
  browser_close: '✕ Close Browser',
  execute_code: '🐍 Execute Code',
  process: '⚙ Process',
  'multi_tool_use.parallel': '⚡ Parallel Tools',
  todo: '☑ Todo',
  cronjob: '⏰ Cron Job',
  delegate_task: '👥 Delegate Task',
  mixture_of_agents: '🧠 Mixture of Agents',
  session_search: '🔍 Search Sessions',
  clarify: '❓ Clarify',
  skill_manage: '📦 Manage Skill',
  vision_analyze: '👁 Analyze Image',
  image_generate: '🎨 Generate Image',
  send_message: '💬 Send Message',
  text_to_speech: '🔊 Text to Speech',
  honcho_profile: '👤 Honcho Profile',
  honcho_search: '🔎 Honcho Search',
  honcho_context: '📋 Honcho Context',
  ha_list_entities: '🏠 HA Entities',
  ha_get_state: '🏠 HA State',
  ha_list_services: '🏠 HA Services',
  web_search: '🌐 Web Search',
  web_extract: '📄 Web Extract',
  browser_navigate: '🌐 Open Page',
  browser_snapshot: '📸 Snapshot',
}

function formatToolDisplayLabel(
  name: string,
  args?: Record<string, unknown>,
): string {
  const normalizedName = name.trim()
  const lowerName = normalizedName.toLowerCase()
  const mappedLabel = TOOL_DISPLAY_LABELS[lowerName]
  if (mappedLabel) return mappedLabel

  if (lowerName === 'read' || lowerName === 'read_file') {
    const filePath = readStringArg(args, 'file_path', 'path', 'target_file')
    return filePath ? `read ${fileNameFromPath(filePath)}` : 'read file'
  }

  if (lowerName === 'edit' || lowerName === 'patch_file') {
    const filePath = readStringArg(args, 'file_path', 'path', 'target_file')
    return filePath ? `edit ${fileNameFromPath(filePath)}` : 'edit file'
  }

  if (
    lowerName === 'write' ||
    lowerName === 'write_file' ||
    lowerName === 'create_file'
  ) {
    const filePath = readStringArg(args, 'file_path', 'path', 'target_file')
    return filePath ? `write ${fileNameFromPath(filePath)}` : 'write file'
  }

  if (lowerName === 'search_files') {
    const pattern = readStringArg(args, 'pattern', 'query', 'regex')
    return pattern ? `search "${pattern}"` : 'search files'
  }

  if (lowerName === 'browser' || lowerName === 'browser_navigate') {
    const action = readStringArg(args, 'action', 'url')
    return action ? `browser ${action}` : 'browser'
  }

  if (lowerName === 'terminal' || lowerName === 'exec') {
    const cmd = readStringArg(args, 'command', 'cmd')
    return cmd
      ? `exec ${cmd.length > 30 ? cmd.slice(0, 27) + '…' : cmd}`
      : 'exec'
  }

  if (lowerName === 'memory_search') return 'memory search'
  if (lowerName === 'save_memory') return 'save memory'
  if (lowerName === 'memory_get') return 'memory get'
  if (lowerName === 'web_fetch') return 'web fetch'
  if (lowerName === 'skill_view') return 'view skill'

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

function messageMetadataSignature(message: ChatMessage): string {
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
    contextPercent:
      root.contextPercent ?? root.context_percent ?? root.context ?? null,
    usage: root.usage && typeof root.usage === 'object' ? root.usage : null,
  })
}

function getMessageUsageMetadata(message: ChatMessage): {
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

  // Server may store step/cost data in message.details (from chat.history)
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
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
    ) {
      return candidate as Record<string, unknown>
    }
  }
  return undefined
}

/** Extract the most useful single argument to display in a tool pill */
function keyArgLabel(
  name: string,
  args?: Record<string, unknown>,
): string | null {
  if (!args) return null
  const str = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : null
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
      return (
        str(args.file_path) ??
        str(args.path) ??
        str(args.old_string ? args.file_path : null)
      )
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
      const first = Object.values(args).find(
        (v) => typeof v === 'string' && v.trim(),
      )
      return str(first)
    }
  }
}

// --- Anime-style Tool Call Card ---

const TOOL_EMOJI_ICONS: Record<string, string> = {
  web_search: '🔍',
  search: '🔍',
  search_files: '🔍',
  session_search: '🔍',
  terminal: '💻',
  exec: '💻',
  shell: '💻',
  bash: '💻',
  Read: '📖',
  read: '📖',
  read_file: '📖',
  file_read: '📖',
  Write: '✏️',
  write: '✏️',
  write_file: '✏️',
  file_write: '✏️',
  Edit: '✏️',
  edit: '✏️',
  memory: '🧠',
  memory_search: '🧠',
  memory_get: '🧠',
  save_memory: '🧠',
  browser: '🌐',
  browser_navigate: '🌐',
  navigate: '🌐',
  image: '🖼️',
  vision: '🖼️',
  skill: '📦',
  skill_view: '📦',
  skill_load: '📦',
  delegate: '🤖',
  spawn: '🤖',
  tts: '🗣️',
  speak: '🗣️',
}

const TOOL_VERBS: Record<string, string> = {
  web_search: 'Searching',
  search: 'Searching',
  search_files: 'Searching',
  terminal: 'Executing',
  exec: 'Executing',
  shell: 'Executing',
  bash: 'Executing',
  Read: 'Reading',
  read: 'Reading',
  read_file: 'Reading',
  file_read: 'Reading',
  Write: 'Writing',
  write: 'Writing',
  write_file: 'Writing',
  file_write: 'Writing',
  Edit: 'Writing',
  edit: 'Writing',
  memory: 'Remembering',
  memory_search: 'Remembering',
  memory_get: 'Remembering',
  save_memory: 'Remembering',
  browser: 'Browsing',
  browser_navigate: 'Browsing',
  navigate: 'Browsing',
  image: 'Analyzing',
  vision: 'Analyzing',
  delegate: 'Delegating',
  spawn: 'Delegating',
  tts: 'Speaking',
  speak: 'Speaking',
}

function useElapsedTime(active: boolean): string {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!active) return
    startRef.current = Date.now()
    setElapsed(0)
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(secs)
    }, 1000)
    return () => clearInterval(interval)
  }, [active])

  if (!active && elapsed === 0) return ''
  if (elapsed < 60) return `${elapsed}s`
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return `${m}m ${s}s`
}

function useAnimatedDots(): string {
  const [dots, setDots] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setDots((d) => (d + 1) % 4), 500)
    return () => clearInterval(interval)
  }, [])
  return '.'.repeat(dots)
}

function ToolCallPill({ toolCall }: { toolCall: StreamToolCall }) {
  const isDone =
    toolCall.phase === 'done' ||
    toolCall.phase === 'complete' ||
    toolCall.phase === 'completed' ||
    toolCall.phase === 'result'
  const isError = toolCall.phase === 'error'
  const isRunning = !isDone && !isError
  const [expanded, setExpanded] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const emoji =
    TOOL_EMOJI_ICONS[toolCall.name] ??
    (toolCall.name.includes('search')
      ? '🔍'
      : toolCall.name.includes('read') || toolCall.name.includes('Read')
        ? '📖'
        : toolCall.name.includes('write') ||
            toolCall.name.includes('Write') ||
            toolCall.name.includes('edit') ||
            toolCall.name.includes('Edit')
          ? '✏️'
          : toolCall.name.includes('exec') ||
              toolCall.name.includes('terminal') ||
              toolCall.name.includes('shell')
            ? '💻'
            : toolCall.name.includes('memory')
              ? '🧠'
              : toolCall.name.includes('browser') ||
                  toolCall.name.includes('navigate')
                ? '🌐'
                : toolCall.name.includes('image') ||
                    toolCall.name.includes('vision')
                  ? '🖼️'
                  : toolCall.name.includes('skill')
                    ? '📦'
                    : toolCall.name.includes('delegate') ||
                        toolCall.name.includes('spawn')
                      ? '🤖'
                      : '⚡')
  const verb =
    TOOL_VERBS[toolCall.name] ??
    (toolCall.name.includes('search')
      ? 'Searching'
      : toolCall.name.includes('read') || toolCall.name.includes('Read')
        ? 'Reading'
        : toolCall.name.includes('write') ||
            toolCall.name.includes('Write') ||
            toolCall.name.includes('edit') ||
            toolCall.name.includes('Edit')
          ? 'Writing'
          : toolCall.name.includes('exec') || toolCall.name.includes('terminal')
            ? 'Executing'
            : toolCall.name.includes('memory')
              ? 'Remembering'
              : toolCall.name.includes('browser')
                ? 'Browsing'
                : 'Working')
  const displayName = formatToolDisplayLabel(
    toolCall.name,
    toolCall.args as Record<string, unknown> | undefined,
  )
  const label = keyArgLabel(
    toolCall.name,
    toolCall.args as Record<string, unknown> | undefined,
  )
  const truncated =
    label && label.length > 50 ? `${label.slice(0, 47)}…` : label

  const elapsed = useElapsedTime(isRunning)
  const dots = useAnimatedDots()

  const result = toolCall.result ?? ''
  const preview = result.slice(0, 100)
  const detail = result.slice(0, 500)
  const hasMore = result.length > 500

  const borderColor = isDone
    ? 'color-mix(in srgb, var(--theme-success) 35%, var(--theme-border))'
    : isError
      ? 'color-mix(in srgb, var(--theme-danger) 35%, var(--theme-border))'
      : 'color-mix(in srgb, var(--theme-accent) 50%, var(--theme-border))'

  const leftAccent = isRunning
    ? 'var(--theme-accent)'
    : isDone
      ? 'var(--theme-success)'
      : 'var(--theme-danger)'

  return (
    <div
      className="rounded-lg border border-primary-200 bg-primary-50 text-[11px] max-w-full overflow-hidden"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: isRunning ? '#6366f1' : isDone ? '#22c55e' : '#ef4444',
        transition: 'border-color 0.3s',
        boxShadow: isRunning ? '0 0 8px rgba(99,102,241,0.15)' : 'none',
      }}
    >
      {/* Header row — always clickable */}
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:opacity-80 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="shrink-0 text-[10px] opacity-50">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="shrink-0 text-sm leading-none">{emoji}</span>
        <span className="shrink-0 font-mono font-semibold text-ink">
          {displayName}
        </span>
        {truncated && truncated !== displayName && (
          <span className="truncate opacity-40 text-[10px] font-mono min-w-0">
            {truncated}
          </span>
        )}
        <span className="flex-1" />
        {elapsed && (
          <span className="shrink-0 text-[10px] tabular-nums text-primary-400">
            {elapsed}
          </span>
        )}
        {isDone && <span className="shrink-0 text-xs text-green-500">✅</span>}
        {isError && <span className="shrink-0 text-xs text-red-500">❌</span>}
        {isRunning && (
          <span className="shrink-0 size-1.5 rounded-full animate-pulse bg-indigo-500" />
        )}
      </button>
      {isRunning && !expanded && (
        <div className="px-2.5 pb-1.5 text-[10px] text-primary-400">
          <span>
            {verb}
            {dots}
          </span>
        </div>
      )}
      {/* Expanded content — args while running, result when done */}
      {expanded && (
        <div
          className="border-t"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          {/* Show args (input) */}
          {toolCall.args != null &&
            typeof toolCall.args === 'object' &&
            Object.keys(toolCall.args as Record<string, unknown>).length >
              0 && (
              <div className="px-2.5 py-1.5">
                <div className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">
                  Input
                </div>
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto text-ink opacity-70">
                  {JSON.stringify(toolCall.args, null, 2)}
                </pre>
              </div>
            )}
          {/* Show result when done */}
          {isDone && result && (
            <div
              className="px-2.5 py-1.5 border-t"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">
                Output
              </div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-ink opacity-80">
                {showMore ? result : detail}
                {hasMore && !showMore && (
                  <button
                    type="button"
                    className="block mt-1 text-[10px] underline text-accent-500"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowMore(true)
                    }}
                  >
                    Show more
                  </button>
                )}
              </pre>
            </div>
          )}
          {/* Show error */}
          {isError && result && (
            <div className="px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-red-500 mb-0.5">
                Error
              </div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-red-500">
                {result}
              </pre>
            </div>
          )}
          {/* Running indicator when expanded */}
          {isRunning && (
            <div
              className="px-2.5 py-1.5 text-[10px] text-primary-400 border-t"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <span>
                {verb}
                {dots}
              </span>
            </div>
          )}
        </div>
      )}
      {!expanded && isError && result && (
        <div className="px-2.5 pb-1.5 text-[10px] font-mono truncate text-red-500">
          {result.slice(0, 80)}
        </div>
      )}
    </div>
  )
}

function LifecycleEventCard({
  text,
  emoji,
  isError,
}: {
  text: string
  emoji: string
  isError: boolean
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]"
      style={{
        background: 'color-mix(in srgb, var(--theme-card2) 70%, transparent)',
        borderLeft: `2px solid ${
          isError
            ? 'color-mix(in srgb, var(--theme-danger) 60%, var(--theme-border))'
            : 'color-mix(in srgb, var(--theme-accent) 45%, var(--theme-border))'
        }`,
        color: 'var(--theme-muted)',
      }}
    >
      {emoji ? <span className="leading-none opacity-80">{emoji}</span> : null}
      <span className="truncate">{text}</span>
    </div>
  )
}

function attachmentSource(attachment: ChatAttachment | undefined): string {
  if (!attachment) return ''
  const candidates = [attachment.previewUrl, attachment.dataUrl, attachment.url]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }
  return ''
}

function attachmentExtension(attachment: ChatAttachment): string {
  const name = typeof attachment.name === 'string' ? attachment.name : ''
  const fromName = name.split('.').pop()?.trim().toLowerCase() || ''
  if (fromName) return fromName

  const source = attachmentSource(attachment)
  const fileName = source.split('?')[0]?.split('#')[0]?.split('/').pop() || ''
  return fileName.split('.').pop()?.trim().toLowerCase() || ''
}

function isImageAttachment(attachment: ChatAttachment): boolean {
  const contentType =
    typeof attachment.contentType === 'string'
      ? attachment.contentType.trim().toLowerCase()
      : ''
  if (contentType.startsWith('image/')) return true

  const ext = attachmentExtension(attachment)
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(
    ext,
  )
}

function isMarkdownAttachment(attachment: ChatAttachment): boolean {
  const ext = attachmentExtension(attachment)
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return true

  const contentType =
    typeof attachment.contentType === 'string'
      ? attachment.contentType.trim().toLowerCase()
      : ''
  return contentType.includes('markdown')
}

function decodeAttachmentText(attachment: ChatAttachment): string {
  const candidates = [attachment.dataUrl, attachment.previewUrl, attachment.url]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) continue
    const trimmed = candidate.trim()

    if (!trimmed.startsWith('data:')) {
      return trimmed
    }

    const commaIndex = trimmed.indexOf(',')
    if (commaIndex < 0) continue

    const metadata = trimmed.slice(0, commaIndex).toLowerCase()
    const payload = trimmed.slice(commaIndex + 1)

    try {
      if (metadata.includes(';base64')) {
        return decodeURIComponent(escape(atob(payload)))
      }
      return decodeURIComponent(payload)
    } catch {
      continue
    }
  }

  return ''
}

function MarkdownDocumentCard({
  title,
  content,
  openHref,
  className,
}: {
  title: string
  content: string
  openHref?: string
  className?: string
}) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const hasContent = content.trim().length > 0

  return (
    <div
      className={cn(
        'w-full max-w-[36rem] overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-primary-200 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-primary-900">
            {title}
          </div>
          <div className="text-[11px] text-primary-600">Markdown document</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasContent ? (
            <div className="flex items-center rounded-lg border border-primary-200 bg-primary-100/70 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-xs',
                  viewMode === 'preview' &&
                    'bg-primary-200 text-primary-900 hover:bg-primary-200',
                )}
                onClick={() => setViewMode('preview')}
              >
                Preview
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-xs',
                  viewMode === 'source' &&
                    'bg-primary-200 text-primary-900 hover:bg-primary-200',
                )}
                onClick={() => setViewMode('source')}
              >
                Source
              </Button>
            </div>
          ) : null}
          {openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-700 underline decoration-primary-300 underline-offset-4 hover:decoration-primary-500"
            >
              Open
            </a>
          ) : null}
        </div>
      </div>

      <div className="max-h-[26rem] overflow-auto p-3">
        {hasContent ? (
          viewMode === 'preview' ? (
            <Markdown className="text-sm">{content}</Markdown>
          ) : (
            <CodeBlock content={content} language="markdown" className="my-0" />
          )
        ) : (
          <div className="text-sm text-primary-600">
            Preview unavailable for this markdown content.
          </div>
        )}
      </div>
    </div>
  )
}

function MarkdownAttachmentCard({
  attachment,
}: {
  attachment: ChatAttachment
}) {
  const source = attachmentSource(attachment)
  const content = useMemo(() => decodeAttachmentText(attachment), [attachment])
  const ext = attachmentExtension(attachment)

  return (
    <MarkdownDocumentCard
      title={`${attachment.name || 'Markdown attachment'}${ext ? ` • ${ext.toUpperCase()}` : ''}`}
      content={content}
      openHref={source || undefined}
    />
  )
}

function extractStandaloneMarkdownFence(text: string): string | null {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:md|markdown)\n([\s\S]*?)\n```$/i)
  if (!match) return null
  return typeof match[1] === 'string' ? match[1].trim() : null
}

function MarkdownMessageCard({ content }: { content: string }) {
  return (
    <MarkdownDocumentCard
      title="Markdown preview"
      content={content}
      className="max-w-full"
    />
  )
}

const TOOL_ICONS: Record<string, string> = {
  exec: '\u2699',
  terminal: '\u2699',
  Read: '\u25c7',
  read: '\u25c7',
  read_file: '\u25c7',
  Write: '\u270e',
  write: '\u270e',
  write_file: '\u270e',
  Edit: '\u270e',
  edit: '\u270e',
  web_search: '\u25ce',
  search_files: '\u25ce',
  memory_search: '\u2726',
  memory_get: '\u2726',
  save_memory: '\u2726',
  browser: '\u25a3',
  browser_navigate: '\u25a3',
  image: '\u25ce',
  skill_view: '\u26a1',
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
  const [showRawJson, setShowRawJson] = useState(false)
  const [showFullOutput, setShowFullOutput] = useState(false)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const icon = TOOL_ICONS[toolSection.type] ?? '🔧'
  const isError = toolSection.state === 'output-error'
  const isRunning =
    toolSection.state === 'input-available' ||
    toolSection.state === 'input-streaming'
  const isDone = toolSection.state === 'output-available'
  const headerArg = toolSection.input
    ? keyArgLabel(toolSection.type, toolSection.input)
    : null
  const toolDisplayLabel = formatToolDisplayLabel(
    toolSection.type,
    toolSection.input,
  )
  const headerArgTruncated =
    headerArg && headerArg.length > 60
      ? `${headerArg.slice(0, 57)}…`
      : headerArg

  const rawJsonPayload = useMemo(() => {
    if (!showRawJson) return ''
    return JSON.stringify(
      {
        type: toolSection.type,
        input: toolSection.input ?? {},
        output: toolSection.outputText || toolSection.errorText || null,
      },
      null,
      2,
    )
  }, [
    showRawJson,
    toolSection.type,
    toolSection.input,
    toolSection.outputText,
    toolSection.errorText,
  ])
  const outputText = toolSection.outputText || toolSection.errorText || ''
  const shouldTruncateOutput = outputText.length > 800
  const displayedOutputText =
    shouldTruncateOutput && !showFullOutput
      ? `${outputText.slice(0, 800)}…`
      : outputText
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isRunning, toolSection.key])
  const elapsedLabel =
    elapsed >= 60
      ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
      : `${elapsed}s`
  const verb = toolSection.type.includes('search')
    ? 'Searching'
    : toolSection.type.includes('read') || toolSection.type.includes('Read')
      ? 'Reading'
      : toolSection.type.includes('write') ||
          toolSection.type.includes('Write') ||
          toolSection.type.includes('edit')
        ? 'Writing'
        : toolSection.type.includes('exec') ||
            toolSection.type.includes('terminal')
          ? 'Executing'
          : toolSection.type.includes('memory')
            ? 'Remembering'
            : 'Working'

  const previewLabel = toolSection.preview || headerArgTruncated
  const hasInputData =
    toolSection.input && Object.keys(toolSection.input).length > 0
  const hasOutputData = !!(toolSection.outputText || toolSection.errorText)
  const isArtifact = toolSection.type.startsWith('artifact:')
  const artifactKind = isArtifact ? toolSection.type.slice('artifact:'.length) : null
  const artifactTitle =
    typeof toolSection.input?.title === 'string' && toolSection.input.title.trim()
      ? toolSection.input.title.trim()
      : 'Artifact'
  const artifactPath =
    typeof toolSection.input?.path === 'string' && toolSection.input.path.trim()
      ? toolSection.input.path.trim()
      : ''
  const artifactPreview =
    typeof toolSection.preview === 'string' && toolSection.preview.trim()
      ? toolSection.preview.trim()
      : ''

  return (
    <div>
      <div
        className={cn(
          'overflow-hidden rounded-lg border text-[12px] transition-all',
          'cursor-pointer hover:border-[var(--theme-accent)]/40',
        )}
        style={{
          background: 'color-mix(in srgb, var(--theme-card2) 76%, transparent)',
          borderColor: 'var(--theme-border)',
          boxShadow: isRunning ? '0 0 0 1px color-mix(in srgb, var(--theme-accent) 18%, transparent)' : undefined,
        }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-sm leading-none shrink-0 opacity-80">{icon}</span>
          <span className="font-medium text-[12px] text-[var(--theme-text)]">
            {toolDisplayLabel}
          </span>
          {previewLabel && previewLabel !== toolDisplayLabel ? (
            <span className="truncate text-[10px] min-w-0 text-[var(--theme-muted)]">
              {previewLabel}
            </span>
          ) : null}
          <span className="flex-1" />
          {isRunning && (
            <span className="text-[10px] tabular-nums text-[var(--theme-muted)]">
              {elapsedLabel}
            </span>
          )}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]',
              isRunning
                ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                : isDone
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-red-500/10 text-red-500',
            )}
          >
            {isRunning ? 'Running' : isDone ? 'Done' : 'Error'}
          </span>
          {isRunning && (
            <span className="size-1.5 rounded-full animate-pulse bg-[var(--theme-accent)]" />
          )}
          <span className="text-[8px] opacity-30 ml-0.5">
            {open ? '▾' : '▸'}
          </span>
        </div>
      </div>

      {open && (
        <div className="mt-1 ml-3 flex flex-col gap-1.5 border-l border-[var(--theme-border)]/70 pb-1 pl-3 animate-in slide-in-from-top-1 duration-150">
          {isArtifact ? (
            <div
              className="overflow-hidden rounded-xl border"
              style={{
                borderColor: 'var(--theme-border)',
                background:
                  'color-mix(in srgb, var(--theme-accent) 4%, var(--theme-card))',
              }}
            >
              <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" aria-hidden="true">📄</span>
                    <span className="truncate text-sm font-semibold text-[var(--theme-text)]">
                      {artifactTitle}
                    </span>
                    {artifactKind ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{
                          background: 'var(--theme-card2)',
                          color: 'var(--theme-muted)',
                        }}
                      >
                        {artifactKind}
                      </span>
                    ) : null}
                  </div>
                  {artifactPath ? (
                    <div
                      className="mt-1 truncate font-mono text-[11px]"
                      style={{ color: 'var(--theme-muted)' }}
                      title={artifactPath}
                    >
                      {artifactPath}
                    </div>
                  ) : null}
                </div>
                {artifactPath ? (
                  <a
                    href={artifactPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium"
                    style={{
                      background: 'var(--theme-card2)',
                      color: 'var(--theme-text)',
                    }}
                  >
                    Open ↗
                  </a>
                ) : null}
              </div>
              {artifactPreview ? (
                <div
                  className="border-t px-3 py-2 text-xs"
                  style={{
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-muted)',
                    background:
                      'color-mix(in srgb, var(--theme-bg) 75%, transparent)',
                  }}
                >
                  {artifactPreview}
                </div>
              ) : null}
            </div>
          ) : null}
          {hasInputData && !showRawJson && !isArtifact ? (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-primary-500 mb-0.5 font-sans">
                Input
              </div>
              {toolSection.type === 'exec' && headerArg ? (
                <pre
                  className="overflow-x-auto whitespace-pre-wrap break-words rounded px-2 py-1 text-[10px] font-mono text-amber-500"
                  style={{ background: 'var(--code-bg, var(--theme-card))' }}
                >
                  $ {headerArg}
                </pre>
              ) : (
                <pre
                  className="max-h-32 overflow-x-auto whitespace-pre-wrap break-words rounded p-2 text-[10px] font-mono"
                  style={{
                    background: 'var(--code-bg, var(--theme-card))',
                    color: 'var(--code-foreground)',
                  }}
                >
                  {JSON.stringify(toolSection.input, null, 2)}
                </pre>
              )}
            </div>
          ) : null}

          {!showRawJson && !isArtifact ? (
            isError && toolSection.errorText ? (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-red-500 mb-0.5 font-sans">
                  Error
                </div>
                <pre
                  className="max-h-48 overflow-x-auto whitespace-pre-wrap break-words rounded p-2 text-[10px] font-mono text-red-400"
                  style={{ background: 'var(--code-bg, var(--theme-card))' }}
                >
                  {displayedOutputText}
                </pre>
              </div>
            ) : toolSection.outputText ? (
              <div>
                <div className="text-[9px] uppercase tracking-widest text-primary-500 mb-0.5 font-sans">
                  Output
                </div>
                <pre
                  className="max-h-48 overflow-x-auto whitespace-pre-wrap break-words rounded p-2 text-[10px] font-mono"
                  style={{
                    background: 'var(--code-bg, var(--theme-card))',
                    color: 'var(--code-foreground)',
                  }}
                >
                  {displayedOutputText}
                </pre>
              </div>
            ) : null
          ) : (
            <pre
              className="max-h-64 overflow-x-auto whitespace-pre-wrap break-words rounded p-2 text-[10px] font-mono"
              style={{
                background: 'var(--code-bg, var(--theme-card))',
                color: 'var(--code-foreground)',
              }}
            >
              {rawJsonPayload}
            </pre>
          )}

          {!isArtifact && (shouldTruncateOutput || toolSection.outputText) && (
            <div className="flex flex-wrap items-center gap-2">
              {shouldTruncateOutput && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowFullOutput((v) => !v)
                  }}
                  className="text-[9px] text-primary-500 hover:text-primary-700"
                >
                  {showFullOutput ? 'less' : 'more'}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRawJson((v) => !v)
                }}
                className="text-[9px] text-primary-500 hover:text-primary-700"
              >
                {showRawJson ? 'formatted' : 'raw'}
              </button>
            </div>
          )}
          {/* Fallback when no args or output available */}
          {!isArtifact && !hasInputData && !hasOutputData && !isRunning && (
            <div className="text-[10px] text-primary-400 italic">
              No detail available for this tool call
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolCallGroup({
  toolSections,
  expandAll,
  isStreaming,
}: {
  toolSections: Array<InlineToolSection>
  expandAll?: boolean
  isStreaming?: boolean
}) {
  const shouldAutoOpen = shouldAutoExpandHermesActivityCard({
    isStreaming: Boolean(isStreaming),
    toolCount: toolSections.length,
  })
  const [open, setOpen] = useState(Boolean(expandAll) || shouldAutoOpen)
  useEffect(() => {
    if (expandAll || shouldAutoOpen) setOpen(true)
  }, [expandAll, shouldAutoOpen])

  const summary = buildHermesActivitySummary(toolSections)

  if (toolSections.length > 1 || isStreaming) {
    return (
      <div className="my-2 w-full max-w-[min(100%,700px)] overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--theme-border)_88%,transparent)] bg-[color-mix(in_srgb,var(--theme-card2)_96%,var(--theme-bg)_4%)]">
        <button
          type="button"
          className="flex w-full items-start gap-3 px-3 py-2 text-left text-[12px]"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="mt-0.5 font-mono text-[12px] leading-none text-[var(--theme-accent)]/85">
            ┊
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                Tool calls
              </span>
              <span className="rounded-md border border-[var(--theme-border)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--theme-muted)]">
                {summary.countLabel}
              </span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]',
                  summary.errorCount > 0
                    ? 'bg-red-500/8 text-red-500'
                    : summary.runningCount > 0 || isStreaming
                      ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                      : 'bg-emerald-500/8 text-emerald-600',
                )}
              >
                {summary.statusLabel}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] opacity-45">
                {open ? '▾' : '▸'}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-[var(--theme-text)]/76">
              {summary.collapsedLabel}
            </div>
          </div>
        </button>
        {open && (
          <div className="border-t border-[color-mix(in_srgb,var(--theme-border)_82%,transparent)] px-3 pb-2.5 pt-2">
            <div className="flex flex-col gap-1.5">
              {toolSections.map((toolSection, index) => (
                <InlineToolSectionItem
                  key={toolSection.key || `${toolSection.type}-${index}`}
                  toolSection={toolSection}
                  index={index}
                  forceOpen={expandAll}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 my-3 w-full max-w-[min(100%,700px)]">
      {toolSections.map((toolSection, index) => (
        <InlineToolSectionItem
          key={toolSection.key || `${toolSection.type}-${index}`}
          toolSection={toolSection}
          index={index}
          forceOpen={expandAll}
        />
      ))}
    </div>
  )
}

function MessageItemComponent({
  message,
  attachedToolMessages = [],
  toolResultsByCallId,
  toolCalls: streamToolCalls = [],
  lifecycleEvents = [],
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
  const displayWordCount = countWords(displayText)
  const revealComplete =
    revealedWordCount >= displayWordCount && displayWordCount > 0
  const effectiveIsStreaming =
    remoteStreamingActive || (_simulateStreaming && !revealComplete)
  const assistantDisplayText = effectiveIsStreaming ? revealedText : displayText
  const assistantCorruptionWarning = useMemo(
    () => detectAssistantCorruptionWarning(role, assistantDisplayText),
    [role, assistantDisplayText],
  )
  const standaloneMarkdownDocument = useMemo(
    () => extractStandaloneMarkdownFence(assistantDisplayText),
    [assistantDisplayText],
  )

  useEffect(() => {
    const nextTotalWords = countWords(displayText)
    const previousText = previousTextRef.current
    const previousLength = previousTextLengthRef.current
    const textGrew =
      displayText.length > previousLength &&
      displayText.startsWith(previousText)
    const textChanged = displayText !== previousText

    targetWordCountRef.current = nextTotalWords
    previousTextRef.current = displayText
    previousTextLengthRef.current = displayText.length

    if (!effectiveIsStreaming) {
      if (revealTimerRef.current !== null) {
        window.clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
      }
      setRevealedWordCount(nextTotalWords)
      return
    }

    if (textChanged && !textGrew) {
      setRevealedWordCount(nextTotalWords)
      return
    }

    if (revealTimerRef.current !== null) {
      return
    }

    // Don't start animation if already fully revealed
    setRevealedWordCount((wordCount) => {
      if (wordCount >= nextTotalWords) {
        return wordCount
      }

      function tick() {
        setRevealedWordCount((visibleWordCount) => {
          const targetWordCount = targetWordCountRef.current
          if (visibleWordCount >= targetWordCount) {
            if (revealTimerRef.current !== null) {
              window.clearInterval(revealTimerRef.current)
              revealTimerRef.current = null
            }
            return visibleWordCount
          }

          const nextWordCount = Math.min(
            targetWordCount,
            visibleWordCount + WORDS_PER_TICK,
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
      return wordCount
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

  // Extract inline images from content array (server sends images as content blocks)
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
  const hasRevealedText = effectiveIsStreaming
    ? assistantDisplayText.length > 0
    : hasText
  const canRetryMessage =
    isUser && (hasText || hasAttachments || hasInlineImages)

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
        preview: typeof entry?.preview === 'string' ? entry.preview : undefined,
        result: typeof entry?.result === 'string' ? entry.result : undefined,
      }))
      .filter((entry: any) => entry.id.length > 0)
  }, [message])
  const effectiveStreamToolCalls =
    streamToolCalls.length > 0 ? streamToolCalls : embeddedStreamToolCalls
  const hasStreamToolCalls = effectiveStreamToolCalls.length > 0
  const effectiveLifecycleEvents = lifecycleEvents
  const hasLifecycleEvents = effectiveLifecycleEvents.length > 0
  const activeStreamToolLabels = useMemo(() => {
    const labels: Array<string> = []
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
        const errorText = toolMessage.isError
          ? outputText || 'Unknown error'
          : undefined
        const toolType =
          (typeof toolMessage.toolName === 'string' &&
            toolMessage.toolName.trim()) ||
          parseToolNameFromMessageText(messageText)
        return {
          key:
            (typeof (toolMessage as any).id === 'string' &&
              (toolMessage as any).id) ||
            (typeof toolMessage.toolCallId === 'string' &&
              toolMessage.toolCallId) ||
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
  const streamToolSections = useMemo<Array<InlineToolSection>>(
    () =>
      effectiveStreamToolCalls.map((toolCall, index) => {
        const outputText =
          typeof toolCall.result === 'string' ? toolCall.result : ''
        const isError = toolCall.phase === 'error'
        const isComplete =
          toolCall.phase === 'done' ||
          toolCall.phase === 'complete' ||
          toolCall.phase === 'completed' ||
          toolCall.phase === 'result' ||
          outputText.length > 0
        return {
          key: toolCall.id || `${toolCall.name}-${index}`,
          type: toolCall.name,
          input:
            toolCall.args && typeof toolCall.args === 'object'
              ? (toolCall.args as Record<string, unknown>)
              : undefined,
          preview: toolCall.preview,
          outputText,
          errorText: isError ? outputText || 'Tool failed' : undefined,
          state: isError
            ? 'output-error'
            : isComplete || !effectiveIsStreaming
              ? 'output-available'
              : 'input-available',
        }
      }),
    [effectiveStreamToolCalls, effectiveIsStreaming],
  )
  const inlineToolSections = useMemo<Array<InlineToolSection>>(
    () => [
      ...streamToolSections,
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
          input: toolPart.input,
          outputText,
          errorText: toolPart.errorText,
          state: toolPart.state,
        }
      }),
      ...attachedToolSections,
    ],
    [attachedToolSections, streamToolSections, toolParts],
  )
  // When streaming is done, force all tool sections to completed state
  // Prevents stuck timers from race conditions where tool.completed SSE
  // arrives after the done event or phase wasn't properly updated
  const finalToolSections = useMemo(() => {
    if (effectiveIsStreaming) return inlineToolSections
    return inlineToolSections.map((section) =>
      section.state === 'input-available' || section.state === 'input-streaming'
        ? { ...section, state: 'output-available' as const }
        : section,
    )
  }, [inlineToolSections, effectiveIsStreaming])
  const inlineRenderPlan = useMemo(
    () => buildInlineToolRenderPlan(message, finalToolSections),
    [message, finalToolSections],
  )
  const compactInlineRenderPlan = useMemo(
    () => compactInlineToolRenderPlan(inlineRenderPlan),
    [inlineRenderPlan],
  )
  const hasToolCalls = finalToolSections.length > 0
  const shouldRenderMessageBubble =
    hasText ||
    hasAttachments ||
    hasInlineImages ||
    (effectiveIsStreaming && hasRevealedText)

  // 'queued' = delivered to server, waiting for response (busy/backlogged)
  // 'sending' = still in flight to the server API (should clear in <1s)
  // 'error'   = server rejected or network failed → show retry
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
    const isSuccess = execNotification.ok ?? execNotification.exitCode === 0
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
      {/* Grouped tool card above the assistant bubble. Only show once there
          is real assistant text in the bubble. While streaming with no text,
          the legacy ThinkingBubble in chat-message-list owns the visual and
          renders its own branched TuiActivityCard so we don't double up. */}
      {!isUser &&
      finalToolSections.length > 0 &&
      (hasText || !effectiveIsStreaming) ? (
        <div className="w-full max-w-[var(--chat-content-max-width)] flex">
          <div className="w-6 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <TuiActivityCard
              toolSections={finalToolSections}
              thinking={null}
              isStreaming={effectiveIsStreaming}
              expandAll={expandAllToolSections}
              formatLabel={formatToolDisplayLabel}
              formatArg={keyArgLabel}
            />
          </div>
        </div>
      ) : null}
      {effectiveIsStreaming && hasLifecycleEvents && !hasToolCalls && (
        <div className="w-full max-w-[var(--chat-content-max-width)] flex flex-col gap-1">
          {effectiveLifecycleEvents.map((event, index) => (
            <LifecycleEventCard
              key={`${event.timestamp}-${index}-${event.text}`}
              text={event.text}
              emoji={event.emoji}
              isError={event.isError}
            />
          ))}
        </div>
      )}
      {/* Narration messages (tool-call activity) — compact collapsible row */}
      {!isUser && (message as any).__isNarration && hasText && (
        <div className="w-full max-w-[var(--chat-content-max-width)]">
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
      {/* Tool calls now render inline inside the assistant bubble, not above it */}

      {shouldRenderMessageBubble && !(message as any).__isNarration && (
        <Message
          className={cn('gap-2 md:gap-3', isUser ? 'flex-row-reverse' : '')}
        >
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
            data-chat-message-bubble={isUser ? 'user' : 'assistant'}
            className={cn(
              'break-words whitespace-normal min-w-0 flex flex-col gap-2 px-3 py-2 max-w-[80%]',
              '',
              !isUser
                ? 'border rounded-2xl rounded-tl-sm'
                : 'text-white rounded-2xl rounded-tr-sm',
              isQueued && isUser && !isFailed && 'opacity-70',
              isFailed && isUser && 'bg-red-50/50 border border-red-300',
              bubbleClassName,
            )}
            style={
              !isUser
                ? {
                    background: 'var(--chat-assistant-bg)',
                    borderColor: 'var(--chat-assistant-border)',
                    color: 'var(--chat-assistant-foreground)',
                  }
                : {
                    background: 'var(--chat-user-bg)',
                    borderColor: 'var(--chat-user-border)',
                    color: 'var(--chat-user-foreground)',
                  }
            }
          >
            {hasAttachments && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => {
                  const source = attachmentSource(attachment)
                  const ext = attachmentExtension(attachment)
                  const imageAttachment = isImageAttachment(attachment)
                  const markdownAttachment = isMarkdownAttachment(attachment)

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

                  if (markdownAttachment) {
                    const mdContent = decodeAttachmentText(attachment)
                    // Only render preview if actual content exists (base64 is stripped on history reload)
                    if (mdContent.trim().length > 0) {
                      return (
                        <MarkdownAttachmentCard
                          key={attachment.id || attachment.name || source}
                          attachment={attachment}
                        />
                      )
                    }
                    // Fall through to generic attachment link
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
                      <span className="truncate">
                        {attachment.name || 'Attachment'}
                      </span>
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
                <span className="text-pretty">{displayText}</span>
              ) : hasRevealedText ? (
                <div className="relative">
                  {assistantCorruptionWarning ? (
                    <div
                      className="mb-3 rounded-xl border px-3 py-2 text-xs"
                      style={{
                        borderColor: 'rgba(245, 158, 11, 0.45)',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: 'var(--chat-assistant-foreground)',
                      }}
                    >
                      <div className="font-semibold">
                        {assistantCorruptionWarning.label}
                      </div>
                      <div className="mt-1 opacity-80">
                        {assistantCorruptionWarning.detail}
                      </div>
                    </div>
                  ) : null}
                  {standaloneMarkdownDocument ? (
                    <MarkdownMessageCard content={standaloneMarkdownDocument} />
                  ) : (
                    <MessageContent
                      markdown
                      className={cn(
                        'text-primary-900 bg-transparent w-full text-pretty transition-all duration-100',
                        effectiveIsStreaming && 'chat-streaming-content',
                      )}
                    >
                      {assistantDisplayText}
                    </MessageContent>
                  )}
                  {effectiveIsStreaming && (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500 align-text-bottom" />
                  )}
                </div>
              ) : null)}
            {/* Sent indicator — message delivered, waiting for response */}
            {isUser && isQueued && (
              <span
                className="self-end text-[10px]"
                style={{
                  color:
                    'color-mix(in srgb, var(--chat-user-foreground) 60%, transparent)',
                }}
              >
                Sent
              </span>
            )}
          </div>
        </Message>
      )}
      {/* Bottom thinking bubble handles empty streaming states; avoid duplicate in-thread working copy. */}
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
  if (prevProps.lifecycleEvents !== nextProps.lifecycleEvents) return false
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
