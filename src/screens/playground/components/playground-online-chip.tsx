/**
 * Live "agents online now" chip.
 *
 * Polls VITE_PLAYGROUND_STATS_URL (e.g. CF Worker /stats endpoint) every 5s.
 * Falls back gracefully if no stats URL configured or endpoint unreachable.
 *
 * Use as a floating HUD element to show real-time multiplayer presence
 * count for the demo / hackathon judges / pitch deck.
 */
import { useEffect, useState } from 'react'

type Stats = {
  online: number
  byWorld?: Record<string, number>
  peakToday?: number
  ts?: number
}

const STATS_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PLAYGROUND_STATS_URL) || ''
const POLL_MS = 5000

export function PlaygroundOnlineChip({ accent = '#34d399' }: { accent?: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)

  useEffect(() => {
    if (!STATS_URL) {
      setReachable(false)
      return
    }
    let cancelled = false

    const tick = async () => {
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
    }

    void tick()
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  // Hide the chip entirely when no stats endpoint is configured. We don't
  // want a stale "0 online" sitting on the HUD during local dev.
  if (!STATS_URL || reachable === false) return null

  const n = stats?.online ?? 0
  const dotColor = n > 0 ? accent : '#94a3b8'

  return (
    <div
      className="pointer-events-auto fixed top-3 z-[70] flex items-center gap-2 rounded-full border-2 border-white/15 bg-black/65 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xl backdrop-blur-xl"
      style={{
        right: 16,
        boxShadow: `0 0 12px ${accent}33, 0 8px 24px rgba(0,0,0,.5)`,
      }}
      title={
        stats?.peakToday
          ? `Peak today: ${stats.peakToday}`
          : 'Live multiplayer count'
      }
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 8px ${dotColor}`,
        }}
      />
      <span>
        {n} agent{n === 1 ? '' : 's'} online
      </span>
      {stats?.peakToday && stats.peakToday > 0 && (
        <span className="text-white/45">· peak {stats.peakToday}</span>
      )}
    </div>
  )
}
