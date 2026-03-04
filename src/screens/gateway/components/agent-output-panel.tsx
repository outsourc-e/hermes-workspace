import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/prompt-kit/markdown'
import type { HubTask } from './task-board'
import { InlineApprovalCard } from './inline-approval-card'
import type { ApprovalRequest } from '../lib/approvals-store'

type OutputMessage = {
  role: 'assistant' | 'user' | 'tool'
  content: string
  timestamp: number
  done?: boolean
}

type SessionOutputCacheEntry = {
  messages: OutputMessage[]
  sessionEnded: boolean
  tokenCount: number
}

const MAX_CACHED_MESSAGES = 200
const sessionOutputCache = new Map<string, SessionOutputCacheEntry>()

export type AgentOutputPanelProps = {
  agentName: string
  sessionKey: string | null
  tasks: HubTask[]
  onClose: () => void
  onLine?: (line: string) => void
  /** Model preset id — shown in header badge e.g. 'pc1-coder', 'sonnet' */
  modelId?: string
  /** Optional runtime status label shown in the header badge. */
  statusLabel?: string
  /** Compact mode: no outer border/padding and no internal header. Use inside LiveActivityPanel. */
  compact?: boolean
  /**
   * When true, skip opening an internal SSE connection.
   * The parent component manages the SSE stream to avoid duplicate connections
   * (triple-subscribe regression). Messages are fed via the shared state instead.
   */
  externalStream?: boolean
  /**
   * Pre-captured output lines from the parent's SSE stream.
   * When provided (and non-empty), these are rendered directly instead of
   * the internal `messages` state. This is the Option A fix for the live
   * output panel — the parent already has the data, just pass it down.
   */
  outputLines?: string[]
  /** Enable inline message input at the bottom of the output panel */
  enableMessaging?: boolean
  /** Callback when user sends a message to this agent */
  onSendMessage?: (sessionKey: string, message: string) => void
  /** Pending approval requests for this agent — shown as inline cards */
  approvals?: ApprovalRequest[]
  /** Called when user approves an inline request */
  onApprove?: (id: string) => void
  /** Called when user denies an inline request */
  onDeny?: (id: string) => void
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSsePayload(raw: string): Record<string, unknown> | null {
  try {
    return toRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

function payloadMatchesSession(
  payload: Record<string, unknown> | null,
  sessionKey: string,
): boolean {
  if (!payload) return false
  const payloadSessionKey = readString(payload.sessionKey)
  return !payloadSessionKey || payloadSessionKey === sessionKey
}

// Strip DeepSeek-R1 <think>...</think> reasoning blocks from displayed content.
// Applied at render time only — raw content is preserved in state for streaming continuity.
function stripThinkBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trimStart()
}

/** Format a timestamp to HH:MM:SS for terminal-style display */
function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncateArgs(args: unknown, maxLength = 80): string {
  let raw = ''
  if (typeof args === 'string') {
    raw = args
  } else {
    try {
      raw = JSON.stringify(args)
    } catch {
      raw = ''
    }
  }
  if (!raw || raw === '{}' || raw === 'undefined') return ''
  if (raw.length <= maxLength) return raw
  return `${raw.slice(0, maxLength - 1)}…`
}

function extractTextFromMessage(message: unknown): string {
  const row = toRecord(message)
  if (!row) return ''

  const direct = readString(row.text) || readString(row.content)
  if (direct) return direct

  const content = row.content
  if (!Array.isArray(content)) return ''

  return content
    .map((block) => {
      const item = toRecord(block)
      if (!item) return ''
      if (readString(item.type) !== 'text') return ''
      return readString(item.text)
    })
    .filter(Boolean)
    .join('')
}

function readEventText(payload: Record<string, unknown>): string {
  return (
    readString(payload.text) ||
    readString(payload.content) ||
    readString(payload.chunk) ||
    extractTextFromMessage(payload.message)
  )
}

function readEventRole(payload: Record<string, unknown>): 'assistant' | 'user' | '' {
  const direct = readString(payload.role).toLowerCase()
  if (direct === 'assistant' || direct === 'user') {
    return direct
  }

  const message = toRecord(payload.message)
  const nested = readString(message?.role).toLowerCase()
  if (nested === 'assistant' || nested === 'user') {
    return nested
  }
  return ''
}

function upsertAssistantStream(
  previous: OutputMessage[],
  text: string,
  replace: boolean,
): OutputMessage[] {
  const last = previous[previous.length - 1]
  if (last && last.role === 'assistant' && !last.done) {
    return [
      ...previous.slice(0, -1),
      { ...last, content: replace ? text : `${last.content}${text}` },
    ]
  }
  return [...previous, { role: 'assistant', content: text, timestamp: Date.now() }]
}

function appendAssistantMessage(previous: OutputMessage[], text: string): OutputMessage[] {
  const last = previous[previous.length - 1]
  if (last && last.role === 'assistant' && !last.done) {
    // Always finalize the last in-progress assistant message with the complete text.
    // This handles providers (e.g. Gemini via OpenRouter) that emit both streaming
    // chunks AND a final 'message' event — we update in place rather than appending.
    return [
      ...previous.slice(0, -1),
      { ...last, content: text, done: true },
    ]
  }
  // Check recent messages for exact duplicate content (guards against SSE replay on reconnect)
  const tail = previous.slice(-10)
  if (tail.some((msg) => msg.role === 'assistant' && msg.content === text)) return previous
  return [...previous, { role: 'assistant', content: text, timestamp: Date.now(), done: true }]
}

function trimMessages(messages: OutputMessage[]): OutputMessage[] {
  if (messages.length <= MAX_CACHED_MESSAGES) return messages
  return messages.slice(-MAX_CACHED_MESSAGES)
}

function appendBoundedMessage(previous: OutputMessage[], message: OutputMessage): OutputMessage[] {
  // Deduplicate: skip if an identical role+content message exists in the recent tail
  const tail = previous.slice(-10)
  if (tail.some((msg) => msg.role === message.role && msg.content === message.content)) {
    return previous
  }
  return [...trimMessages(previous), message].slice(-MAX_CACHED_MESSAGES)
}

function readCachedSessionState(sessionKey: string | null): SessionOutputCacheEntry | null {
  if (!sessionKey) return null
  return sessionOutputCache.get(sessionKey) ?? null
}

export function AgentOutputPanel({
  agentName,
  sessionKey,
  tasks,
  onClose,
  onLine,
  modelId,
  statusLabel,
  compact = false,
  externalStream = false,
  outputLines,
  enableMessaging = false,
  onSendMessage,
  approvals,
  onApprove,
  onDeny,
}: AgentOutputPanelProps) {
  const [messageInput, setMessageInput] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const cachedInitial = readCachedSessionState(sessionKey)
  const [messages, setMessages] = useState<OutputMessage[]>(cachedInitial?.messages ?? [])
  const [sessionEnded, setSessionEnded] = useState(cachedInitial?.sessionEnded ?? false)
  const [tokenCount, setTokenCount] = useState(cachedInitial?.tokenCount ?? 0)
  const [streamDisconnected, setStreamDisconnected] = useState(false)
  const [streamReconnectNonce, setStreamReconnectNonce] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Hydrate state when sessionKey changes
  useEffect(() => {
    const cached = readCachedSessionState(sessionKey)
    setMessages(cached?.messages ?? [])
    setSessionEnded(cached?.sessionEnded ?? false)
    setTokenCount(cached?.tokenCount ?? 0)
    setStreamDisconnected(false)
  }, [sessionKey])

  // Persist state to in-memory cache, bounded by message count.
  useEffect(() => {
    if (!sessionKey) return
    const boundedMessages = trimMessages(messages)
    if (boundedMessages !== messages) {
      setMessages(boundedMessages)
      return
    }
    sessionOutputCache.set(sessionKey, {
      messages: boundedMessages,
      sessionEnded,
      tokenCount,
    })
  }, [messages, sessionEnded, sessionKey, tokenCount])

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const streamStatus = sessionEnded
    ? 'Completed'
    : streamDisconnected
      ? 'Disconnected'
      : sessionKey
        ? 'Streaming'
        : 'Idle'
  const headerStatus = statusLabel || streamStatus
  const handleReconnect = useCallback(() => {
    setStreamDisconnected(false)
    setStreamReconnectNonce((n) => n + 1)
  }, [])

  // SSE stream consumption — skip when parent manages the stream (externalStream)
  useEffect(() => {
    if (!sessionKey || externalStream) return

    const source = new EventSource(`/api/chat-events?sessionKey=${encodeURIComponent(sessionKey)}`)
    source.onopen = () => {
      setStreamDisconnected(false)
    }
    source.onerror = () => {
      setStreamDisconnected(true)
    }

    // 'chunk' — streaming text from assistant
    source.addEventListener('chunk', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const text = readEventText(payload)
      if (!text) return
      const fullReplace = payload.fullReplace === true

      // Approximate token count: ~4 chars per token
      if (!fullReplace) {
        setTokenCount((n) => n + Math.ceil(text.length / 4))
      }

      setMessages((prev) => trimMessages(upsertAssistantStream(prev, text, fullReplace)))
      onLine?.(text)
    })

    // 'tool' — tool call event
    source.addEventListener('tool', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const name = readString(payload.name) || 'tool'
      const args = payload.args ?? payload.input ?? payload.parameters
      const argsStr = truncateArgs(args)
      const content = argsStr ? `${name}(${argsStr})` : `${name}()`
      setMessages((prev) =>
        appendBoundedMessage(prev, { role: 'tool', content, timestamp: Date.now() }),
      )
    })

    // 'done' — session/run completed: add status marker
    source.addEventListener('done', (event) => {
      let doneLabel = 'Session ended'
      if (event instanceof MessageEvent) {
        const payload = parseSsePayload(event.data as string)
        if (!payload) return
        if (!payloadMatchesSession(payload, sessionKey)) return
        const state = readString(payload?.state).toLowerCase()
        const error = readString(payload?.errorMessage)
        if (state === 'error') {
          doneLabel = error ? `Session ended with error: ${error}` : 'Session ended with error'
        } else if (state === 'aborted') {
          doneLabel = 'Session aborted'
        }
      }
      setSessionEnded(true)
      setStreamDisconnected(false)
      setMessages((prev) =>
        appendBoundedMessage(prev, {
          role: 'assistant',
          content: doneLabel,
          timestamp: Date.now(),
          done: true,
        }),
      )
    })

    // 'user_message' — user turn sent to the agent
    source.addEventListener('user_message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const text = readEventText(payload)
      if (!text) return
      setMessages((prev) =>
        appendBoundedMessage(prev, { role: 'user', content: text, timestamp: Date.now() }),
      )
    })

    // 'message' — final/standalone message payload from gateway
    source.addEventListener('message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data as string)
      if (!payload) return
      if (!payloadMatchesSession(payload, sessionKey)) return
      const role = readEventRole(payload)
      const text = readEventText(payload)
      if (!text) return
      if (role === 'user') {
        setMessages((prev) =>
          appendBoundedMessage(prev, { role: 'user', content: text, timestamp: Date.now() }),
        )
        return
      }
      setMessages((prev) => trimMessages(appendAssistantMessage(prev, text)))
      onLine?.(text)
    })

    return () => {
      source.close()
    }
  }, [onLine, sessionKey, streamReconnectNonce, externalStream])

  const inner = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Task list */}
      {tasks.length > 0 && (
        <div className={cn('space-y-1.5', compact ? 'mb-2' : 'mb-3')}>
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                'rounded-lg px-3 py-2',
                compact
                  ? 'border border-[var(--theme-border)] bg-[var(--theme-card2)]'
                  : 'border border-[var(--theme-border)] bg-[var(--theme-card)]',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'size-1.5 rounded-full',
                  task.status === 'done' ? 'bg-emerald-500' : task.status === 'in_progress' ? 'bg-blue-500 animate-pulse' : 'bg-neutral-500',
                )} />
                <span className={cn('text-xs font-medium', compact ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text)]')}>
                  {task.title}
                </span>
              </div>
              <p className={cn('mt-1 text-[10px]', compact ? 'text-[var(--theme-muted)]' : 'text-[var(--theme-muted)]')}>
                {task.status === 'in_progress'
                  ? 'Working...'
                  : task.status === 'done'
                    ? '✓ Completed'
                    : 'Queued'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Terminal output */}
      {sessionKey && streamDisconnected && !sessionEnded ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400">
          <span>Stream disconnected</span>
          <button
            type="button"
            onClick={handleReconnect}
            className="rounded border border-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-600 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            Reconnect
          </button>
        </div>
      ) : null}
      {sessionKey ? (
        <div
          ref={scrollRef}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto p-3 font-mono',
            compact
              ? 'min-h-0 flex-1 rounded-lg bg-[var(--theme-card2)] text-[11px] leading-relaxed text-[var(--theme-text)]'
              : 'mt-1 min-h-[300px] flex-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] text-sm leading-6 text-[var(--theme-text)]',
          )}
        >
          {/* Option A: render parent-captured output lines directly when available */}
          {outputLines && outputLines.length > 0 ? (
            <>
              {outputLines.map((line, index) => (
                <div key={index} className="my-1">
                  <Markdown className="text-sm leading-6 text-[var(--theme-text)] [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2 [&_pre]:bg-[var(--theme-card2)] [&_pre]:border-[var(--theme-border)] [&_code]:text-emerald-600 dark:[&_code]:text-emerald-300">
                    {stripThinkBlocks(line)}
                  </Markdown>
                </div>
              ))}
              <span className="animate-pulse text-emerald-600 dark:text-emerald-400">▊</span>
            </>
          ) : messages.length === 0 && !sessionEnded ? (
            <p className="animate-pulse text-[var(--theme-muted)]">Waiting for response…</p>
          ) : (
            <>
              {[...messages].sort((a, b) => a.timestamp - b.timestamp).map((msg, index) =>
                msg.role === 'tool' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="mb-1 rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-1 font-mono text-xs leading-5 text-[var(--theme-muted)]"
                  >
                    <span className="text-[var(--theme-muted)] mr-2 text-[10px] tabular-nums opacity-60">{formatTimestamp(msg.timestamp)}</span>
                    <span className="text-[var(--theme-muted)] opacity-70">▶ </span>
                    {msg.content}
                  </div>
                ) : msg.role === 'user' ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="my-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-900 dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-200"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">You</span>
                      <span className="text-[10px] text-[var(--theme-muted)] tabular-nums">{formatTimestamp(msg.timestamp)}</span>
                    </div>
                    <Markdown className="text-sm leading-6 text-blue-800 dark:text-blue-100 [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2">
                      {msg.content}
                    </Markdown>
                  </div>
                ) : msg.done ? (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="mt-2 border-t border-[var(--theme-border)] pt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 font-mono"
                  >
                    <span className="text-[var(--theme-muted)] mr-2 text-[10px] tabular-nums">{formatTimestamp(msg.timestamp)}</span>
                    {msg.content}
                  </div>
                ) : (
                  <div
                    key={`${msg.timestamp}-${index}`}
                    className="my-2"
                  >
                    <span className="text-[var(--theme-muted)] text-[10px] font-mono tabular-nums block mb-0.5">{formatTimestamp(msg.timestamp)}</span>
                    <Markdown className="text-sm leading-6 text-[var(--theme-text)] [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2 [&_pre]:bg-[var(--theme-card2)] [&_pre]:border-[var(--theme-border)] [&_code]:text-emerald-600 dark:[&_code]:text-emerald-300">
                      {stripThinkBlocks(msg.content)}
                    </Markdown>
                  </div>
                ),
              )}
              {!sessionEnded && messages.length > 0 && (
                <span className="animate-pulse text-emerald-600 dark:text-emerald-400">▊</span>
              )}
            </>
          )}
        </div>
      ) : (
        // Fallback placeholder when no sessionKey
        <div className={cn('min-h-0 flex-1 overflow-y-auto rounded-lg bg-[var(--theme-card2)] p-3 font-mono text-sm leading-6 text-[var(--theme-text)]', compact ? 'min-h-0 flex-1 overflow-y-auto' : 'mt-1 min-h-[300px]')}>
          {tasks.length === 0 ? (
            <p className="text-[var(--theme-muted)]">No dispatched tasks yet.</p>
          ) : (
            <>
              <p className="text-[var(--theme-muted)]">$ Dispatching to {agentName}…</p>
              <p className="animate-pulse text-emerald-600 dark:text-emerald-400">▊</p>
            </>
          )}
        </div>
      )}

      {/* Inline approval cards */}
      {approvals && approvals.length > 0 && (
        <div className="mt-2 space-y-2">
          {approvals.map((approval) => (
            <InlineApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={onApprove ?? (() => {})}
              onDeny={onDeny ?? (() => {})}
            />
          ))}
        </div>
      )}

      {/* Inline message input */}
      {enableMessaging && sessionKey && !sessionEnded && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const text = messageInput.trim()
            if (!text || !sessionKey || sendingMessage) return
            setSendingMessage(true)
            setMessageInput('')
            // Add user message to local display immediately
            setMessages((prev) => [
              ...prev,
              { role: 'user', content: text, timestamp: Date.now() },
            ])
            // Clear sessionEnded so we show the streaming cursor again
            setSessionEnded(false)
            if (onSendMessage) {
              onSendMessage(sessionKey, text)
            } else {
              fetch('/api/sessions/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sessionKey, message: text }),
              }).catch(() => { /* best effort */ })
            }
            setSendingMessage(false)
            messageInputRef.current?.focus()
          }}
        >
          <input
            ref={messageInputRef}
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Message ${agentName}...`}
            disabled={sendingMessage}
            className="flex-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!messageInput.trim() || sendingMessage}
            className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col p-3">
        {inner}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {agentName}
          </h3>
          {modelId ? (
            <span className="shrink-0 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--theme-muted)]">
              {modelId}
            </span>
          ) : null}
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              headerStatus === 'Completed'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : headerStatus === 'Disconnected'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                : headerStatus === 'Streaming'
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)]',
            )}
          >
            {headerStatus}
          </span>
          {tokenCount > 0 ? (
            <span className="shrink-0 font-mono text-[10px] text-[var(--theme-muted)] tabular-nums">
              ~{tokenCount.toLocaleString()} tok
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--theme-border)] text-sm text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
          aria-label="Close agent output"
        >
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {inner}
      </div>
    </div>
  )
}
