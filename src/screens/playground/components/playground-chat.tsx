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
  // Live online count from the multiplayer hub (dispatched by playground-world-3d).
  // Fallback: include bots so the chat doesn't say "0 online" while you're offline.
  const [serverOnline, setServerOnline] = useState<number | null>(null)
  const [transport, setTransport] = useState<string | null>(null)
  useEffect(() => {
    // Seed from window globals so we don't miss the first dispatch if chat
    // mounts after world-3d has already fired the events.
    const cur = (window as any).__hermesPlaygroundLiveCount as { online?: number } | undefined
    if (typeof cur?.online === 'number') setServerOnline(cur.online)
    const curT = (window as any).__hermesPlaygroundLiveTransport as string | undefined
    if (curT) setTransport(curT)
    const onCount = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { online?: number } | undefined
      if (typeof detail?.online === 'number') setServerOnline(detail.online)
    }
    const onTransport = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as string | undefined
      if (detail) setTransport(detail)
    }
    window.addEventListener('hermes-playground-count', onCount)
    window.addEventListener('hermes-playground-transport', onTransport)
    return () => {
      window.removeEventListener('hermes-playground-count', onCount)
      window.removeEventListener('hermes-playground-transport', onTransport)
    }
  }, [])
  const liveConnected = transport === 'ws' || transport === 'both'
  const npcCount = botsFor(worldId).length
  const onlineCount = serverOnline != null && liveConnected ? serverOnline : 1 + npcCount
  const onlineLabel = serverOnline != null && liveConnected
    ? `${onlineCount} player${onlineCount === 1 ? '' : 's'}`
    : `${onlineCount} online`
  const transportLabel = transport === 'ws' || transport === 'both'
    ? 'WS'
    : transport === 'broadcast'
      ? 'local-only (no hub)'
      : transport === 'offline'
        ? 'offline'
        : 'connecting'
  return (
    <div
      className="pointer-events-auto fixed bottom-3 z-[60] flex max-w-[92vw] flex-col rounded-2xl border border-white/10 bg-black/65 text-white shadow-2xl backdrop-blur-xl"
      style={{ width: 360, height: collapsed ? 42 : 240, maxWidth: 'calc(100vw - 320px)', left: 'min(120px, 9vw)' }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/65">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: liveConnected ? '#34d399' : '#facc15' }}
            title={transportLabel}
          />
          Chat · {onlineLabel}
          {npcCount > 0 && <span className="text-white/35"> · {npcCount} NPC</span>}
          <span className="ml-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-white/45">
            {transportLabel}
          </span>
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
              messages.map((m) => {
                const isBot = typeof m.authorId === 'string' && m.authorId.startsWith('bot:')
                return (
                  <div key={m.id} className="mb-1.5">
                    {isBot && (
                      <span className="mr-1 rounded bg-purple-400/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-purple-200">
                        NPC
                      </span>
                    )}
                    <span className="font-semibold" style={{ color: m.color ?? 'white' }}>
                      {m.authorName}:
                    </span>{' '}
                    <span className="opacity-90">{m.body}</span>
                  </div>
                )
              })
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
