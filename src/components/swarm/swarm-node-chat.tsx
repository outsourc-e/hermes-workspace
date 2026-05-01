'use client'

import { useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Chat01Icon,
  Clock01Icon,
  SentIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  ts: number
  durationMs?: number
}

type SwarmNodeChatProps = {
  workerId: string
  className?: string
  collapsed?: boolean
  onCollapsedChange?: (next: boolean) => void
}

const STORAGE_PREFIX = 'claude-swarm-chat-v1:'

function loadHistory(workerId: string): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + workerId)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistHistory(workerId: string, messages: Message[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + workerId,
      JSON.stringify(messages.slice(-30)),
    )
  } catch {
    /* noop */
  }
}

export function SwarmNodeChat({
  workerId,
  className,
  collapsed = false,
  onCollapsedChange,
}: SwarmNodeChatProps) {
  const [messages, setMessages] = useState<Message[]>(() =>
    loadHistory(workerId),
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMessages(loadHistory(workerId))
  }, [workerId])

  useEffect(() => {
    persistHistory(workerId, messages)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [workerId, messages])

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const userMsg: Message = { id, role: 'user', text, ts: Date.now() }
    setMessages((current) => [...current, userMsg])
    setDraft('')
    setBusy(true)
    try {
      const res = await fetch('/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerIds: [workerId],
          prompt: text,
          timeoutSeconds: 240,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as {
        results?: Array<{
          ok: boolean
          output: string
          error: string | null
          durationMs: number
        }>
      }
      const result = data.results && data.results[0] ? data.results[0] : null
      if (!result) {
        throw new Error('No result returned from dispatch.')
      }
      if (!result.ok) {
        setMessages((current) => [
          ...current,
          {
            id: `${id}-err`,
            role: 'error',
            text:
              result.error ||
              'Worker dispatch failed without an error message.',
            ts: Date.now(),
            durationMs: result.durationMs,
          },
        ])
      } else {
        setMessages((current) => [
          ...current,
          {
            id: `${id}-r`,
            role: 'assistant',
            text: result.output.trim() || '(empty reply)',
            ts: Date.now(),
            durationMs: result.durationMs,
          },
        ])
      }
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `${id}-err`,
          role: 'error',
          text: err instanceof Error ? err.message : 'Dispatch failed',
          ts: Date.now(),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setMessages([])
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-emerald-400/18 bg-[#08110d]/70 p-2.5 text-emerald-50/90 backdrop-blur',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-emerald-200/65">
        <span className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={Chat01Icon} size={12} />
          {workerId} · direct dispatch
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-full border border-emerald-400/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-emerald-100/70 hover:text-white"
          >
            Clear
          </button>
          {onCollapsedChange ? (
            <button
              type="button"
              onClick={() => onCollapsedChange(!collapsed)}
              className="rounded-full border border-emerald-400/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-emerald-100/70 hover:text-white"
            >
              {collapsed ? 'Open' : 'Hide'}
            </button>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <>
          <div
            ref={scrollRef}
            className="mb-2 max-h-36 min-h-[70px] overflow-y-auto rounded-xl border border-emerald-400/10 bg-black/35 p-2 text-xs"
          >
            {messages.length === 0 ? (
              <div className="px-2 py-4 text-center text-[11px] text-emerald-100/50">
                Inline dispatch to {workerId}. Real replies come from its Hermes
                profile.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'rounded-lg border px-2 py-1.5',
                      message.role === 'user' &&
                        'border-emerald-400/25 bg-emerald-500/10 text-emerald-50',
                      message.role === 'assistant' &&
                        'border-amber-400/25 bg-amber-500/5 text-amber-50',
                      message.role === 'error' &&
                        'border-red-500/40 bg-red-500/10 text-red-100',
                    )}
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-emerald-100/60">
                      <span className="inline-flex items-center gap-1">
                        {message.role === 'user'
                          ? 'You'
                          : message.role === 'assistant'
                            ? workerId
                            : 'Error'}
                        {message.role === 'assistant' ? (
                          <HugeiconsIcon
                            icon={CheckmarkCircle02Icon}
                            size={10}
                            className="text-emerald-300"
                          />
                        ) : null}
                        {message.role === 'error' ? (
                          <HugeiconsIcon
                            icon={AlertCircleIcon}
                            size={10}
                            className="text-red-300"
                          />
                        ) : null}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {message.durationMs ? (
                          <span className="inline-flex items-center gap-0.5">
                            <HugeiconsIcon icon={Clock01Icon} size={9} />
                            {(message.durationMs / 1000).toFixed(1)}s
                          </span>
                        ) : null}
                        <span>{new Date(message.ts).toLocaleTimeString()}</span>
                      </span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-[12px] text-emerald-50">
                      {message.text}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void send()
                }
              }}
              disabled={busy}
              placeholder={`Message ${workerId}…`}
              className="flex-1 resize-none rounded-xl border border-emerald-400/20 bg-black/40 px-2 py-1.5 text-xs text-emerald-50 focus:border-emerald-300/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              className={cn(
                'inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold transition-colors',
                busy
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : 'bg-emerald-400 text-black hover:bg-emerald-300 disabled:opacity-40',
              )}
            >
              <HugeiconsIcon icon={SentIcon} size={12} />
              {busy ? '…' : 'Send'}
            </button>
          </div>
          <div className="mt-1 text-right text-[9px] text-emerald-100/35">
            ⌘/Ctrl+Return to send
          </div>
        </>
      ) : null}
    </div>
  )
}
