/**
 * Whoop Widget — Today's Readiness
 * Shows strain, recovery, HRV, resting HR, sleep from Whoop data.
 * Data shape matches /api/whoop which returns WhoopSnapshot (camelCase).
 */
import { useEffect, useState } from 'react'

type WhoopData = {
  date: string | null
  recoveryPct: number | null
  hrvMs: number | null
  restingHrBpm: number | null
  sleepPerformancePct: number | null
  sleepHours: number | null
  sleepEfficiencyPct: number | null
  dayStrain: number | null
  avgHrBpm: number | null
}

function strainColor(strain: number | null): string {
  if (strain === null) return 'text-[var(--theme-muted)]'
  if (strain >= 7) return 'text-emerald-400'
  if (strain >= 5) return 'text-amber-400'
  return 'text-red-400'
}

function recoveryColor(rec: number | null): string {
  if (rec === null) return 'text-[var(--theme-muted)]'
  if (rec >= 70) return 'text-emerald-400'
  if (rec >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function gaugeColor(pct: number | null): string {
  if (pct === null) return 'bg-[var(--theme-muted)]'
  if (pct >= 70) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function fmtHours(h: number | null): string {
  if (h === null) return '—'
  const m = Math.round(h * 60)
  const hm = Math.floor(m / 60)
  const mm = m % 60
  return `${hm}h${mm.toString().padStart(2, '0')}m`
}

export function WhoopWidget() {
  const [data, setData] = useState<WhoopData | null>(null)

  useEffect(() => {
    fetch('/api/whoop')
      .then((r) => r.json())
      .then((d) => {
        if (d.date) setData(d)
      })
      .catch(() => {})
  }, [])

  if (!data || !data.date) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          Today's Readiness
        </span>
        <div className="text-xs text-[var(--theme-muted)]">no data</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          Today's Readiness
        </span>
        <span className="text-[10px] text-[var(--theme-muted)]">
          {new Date(data.date).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>

      {/* Strain gauge */}
      <div className="flex flex-col gap-1">
        <div className="flex items-end justify-between">
          <span className="text-[10px] text-[var(--theme-muted)]">STRAIN</span>
          <span className={`text-lg font-bold ${strainColor(data.dayStrain)}`}>
            {data.dayStrain !== null ? data.dayStrain.toFixed(1) : '—'}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--theme-border)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-red-500"
            style={{
              width: `${data.dayStrain !== null ? Math.min(100, (data.dayStrain / 10) * 100) : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Recovery bar */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--theme-muted)]">
            RECOVERY
          </span>
          <span
            className={`text-sm font-bold ${recoveryColor(data.recoveryPct)}`}
          >
            {data.recoveryPct !== null ? `${data.recoveryPct}%` : '—'}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--theme-border)]">
          <div
            className={`h-full rounded-full ${gaugeColor(data.recoveryPct)}`}
            style={{ width: `${data.recoveryPct ?? 0}%` }}
          />
        </div>
      </div>

      {/* HRV + Resting HR */}
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--theme-muted)]">HRV</span>
          <span className="text-sm font-bold text-[var(--theme-text)]">
            {data.hrvMs !== null ? `${data.hrvMs}ms` : '—'}
          </span>
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--theme-muted)]">
            RESTING HR
          </span>
          <span className="text-sm font-bold text-[var(--theme-text)]">
            {data.restingHrBpm !== null ? `${data.restingHrBpm}bpm` : '—'}
          </span>
        </div>
      </div>

      {/* Sleep */}
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--theme-muted)]">SLEEP</span>
          <span className="text-sm font-bold text-[var(--theme-text)]">
            {fmtHours(data.sleepHours)}
          </span>
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--theme-muted)]">PERF</span>
          <span className="text-sm font-bold text-[var(--theme-text)]">
            {data.sleepPerformancePct !== null
              ? `${data.sleepPerformancePct}%`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
