import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/prompt-kit/markdown'
import {
  fetchSessionHistory,
  sendToSession,
  steerAgent,
  type SessionHistoryMessage,
} from '@/lib/gateway-api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentChatPanelProps = {
  /** Agent display name */
  agentName: string
  /** Agent ID */
  agentId: string
  /** Session key for this agent (from agentSessionMap) */
  sessionKey: string | null
  /** Whether agent is currently running */
  isRunning: boolean
  /** Close handler */
  onClose: () => void
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(msg: SessionHistoryMessage): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p) => p.type === 'text' || !p.type)
      .map((p) => p.text ?? '')
      .join('\n')
  }
  return ''
}

function toChat(msg: SessionHistoryMessage, idx: number): ChatMessage {
  const role =
    msg.role === 'assistant' ? 'assistant' : msg.role === 'user' ? 'user' : 'system'
  return {
    id: `hist-${idx}-${msg.timestamp ?? idx}`,
    role,
    content: extractText(msg),
    timestamp: msg.timestamp,
  }
}

let _nextId = 0
function localId() {
  return `local-${Date.now()}-${++_nextId}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentChatPanel({
  agentName,
  agentId: _agentId,
  sessionKey,
  isRunning,
  onClose,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!sessionKey) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSessionHistory(sessionKey, { limit: 100 })
      if (res.ok !== false && res.messages) {
        const parsed = res.messages
          .map(toChat)
          .filter((m) => m.content.trim().length > 0)
        setMessages(parsed)
      } else if (res.error) {
        setError(res.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [sessionKey])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  // ── SSE streaming for real-time word-by-word updates ───────────────────────
  useEffect(() => {
    if (!sessionKey) return
    const source = new EventSource('/api/chat-events')
    let streamingText = ''

    function matchesSession(payload: Record<string, unknown>): boolean {
      return payload.sessionKey === sessionKey
    }

    function parsePayload(raw: string): Record<string, unknown> | null {
      try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : null } catch { return null }
    }

    // Streaming chunks — word-by-word text
    source.addEventListener('chunk', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parsePayload(event.data)
      if (!payload || !matchesSession(payload)) return
      const text = typeof payload.text === 'string' ? payload.text : ''
      if (!text) return
      const fullReplace = payload.fullReplace === true
      streamingText = fullReplace ? text : streamingText + text

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.id === 'streaming-assistant') {
          return [...prev.slice(0, -1), { ...last, content: streamingText }]
        }
        return [...prev, { id: 'streaming-assistant', role: 'assistant' as const, content: streamingText }]
      })
    })

    // Message complete — finalize
    source.addEventListener('message', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parsePayload(event.data)
      if (!payload || !matchesSession(payload)) return
      streamingText = ''
      // Reload full history to get the finalized message
      void loadHistory()
    })

    // Done event — session finished
    source.addEventListener('done', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parsePayload(event.data)
      if (!payload || !matchesSession(payload)) return
      streamingText = ''
      void loadHistory()
    })

    source.onerror = () => {
      // Fallback to polling if SSE fails
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(() => void loadHistory(), 5000)
    }

    return () => {
      source.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sessionKey, loadHistory])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || !sessionKey) return

    const userMsg: ChatMessage = { id: localId(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setSending(true)
    setError(null)

    try {
      if (isRunning) {
        // Agent is running — use steer to send a directive
        await steerAgent(sessionKey, text)
      } else {
        // Agent is idle — send a new message to the session
        await sendToSession(sessionKey, text)
      }
      // Reload history to get agent's response
      setTimeout(() => void loadHistory(), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }, [draft, sessionKey, isRunning, loadHistory])

  // ── Focus textarea on mount ───────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-slate-900 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'size-2.5 rounded-full',
                isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400',
              )}
            />
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                Chat with {agentName}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isRunning ? 'Running — messages sent as directives' : 'Idle — direct conversation'}
                {sessionKey ? ` · ${sessionKey.slice(0, 24)}…` : ' · No session'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loading}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              {loading ? '↻' : '↻ Refresh'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Messages ────────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {!sessionKey && (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
              No active session for this agent. Start a mission first.
            </div>
          )}

          {sessionKey && messages.length === 0 && !loading && (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
              No messages yet. Send one to start a conversation.
            </div>
          )}

          {loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
              Loading conversation…
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                  msg.role === 'user'
                    ? 'bg-accent-500 text-white rounded-br-md'
                    : msg.role === 'system'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 text-xs italic'
                      : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 rounded-bl-md',
                )}
              >
                {msg.role === 'assistant' ? (
                  <Markdown>{msg.content}</Markdown>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
                {msg.timestamp && (
                  <p className="mt-1 text-[10px] opacity-50">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Input ───────────────────────────────────────────────────────── */}
        <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                !sessionKey
                  ? 'No session available…'
                  : isRunning
                    ? 'Send a directive to the running agent…'
                    : 'Send a message…'
              }
              disabled={!sessionKey || sending}
              className="flex-1 resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:ring-1 focus:ring-accent-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-neutral-500"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
            />
            <button
              type="button"
              disabled={!draft.trim() || !sessionKey || sending}
              onClick={() => void handleSend()}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all',
                'bg-accent-500 hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {sending ? '…' : isRunning ? 'Steer ⌘↵' : 'Send ⌘↵'}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-neutral-400">
            {isRunning
              ? 'Agent is running. Messages are sent as steering directives.'
              : 'Agent is idle. Messages start a new conversation turn.'}
          </p>
        </div>
      </div>
    </div>
  )
}
