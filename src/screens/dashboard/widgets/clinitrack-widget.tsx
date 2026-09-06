/**
 * CliniTrack Health Widget
 * Shows live status of the CliniTrack app on home PC.
 */
import { useEffect, useState } from 'react'

type HealthStatus = {
  ok: boolean
  data?: {
    version?: string
    uptime?: number
    patients?: number
    users?: number
  }
  error?: string
  checkedAt: number
}

export function ClinitrackWidget() {
  const [status, setStatus] = useState<HealthStatus | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/clinitrack/health')
        const data = await res.json()
        setStatus({ ...data, checkedAt: Date.now() })
      } catch (err) {
        setStatus({
          ok: false,
          error: err instanceof Error ? err.message : 'fetch failed',
          checkedAt: Date.now(),
        })
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const isOk = status?.ok
  const lastChecked = status?.checkedAt
    ? new Date(status.checkedAt).toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          CliniTrack
        </span>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            isOk
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {isOk ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      {isOk && status.data ? (
        <div className="flex flex-col gap-1">
          {status.data.version && (
            <div className="text-xs text-[var(--theme-muted)]">
              v{status.data.version}
            </div>
          )}
          {status.data.patients !== undefined && (
            <div className="text-xs text-[var(--theme-text)]">
              {status.data.patients} patients
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-[var(--theme-muted)]">
          {status?.error || 'checking…'}
        </div>
      )}

      <div className="text-[10px] text-[var(--theme-muted)]">
        checked {lastChecked}
      </div>
    </div>
  )
}
