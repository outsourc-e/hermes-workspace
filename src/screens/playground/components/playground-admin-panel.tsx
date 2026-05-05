import { useEffect, useMemo, useState } from 'react'

type AdminStats = {
  ok?: boolean
  error?: string
  online: number
  byWorld: Record<string, number>
  peakToday: number
  uniqueToday: number
  joinsToday: number
  leavesToday: number
  chatsToday: number
  activeLast15m: number
  activeLast60m: number
  recentPlayers: Array<{
    id: string
    name?: string
    color?: string
    firstSeen: number
    lastSeen: number
    lastWorld?: string
    lastChatAt?: number
    chats: number
    joins: number
  }>
  recentEvents: Array<{
    type: string
    id: string
    name?: string
    color?: string
    world?: string
    text?: string
    ts: number
  }>
  ts: number
}

const WORLD_LABELS: Record<string, string> = {
  training: 'Training',
  agora: 'Agora',
  forge: 'Forge',
  grove: 'Grove',
  oracle: 'Oracle',
  arena: 'Arena',
}

const EVENT_STYLES: Record<string, { label: string; tone: string }> = {
  join: { label: 'Join', tone: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' },
  leave: { label: 'Leave', tone: 'border-zinc-300/20 bg-white/5 text-zinc-200' },
  chat: { label: 'Human chat', tone: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100' },
  world_change: { label: 'Travel', tone: 'border-violet-300/25 bg-violet-300/10 text-violet-100' },
}

function fmtTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtAge(ts?: number) {
  if (!ts) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function PlaygroundAdminPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch('/api/playground-admin', { cache: 'no-store' })
        const data = (await r.json()) as AdminStats
        if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`)
        if (!cancelled) {
          setStats(data)
          setError(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load admin stats')
      }
    }
    load()
    const id = window.setInterval(load, 10000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const derived = useMemo(() => {
    if (!stats) return null
    const recentChatters = stats.recentPlayers.filter((player) => player.chats > 0)
    const churn = stats.joinsToday > 0 ? Math.round((stats.leavesToday / stats.joinsToday) * 100) : 0
    const stale = stats.activeLast15m > Math.max(stats.online + 3, stats.online * 2)
    const busiestWorld = Object.entries(stats.byWorld).sort((a, b) => b[1] - a[1])[0]
    return { recentChatters, churn, stale, busiestWorld }
  }, [stats])

  return (
    <div className="pointer-events-auto fixed right-3 top-3 z-[90] flex max-h-[calc(100vh-24px)] w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-amber-200/15 bg-[#07080d]/88 text-xs text-white shadow-[0_24px_80px_rgba(0,0,0,.62)] backdrop-blur-2xl">
      <div className="border-b border-white/10 bg-gradient-to-r from-amber-300/10 via-cyan-300/8 to-violet-300/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-100">Private</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Dashboard admin</span>
            </div>
            <div className="mt-1 text-base font-bold tracking-tight text-white">HermesWorld Control Room</div>
            <div className="mt-0.5 text-[11px] text-white/50">Human relay analytics. NPC ambient chatter is client-side flavor and intentionally excluded.</div>
          </div>
          <div className="text-right text-[10px] text-white/45">
            <div>Updated</div>
            <div className="font-semibold text-white/70">{fmtTime(stats?.ts)}</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {error ? <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-red-100">{error}</div> : null}

        {stats ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Online now" value={stats.online} accent="#34d399" />
              <StatCard label="Unique today" value={stats.uniqueToday} accent="#fbbf24" />
              <StatCard label="Peak today" value={stats.peakToday} accent="#a78bfa" />
              <StatCard label="Active 15m" value={stats.activeLast15m} accent="#22d3ee" />
              <StatCard label="Active 60m" value={stats.activeLast60m} accent="#60a5fa" />
              <StatCard label="Human chats" value={stats.chatsToday} accent="#f472b6" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <HealthPill label="Joins" value={stats.joinsToday} />
              <HealthPill label="Leaves" value={stats.leavesToday} />
              <HealthPill label="Churn" value={`${derived?.churn ?? 0}%`} warn={(derived?.churn ?? 0) > 75 && stats.joinsToday > 5} />
            </div>

            {derived?.stale ? (
              <div className="rounded-2xl border border-yellow-300/25 bg-yellow-300/10 p-3 text-[11px] text-yellow-100">
                Active players are much higher than live sockets. Likely reconnect/background-tab churn, not real concurrent users.
              </div>
            ) : null}

            <section>
              <SectionTitle title="Worlds" detail={derived?.busiestWorld ? `Busiest: ${WORLD_LABELS[derived.busiestWorld[0]] ?? derived.busiestWorld[0]}` : 'No live world yet'} />
              <div className="grid grid-cols-2 gap-2">
                {Object.entries({ training: 0, agora: 0, forge: 0, grove: 0, oracle: 0, arena: 0, ...stats.byWorld }).map(([world, count]) => (
                  <div key={world} className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white/80">{WORLD_LABELS[world] ?? world}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/65">{count}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-cyan-300/80" style={{ width: `${Math.min(100, count * 18)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle title="Recent players" detail={`${stats.recentPlayers.length} tracked today`} />
              <div className="max-h-56 space-y-1.5 overflow-auto rounded-2xl border border-white/8 bg-black/25 p-2">
                {stats.recentPlayers.length === 0 ? <EmptyState label="No human players tracked yet." /> : null}
                {stats.recentPlayers.slice(0, 14).map((player) => (
                  <div key={player.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: player.color || '#fff' }} />
                        <span className="truncate font-semibold" style={{ color: player.color || '#fff' }}>{player.name || player.id.slice(0, 8)}</span>
                        {player.chats > 0 ? <span className="rounded bg-cyan-300/12 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan-100">chatter</span> : null}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-white/45">
                        {WORLD_LABELS[player.lastWorld || ''] ?? player.lastWorld ?? 'unknown'} · {fmtAge(player.lastSeen)} · joined {player.joins}x · chats {player.chats}
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-white/42">
                      <div>last chat</div>
                      <div className="text-white/65">{fmtAge(player.lastChatAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle title="Recent human chatters" detail={`${derived?.recentChatters.length ?? 0} today`} />
              <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/8 bg-white/[0.035] p-2">
                {derived?.recentChatters.length === 0 ? <span className="text-[11px] text-white/40">No human chat yet. NPC bubbles are not counted here.</span> : null}
                {derived?.recentChatters.slice(0, 12).map((player) => (
                  <span key={player.id} className="rounded-full border border-cyan-300/15 bg-cyan-300/8 px-2 py-1 text-[10px] text-cyan-50">
                    {player.name || player.id.slice(0, 8)} · {player.chats}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle title="Recent events" detail="latest relay events" />
              <div className="max-h-64 space-y-1.5 overflow-auto rounded-2xl border border-white/8 bg-black/25 p-2">
                {stats.recentEvents.length === 0 ? <EmptyState label="No relay events yet." /> : null}
                {stats.recentEvents.slice(0, 28).map((event, idx) => {
                  const style = EVENT_STYLES[event.type] ?? { label: event.type, tone: 'border-white/15 bg-white/8 text-white/80' }
                  return (
                    <div key={`${event.ts}-${event.id}-${idx}`} className="rounded-xl bg-white/[0.035] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${style.tone}`}>{style.label}</span>
                        <span className="text-[10px] text-white/40">{fmtTime(event.ts)}</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-white/70">
                        <span style={{ color: event.color || undefined }}>{event.name || event.id.slice(0, 8)}</span>
                        {event.world ? <span className="text-white/40"> · {WORLD_LABELS[event.world] ?? event.world}</span> : null}
                        {event.text ? <span className="text-white/55"> · “{event.text}”</span> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-1.5 flex items-end justify-between gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/48">{title}</div>
      {detail ? <div className="truncate text-[10px] text-white/35">{detail}</div> : null}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2.5 shadow-inner shadow-white/[0.02]">
      <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-white/42">{label}</div>
      <div className="mt-1 text-2xl font-black leading-none" style={{ color: accent }}>{value}</div>
    </div>
  )
}

function HealthPill({ label, value, warn = false }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border px-3 py-2 ${warn ? 'border-yellow-300/25 bg-yellow-300/10' : 'border-white/8 bg-white/[0.04]'}`}>
      <div className="text-[9px] uppercase tracking-[0.13em] text-white/42">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-white">{value}</div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-white/38">{label}</div>
}
