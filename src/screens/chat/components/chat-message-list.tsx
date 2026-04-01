import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowExpand01Icon,
  ArrowUp01Icon,
  Robot01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  getMessageTimestamp,
  getToolCallsFromMessage,
  textFromMessage,
} from '../utils'
import { MessageItem } from './message-item'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ResearchCard } from './research-card'
import type { ChatMessage } from '../types'
import type { UseResearchCardResult } from '@/hooks/use-research-card'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/prompt-kit/chat-container'
import { AssistantAvatar } from '@/components/avatars'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import { CHAT_OPEN_MESSAGE_SEARCH_EVENT } from '@/screens/chat/chat-events'

/** Duration (ms) the thinking indicator stays visible after waitingForResponse
 *  clears, giving the first response message time to render before the
 *  indicator disappears — prevents a flash of blank space (Bug 2 fix).
 *  Keep this short so tool pills appear immediately and the shimmer only
 *  bridges the gap until the first tool/text event arrives. */
const THINKING_GRACE_PERIOD_MS = 300

/** Map tool names to human-readable status strings */
const TOOL_STATUS_MAP: Record<string, string> = {
  memory_search: 'Searching memory…',
  memory_get: 'Searching memory…',
  web_search: 'Searching the web…',
  web_fetch: 'Reading page…',
  cron: 'Managing schedules…',
  message: 'Sending message…',
  gateway: 'Managing gateway…',
  canvas: 'Rendering canvas…',
  voice_call: 'Making call…',
  pdf: 'Reading PDF…',
  todo: 'Managing tasks…',
  Read: 'Reading file…',
  read: 'Reading file…',
  Write: 'Writing file…',
  write: 'Writing file…',
  Edit: 'Writing file…',
  edit: 'Writing file…',
  exec: 'Running code…',
  sessions_spawn: 'Spawning agent…',
  sessions_history: 'Checking sessions…',
  sessions_list: 'Checking sessions…',
  browser: 'Browsing web…',
  image: 'Analyzing image…',
  tts: 'Generating audio…',
}

function getToolStatusLabel(toolName: string): string {
  return TOOL_STATUS_MAP[toolName] ?? 'Working…'
}

const TOOL_EMOJIS: Record<string, string> = {
  web_search: '🔍', search: '🔍', search_files: '🔍', session_search: '🔍',
  web_fetch: '🌐',
  terminal: '💻', exec: '💻', shell: '💻', bash: '💻',
  Read: '📖', read: '📖', read_file: '📖', file_read: '📖',
  pdf: '📄',
  Write: '✏️', write: '✏️', write_file: '✏️', edit: '✏️', Edit: '✏️',
  memory: '🧠', memory_search: '🧠', memory_get: '🧠', save_memory: '🧠',
  browser: '🌐', browser_navigate: '🌐', navigate: '🌐',
  image: '🖼️', vision: '🖼️',
  skill: '📦', skill_view: '📦', skill_load: '📦',
  delegate: '🤖', spawn: '🤖', subagents: '🤖', agents_list: '🤖',
  todo: '✅', cron: '⏰', message: '💬',
  voice_call: '📞', canvas: '🎨', nodes: '📱', gateway: '⚙️',
  lcm_grep: '🔍', lcm_expand: '🔍', lcm_describe: '🔍', lcm_expand_query: '🔍',
  sessions_send: '📤', session_status: '📊', sessions_yield: '⏸️',
  tts: '🗣️',
}

function getToolEmoji(name: string): string {
  if (TOOL_EMOJIS[name]) return TOOL_EMOJIS[name]
  if (name.includes('search')) return '🔍'
  if (name.includes('read') || name.includes('Read')) return '📖'
  if (name.includes('write') || name.includes('Write') || name.includes('edit')) return '✏️'
  if (name.includes('exec') || name.includes('terminal')) return '💻'
  if (name.includes('memory')) return '🧠'
  if (name.includes('browser')) return '🌐'
  if (name.includes('skill')) return '📦'
  return '⚡'
}

function getToolVerb(name: string): string {
  if (name.includes('search')) return 'Searching'
  if (name.includes('read') || name.includes('Read')) return 'Reading'
  if (name.includes('write') || name.includes('Write') || name.includes('edit')) return 'Writing'
  if (name.includes('exec') || name.includes('terminal')) return 'Executing'
  if (name.includes('memory')) return 'Remembering'
  if (name.includes('browser')) return 'Browsing'
  if (name.includes('skill')) return 'Loading skill'
  return 'Working'
}

