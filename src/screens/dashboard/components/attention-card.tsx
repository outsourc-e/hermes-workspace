import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Time04Icon,
  Settings02Icon,
  ConsoleIcon,
} from '@hugeicons/core-free-icons'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

type AttentionItem = {
  id: string
  severity: 'warn' | 'error' | 'info'
  icon: typeof AlertCircleIcon
  label: string
  detail: string
  href?: { to: string; search?: Record<string, unknown> }
}

function isCronStale(nextRunAt: string | null): boolean {
  if (!nextRunAt) return false
  const ms = Date.parse(nextRunAt)
  if (!Number.isFinite(ms)) return false
  return ms - Date.now() < -7 * 86_400_000
}

function buildItems(overview: DashboardOverview | null): Array<AttentionItem> {
  if (!overview) return []
  const items: Array<AttentionItem> = []

  // Stale or paused cron
  if (overview.cron) {
    const stale = isCronStale(overview.cron.nextRunAt)
    if (stale) {
      items.push({
        id: 'cron-stale',
        severity: 'warn',
        icon: Time04Icon,
        label: `${overview.cron.total} cron job${overview.cron.total === 1 ? '' : 's'} stale`,
        detail: 'Last scheduled run is more than 7 days overdue.',
        href: { to: '/jobs' },
      })
    } else if (overview.cron.paused > 0) {
      items.push({
        id: 'cron-paused',
        severity: 'warn',
        icon: Time04Icon,
        label: `${overview.cron.paused} paused job${overview.cron.paused === 1 ? '' : 's'}`,
        detail: 'Resume from /jobs if these should be running.',
        href: { to: '/jobs' },
      })
    }
  }

  // Log errors / warnings
  if (overview.logs && overview.logs.errorCount > 0) {
    items.push({
      id: 'log-errors',
      severity: 'error',
      icon: ConsoleIcon,
      label: `${overview.logs.errorCount} log error${overview.logs.errorCount === 1 ? '' : 's'} in tail`,
      detail: 'Recent agent log shows tracebacks or fatal errors.',
    })
  } else if (overview.logs && overview.logs.warnCount > 0) {
    items.push({
      id: 'log-warns',
      severity: 'warn',
      icon: ConsoleIcon,
      label: `${overview.logs.warnCount} log warning${overview.logs.warnCount === 1 ? '' : 's'}`,
      detail: 'Recent agent log emitted warnings.',
    })
  }

  // Config drift
  if (
    overview.status &&
    overview.status.configVersion !== null &&
    overview.status.latestConfigVersion !== null &&
    overview.status.latestConfigVersion > overview.status.configVersion
  ) {
    const diff =
      overview.status.latestConfigVersion - overview.status.configVersion
    items.push({
      id: 'config-drift',
      severity: 'warn',
      icon: Settings02Icon,
      label: `${diff} config diff${diff === 1 ? '' : 's'} pending`,
      detail: `Local v${overview.status.configVersion} · latest v${overview.status.latestConfigVersion}`,
      href: { to: '/settings', search: {} },
    })
  }

  // Restart pending
  if (overview.status?.restartRequested) {
    items.push({
      id: 'restart-pending',
      severity: 'warn',
      icon: AlertCircleIcon,
      label: 'Restart pending',
      detail: 'Hermes flagged restart_requested on /api/status.',
    })
  }

  // Platform errors
  for (const p of overview.platforms) {
    if (
      p.state.toLowerCase() === 'error' ||
      p.state.toLowerCase() === 'failed' ||
      p.state.toLowerCase() === 'disconnected'
    ) {
      items.push({
        id: `platform-${p.name}`,
        severity: 'error',
        icon: AlertCircleIcon,
        label: `${p.name} ${p.state}`,
        detail: p.errorMessage || 'Platform reports a non-connected state.',
      })
    }
  }

  return items
}

/**
 * The "Attention" card — what the operator should look at right now.
 *
 * Replaces the noisy mix of separate warning chips scattered across the
 * dashboard with a single prioritized list. Items are derived from the
 * already-aggregated overview payload, so no new endpoints needed.
 *
 * Renders an "All clear" state when nothing demands attention. That
 * keeps the card present in the layout (no reflow) and makes the
 * positive signal explicit, which the Hermes Agent review specifically
 * called out.
 */
export function AttentionCard({
  overview,
}: {
  overview: DashboardOverview | null
}) {
  const navigate = useNavigate()
  const items = buildItems(overview)
  const empty = items.length === 0

  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 90%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-15 blur-3xl"
        style={{
          background: empty ? 'var(--theme-success)' : 'var(--theme-warning)',
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={empty ? CheckmarkCircle02Icon : AlertCircleIcon}
            size={14}
            strokeWidth={1.5}
            style={{
              color: empty ? 'var(--theme-success)' : 'var(--theme-warning)',
            }}
          />
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--theme-text)' }}
          >
            Attention
          </h3>
        </div>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]"
          style={{
            background: empty
              ? 'color-mix(in srgb, var(--theme-success) 14%, transparent)'
              : 'color-mix(in srgb, var(--theme-warning) 14%, transparent)',
            color: empty ? 'var(--theme-success)' : 'var(--theme-warning)',
          }}
        >
          {empty ? 'all clear' : `${items.length}`}
        </span>
      </div>

      {empty ? (
        <p
          className="py-1 text-[11px]"
          style={{ color: 'var(--theme-muted)' }}
        >
          Nothing to triage. Gateway healthy, no stale jobs, logs quiet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const tone =
              item.severity === 'error'
                ? 'var(--theme-danger)'
                : item.severity === 'warn'
                  ? 'var(--theme-warning)'
                  : 'var(--theme-muted)'
            const content = (
              <div className="flex items-start gap-2">
                <HugeiconsIcon
                  icon={item.icon}
                  size={12}
                  strokeWidth={1.5}
                  style={{ color: tone, marginTop: 2 }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[11px] font-semibold"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {item.label}
                  </div>
                  <div
                    className="truncate text-[10px]"
                    style={{ color: 'var(--theme-muted)' }}
                    title={item.detail}
                  >
                    {item.detail}
                  </div>
                </div>
              </div>
            )
            if (item.href) {
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href as never)}
                    className="w-full rounded border px-2 py-1.5 text-left transition-colors hover:bg-[var(--theme-card)]/80"
                    style={{ borderColor: 'var(--theme-border)' }}
                  >
                    {content}
                  </button>
                </li>
              )
            }
            return (
              <li
                key={item.id}
                className="rounded border px-2 py-1.5"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                {content}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
