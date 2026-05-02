import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Time04Icon,
  Settings02Icon,
  ConsoleIcon,
} from '@hugeicons/core-free-icons'
import type {
  DashboardIncident,
  DashboardOverview,
} from '@/server/dashboard-aggregator'

const SOURCE_ICON: Record<DashboardIncident['source'], typeof AlertCircleIcon> = {
  cron: Time04Icon,
  platform: AlertCircleIcon,
  log: ConsoleIcon,
  config: Settings02Icon,
  gateway: AlertCircleIcon,
}

/**
 * The "Attention" card — what the operator should look at right now.
 *
 * Reads the server-aggregated `incidents[]` array from the overview
 * payload. The aggregator merges failed cron jobs, platform errors,
 * config drift, restart-pending, and log tail errors into a single
 * triage list, so the UI stays dumb and presentation-only.
 */
export function AttentionCard({
  overview,
}: {
  overview: DashboardOverview | null
}) {
  const navigate = useNavigate()
  const items = overview?.incidents ?? []
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
            const Icon = SOURCE_ICON[item.source] ?? AlertCircleIcon
            const content = (
              <div className="flex items-start gap-2">
                <HugeiconsIcon
                  icon={Icon}
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
              const href = item.href
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: href, search: {} } as never)
                    }
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