function ToolCallCard({ name, phase }: { name: string; phase: string }) {
  const isDone = phase === 'done' || phase === 'complete' || phase === 'completed'
  const isError = phase === 'error' || phase === 'failed'
  const isRunning = !isDone && !isError

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isRunning])

  const [dots, setDots] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    const id = window.setInterval(() => setDots((d) => (d + 1) % 4), 400)
    return () => window.clearInterval(id)
  }, [isRunning])

  const elapsedLabel = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`
  const emoji = getToolEmoji(name)
  const verb = getToolVerb(name)
  const displayName = name.replace(/_/g, ' ')

  return (
    <div
      className="rounded-lg border border-primary-200 bg-primary-50 text-[11px] overflow-hidden"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: isRunning ? '#6366f1' : isDone ? '#22c55e' : '#ef4444',
        boxShadow: isRunning ? '0 0 8px rgba(99,102,241,0.12)' : 'none',
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className="text-sm leading-none">{emoji}</span>
        <span className="font-mono font-semibold text-ink">{displayName}</span>
        <span className="flex-1" />
        {isRunning && <span className="text-[10px] tabular-nums text-primary-400">{elapsedLabel}</span>}
        {isDone && <span className="text-xs text-green-500">✅</span>}
        {isError && <span className="text-xs text-red-500">❌</span>}
        {isRunning && <span className="size-1.5 rounded-full animate-pulse bg-indigo-500" />}
      </div>
      {isRunning && (
        <div className="px-2.5 pb-1.5 text-[10px] text-primary-400">
          {verb}{'.'.repeat(dots)}
        </div>
      )}
    </div>
  )
}

type ThinkingBubbleProps = {
  activeToolCalls?: Array<{ id: string; name: string; phase: string }>
  liveToolActivity?: Array<{ name: string; timestamp: number }>
  researchCard?: UseResearchCardResult
  isCompacting?: boolean
}

/**
 * Premium shimmer thinking bubble — matches the assistant message position
 * with three bouncing dots, a gradient shimmer sweep, and a dynamic status
 * label that reflects what's actually happening (tool calls, etc.).
 */
function ThinkingBubble({
  activeToolCalls = [],
  liveToolActivity = [],
  researchCard,
  isCompacting = false,
}: ThinkingBubbleProps) {
  const allTools = useMemo(
    () =>
      liveToolActivity.length > 0
        ? liveToolActivity.map((t) => ({ name: t.name, phase: 'calling' as const }))
        : activeToolCalls.map((t) => ({ name: t.name, phase: t.phase })),
    [activeToolCalls, liveToolActivity],
  )

  // Derive the most recent active tool name
  const activeToolName = useMemo(() => {
    // liveToolActivity is ordered newest-first
    if (liveToolActivity.length > 0) return liveToolActivity[0].name
    // activeToolCalls: prefer 'calling'/'start' phase, fall back to most recent
    const calling = activeToolCalls.find(
      (tc) => tc.phase === 'calling' || tc.phase === 'start',
    )
    if (calling) return calling.name
    if (activeToolCalls.length > 0) return activeToolCalls[activeToolCalls.length - 1].name
    return null
  }, [activeToolCalls, liveToolActivity])

  const statusLabel = isCompacting
    ? 'Compacting context...'
    : activeToolName
      ? getToolStatusLabel(activeToolName)
      : 'Thinking…'

  // Elapsed time counter — resets when the status label changes (new tool)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    setElapsed(0)
    const interval = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(interval)
  }, [statusLabel])

  const elapsedLabel = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`

  const isStale = elapsed >= 30
  const isVeryStale = elapsed >= 60
  const canExpandResearch = Boolean(researchCard && researchCard.steps.length > 0)
  const expandedResearchCard = canExpandResearch ? researchCard : null
  const completedResearchSteps = researchCard
    ? researchCard.steps.filter((step) => step.status === 'done').length
    : 0

  // Track displayed label with a small delay so we fade between changes
  const [displayedLabel, setDisplayedLabel] = useState(statusLabel)
  const [visible, setVisible] = useState(true)
  const prevLabelRef = useRef(statusLabel)

  useEffect(() => {
    if (statusLabel === prevLabelRef.current) return
    // Fade out, swap, fade in
    setVisible(false)
    const swapTimer = window.setTimeout(() => {
      setDisplayedLabel(statusLabel)
      prevLabelRef.current = statusLabel
      setVisible(true)
    }, 150)
    return () => window.clearTimeout(swapTimer)
  }, [statusLabel])

  // When a tool is active, render grouped tool pill cards instead of shimmer bubble
  if (allTools.length > 0 && !isCompacting) {
    // Group consecutive same-name tools to avoid flooding the UI
    const grouped: Array<{ name: string; phase: string; count: number }> = []
    for (const tc of allTools) {
      const last = grouped[grouped.length - 1]
      if (last && last.name === tc.name) {
        last.count++
        // Keep the most "active" phase (running > complete > error)
        if (tc.phase !== 'done' && tc.phase !== 'complete' && tc.phase !== 'completed') {
          last.phase = tc.phase
        }
      } else {
        grouped.push({ name: tc.name, phase: tc.phase, count: 1 })
      }
    }
    return (
      <div className="flex flex-col gap-1.5 max-w-sm animate-in fade-in duration-200">
        {grouped.map((tc, i) => (
          <div key={`${tc.name}-${i}`} className="relative">
            <ToolCallCard name={tc.name} phase={tc.phase} />
            {tc.count > 1 && (
              <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-indigo-500 text-white rounded-full size-5 flex items-center justify-center shadow-sm">
                {tc.count}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2">
      {/* Avatar with pulsing glow ring */}
      <div className="thinking-avatar-glow shrink-0 rounded-lg">
        <AssistantAvatar size={28} />
      </div>

      {/* Chat bubble */}
      <div className="relative overflow-hidden rounded-2xl rounded-bl-sm border border-primary-200 dark:border-primary-200/20 bg-primary-100 dark:bg-primary-100 thinking-shimmer-bubble">
        {/* Shimmer overlay */}
        <div className="thinking-shimmer-sweep pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative flex flex-col gap-1 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {isCompacting ? (
                  <span
                    className="inline-block size-3 rounded-full border border-primary-300 border-t-primary-500 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <>
                    <span className="thinking-dot thinking-dot-1" />
                    <span className="thinking-dot thinking-dot-2" />
                    <span className="thinking-dot thinking-dot-3" />
                  </>
                )}
                <span
                  className={cn(
                    'thinking-label ml-1.5 text-xs font-medium transition-opacity duration-300',
                    isStale
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-primary-500 dark:text-primary-500',
                  )}
                  style={{ opacity: visible ? 1 : 0 }}
                >
                  {displayedLabel}{' '}
                  {elapsed >= 3 ? (
                    <span className="text-[10px] opacity-60">{elapsedLabel}</span>
                  ) : null}
                </span>
              </div>
              {canExpandResearch ? (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-primary-500 dark:text-primary-400">
                  <span>{completedResearchSteps}/{expandedResearchCard?.steps.length ?? 0} tools</span>
                  <span aria-hidden="true" className="opacity-40">•</span>
                  <span>{expandedResearchCard?.isActive ? 'Live timeline' : 'Timeline ready'}</span>
                </div>
              ) : null}
            </div>
            {canExpandResearch ? (
              <button
                type="button"
                onClick={() => expandedResearchCard?.setCollapsed(!expandedResearchCard.collapsed)}
                className="relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-primary-200/80 bg-primary-50/90 text-primary-500 transition-colors hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/80 dark:text-primary-300 dark:hover:bg-primary-800"
                aria-label={expandedResearchCard?.collapsed ? 'Expand research timeline' : 'Collapse research timeline'}
                title={expandedResearchCard?.collapsed ? 'Expand research timeline' : 'Collapse research timeline'}
              >
                <HugeiconsIcon
                  icon={expandedResearchCard?.collapsed ? ArrowExpand01Icon : ArrowUp01Icon}
                  size={14}
                  strokeWidth={1.8}
                />
              </button>
            ) : null}
          </div>

          {isStale ? (
            <span className="text-[11px] text-amber-500 dark:text-amber-400 animate-pulse">
              {isVeryStale ? 'Still working… this is taking a while' : 'Taking longer than usual…'}
            </span>
          ) : null}

          {activeToolName && !isCompacting ? (
            <div
              style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 300ms ease',
              }}
            >
              <span className="inline-flex items-center rounded-full bg-primary-200/60 dark:bg-primary-800/30 px-2 py-0.5 text-[10px] font-mono text-primary-400 dark:text-primary-500 select-none">
                {activeToolName}
              </span>
            </div>
          ) : null}
        </div>

        {expandedResearchCard && !expandedResearchCard.collapsed ? (
          <ResearchCard researchCard={expandedResearchCard} />
        ) : null}
      </div>
    </div>
  )
}

const VIRTUAL_ROW_HEIGHT = 136
const VIRTUAL_OVERSCAN = 8
const NEAR_BOTTOM_THRESHOLD = 200
// Pull-to-refresh constants removed

const HIDDEN_SYSTEM_USER_SUBSTRINGS = [
  'Pre-compaction memory flush',
  'Read HEARTBEAT.md',
  'HEARTBEAT_OK',
  'Execute your Session Startup sequence',
  '[Queued messages',
  'Heartbeat prompt',
] as const

const HIDDEN_SYSTEM_USER_PREFIXES = [
  '[Fri ',
  '[Mon ',
  '[Tue ',
  '[Wed ',
  '[Thu ',
  '[Sat ',
  '[Sun ',
] as const

function shouldHideSystemInjectedUserMessage(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (HIDDEN_SYSTEM_USER_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true
  }
  return HIDDEN_SYSTEM_USER_SUBSTRINGS.some((substring) =>
    trimmed.includes(substring),
  )
}

function getChronologyRank(message: ChatMessage): number {
  const role = typeof message.role === 'string' ? message.role.toLowerCase() : ''
  const content = Array.isArray(message.content) ? message.content : []
  const hasToolCalls =
    content.some((part) => part.type === 'toolCall') ||
    (Array.isArray((message as any).streamToolCalls) &&
      (message as any).streamToolCalls.length > 0) ||
    (Array.isArray((message as any).__streamToolCalls) &&
      (message as any).__streamToolCalls.length > 0)

  if (role === 'user') return 0
  if (role === 'assistant' && hasToolCalls) return 1
  if (role === 'tool' || role === 'toolresult' || role === 'tool_result') return 2
  if (role === 'assistant') return 3
  return 4
}

function sortMessagesChronologically(
  messages: Array<ChatMessage>,
): Array<ChatMessage> {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const leftTimestamp = getMessageTimestamp(left.message)
      const rightTimestamp = getMessageTimestamp(right.message)
      if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp

      const leftRank = getChronologyRank(left.message)
      const rightRank = getChronologyRank(right.message)
      if (leftRank !== rightRank) return leftRank - rightRank

      const leftHistoryIndex =
        typeof (left.message as any).__historyIndex === 'number'
          ? (left.message as any).__historyIndex
          : undefined
      const rightHistoryIndex =
        typeof (right.message as any).__historyIndex === 'number'
          ? (right.message as any).__historyIndex
          : undefined
      if (
        leftHistoryIndex !== undefined &&
        rightHistoryIndex !== undefined &&
        leftHistoryIndex !== rightHistoryIndex
      ) {
        return leftHistoryIndex - rightHistoryIndex
      }

      const leftRealtimeSequence =
        typeof (left.message as any).__realtimeSequence === 'number'
          ? (left.message as any).__realtimeSequence
          : undefined
      const rightRealtimeSequence =
        typeof (right.message as any).__realtimeSequence === 'number'
          ? (right.message as any).__realtimeSequence
          : undefined
      if (
        leftRealtimeSequence !== undefined &&
        rightRealtimeSequence !== undefined &&
        leftRealtimeSequence !== rightRealtimeSequence
      ) {
        return leftRealtimeSequence - rightRealtimeSequence
      }

      return left.index - right.index
    })
    .map(({ message }) => message)
}

