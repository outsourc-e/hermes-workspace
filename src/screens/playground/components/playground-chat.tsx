import { useEffect, useRef, useState } from 'react'
import type { PlaygroundWorldId } from '../lib/playground-rpg'
import { botsFor } from '../lib/playground-bots'

export type ChatMessage = {
  id: string
  authorId: string
  authorName: string
  body: string
  ts: number
  color?: string
}

type Props = {
  worldId: PlaygroundWorldId
  messages: ChatMessage[]
  onSend: (body: string) => void
  collapsed?: boolean
  onToggle?: () => void
}

export function PlaygroundChat({ worldId, messages, onSend, collapsed = false, onToggle }: Props) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])
  const onlineCount = 1 + botsFor(worldId).length
  return (
    <div
      className="pointer-events-auto fixed bottom-3 left-3 z-[60] flex max-w-[92vw] flex-col rounded-2xl border border-white/10 bg-black/65 text-white shadow-2xl backdrop-blur-xl"
      style={{ width: 360, height: collapsed ? 42 : 240, maxWidth: 'calc(100vw - 24px)' }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/65">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          Chat · {onlineCount} online
        </div>
        <button
          onClick={onToggle}
          className="rounded px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/55 hover:bg-white/10"
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 text-[12px] leading-snug">
            {messages.length === 0 ? (
              <div className="text-center text-white/40">No messages yet — say hi 👋</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="mb-1.5">
                  <span className="font-semibold" style={{ color: m.color ?? 'white' }}>
                    {m.authorName}:
                  </span>{' '}
                  <span className="opacity-90">{m.body}</span>
                </div>
              ))
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim()) return
              onSend(draft.trim())
              setDraft('')
            }}
            className="flex gap-2 border-t border-white/10 p-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={140}
              placeholder="Press Enter to send…"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-[12px] outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-lg bg-cyan-300 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-black disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  )
}
