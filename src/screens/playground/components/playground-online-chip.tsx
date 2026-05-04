/**
 * Live "agents online now" chip with connection-state indicator.
 *
 * Strategy:
 *   1. Prefer server-pushed count via `hermes-playground-count` CustomEvent
 *      (emitted by the multiplayer hook on every server `count` message).
 *      Zero polling, real-time.
 *   2. Fall back to one /stats fetch on mount if no WS push has arrived in
 *      ~3s (so the chip works on the title screen before a player has
 *      connected to /playground).
 *   3. Hide the chip if no VITE_PLAYGROUND_STATS_URL is configured AND
 *      no live event ever arrives.
 *
 * Connection states (driven by the hook's `transport`):
 *   - both:      green dot, "live"
 *   - ws:        green dot, "live"
 *   - broadcast: yellow dot, "local-only"
 *   - offline:   red dot, "offline"
 */
import { useEffect, useState } from 'react'

type Stats = {
  online: number
  byWorld?: Record<string, number>
  peakToday?: number
  ts?: number
}

type Transport = 'offline' | 'broadcast' | 'ws' | 'both'

const STATS_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PLAYGROUND_STATS_URL) || ''

export function PlaygroundOnlineChip({ accent = '#34d399' }: { accent?: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [transport, setTransport] = useState<Transport>('offline')
  const [reachable, setReachable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const onCount = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as Stats
      if (!detail) return
      setStats(detail)
      setReachable(true)
    }
    const onTransport = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as Transport
      if (detail) setTransport(detail)
    }
    window.addEventListener('hermes-playground-count', onCount)
    window.addEventListener('hermes-playground-transport', onTransport)

    // Pre-populate from window globals if hook fired before mount.
    const cur = (window as any).__hermesPlaygroundLiveCount as Stats | undefined
    if (cur) setStats(cur)
    const curT = (window as any).__hermesPlaygroundLiveTransport as Transport | undefined
    if (curT) setTransport(curT)

    // Fallback: one-shot /stats fetch if no push arrives in 3s.
    const fallbackId = window.setTimeout(async () => {
      if (cancelled || stats) return
      if (!STATS_URL) {
        setReachable(false)
        return
      }
      try {
        const r = await fetch(STATS_URL, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const data = (await r.json()) as Stats
        if (cancelled) return
        setStats(data)
        setReachable(true)
      } catch {
        if (cancelled) return
        setReachable(false)
      }
    }, 3000)

    return () => {
      cancelled = true
      window.clearTimeout(fallbackId)
      window.removeEventListener('hermes-playground-count', onCount)
      window.removeEventListener('hermes-playground-transport', onTransport)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hide entirely when no stats URL configured AND no WS event ever arrived.
  if (!STATS_URL && !stats) return null
  if (!stats && reachable === false) return null

  // Show the live WS count once we're connected; otherwise show the snapshot
  // count from /stats (it does NOT include you yet because you haven't connected).
  const liveConnected = transport === 'ws' || transport === 'both'
  const n = stats?.online ?? 0
  const displayCount = stats == null ? '—' : liveConnected ? String(n) : n === 0 ? '0' : String(n)
  const status: { color: string; label: string } = (() => {
    switch (transport) {
      case 'both':
      case 'ws':
        return { color: '#34d399', label: 'live' }
      case 'broadcast':
        return { color: '#facc15', label: 'local-only' }
      case 'offline':
      default:
        return { color: '#94a3b8', label: 'connecting…' }
    }
  })()

  const byWorldEntries = stats?.byWorld
    ? Object.entries(stats.byWorld).filter(([, v]) => v > 0)
    : []
  const tooltip = [
    stats?.peakToday ? `Peak today: ${stats.peakToday}` : null,
    byWorldEntries.length
      ? byWorldEntries.map(([w, v]) => `${w}: ${v}`).join(' · ')
      : null,
    `Status: ${status.label}`,
  ]
    .filter(Boolean)
    .join(' \u2022 ')

  return (
    <div
      className="pointer-events-auto fixed top-3 left-3 z-[70] flex items-center gap-2 rounded-full border-2 border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xl backdrop-blur-xl"
      style={{
        boxShadow: `0 0 12px ${accent}33, 0 8px 24px rgba(0,0,0,.5)`,
      }}
      title={tooltip}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: status.color,
          boxShadow: `0 0 8px ${status.color}`,
          animation: status.color === '#34d399' ? 'pulse-online 2s ease-in-out infinite' : undefined,
        }}
      />
      <span>Players online</span>
      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/80">{displayCount}</span>
      {stats?.peakToday && stats.peakToday > 0 && (
        <span className="text-white/45">· peak {stats.peakToday}</span>
      )}
      <style>{`
        @keyframes pulse-online {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
