import { cn } from '@/lib/utils'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

/**
 * One-line strip showing gateway state + active agents + a soft warning
 * pill when the agent has flagged a restart_requested. Sits at the top of
 * the dashboard so users get a fast read on whether anything is wrong
 * before they dig into cards.
 */
export function SystemStatusStrip({
  status,
}: {
  status: DashboardOverview['status']
}) {
  if (!status) return null
  const ok =
    status.gatewayState === 'running' ||
    status.gatewayState === 'connected' ||
    status.gatewayState === 'ok'
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-[11px]',
        'bg-[var(--theme-card)]/60 backdrop-blur-sm',
      )}
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-1.5 w-1.5 rounded-full',
            ok ? 'bg-[var(--theme-success)]' : 'bg-[var(--theme-warning)]',
          )}
        />
        <span
          className="font-mono uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {ok ? 'gateway online' : `gateway ${status.gatewayState}`}
        </span>
        <span
          className="font-mono uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          · {status.activeAgents} active{' '}
          {status.activeAgents === 1 ? 'agent' : 'agents'}
        </span>
      </div>
      {status.restartRequested ? (
        <span
          className="rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em]"
          style={{
            background:
              'color-mix(in srgb, var(--theme-warning) 15%, transparent)',
            color: 'var(--theme-warning)',
            border:
              '1px solid color-mix(in srgb, var(--theme-warning) 35%, transparent)',
          }}
        >
          restart requested
        </span>
      ) : null}
    </div>
  )
}
