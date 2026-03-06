import { GlanceCard, HealthBadge, StatBlock } from './glance-card'
import { cn } from '@/lib/utils'

type SystemGlanceProps = {
  sessions: number
  activeAgents: number
  costToday: string
  uptimeFormatted: string
  updatedAgo: string
  healthStatus: 'healthy' | 'warning' | 'critical' | 'offline'
  gatewayConnected: boolean
  /** Context usage % from API (e.g. 47.3) — shown as MEMORY ring */
  sessionPercent?: number
  providers?: Array<{ name: string; cost: number; tokens: number }>
  currentModel?: string
  /** Compact single-row layout for mobile */
  compact?: boolean
  /** Optional controls rendered at the bottom of the card (e.g. widget edit buttons) */
  actions?: React.ReactNode
  /** True while initial data is still loading */
  loading?: boolean
}

function ShimmerBlock() {
  return (
    <div className="h-6 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
  )
}

// ─── Compact mobile variant ───────────────────────────────────────────────────

function SystemGlanceCompact({
  sessions,
  activeAgents: _activeAgents,
  costToday,
  uptimeFormatted,
  healthStatus,
  gatewayConnected: _gatewayConnected,
  sessionPercent: _sessionPercent,
  currentModel: _currentModel,
}: SystemGlanceProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/60">
      {/* Health dot */}
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          healthStatus === 'healthy' && 'animate-pulse bg-emerald-500',
          healthStatus === 'warning' && 'bg-amber-500',
          healthStatus === 'critical' && 'animate-pulse bg-red-500',
          healthStatus === 'offline' && 'bg-neutral-400',
        )}
      />

      {/* Stats — condensed for mobile */}
      <div className="flex flex-1 items-center justify-center gap-x-3">
        <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{costToday}</span>
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{sessions} sessions</span>
        <span className="text-neutral-300 dark:text-neutral-600">·</span>
        <span className="text-xs text-neutral-400">{uptimeFormatted}</span>
      </div>
    </div>
  )
}

// ─── Full desktop variant ─────────────────────────────────────────────────────

export function SystemGlance(props: SystemGlanceProps) {
  const {
    costToday,
    uptimeFormatted,
    updatedAgo,
    healthStatus,
    gatewayConnected,
    sessionPercent,
    currentModel,
    compact = false,
    actions,
  } = props

  if (compact) {
    return <SystemGlanceCompact {...props} />
  }

  return (
    <GlanceCard className="space-y-4">
      {/* Row 1: Updated timestamp + model badge | Single merged status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            Updated {updatedAgo}
          </span>
          {currentModel && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {currentModel}
            </span>
          )}
        </div>
        {/* Single merged badge — no more duplicate HEALTHY */}
        <HealthBadge
          status={healthStatus}
          syncing={gatewayConnected}
        />
      </div>

      {/* Row 2: Bordered stat blocks — Memory ring | Cost | Model */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary-200 bg-primary-50/80 py-3 px-2 dark:border-neutral-700/60 dark:bg-neutral-800/40">
          <StatBlock
            label="MEMORY"
            value=""
            percent={sessionPercent}
            sublabel="of context window"
          />
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary-200 bg-primary-50/80 py-3 px-2 dark:border-neutral-700/60 dark:bg-neutral-800/40">
          {props.loading ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">COST</span>
              <ShimmerBlock />
            </div>
          ) : (
            <StatBlock
              label="COST"
              value={costToday}
              sublabel="today"
            />
          )}
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary-200 bg-primary-50/80 py-3 px-2 dark:border-neutral-700/60 dark:bg-neutral-800/40">
          {props.loading ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">MODEL</span>
              <ShimmerBlock />
            </div>
          ) : (
            <StatBlock
              label="MODEL"
              value={currentModel || '—'}
              sublabel="active"
            />
          )}
        </div>
      </div>

      {/* Row 3: Uptime bar — HealthBadge intentionally removed here (shown top-right) */}
      <div className="rounded-xl border border-neutral-200/50 bg-neutral-50/50 p-3 dark:border-neutral-700/50 dark:bg-neutral-800/50">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            UPTIME
          </span>
          <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
            {uptimeFormatted}
          </span>
        </div>
      </div>

      {/* Row 4: Optional widget controls slot */}
      {actions ? (
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200/60 pt-3 dark:border-neutral-700/40">
          {actions}
        </div>
      ) : null}
    </GlanceCard>
  )
}
