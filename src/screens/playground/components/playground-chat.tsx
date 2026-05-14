import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace-store'
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

function PlaygroundChatInner({ worldId, messages, onSend, collapsed = false, onToggle }: Props) {
  const [draft, setDraft] = useState('')
  const [softExpanded, setSoftExpanded] = useState(false)
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const chromeLeft = sidebarCollapsed ? 'min(120px, 9vw)' : '320px'
  const chromeMaxWidth = sidebarCollapsed ? 'calc(100vw - 320px)' : 'calc(100vw - 520px)'
  const [filter, setFilter] = useState<'all' | 'humans' | 'npcs'>('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, 50)
    return () => window.clearTimeout(id)
  }, [messages.length, filter])
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
  const { humanMessages, npcMessages } = useMemo(() => {
    const humans: ChatMessage[] = []
    const npcs: ChatMessage[] = []
    for (const message of messages) {
      if (typeof message.authorId === 'string' && message.authorId.startsWith('bot:')) npcs.push(message)
      else humans.push(message)
    }
    return { humanMessages: humans, npcMessages: npcs }
  }, [messages])
  const visibleMessages = useMemo(() => (filter === 'humans' ? humanMessages : filter === 'npcs' ? npcMessages : messages), [filter, humanMessages, messages, npcMessages])
  const onlineCount = serverOnline != null && liveConnected ? serverOnline : 1 + npcCount
  const onlineLabel = serverOnline != null && liveConnected
    ? `${onlineCount} player${onlineCount === 1 ? '' : 's'}`
    : `${onlineCount} online`
  const transportLabel = transport === 'ws' || transport === 'both'
    ? 'live'
    : transport === 'broadcast'
      ? 'local-only'
      : transport === 'offline'
        ? 'offline'
        : 'connecting'
  const visiblyCollapsed = collapsed && !softExpanded
  return (
    <div
      className="pointer-events-auto fixed bottom-3 z-[60] flex max-w-[92vw] flex-col rounded-2xl border border-white/10 bg-black/70 text-white shadow-2xl backdrop-blur-xl transition-[height]"
      onMouseEnter={() => setSoftExpanded(true)}
      onMouseLeave={() => setSoftExpanded(false)}
      onFocus={() => setSoftExpanded(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSoftExpanded(false) }}
      style={{ width: 380, height: visiblyCollapsed ? 32 : 264, maxWidth: chromeMaxWidth, left: chromeLeft, opacity: 'var(--hermesworld-hud-opacity, .88)' }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/65">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: liveConnected ? '#34d399' : '#facc15' }}
            title={transportLabel}
          />
          Chat · {onlineLabel}
          {npcCount > 0 && <span className="text-white/35"> · {npcCount} ambient NPC</span>}
          <span className="ml-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-white/45">
            {transportLabel}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="rounded px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/55 hover:bg-white/10"
        >
          {visiblyCollapsed ? '▾' : '▴'}
        </button>
      </div>
      {!visiblyCollapsed && (
        <>
          <div className="flex items-center gap-1 border-b border-white/8 px-2 py-1.5">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={messages.length} />
            <FilterButton active={filter === 'humans'} onClick={() => setFilter('humans')} label="Humans" count={humanMessages.length} />
            <FilterButton active={filter === 'npcs'} onClick={() => setFilter('npcs')} label="NPC" count={npcMessages.length} />
            <span className="ml-auto text-[9px] text-white/32">NPC flavor is local, not analytics</span>
          </div>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 text-[12px] leading-snug">
            {visibleMessages.length === 0 ? (
              <div className="text-center text-white/40">
                {filter === 'humans' ? 'No human chat yet — say hi 👋' : filter === 'npcs' ? 'No ambient NPC lines yet.' : 'No messages yet — say hi 👋'}
              </div>
            ) : (
              visibleMessages.map((m) => {
                const isBot = typeof m.authorId === 'string' && m.authorId.startsWith('bot:')
                return (
                  <div key={m.id} className={`mb-1.5 rounded-lg px-1.5 py-1 ${isBot ? 'bg-purple-300/[0.035] text-white/72' : 'bg-cyan-300/[0.045]'}`}>
                    {isBot && (
                      <span className="mr-1 rounded bg-purple-400/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-purple-200">
                        Ambient NPC
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
              placeholder="Press Enter to send human chat…"
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

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] transition ${
        active
          ? 'border-cyan-200/45 bg-cyan-200/15 text-cyan-50 shadow-[0_0_14px_rgba(34,211,238,.18)]'
          : 'border-white/10 bg-white/[0.04] text-white/42 hover:bg-white/[0.08] hover:text-white/70'
      }`}
    >
      {label} <span className="text-white/45">{count}</span>
    </button>
  )
}

export const PlaygroundChat = memo(PlaygroundChatInner)