type MessageSearchMatch = {
  stableId: string
  messageIndex: number
}

type DisplayEntry = {
  message: ChatMessage
  sourceIndex: number
  attachedToolMessages: Array<ChatMessage>
}

function escapeAttributeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }

  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

type ChatMessageListProps = {
  messages: Array<ChatMessage>
  onRetryMessage?: (message: ChatMessage) => void
  onRefresh?: () => void | Promise<unknown>
  loading: boolean
  empty: boolean
  emptyState?: React.ReactNode
  notice?: React.ReactNode
  noticePosition?: 'start' | 'end'
  waitingForResponse: boolean
  sessionKey?: string
  pinToTop: boolean
  pinGroupMinHeight: number
  headerHeight: number
  contentStyle?: React.CSSProperties
  // Streaming support
  streamingMessageId?: string | null
  streamingText?: string
  streamingThinking?: string
  lifecycleEvents?: Array<{
    text: string
    emoji: string
    timestamp: number
    isError: boolean
  }>
  isStreaming?: boolean
  bottomOffset?: number | string
  activeToolCalls?: Array<{ id: string; name: string; phase: string }>
  liveToolActivity?: Array<{ name: string; timestamp: number }>
  researchCard?: UseResearchCardResult
  hideSystemMessages?: boolean
  isCompacting?: boolean
  /** True while the HTTP send request is in-flight (before waitingForResponse
   *  can confirm the server received it). Keeps the thinking indicator visible
   *  during the very first render after the user submits. */
  sending?: boolean
}

