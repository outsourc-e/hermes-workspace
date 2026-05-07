import { useEffect, useRef, useState } from 'react'

type Props = { enabled: boolean }

export function FpsCounter({ enabled }: Props) {
  const [stats, setStats] = useState({ fps: 0, low: 0, ms: 0 })
  const frameTimesRef = useRef<number[]>([])
  const lastRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const loop = (now: number) => {
      const last = lastRef.current ?? now
      const dt = Math.max(1, now - last)
      lastRef.current = now
      const fps = 1000 / dt
      const frames = frameTimesRef.current
      frames.push(fps)
      if (frames.length > 120) frames.shift()
      const sorted = [...frames].sort((a, b) => a - b)
      const low = sorted[Math.max(0, Math.floor(sorted.length * 0.01) - 1)] ?? fps
      if (frames.length % 8 === 0) setStats({ fps: Math.round(fps), low: Math.round(low), ms: Number(dt.toFixed(1)) })
      rafRef.current = window.requestAnimationFrame(loop)
    }
    rafRef.current = window.requestAnimationFrame(loop)
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastRef.current = null
      frameTimesRef.current = []
    }
  }, [enabled])

  if (!enabled) return null
  const color = stats.fps > 50 ? '#34d399' : stats.fps >= 30 ? '#fbbf24' : '#fb7185'
  return (
    <div
      className="pointer-events-none fixed right-3 top-[204px] z-[71] rounded-xl border bg-black/72 px-3 py-2 text-[11px] font-bold text-white shadow-xl backdrop-blur-xl"
      style={{ borderColor: `${color}66`, boxShadow: `0 0 14px ${color}22, 0 8px 22px rgba(0,0,0,.5)` }}
    >
      <div style={{ color }} className="text-sm leading-none">{stats.fps || '—'} FPS</div>
      <div className="mt-1 text-white/55">1% low {stats.low || '—'} · {stats.ms || '—'}ms</div>
    </div>
  )
}
