/**
 * AgoraChatPanel — room chat composer + scrollback.
 */
import { useEffect, useRef, useState } from 'react'
import type { AgoraMessage, AgoraUser } from '../lib/agora-types'

interface AgoraChatPanelProps {
  self: AgoraUser
  others: AgoraUser[]
  messages: AgoraMessage[]
  onSend: (body: string) => void
}

export function AgoraChatPanel({ self, others, messages, onSend }: AgoraChatPanelProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSend(draft)
    setDraft('')
  }

  function nameFor(userId: string) {
    if (userId === self.profile.id) return self.profile.displayName
    const u = others.find((o) => o.profile.id === userId)
    return u?.profile.displayName ?? 'Stranger'
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-2xl"
      style={{
        background: 'var(--theme-card)',
        border: '1px solid var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">Room Chat</span>
        <span className="text-[10px] opacity-50">{messages.length} msg</span>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 text-[12px] leading-snug">
        {messages.length === 0 ? (
          <div className="opacity-50 text-center mt-6 text-[11px]">No messages yet — say hi 👋</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="mb-1.5">
              <span
                className="font-semibold"
                style={{
                  color: m.userId === self.profile.id ? 'var(--theme-accent)' : 'var(--theme-text)',
                }}
              >
                {nameFor(m.userId)}:
              </span>{' '}
              <span className="opacity-90">{m.body}</span>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-2" style={{ borderColor: 'var(--theme-border)' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something to the room…"
          maxLength={280}
          className="flex-1 rounded-lg px-2 py-1.5 text-[12px] outline-none"
          style={{
            background: 'var(--theme-bg)',
            color: 'var(--theme-text)',
            border: '1px solid var(--theme-border)',
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] disabled:opacity-40"
          style={{
            background: 'var(--theme-accent)',
            color: 'var(--theme-bg)',
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