function ChatMessageListComponent({
  messages,
  onRetryMessage,
  onRefresh: _onRefresh,
  loading,
  empty,
  emptyState,
  notice,
  noticePosition = 'start',
  waitingForResponse,
  sessionKey,
  pinToTop,
  pinGroupMinHeight,
  headerHeight,
  contentStyle,
  streamingMessageId,
  streamingText,
  streamingThinking,
  lifecycleEvents = [],
  isStreaming = false,
  bottomOffset = 0,
  activeToolCalls = [],
  liveToolActivity = [],
  researchCard,
  hideSystemMessages = false,
  isCompacting = false,
  sending = false,
}: ChatMessageListProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const lastUserRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const prevSessionKeyRef = useRef<string | undefined>(sessionKey)
  const stickToBottomRef = useRef(true)
  const messageSignatureRef = useRef<Map<string, string>>(new Map())
  const initialRenderRef = useRef(true)
  const streamingTargetsClearRef = useRef<(() => void) | null>(null)
  const [streamingCleared, setStreamingCleared] = useState(0)
  streamingTargetsClearRef.current = () => setStreamingCleared((c) => c + 1)
  const lastScrollTopRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [expandAllToolSections, setExpandAllToolSections] = useState(false)

  // Bug 2 fix: grace period — keep thinking indicator alive briefly after
  // waitingForResponse clears so the response message has time to render.
  const [thinkingGrace, setThinkingGrace] = useState(false)
  const thinkingGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false)
  const [messageSearchValue, setMessageSearchValue] = useState('')
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })
  // Pull-to-refresh removed (was buggy on mobile)
  const [scrollMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const updateIsMobile = () => setIsMobileViewport(media.matches)
    updateIsMobile()
    media.addEventListener('change', updateIsMobile)
    return () => media.removeEventListener('change', updateIsMobile)
  }, [])

  // Bug 2 fix: refs used by grace-period effects (declared here so hooks run in
  // consistent order; actual logic is after displayMessages useMemo below).
  const prevWaitingRef = useRef(waitingForResponse)
  const assistantMessageCountRef = useRef(0)

  // Pull-to-refresh handlers removed

    // contentContainerStyle removed with pull-to-refresh

  const chatContentStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!isMobileViewport) return contentStyle
    return {
      ...contentStyle,
      paddingBottom:
        contentStyle?.paddingBottom ??
        'calc(var(--chat-composer-height, 56px) + var(--safe-b) + 8px)',
    }
  }, [contentStyle, isMobileViewport])

  // Simple scroll handler — only tracks if user is near bottom via refs (no state updates)
  const handleUserScroll = useCallback(function handleUserScroll(metrics: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }) {
    const distanceFromBottom =
      metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD
    const wasScrollingUp = metrics.scrollTop < lastScrollTopRef.current - 5
    lastScrollTopRef.current = metrics.scrollTop

    if (wasScrollingUp && !nearBottom) {
      stickToBottomRef.current = false
      isNearBottomRef.current = false
    } else if (nearBottom) {
      stickToBottomRef.current = true
      isNearBottomRef.current = true
    }
  }, [])

  // Simple scroll to bottom — find viewport and scroll
  const scrollToBottom = useCallback(function scrollToBottom(
    behavior: ScrollBehavior = 'auto',
  ) {
    const anchor = anchorRef.current
    if (!anchor) return
    const viewport = anchor.closest(
      '[data-chat-scroll-viewport]',
    )
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    }
  }, [])

  // Filter messages — toolResult handled by grouping into assistant bubble below
  const displayMessages = useMemo(() => {
    const filteredMessages = messages.filter((msg) => {
      // Hide tool messages — rendered as pills on the assistant message instead
      if (msg.role === 'tool') return false

      const cleanedText = textFromMessage(msg).trim()

      if (msg.role === 'assistant') {
        if (cleanedText === 'HEARTBEAT_OK') return false
        // Hide NO_REPLY messages (agent had nothing to say, or used message tool instead)
        if (cleanedText === 'NO_REPLY') return false
        // Hide truncated NO_REPLY variants (e.g. "NO_" or "NO")
        if (/^NO_?(?:REPLY)?$/i.test(cleanedText)) return false
        return true
      }

      if (msg.role === 'user') {
        const rawText = (Array.isArray(msg.content) ? msg.content : [])
          .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
          .join('')
          .trim()
        const hasAttachments =
          Array.isArray((msg as any).attachments) && (msg as any).attachments.length > 0
        const hasInlineImages =
          Array.isArray((msg as any).inlineImages) && (msg as any).inlineImages.length > 0
        const isPendingOptimisticUserMessage =
          typeof (msg as any).__optimisticId === 'string' ||
          msg.status === 'sending' ||
          msg.status === 'queued'

        // Keep optimistic/pending user messages visible for the whole response cycle,
        // even if the server hasn't echoed normalized text content back yet.
        if (cleanedText.length === 0 && !hasAttachments && !hasInlineImages) {
          if (!isPendingOptimisticUserMessage) return false
        }

        const isSystemPrefixed = /^System:/i.test(rawText)
        if (hideSystemMessages && isSystemPrefixed) return false
        if (hideSystemMessages && shouldHideSystemInjectedUserMessage(cleanedText)) {
          return false
        }
        if (!isSystemPrefixed) return true

        const normalizedText = cleanedText.toLowerCase()
        const containsSystemFailure =
          normalizedText.includes('exec failed') ||
          normalizedText.includes('serverrestart') ||
          normalizedText.includes('signal sigkill')
        const matchesHeartbeatPrompt =
          /read heartbeat\.md if it exists.*?reply heartbeat_ok\./is.test(
            cleanedText,
          )

        if (containsSystemFailure || matchesHeartbeatPrompt) return false
      }

      return true
    })

    const seenMessageIds = new Set<string>()
    const deduped = filteredMessages.filter((message) => {
      const messageId =
        (message as any).id ||
        (message as any).messageId ||
        (message as any).clientId ||
        (message as any).client_id ||
        (message as any).nonce ||
        (message as any).__optimisticId
      if (typeof messageId !== 'string' || messageId.trim().length === 0) {
        return true
      }
      const scopedId = `${message.role}:${messageId.trim()}`
      if (seenMessageIds.has(scopedId)) return false
      seenMessageIds.add(scopedId)
      return true
    })
    return sortMessagesChronologically(deduped)
  }, [hideSystemMessages, messages])

  const displayEntries = useMemo<Array<DisplayEntry>>(() => {
    const entries: Array<DisplayEntry> = []

    displayMessages.forEach((message, index) => {
      // Group both 'tool' and 'toolResult' roles into the preceding assistant bubble
      if (message.role === 'tool' || message.role === 'toolResult') {
        const previousEntry = entries[entries.length - 1]
        if (previousEntry?.message.role === 'assistant') {
          previousEntry.attachedToolMessages.push(message)
        }
        return
      }

      entries.push({
        message,
        sourceIndex: index,
        attachedToolMessages: [],
      })
    })

    return entries
  }, [displayMessages])

  // Bug 2 fix: grace-period effects — placed after displayMessages so they can
  // reference it safely.

  // Early-cancel grace when streaming text actually starts flowing — this is the
  // primary exit path (not the 10s ceiling timer). Ensures zero blank gap.
  useEffect(() => {
    if (thinkingGrace && streamingText && streamingText.trim().length > 0) {
      if (thinkingGraceTimerRef.current) {
        clearTimeout(thinkingGraceTimerRef.current)
        thinkingGraceTimerRef.current = null
      }
      setThinkingGrace(false)
    }
  }, [streamingText, thinkingGrace])

  useEffect(() => {
    const currentAssistantCount = displayEntries.filter(
      ({ message }) => message.role === 'assistant',
    ).length

    // Cancel grace period early when a new assistant message appears
    if (thinkingGrace && currentAssistantCount > assistantMessageCountRef.current) {
      if (thinkingGraceTimerRef.current) {
        clearTimeout(thinkingGraceTimerRef.current)
        thinkingGraceTimerRef.current = null
      }
      setThinkingGrace(false)
    }

    assistantMessageCountRef.current = currentAssistantCount
  }, [displayEntries, messages, thinkingGrace])

  useEffect(() => {
    const wasWaiting = prevWaitingRef.current
    prevWaitingRef.current = waitingForResponse

    if (wasWaiting && !waitingForResponse) {
      // Snapshot assistant count at the moment waiting cleared
      assistantMessageCountRef.current = displayEntries.filter(
        ({ message }) => message.role === 'assistant',
      ).length
      setThinkingGrace(true)
      if (thinkingGraceTimerRef.current) clearTimeout(thinkingGraceTimerRef.current)
      thinkingGraceTimerRef.current = setTimeout(() => {
        thinkingGraceTimerRef.current = null
        setThinkingGrace(false)
      }, THINKING_GRACE_PERIOD_MS)
    }

    return () => {
      if (thinkingGraceTimerRef.current) {
        clearTimeout(thinkingGraceTimerRef.current)
      }
    }
  }, [displayEntries, waitingForResponse]) // eslint-disable-line react-hooks/exhaustive-deps

  const normalizedMessageSearch = useMemo(
    function getNormalizedMessageSearch() {
      return messageSearchValue.trim().toLocaleLowerCase()
    },
    [messageSearchValue],
  )

  const isMessageSearchActive =
    isMessageSearchOpen && normalizedMessageSearch.length > 0

  const messageSearchMatches = useMemo<Array<MessageSearchMatch>>(
    function getMessageSearchMatches() {
      if (!isMessageSearchActive) return []

      const matches: Array<MessageSearchMatch> = []
      for (const [index, entry] of displayEntries.entries()) {
        const message = entry.message
        const messageText = textFromMessage(message).trim().toLocaleLowerCase()
        if (!messageText.includes(normalizedMessageSearch)) continue
        matches.push({
          stableId: getStableMessageId(message, entry.sourceIndex),
          messageIndex: index,
        })
      }
      return matches
    },
    [displayEntries, isMessageSearchActive, normalizedMessageSearch],
  )

  const messageSearchMatchIndexById = useMemo(
    function getMessageSearchMatchIndexById() {
      const indexById = new Map<string, number>()
      for (const [index, match] of messageSearchMatches.entries()) {
        indexById.set(match.stableId, index)
      }
      return indexById
    },
    [messageSearchMatches],
  )

  const activeSearchMatch = messageSearchMatches[activeSearchMatchIndex] ?? null

  const focusSearchInput = useCallback(function focusSearchInput() {
    window.requestAnimationFrame(function focusSearchInputField() {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const closeMessageSearch = useCallback(function closeMessageSearch() {
    setIsMessageSearchOpen(false)
    setMessageSearchValue('')
    setActiveSearchMatchIndex(0)
  }, [])

  const openMessageSearch = useCallback(
    function openMessageSearch() {
      setIsMessageSearchOpen(true)
      setActiveSearchMatchIndex(0)
      focusSearchInput()
    },
    [focusSearchInput],
  )

  const jumpToPreviousMatch = useCallback(
    function jumpToPreviousMatch() {
      if (messageSearchMatches.length === 0) return
      setActiveSearchMatchIndex(function setPreviousMatchIndex(currentIndex) {
        return (
          (currentIndex - 1 + messageSearchMatches.length) %
          messageSearchMatches.length
        )
      })
    },
    [messageSearchMatches.length],
  )

  const jumpToNextMatch = useCallback(
    function jumpToNextMatch() {
      if (messageSearchMatches.length === 0) return
      setActiveSearchMatchIndex(function setNextMatchIndex(currentIndex) {
        return (currentIndex + 1) % messageSearchMatches.length
      })
    },
    [messageSearchMatches.length],
  )

  const scrollToMessageById = useCallback(function scrollToMessageById(
    messageId: string,
    behavior: ScrollBehavior = 'smooth',
  ) {
    const anchor = anchorRef.current
    if (!anchor) return

    const viewport = anchor.closest(
      '[data-chat-scroll-viewport]',
    )
    if (!viewport) return

    const escapedMessageId = escapeAttributeSelector(messageId)
    const selector = `[data-chat-message-id="${escapedMessageId}"]`
    const target = viewport.querySelector(selector)
    if (!target) return

    stickToBottomRef.current = false
    isNearBottomRef.current = false
    setIsNearBottom(false)
    target.scrollIntoView({ behavior, block: 'center', inline: 'nearest' })
  }, [])

  const toolResultsByCallId = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const message of messages) {
      if (message.role !== 'toolResult') continue
      const toolCallId = message.toolCallId
      if (typeof toolCallId === 'string' && toolCallId.trim().length > 0) {
        map.set(toolCallId, message)
      }
    }
    return map
  }, [messages])

  const hasUserVisibleTextMessages = useMemo(() => {
    return displayEntries.some(({ message }) => {
      const role = message.role || 'assistant'
      if (role !== 'user' && role !== 'assistant') return false
      return textFromMessage(message).trim().length > 0
    })
  }, [displayEntries])

  const visibleEntries = useMemo<Array<DisplayEntry>>(
    function getVisibleEntries() {
      if (!isMessageSearchActive) return displayEntries

      return displayEntries.filter((entry) =>
        textFromMessage(entry.message)
          .trim()
          .toLocaleLowerCase()
          .includes(normalizedMessageSearch),
      )
    },
    [displayEntries, isMessageSearchActive, normalizedMessageSearch],
  )

  const toolInteractionCount = useMemo(() => {
    const seenToolCallIds = new Set<string>()
    let count = 0

    for (const message of messages) {
      const toolCalls = getToolCallsFromMessage(message)
      for (const toolCall of toolCalls) {
        const toolCallId = (toolCall.id || '').trim()
        if (toolCallId.length > 0) {
          if (seenToolCallIds.has(toolCallId)) continue
          seenToolCallIds.add(toolCallId)
        }
        count += 1
      }

      if (message.role !== 'toolResult') continue
      const toolCallId = (message.toolCallId || '').trim()
      if (toolCallId.length > 0 && seenToolCallIds.has(toolCallId)) continue
      if (toolCallId.length > 0) {
        seenToolCallIds.add(toolCallId)
      }
      count += 1
    }

    return count
  }, [messages])

  const showToolOnlyNotice =
    !isMessageSearchActive &&
    !loading &&
    !empty &&
    visibleEntries.length > 0 &&
    !hasUserVisibleTextMessages &&
    toolInteractionCount > 0

  const streamingState = useMemo(() => {
    const nextSignatures = new Map<string, string>()
    const isInitialRender = initialRenderRef.current

    displayEntries.forEach(({ message, sourceIndex }) => {
      const stableId = getStableMessageId(message, sourceIndex)
      const text = textFromMessage(message)
      const timestamp = getMessageTimestamp(message)
      const streamingStatus = message.__streamingStatus ?? 'idle'
      const signature = `${streamingStatus}:${timestamp}:${text.length}:${text.slice(-48)}`
      nextSignatures.set(stableId, signature)
    })

    messageSignatureRef.current = nextSignatures
    if (isInitialRender) {
      initialRenderRef.current = false
      return {
        streamingTargets: new Set<string>(),
        signatureById: nextSignatures,
      }
    }

    // Typewriter disabled — messages just fade in via CSS animation
    // toStream stays empty, no streaming targets

    return { streamingTargets: new Set<string>(), signatureById: nextSignatures }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayEntries, streamingCleared])

  const lastAssistantIndex = visibleEntries
    .filter(({ message }) => message.role === 'assistant')
    .map(({ sourceIndex }) => sourceIndex)
    .pop()
  const lastUserIndex = visibleEntries
    .map(({ message, sourceIndex }, index) => ({ message, sourceIndex, index }))
    .filter(({ message }) => message.role === 'user')
    .map(({ index }) => index)
    .pop()
  // Show typing indicator when waiting for response and no visible text yet.
  // Bug 2 fix: also show during grace period (thinkingGrace) so there's no
  // blank-space flash between waitingForResponse clearing and the response
  // message actually rendering.
  // Gap fix: also show whenever isStreaming=true but streamingText is still
  // empty — this covers ALL cases where the stream has started (SSE connected,
  // tool calls in flight OR just completed) but the first text chunk hasn't
  // arrived yet. Removing the old `activeToolCalls.length > 0` gate ensures
  // the indicator stays alive even after tool calls finish and before text flows.
  const showTypingIndicator = (() => {
    // sending covers the instant the HTTP request fires before waitingForResponse
    // is confirmed by the server (they're typically batched but this is belt+suspenders)
    const effectivelyWaiting = waitingForResponse || thinkingGrace || sending
    const hasInThreadStreamingActivity =
      isStreaming &&
      (
        activeToolCalls.length > 0 ||
        lifecycleEvents.length > 0 ||
        Boolean(streamingThinking && streamingThinking.trim().length > 0)
      )
    // Streaming-but-empty only needs the detached thinking bubble when the
    // in-thread streaming row has nothing to show yet.
    const streamingButEmpty =
      isStreaming &&
      (!streamingText || streamingText.trim().length === 0) &&
      !hasInThreadStreamingActivity
    if (isCompacting) return true
    if (streamingButEmpty) return true
    if (!effectivelyWaiting) return false
    // If streaming has visible text, hide indicator — response is rendering
    if (isStreaming && streamingText && streamingText.length > 0) return false
    const lastEntry = visibleEntries[visibleEntries.length - 1]
    const lastMessage = lastEntry?.message
    if (lastMessage && lastMessage.role === 'assistant') {
      const lastId = getStableMessageId(lastMessage, lastEntry.sourceIndex)
      const isBeingTypewritten = streamingState.streamingTargets.has(lastId)
      if (isBeingTypewritten) return false
      // If we're in grace period waiting for a NEW response, the last assistant
      // message is from the PREVIOUS turn — don't let its text hide the bubble.
      // Only suppress once we know this IS the new response (i.e. not waiting).
      if (thinkingGrace || waitingForResponse || sending) return true
      // Check if assistant message has visible text — if not, keep showing indicator
      const msgText = textFromMessage(lastMessage)
      if (!msgText || msgText.trim().length === 0) return true
      return false
    }
    return true
  })()

  const showResearchCard = Boolean(
    researchCard &&
      researchCard.steps.length > 0,
  )

  const shouldBottomPin =
    visibleEntries.length > 0 ||
    showToolOnlyNotice ||
    showResearchCard ||
    showTypingIndicator ||
    liveToolActivity.length > 0 ||
    (isStreaming && !streamingText) ||
    (isStreaming && activeToolCalls.length > 0)

  const normalizedStreamingToolCalls = useMemo<
    Array<{ id: string; name: string; phase: 'calling' | 'running' | 'done' | 'error' }>
  >(
    () =>
      activeToolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        phase:
          toolCall.phase === 'complete' || toolCall.phase === 'completed'
            ? 'done'
            : toolCall.phase === 'start'
              ? 'calling'
              : toolCall.phase === 'failed'
                ? 'error'
                : toolCall.phase === 'calling' || toolCall.phase === 'running'
                  ? toolCall.phase
                  : 'calling',
      })),
    [activeToolCalls],
  )

  // Pin the last user+assistant group without adding bottom padding.
  const groupStartIndex = typeof lastUserIndex === 'number' ? lastUserIndex : -1
  const hasGroup = pinToTop && groupStartIndex >= 0
  const shouldVirtualize = false // Disabled — causes scroll glitches

  const virtualRange = useMemo(() => {
    if (!shouldVirtualize || scrollMetrics.clientHeight <= 0) {
      return {
        startIndex: 0,
        endIndex: visibleEntries.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      }
    }

    const startIndex = Math.max(
      0,
      Math.floor(scrollMetrics.scrollTop / VIRTUAL_ROW_HEIGHT) -
        VIRTUAL_OVERSCAN,
    )
    const visibleCount = Math.ceil(
      scrollMetrics.clientHeight / VIRTUAL_ROW_HEIGHT,
    )
    const endIndex = Math.min(
      visibleEntries.length,
      startIndex + visibleCount + VIRTUAL_OVERSCAN * 2,
    )

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startIndex * VIRTUAL_ROW_HEIGHT,
      bottomSpacerHeight:
        (visibleEntries.length - endIndex) * VIRTUAL_ROW_HEIGHT,
    }
  }, [scrollMetrics, shouldVirtualize, visibleEntries.length])

  function isMessageStreaming(message: ChatMessage, index: number) {
    if (!isStreaming || !streamingMessageId) return false
    const messageId = message.__optimisticId || (message as any).id
    return (
      messageId === streamingMessageId ||
      (message.role === 'assistant' && index === lastAssistantIndex)
    )
  }

  function renderMessage(entry: DisplayEntry, entryIndex: number) {
    const chatMessage = entry.message
    const realIndex = entry.sourceIndex
    const messageIsStreaming = isMessageStreaming(chatMessage, realIndex)
    const stableId = getStableMessageId(chatMessage, realIndex)
    const signature = streamingState.signatureById.get(stableId)
    const simulateStreaming =
      !messageIsStreaming && streamingState.streamingTargets.has(stableId)
    const spacingClass = cn(
      getMessageSpacingClass(visibleEntries, entryIndex),
      getToolGroupClass(visibleEntries, entryIndex),
    )
    const forceActionsVisible =
      typeof lastAssistantIndex === 'number' && realIndex === lastAssistantIndex
    const hasToolCalls =
      chatMessage.role === 'assistant' &&
      (
        getToolCallsFromMessage(chatMessage).length > 0 ||
        entry.attachedToolMessages.length > 0
      )

    const searchMatchIndex = messageSearchMatchIndexById.get(stableId)
    const isSearchMatch = typeof searchMatchIndex === 'number'
    const isActiveMatch =
      isSearchMatch && searchMatchIndex === activeSearchMatchIndex

    // If this is a user message and an assistant reply exists after it,
    // the send obviously succeeded — never show Retry.
    const hasAssistantReply =
      chatMessage.role === 'user' &&
      entryIndex + 1 < visibleEntries.length &&
      visibleEntries[entryIndex + 1]?.message.role === 'assistant'
    const effectiveOnRetry = hasAssistantReply ? undefined : onRetryMessage

    // For the live streaming placeholder: wrap in a stable div whose key never
    // changes for the lifetime of the stream. The div's opacity toggles between
    // 0 (no text yet) and 1 (text flowing) without unmounting the inner
    // MessageItem — preserving its reveal-timer state so text streams word-by-word.
    // ThinkingBubble stays visible via `streamingButEmpty` in showTypingIndicator
    // while this wrapper is invisible.
    if (messageIsStreaming) {
      const hasStreamingActivity =
        activeToolCalls.length > 0 ||
        lifecycleEvents.length > 0 ||
        Boolean(streamingThinking && streamingThinking.trim().length > 0)
      const isEmptyPlaceholder =
        (!streamingText || streamingText.trim().length === 0) && !hasStreamingActivity
      return (
        <div
          key={stableId}
          style={{
            display: isEmptyPlaceholder ? 'none' : undefined,
            opacity: isEmptyPlaceholder ? 0 : 1,
            pointerEvents: isEmptyPlaceholder ? 'none' : undefined,
            transition: 'opacity 150ms ease',
          }}
          aria-hidden={isEmptyPlaceholder ? true : undefined}
        >
          <MessageItem
            message={chatMessage}
            attachedToolMessages={entry.attachedToolMessages}
            onRetryMessage={effectiveOnRetry}
            toolResultsByCallId={hasToolCalls ? toolResultsByCallId : undefined}
            forceActionsVisible={forceActionsVisible}
            wrapperClassName={spacingClass}
            wrapperDataMessageId={stableId}
            bubbleClassName={
              isActiveMatch
                ? 'ring-2 ring-amber-400 bg-amber-50/50'
                : isSearchMatch
                  ? 'bg-amber-50/30'
                  : undefined
            }
            toolCalls={messageIsStreaming ? normalizedStreamingToolCalls : undefined}
            isStreaming={messageIsStreaming}
            streamingText={streamingText}
            streamingThinking={messageIsStreaming ? streamingThinking : undefined}
            lifecycleEvents={messageIsStreaming ? lifecycleEvents : undefined}
            simulateStreaming={simulateStreaming}
            streamingKey={signature}
            expandAllToolSections={expandAllToolSections}
          />
        </div>
      )
    }

    return (
      <MessageItem
        key={stableId}
        message={chatMessage}
        attachedToolMessages={entry.attachedToolMessages}
        onRetryMessage={effectiveOnRetry}
        toolResultsByCallId={hasToolCalls ? toolResultsByCallId : undefined}
        forceActionsVisible={forceActionsVisible}
        wrapperClassName={spacingClass}
        wrapperDataMessageId={stableId}
        bubbleClassName={
          isActiveMatch
            ? 'ring-2 ring-amber-400 bg-amber-50/50'
            : isSearchMatch
              ? 'bg-amber-50/30'
              : undefined
        }
        toolCalls={messageIsStreaming ? normalizedStreamingToolCalls : undefined}
        isStreaming={messageIsStreaming}
        streamingText={messageIsStreaming ? streamingText : undefined}
        streamingThinking={messageIsStreaming ? streamingThinking : undefined}
        lifecycleEvents={messageIsStreaming ? lifecycleEvents : undefined}
        simulateStreaming={simulateStreaming}
        streamingKey={signature}
        expandAllToolSections={expandAllToolSections}
      />
    )
  }

  // Sync near-bottom ref to state every 500ms for button visibility
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIsNearBottom((prev) => {
        const current = isNearBottomRef.current
        return prev === current ? prev : current
      })
    }, 500)
    return () => window.clearInterval(timer)
  }, [])

  // Simple: scroll to bottom when messages change and we should stick
  useEffect(() => {
    if (loading) return
    let frameId: number | null = null
    const sessionChanged = prevSessionKeyRef.current !== sessionKey
    prevSessionKeyRef.current = sessionKey

    // Always scroll on session change (instant)
    if (sessionChanged) {
      stickToBottomRef.current = true
      frameId = window.requestAnimationFrame(() => scrollToBottom('auto'))
      return () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId)
      }
    }

    // Scroll to bottom only if the user is already near the bottom
    if (isNearBottomRef.current) {
      // Use smooth scroll only when user is near bottom (<200px) and new messages arrive;
      // use instant scroll during streaming to avoid choppiness.
      const behavior: ScrollBehavior = isNearBottomRef.current && !isStreaming ? 'smooth' : 'auto'
      frameId = window.requestAnimationFrame(() => scrollToBottom(behavior))
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [
    loading,
    visibleEntries.length,
    isStreaming,
    sessionKey,
    scrollToBottom,
    streamingText,
  ])

  useEffect(() => {
    setExpandAllToolSections(false)
  }, [sessionKey])

  useEffect(() => {
    if (!isMessageSearchOpen) return

    function handleSearchShortcuts(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (event.altKey) return

      const hasCommand = event.metaKey || event.ctrlKey
      if (hasCommand && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        openMessageSearch()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMessageSearch()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) {
          jumpToPreviousMatch()
          return
        }
        jumpToNextMatch()
        return
      }

      const isInputFocused = document.activeElement === searchInputRef.current
      if (!isInputFocused) return

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        jumpToPreviousMatch()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        jumpToNextMatch()
      }
    }

    window.addEventListener('keydown', handleSearchShortcuts, true)
    return () => {
      window.removeEventListener('keydown', handleSearchShortcuts, true)
    }
  }, [
    closeMessageSearch,
    isMessageSearchOpen,
    jumpToNextMatch,
    jumpToPreviousMatch,
    openMessageSearch,
  ])

  useEffect(() => {
    function handleOpenMessageSearch() {
      openMessageSearch()
    }

    window.addEventListener(
      CHAT_OPEN_MESSAGE_SEARCH_EVENT,
      handleOpenMessageSearch,
    )
    return () => {
      window.removeEventListener(
        CHAT_OPEN_MESSAGE_SEARCH_EVENT,
        handleOpenMessageSearch,
      )
    }
  }, [openMessageSearch])

  useEffect(() => {
    function handleOpenSearchShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== 'f') return

      event.preventDefault()
      event.stopPropagation()
      openMessageSearch()
    }

    window.addEventListener('keydown', handleOpenSearchShortcut, true)
    return () => {
      window.removeEventListener('keydown', handleOpenSearchShortcut, true)
    }
  }, [openMessageSearch])

  useEffect(() => {
    if (!isMessageSearchActive) {
      setActiveSearchMatchIndex(0)
      return
    }

    setActiveSearchMatchIndex(function clampActiveMatchIndex(currentIndex) {
      if (messageSearchMatches.length === 0) return 0
      return Math.min(currentIndex, messageSearchMatches.length - 1)
    })
  }, [isMessageSearchActive, messageSearchMatches.length])

  useEffect(() => {
    if (!activeSearchMatch) return

    const frameId = window.requestAnimationFrame(
      function scrollToActiveMatch() {
        scrollToMessageById(activeSearchMatch.stableId, 'smooth')
      },
    )

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [activeSearchMatch, scrollToMessageById])

  const handleScrollToBottom = useCallback(
    function handleScrollToBottom() {
      stickToBottomRef.current = true
      isNearBottomRef.current = true
      setIsNearBottom(true)
      setUnreadCount(0)
      // Haptic feedback on mobile scroll-to-bottom tap
      if (isMobileViewport) hapticTap()
      scrollToBottom('smooth')
    },
    [isMobileViewport, scrollToBottom],
  )

  const scrollToBottomOverlay = useMemo(() => {
    const isVisible = !isNearBottom && displayEntries.length > 0
    const hasVisibleEntries = visibleEntries.length > 0
    const overlayGap = isMobileViewport ? 8 : 24
    const overlayBottom =
      typeof bottomOffset === 'number'
        ? `${bottomOffset + overlayGap}px`
        : `calc(${bottomOffset} + ${overlayGap}px)`
    return (
      <div
        className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2"
        style={{ bottom: overlayBottom }}
      >
        <ScrollToBottomButton
          isVisible={isVisible && hasVisibleEntries}
          unreadCount={unreadCount}
          onClick={handleScrollToBottom}
        />
      </div>
    )
  }, [
    bottomOffset,
    displayEntries.length,
    handleScrollToBottom,
    visibleEntries.length,
    isMobileViewport,
    isNearBottom,
    unreadCount,
  ])

  return (
    // mt-2 is to fix the prompt-input cut off
    <>
    <ChatContainerRoot
      className="h-full flex-1 min-h-0"
      stickToBottom={stickToBottomRef.current}
      onUserScroll={handleUserScroll}
      overlay={scrollToBottomOverlay}
    >
      <div className="w-full">
        {isMessageSearchOpen && (
          <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-primary-200 bg-primary-50/95 px-3 py-2 backdrop-blur-sm">
            <input
              ref={searchInputRef}
              type="text"
              value={messageSearchValue}
              onChange={(e) => setMessageSearchValue(e.target.value)}
              placeholder="Search messages..."
              className="min-w-0 flex-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-sm text-primary-900 outline-none placeholder:text-primary-400 focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
            {isMessageSearchActive && (
              <span className="shrink-0 text-xs text-primary-500 dark:text-neutral-400">
                {messageSearchMatches.length > 0
                  ? `${activeSearchMatchIndex + 1} of ${messageSearchMatches.length}`
                  : 'No matches'}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={jumpToPreviousMatch}
                disabled={messageSearchMatches.length === 0}
                className="rounded p-1 text-primary-500 dark:text-neutral-400 hover:bg-primary-200 dark:hover:bg-primary-800 hover:text-primary-700 dark:hover:text-neutral-200 disabled:opacity-30"
                aria-label="Previous match"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 10l4-4 4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={jumpToNextMatch}
                disabled={messageSearchMatches.length === 0}
                className="rounded p-1 text-primary-500 dark:text-neutral-400 hover:bg-primary-200 dark:hover:bg-primary-800 hover:text-primary-700 dark:hover:text-neutral-200 disabled:opacity-30"
                aria-label="Next match"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={closeMessageSearch}
                className="rounded p-1 text-primary-500 dark:text-neutral-400 hover:bg-primary-200 dark:hover:bg-primary-800 hover:text-primary-700 dark:hover:text-neutral-200"
                aria-label="Close search"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
        <ChatContainerContent
          className="pt-2.5 md:pt-6 flex min-h-full flex-col"
          style={chatContentStyle}
        >
          {notice && noticePosition === 'start' ? notice : null}
          {shouldBottomPin ? <div className="flex-1" aria-hidden="true" /> : null}
          {showToolOnlyNotice ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <HugeiconsIcon
                    icon={Robot01Icon}
                    size={20}
                    strokeWidth={1.5}
                    className="mt-0.5 shrink-0 text-amber-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-800 text-balance">
                      This session contains{' '}
                      <span className="tabular-nums">{toolInteractionCount}</span>{' '}
                      tool interactions
                    </p>
                    <p className="mt-1 text-sm text-amber-700 text-pretty">
                      Most content is AI agent tool usage (file reads, code
                      execution, etc.)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandAllToolSections(true)}
                  disabled={expandAllToolSections}
                  className={cn(
                    'shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    expandAllToolSections
                      ? 'border-amber-300 bg-amber-100 text-amber-700 cursor-default'
                      : 'border-amber-300 bg-amber-100/80 text-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/30 hover:border-amber-400',
                  )}
                  aria-label={
                    expandAllToolSections
                      ? 'All tool sections expanded'
                      : 'Expand all tool sections'
                  }
                >
                  {expandAllToolSections ? '✓ Expanded' : 'Show All'}
                </button>
              </div>
            </div>
          ) : null}
          {loading && displayEntries.length === 0 ? (
            <div className="flex flex-col gap-4 animate-pulse">
              <div className="flex gap-3">
                <div className="size-6 rounded-full bg-primary-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-primary-200 rounded w-3/4" />
                  <div className="h-4 bg-primary-200 rounded w-1/2" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="size-6 rounded-full bg-primary-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-primary-200 rounded w-2/3" />
                  <div className="h-4 bg-primary-200 rounded w-5/6" />
                  <div className="h-4 bg-primary-200 rounded w-1/3" />
                </div>
              </div>
            </div>
          ) : empty && !notice && !isMessageSearchActive ? (
            (emptyState ?? <div aria-hidden></div>)
          ) : isMessageSearchActive && visibleEntries.length === 0 ? (
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-sm text-primary-600">
              No messages match “{messageSearchValue.trim()}”.
            </div>
          ) : hasGroup ? (
            <>
              {visibleEntries.slice(0, groupStartIndex).map(renderMessage)}
              {/* // Keep the last exchange pinned without extra tail gap. // Account
              for space-y-6 (24px) when pinning. */}
              <div
                className="my-2 flex flex-col gap-2 md:my-3 md:gap-3"
                style={{ minHeight: `${Math.max(0, pinGroupMinHeight - 12)}px` }}
              >
                {visibleEntries
                  .slice(groupStartIndex)
                  .map((entry, index) => {
                    const chatMessage = entry.message
                    const realIndex = entry.sourceIndex
                    const entryIndex = groupStartIndex + index
                    const messageIsStreaming = isMessageStreaming(
                      chatMessage,
                      realIndex,
                    )
                    const stableId = getStableMessageId(chatMessage, realIndex)
                    const signature = streamingState.signatureById.get(stableId)
                    const simulateStreaming =
                      !messageIsStreaming &&
                      streamingState.streamingTargets.has(stableId)
                    const forceActionsVisible =
                      typeof lastAssistantIndex === 'number' &&
                      realIndex === lastAssistantIndex
                    const wrapperRef =
                      entryIndex === lastUserIndex ? lastUserRef : undefined
                    const wrapperClassName = cn(
                      getMessageSpacingClass(visibleEntries, entryIndex),
                      getToolGroupClass(visibleEntries, entryIndex),
                      entryIndex === lastUserIndex ? 'scroll-mt-0' : '',
                    )
                    const wrapperScrollMarginTop =
                      entryIndex === lastUserIndex ? headerHeight : undefined
                    const hasToolCalls =
                      chatMessage.role === 'assistant' &&
                      (
                        getToolCallsFromMessage(chatMessage).length > 0 ||
                        entry.attachedToolMessages.length > 0
                      )
                    return (
                      <MessageItem
                        key={stableId}
                        message={chatMessage}
                        attachedToolMessages={entry.attachedToolMessages}
                        onRetryMessage={onRetryMessage}
                        toolResultsByCallId={
                          hasToolCalls ? toolResultsByCallId : undefined
                        }
                        forceActionsVisible={forceActionsVisible}
                        wrapperRef={wrapperRef}
                        wrapperClassName={wrapperClassName}
                        wrapperScrollMarginTop={wrapperScrollMarginTop}
                        isStreaming={messageIsStreaming}
                        streamingText={
                          messageIsStreaming ? streamingText : undefined
                        }
                        streamingThinking={
                          messageIsStreaming ? streamingThinking : undefined
                        }
                        lifecycleEvents={
                          messageIsStreaming ? lifecycleEvents : undefined
                        }
                        simulateStreaming={simulateStreaming}
                        streamingKey={signature}
                        expandAllToolSections={expandAllToolSections}
                        isLastAssistant={forceActionsVisible}
                      />
                    )
                  })}
              </div>
            </>
          ) : (
            <>
              {shouldVirtualize && virtualRange.topSpacerHeight > 0 ? (
                <div
                  aria-hidden="true"
                  style={{ height: `${virtualRange.topSpacerHeight}px` }}
                />
              ) : null}
              {visibleEntries
                .slice(virtualRange.startIndex, virtualRange.endIndex)
                .map((entry, index) =>
                  renderMessage(entry, virtualRange.startIndex + index),
                )}
              {shouldVirtualize && virtualRange.bottomSpacerHeight > 0 ? (
                <div
                  aria-hidden="true"
                  style={{ height: `${virtualRange.bottomSpacerHeight}px` }}
                />
              ) : null}
            </>
          )}
          {showTypingIndicator ||
          showResearchCard ||
          isCompacting ||
          liveToolActivity.length > 0 ||
          (isStreaming && !streamingText) ||
          (isStreaming && activeToolCalls.length > 0) ? (
            <div
              className="flex flex-col gap-1 py-1.5 px-1 animate-in fade-in duration-300 md:gap-1.5 md:py-2"
              role="status"
              aria-live="polite"
            >
              <ThinkingBubble
                activeToolCalls={activeToolCalls}
                liveToolActivity={liveToolActivity}
                researchCard={researchCard}
                isCompacting={isCompacting}
              />
            </div>
          ) : null}
          {notice && noticePosition === 'end' ? notice : null}
          <ChatContainerScrollAnchor ref={anchorRef} />
        </ChatContainerContent>
      </div>
    </ChatContainerRoot>
    </>
  )
}

function getMessageSpacingClass(
  messages: Array<ChatMessage>,
  index: number,
): string {
  if (index === 0) return 'mt-0'
  const currentRole = messages[index]?.role ?? 'assistant'
  const previousRole = messages[index - 1]?.role ?? 'assistant'
  if (currentRole === previousRole) {
    return 'mt-1 md:mt-1.5'
  }
  if (currentRole === 'assistant') {
    return 'mt-2 md:mt-2.5'
  }
  return 'mt-2 md:mt-2.5'
}

function getToolGroupClass(
  messages: Array<ChatMessage>,
  index: number,
): string {
  const message = messages[index]
  if (!message || message.role !== 'assistant') return ''
  const hasToolCalls = getToolCallsFromMessage(message).length > 0
  if (!hasToolCalls) return ''

  let previousUserIndex = -1
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      previousUserIndex = i
      break
    }
  }

  let nextUserIndex = -1
  for (let i = index + 1; i < messages.length; i += 1) {
    if (messages[i]?.role === 'user') {
      nextUserIndex = i
      break
    }
  }

  if (previousUserIndex === -1 || nextUserIndex === -1) return ''
  return 'border-l border-primary-200/70 pl-3'
}

