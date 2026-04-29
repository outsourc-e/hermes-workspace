'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  Clock01Icon,
  SentIcon,
} from '@hugeicons/core-free-icons'
import { useQueryClient } from '@tanstack/react-query'
import { ChatComposer } from '@/screens/chat/components/chat-composer'
import { cn } from '@/lib/utils'
import { useSwarmChat, type SwarmChatMessage } from '@/hooks/use-swarm-chat'

type Swarm2LiveChatProps = {
  workerId: string
  className?: string
  preview?: boolean
  previewLimit?: number
  nativeStyle?: boolean
}

function formatMessageTime(ts: number | null | undefined): string {
  if (!ts) return ''
  const millis = ts < 1e12 ? ts * 1000 : ts
  const date = new Date(millis)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
  if (sameDay) return time
  const shortDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
  return `${shortDate} ${time}`
}

function parseTodoSummary(content: string): { total: number; pending: number; inProgress: number; completed: number; cancelled: number } | null {
  try {
    const parsed = JSON.parse(content) as {
      todos?: unknown[]
      summary?: {
        total?: number
        pending?: number
        in_progress?: number
        completed?: number
        cancelled?: number
      }
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.summary) return null
    return {
      total: parsed.summary.total ?? 0,
      pending: parsed.summary.pending ?? 0,
      inProgress: parsed.summary.in_progress ?? 0,
      completed: parsed.summary.completed ?? 0,
      cancelled: parsed.summary.cancelled ?? 0,
    }
  } catch {
    return null
  }
}

function parseToolMarker(content: string): string | null {
  const match = content.trim().match(/^\[tool:([^\]]+)\]$/i)
  return match?.[1]?.trim() ?? null
}

function MessageBubble({
  workerId,
  message,
  nativeStyle = false,
}: {
  workerId: string
  message: SwarmChatMessage
  nativeStyle?: boolean
}) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isTool = message.role === 'tool'
  const isError = message.role === 'error'
  const label = isUser
    ? 'You'
    : isAssistant
      ? workerId
      : isTool
        ? 'tool'
        : message.role
  const todoSummary = parseTodoSummary(message.content)
  const toolMarker = parseToolMarker(message.content)
  const renderAsToolCard = isTool || Boolean(toolMarker)

  return (
    <div
      className={cn(
        'w-full',
        nativeStyle && isUser ? 'flex justify-end' : 'flex justify-start',
      )}
    >
      <div
        className={cn(
          nativeStyle
            ? 'rounded-2xl border px-3 py-2 text-[12px] leading-relaxed shadow-sm'
            : 'rounded-xl border px-2.5 py-1.5 text-[12px] leading-relaxed',
          nativeStyle && (isUser ? 'max-w-[72%]' : 'max-w-[92%]'),
          isUser &&
            'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)]',
          isAssistant &&
            'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-text)]',
          renderAsToolCard &&
            'border-[var(--theme-border)] bg-[color:rgba(255,255,255,0.03)] text-[var(--theme-muted-2)]',
          isError && 'border-red-400/40 bg-red-500/10 text-red-200',
          message.pending && 'opacity-80',
        )}
      >
      <div className={cn(
        'mb-0.5 flex items-center justify-between gap-2 text-[9px] text-[var(--theme-muted)]',
        nativeStyle ? 'font-medium tracking-normal' : 'font-semibold uppercase tracking-[0.16em]',
      )}>
        {nativeStyle ? (
          <span className="inline-flex items-center gap-1">
            {isError ? (
              <HugeiconsIcon icon={AlertCircleIcon} size={9} />
            ) : null}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {isError ? (
              <HugeiconsIcon icon={AlertCircleIcon} size={9} />
            ) : null}
            {renderAsToolCard ? 'tool' : label}
          </span>
        )}
        {message.timestamp && !message.pending ? (
          <span className="inline-flex items-center gap-1 text-[9px] text-[var(--theme-muted)]/80">
            <HugeiconsIcon icon={Clock01Icon} size={9} />
            {formatMessageTime(message.timestamp)}
          </span>
        ) : null}
      </div>
        {todoSummary ? (
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-[var(--theme-text)]">Task snapshot</div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-[var(--theme-muted-2)]">
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">{todoSummary.total} total</span>
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">{todoSummary.pending} pending</span>
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">{todoSummary.inProgress} in progress</span>
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">{todoSummary.completed} completed</span>
              {todoSummary.cancelled > 0 ? (
                <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">{todoSummary.cancelled} cancelled</span>
              ) : null}
            </div>
          </div>
        ) : renderAsToolCard ? (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-[var(--theme-text)]">
              {toolMarker ? `Used ${toolMarker}` : 'Tool result'}
            </div>
            {!toolMarker && message.content ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-snug text-[var(--theme-muted-2)]">
                {message.content}
              </pre>
            ) : null}
          </div>
        ) : (
          <pre className={cn(
            'whitespace-pre-wrap break-words font-sans text-[12px] leading-snug',
            message.pending && isAssistant && 'animate-pulse',
          )}>
            {message.content || '(empty)'}
          </pre>
        )}
      </div>
    </div>
  )
}

