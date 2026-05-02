import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Time04Icon } from '@hugeicons/core-free-icons'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatNextRun(iso: string | null): string {
  if (!iso) return 'no scheduled runs'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'no scheduled runs'
  const diff = ms - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 60_000) return 'next: <1m'
  if (diff < 3_600_000) return `next: ${Math.round(diff / 60_000)}m`
  if (diff < 86_400_000) return `next: ${Math.round(diff / 3_600_000)}h`
  return `next: ${Math.round(diff / 86_400_000)}d`
}

/**
 * Compact summary of cron jobs so users can spot a paused or failing
 * scheduled job without leaving the dashboard. Click-through deep links
 * to /jobs.
 */
export function CronSummaryCard({
  cron,
}: {
  cron: DashboardOverview['cron']
}) {
  const navigate = useNavigate()
  if (!cron) return null
  return (
    <button
      type="button"
      onClick={() => navigate({ to: '/jobs' })}
      className="group flex w-full items-center justify-between gap-3 rounded-md border bg-[var(--theme-card)]/40 px-3 py-2 text-left transition-colors hover:bg-[var(--theme-card)]/70"
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={Time04Icon}
          size={14}
          strokeWidth={1.5}
          style={{ color: 'var(--theme-muted)' }}
        />
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          Cron
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-mono">
        <span style={{ color: 'var(--theme-text)' }}>
          {cron.total} {cron.total === 1 ? 'job' : 'jobs'}
        </span>
        {cron.paused > 0 ? (
          <span style={{ color: 'var(--theme-warning)' }}>
            {cron.paused} paused
          </span>
        ) : null}
        {cron.running > 0 ? (
          <span style={{ color: 'var(--theme-success)' }}>
            {cron.running} running
          </span>
        ) : null}
        <span style={{ color: 'var(--theme-muted)' }}>
          {formatNextRun(cron.nextRunAt)}
        </span>
      </div>
    </button>
  )
}