function getStableMessageId(message: ChatMessage, index: number): string {
  if (message.__optimisticId) return message.__optimisticId

  const idCandidates = ['id', 'messageId', 'uuid', 'clientId'] as const
  for (const key of idCandidates) {
    const value = (message as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  const timestamp = getRawMessageTimestamp(message)
  if (timestamp) {
    return `${message.role ?? 'assistant'}-${timestamp}-${index}`
  }

  return `${message.role ?? 'assistant'}-${index}`
}

function getRawMessageTimestamp(message: ChatMessage): number | null {
  const candidates = [
    (message as any).createdAt,
    (message as any).created_at,
    (message as any).timestamp,
    (message as any).time,
    (message as any).ts,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      if (candidate < 1_000_000_000_000) return candidate * 1000
      return candidate
    }
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return null
}

function areChatMessageListEqual(
  prev: ChatMessageListProps,
  next: ChatMessageListProps,
) {
  return (
    prev.messages === next.messages &&
    prev.onRetryMessage === next.onRetryMessage &&
    prev.onRefresh === next.onRefresh &&
    prev.loading === next.loading &&
    prev.empty === next.empty &&
    prev.emptyState === next.emptyState &&
    prev.notice === next.notice &&
    prev.noticePosition === next.noticePosition &&
    prev.waitingForResponse === next.waitingForResponse &&
    prev.sessionKey === next.sessionKey &&
    prev.pinToTop === next.pinToTop &&
    prev.pinGroupMinHeight === next.pinGroupMinHeight &&
    prev.headerHeight === next.headerHeight &&
    prev.contentStyle === next.contentStyle &&
    prev.streamingMessageId === next.streamingMessageId &&
    prev.streamingText === next.streamingText &&
    prev.streamingThinking === next.streamingThinking &&
    prev.lifecycleEvents === next.lifecycleEvents &&
    prev.isStreaming === next.isStreaming &&
    prev.bottomOffset === next.bottomOffset &&
    prev.activeToolCalls === next.activeToolCalls &&
    prev.liveToolActivity === next.liveToolActivity &&
    prev.researchCard === next.researchCard &&
    prev.hideSystemMessages === next.hideSystemMessages &&
    prev.sending === next.sending
  )
}

const MemoizedChatMessageList = memo(
  ChatMessageListComponent,
  areChatMessageListEqual,
)

export { MemoizedChatMessageList as ChatMessageList }
