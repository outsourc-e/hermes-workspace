/**
 * Health Uptime Widget — shows workspace uptime and API latency.
 * Fetches own health endpoint to measure latency.
 */
import { useEffect, useState } from 'react'

type HealthData = {
  uptimeSecs: number
  latencyMs: number
  timestamp: number
}

function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function UptimeWidget() {
  const [health, setHealth] = useState<HealthData | null>(null)

  useEffect(() => {
    const measure = async () => {
      const t0 = Date.now()
      try {
        const r = await fetch('/api/v1/health')
        const latency = Date.now() - t0
        const data = await r.json()
        setHealth({
          uptimeSecs: data.uptime ?? 0,
          latencyMs: latency,
          timestamp: Date.now(),
        })
      } catch {
        setHealth({ uptimeSecs: 0, latencyMs: -1, timestamp: Date.now() })
      }
    }
    measure()
    const iv = setInterval(measure, 30000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
        Workspace
      </span>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--theme-muted)]">UPTIME</span>
          <span className="text-sm font-bold text-[var(--theme-text)]">
            {health ? formatUptime(health.uptimeSecs) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--theme-muted)]">LATENCY</span>
          <span
            className={`text-sm font-bold ${health && health.latencyMs > 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {health
              ? health.latencyMs < 0
                ? 'offline'
                : `${health.latencyMs}ms`
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--theme-muted)]">STREAK</span>
          <span className="text-sm font-bold text-[var(--theme-text)]">
            {health && health.uptimeSecs > 86400 ? '🔥' : health ? '✨' : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