export function Swarm2LiveChat({
  workerId,
  className,
  preview = false,
  previewLimit = 4,
  nativeStyle = false,
}: Swarm2LiveChatProps) {
  const queryClient = useQueryClient()
  const {
    messages,
    isLoading,
    isFetching,
    sendMessage,
    isSending,
    error,
    sendError,
    sessionId,
    sessionTitle,
    source,
  } = useSwarmChat({ workerId, limit: 30, enabled: Boolean(workerId) })
  const [draft, setDraft] = useState('')
  const [localPending, setLocalPending] = useState<{
    prompt: string
    sentAt: number
    baselineLastId: string | null
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Active poll while a send is pending; pushes fresh data into the shared query cache.
  useEffect(() => {
    if (!localPending || !workerId) return
    let cancelled = false
    const startedAt = Date.now()
    const queryKey = ['swarm', 'chat', workerId, 30] as const
    async function poll() {
      try {
        const res = await fetch(`/api/swarm-chat?workerId=${encodeURIComponent(workerId)}&limit=30`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        queryClient.setQueryData(queryKey, data)
      } catch {
        /* keep optimistic state */
      }
    }
    void poll()
    const interval = window.setInterval(() => {
      if (Date.now() - startedAt > 120_000) {
        window.clearInterval(interval)
        return
      }
      void poll()
    }, 1_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [localPending, workerId, queryClient])

  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [preview, nativeStyle, workerId])

  // Determine whether we have a new assistant reply since the moment we sent.
  // Single source of truth: state.db `messages` array, anchored by baselineLastId.
  const pendingState = useMemo(() => {
    if (!localPending) return { hasUserEcho: false, hasAssistantReply: false }
    const baselineId = localPending.baselineLastId
    const baselineIndex = baselineId
      ? messages.findIndex((m) => m.id === baselineId)
      : -1
    const newSlice = baselineIndex >= 0 ? messages.slice(baselineIndex + 1) : messages
    const prompt = localPending.prompt.trim()
    const hasUserEcho = newSlice.some((m) =>
      m.role === 'user' && (
        m.content.trim() === prompt ||
        m.content.includes(prompt) ||
        prompt.includes(m.content.trim())
      ),
    )
    const hasAssistantReply = newSlice.some((m) => m.role === 'assistant')
    return { hasUserEcho, hasAssistantReply }
  }, [messages, localPending])

  const renderedMessages = useMemo(() => {
    if (!localPending) return messages
    const extra: Array<SwarmChatMessage> = []
    if (!pendingState.hasUserEcho) {
      extra.push({
        id: `local-user-${localPending.sentAt}`,
        role: 'user',
        content: localPending.prompt,
        timestamp: localPending.sentAt,
        origin: 'optimistic',
        pending: true,
      })
    }
    if (!pendingState.hasAssistantReply) {
      extra.push({
        id: `local-assistant-${localPending.sentAt}`,
        role: 'assistant',
        content: 'Thinking…',
        timestamp: localPending.sentAt,
        origin: 'optimistic',
        pending: true,
      })
    }
    return [...messages, ...extra]
  }, [messages, localPending, pendingState])

  useEffect(() => {
    if (!localPending) return
    if (pendingState.hasAssistantReply) setLocalPending(null)
  }, [pendingState, localPending])

  const previewMessages = preview ? renderedMessages.slice(-previewLimit) : renderedMessages
  const allErrors = sendError || error

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [renderedMessages.length])

  async function handleSend() {
    const text = draft.trim()
    if (!text || isSending) return
    const sentAt = Date.now()
    const baselineLastId = messages.length ? messages[messages.length - 1].id : null
    setLocalPending({ prompt: text, sentAt, baselineLastId })
    setDraft('')
    try {
      await sendMessage(text)
    } catch {
      setLocalPending(null)
      setDraft(text)
    }
  }

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-[1.25rem] border border-[var(--theme-border)] bg-[color:rgba(255,255,255,0.015)]',
        className,
      )}
    >
      {!nativeStyle ? (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]/85">
          <span>Chat</span>
          <span className="text-[9px] normal-case tracking-normal">{source === 'state.db' ? 'live' : 'no session'}</span>
        </header>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          'flex-1 space-y-1.5 overflow-y-auto px-3 py-2',
          preview ? 'max-h-[260px] min-h-[140px]' : nativeStyle ? 'max-h-[300px] min-h-[170px]' : 'max-h-[250px] min-h-[120px]',
        )}
      >
        {isLoading ? (
          <p className="text-center text-[11px] text-[var(--theme-muted)]">
            Loading session…
          </p>
        ) : previewMessages.length === 0 ? (
          <p className="text-center text-[11px] text-[var(--theme-muted)]">
            No messages yet for {workerId}. Send a prompt below.
          </p>
        ) : (
          previewMessages.map((m) => (
            <MessageBubble key={m.id} workerId={workerId} message={m} nativeStyle={nativeStyle} />
          ))
        )}
      </div>

      {allErrors ? (
        <div className="border-t border-red-400/30 bg-red-500/10 px-3 py-1 text-[10px] text-red-200">
          {allErrors}
        </div>
      ) : null}

      {!preview ? (
        nativeStyle ? (
          <div className="border-t border-[var(--theme-border)]/70 px-2 py-2">
            <ChatComposer
              onSubmit={(value, _attachments, _fastMode, helpers) => {
                const text = value.trim()
                if (!text || isSending) return
                const sentAt = Date.now()
                const baselineLastId = messages.length ? messages[messages.length - 1].id : null
                setLocalPending({ prompt: text, sentAt, baselineLastId })
                helpers.reset()
                void sendMessage(text).catch(() => {
                  setLocalPending(null)
                  helpers.setValue(text)
                })
              }}
              isLoading={isSending}
              disabled={false}
              embedded
              hideModelSelector
            />

          </div>
        ) : (
          <div className="border-t border-[var(--theme-border)]/70 px-2.5 py-2">
            <div className="flex items-end gap-2 rounded-xl border border-[var(--theme-border)]/70 bg-transparent p-1.5">
              <textarea
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                disabled={isSending}
                placeholder={`Message ${workerId}…`}
                className="flex-1 resize-none bg-transparent px-1.5 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)]"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending || !draft.trim()}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
                  isSending
                    ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
                    : 'bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)] disabled:opacity-40',
                )}
              >
                <HugeiconsIcon icon={SentIcon} size={11} />
                {isSending ? '…' : 'Send'}
              </button>
            </div>

          </div>
        )
      ) : null}
    </section>
  )
}
