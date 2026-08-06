'use client'

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  Clock01Icon,
  SentIcon,
} from '@hugeicons/core-free-icons'
import type {
  SwarmChatMessage,
  SwarmSessionCardOwner,
} from '@/hooks/use-swarm-chat'
import { ChatComposer } from '@/screens/chat/components/chat-composer'
import { cn } from '@/lib/utils'
import { useSwarmChat } from '@/hooks/use-swarm-chat'

type Swarm2LiveChatProps = {
  workerId: string
  cardOwner?: SwarmSessionCardOwner | null
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

function parseTodoSummary(content: string): {
  total: number
  pending: number
  inProgress: number
  completed: number
  cancelled: number
} | null {
  try {
    const parsed: unknown = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') return null
    const summary = (
      parsed as {
        summary?: {
          total?: number
          pending?: number
          in_progress?: number
          completed?: number
          cancelled?: number
        }
      }
    ).summary
    if (!summary) return null
    return {
      total: summary.total ?? 0,
      pending: summary.pending ?? 0,
      inProgress: summary.in_progress ?? 0,
      completed: summary.completed ?? 0,
      cancelled: summary.cancelled ?? 0,
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
        <div
          className={cn(
            'mb-0.5 flex items-center justify-between gap-2 text-[9px] text-[var(--theme-muted)]',
            nativeStyle
              ? 'font-medium tracking-normal'
              : 'font-semibold uppercase tracking-[0.16em]',
          )}
        >
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
            <div className="text-[11px] font-medium text-[var(--theme-text)]">
              Task snapshot
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-[var(--theme-muted-2)]">
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">
                {todoSummary.total} total
              </span>
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">
                {todoSummary.pending} pending
              </span>
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">
                {todoSummary.inProgress} in progress
              </span>
              <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">
                {todoSummary.completed} completed
              </span>
              {todoSummary.cancelled > 0 ? (
                <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5">
                  {todoSummary.cancelled} cancelled
                </span>
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
          <div className="space-y-1.5">
            {message.content ? (
              <pre
                className={cn(
                  'whitespace-pre-wrap break-words font-sans text-[12px] leading-snug',
                  message.pending && isAssistant && 'animate-pulse',
                )}
              >
                {message.content}
              </pre>
            ) : null}
            {message.attachments?.length ? (
              <ul
                aria-label="Message attachments"
                className="space-y-1 text-[10px] text-[var(--theme-muted-2)]"
              >
                {message.attachments.map((attachment, index) => (
                  <li
                    key={
                      attachment.id ??
                      `${attachment.name ?? 'attachment'}-${index}`
                    }
                    className="truncate rounded-md border border-[var(--theme-border)]/70 px-1.5 py-1"
                  >
                    {attachment.name?.trim() || 'Attachment'}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export function Swarm2LiveChat({
  workerId,
  cardOwner,
  className,
  preview = false,
  previewLimit = 4,
  nativeStyle = false,
}: Swarm2LiveChatProps) {
  const navigate = useNavigate()
  const {
    messages,
    isLoading,
    sendMessage,
    isSending,
    error,
    sendError,
    sessionTitle,
    target,
    transcriptStatus,
  } = useSwarmChat({
    workerId,
    cardOwner,
    limit: 30,
    enabled: Boolean(workerId),
  })
  const [draft, setDraft] = useState('')
  const [admissionError, setAdmissionError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [preview, nativeStyle, workerId])

  const previewMessages = preview ? messages.slice(-previewLimit) : messages
  const allErrors = admissionError || sendError || error

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  async function handleSend() {
    const text = draft.trim()
    if (!text || isSending) return
    setDraft('')
    setAdmissionError(null)
    try {
      await sendMessage(text)
    } catch {
      setDraft(text)
      setAdmissionError('Unable to save or deliver this Session Card message')
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
          <span>Card history</span>
          <span className="text-[9px] normal-case tracking-normal">
            {transcriptStatus === 'ready' ? 'authoritative' : 'unavailable'}
          </span>
        </header>
      ) : null}

      {target ? (
        <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)]/70 px-3 py-1.5 text-[10px] text-[var(--theme-muted)]">
          <span className="truncate">{sessionTitle}</span>
          <button
            type="button"
            aria-label={`Open ${sessionTitle}`}
            onClick={() => void navigate(target.route)}
            className="shrink-0 rounded-full border border-[var(--theme-border)] px-2 py-0.5 font-semibold text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
          >
            Open chat
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          'flex-1 space-y-1.5 overflow-y-auto px-3 py-2',
          preview
            ? 'max-h-[260px] min-h-[140px]'
            : nativeStyle
              ? 'max-h-[300px] min-h-[170px]'
              : 'max-h-[250px] min-h-[120px]',
        )}
      >
        {(transcriptStatus === 'unmapped' ||
          transcriptStatus === 'unavailable') &&
        previewMessages.length === 0 ? (
          <p className="text-center text-[11px] text-[var(--theme-muted)]">
            Transcript unavailable: no complete Session Card is mapped to this
            worker.
          </p>
        ) : transcriptStatus === 'incomplete' &&
          previewMessages.length === 0 ? (
          <p className="text-center text-[11px] text-[var(--theme-muted)]">
            Transcript unavailable: Session Card history is incomplete.
          </p>
        ) : (isLoading || transcriptStatus === 'loading') &&
          previewMessages.length === 0 ? (
          <p className="text-center text-[11px] text-[var(--theme-muted)]">
            Loading Session Card history…
          </p>
        ) : previewMessages.length === 0 ? (
          <p className="text-center text-[11px] text-[var(--theme-muted)]">
            No messages yet on the authoritative Session Card.
          </p>
        ) : (
          <>
            {transcriptStatus === 'incomplete' ||
            transcriptStatus === 'unavailable' ? (
              <p
                role="status"
                className="text-center text-[10px] text-[var(--theme-muted)]"
              >
                Showing the last Card-durable transcript while history
                refreshes.
              </p>
            ) : null}
            {previewMessages.map((m) => (
              <MessageBubble
                key={m.id}
                workerId={workerId}
                message={m}
                nativeStyle={nativeStyle}
              />
            ))}
          </>
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
              onSubmit={(value, attachments, _fastMode, helpers) => {
                const text = value.trim()
                if ((!text && attachments.length === 0) || isSending) return
                setAdmissionError(null)
                try {
                  const pending = sendMessage(text, attachments)
                  void pending
                    .then(() => {
                      // The hook admits the exact Card-owned recovery row before
                      // transport. Clear only after delivery is confirmed.
                      helpers.reset()
                    })
                    .catch(() => {
                      setAdmissionError(
                        'Unable to save or deliver this Session Card message',
                      )
                      helpers.setValue(text)
                      helpers.setAttachments(attachments)
                    })
                } catch {
                  setAdmissionError(
                    'Unable to save or deliver this Session Card message',
                  )
                  // ChatComposer clears after onSubmit returns. Restore on the
                  // next microtask when durable admission failed synchronously.
                  queueMicrotask(() => {
                    helpers.setValue(text)
                    helpers.setAttachments(attachments)
                  })
                }
              }}
              isLoading={isSending}
              disabled={!target}
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
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                disabled={!target || isSending}
                placeholder={
                  target ? `Message ${workerId}…` : 'Session Card unavailable'
                }
                className="flex-1 resize-none bg-transparent px-1.5 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)]"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!target || isSending || !draft.trim()}
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
