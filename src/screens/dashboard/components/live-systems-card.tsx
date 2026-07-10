import type {
  DashboardLiveSystem,
  DashboardLiveSystemsSection,
  LiveSystemStatus,
} from '@/server/dashboard-aggregator'
import { STATUS_TONE } from '../lib/status-meta'

function formatTime(value: string | null): string {
  if (!value) return 'no heartbeat'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return 'unknown'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function StatusPill({ status }: { status: LiveSystemStatus }) {
  const meta = STATUS_TONE(status)
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.13em] ${meta.tone}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function SystemRow({ system }: { system: DashboardLiveSystem }) {
  const body = (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/70 p-3 transition-colors hover:border-[var(--theme-accent-border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {system.label}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--theme-muted)]">
            {system.detail}
          </p>
        </div>
        <StatusPill status={system.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
          {system.source}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
          {formatTime(system.lastSeenAt)}
        </span>
      </div>
    </div>
  )

  if (!system.href) return body
  return (
    <a href={system.href} className="block" title={system.detail}>
      {body}
    </a>
  )
}

export function LiveSystemsCard({
  liveSystems,
}: {
  liveSystems: DashboardLiveSystemsSection | null
}) {
  if (!liveSystems) return null
  const critical = liveSystems.systems.filter(
    (system) => system.status === 'offline' || system.status === 'degraded',
  )
  const visibleSystems = [
    ...critical,
    ...liveSystems.systems.filter(
      (system) => system.status !== 'offline' && system.status !== 'degraded',
    ),
  ].slice(0, 10)

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-success), var(--theme-warning), var(--theme-danger), transparent)',
        }}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Live Systems
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
              Real source wiring map
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              Reads current source-of-truth endpoints only. No writes, no
              secrets, no customer/vendor actions.
            </p>
          </div>
          <div className="grid grid-cols-5 gap-1.5 text-center">
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-success)]">
                {liveSystems.summary.operational + liveSystems.summary.connected}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                live
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-warning)]">
                {liveSystems.summary.approvalGated}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                needs&nbsp;T
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-warning)]">
                {liveSystems.summary.degraded}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                warn
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-danger)]">
                {liveSystems.summary.offline}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                down
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-muted)]">
                {liveSystems.summary.notWired + liveSystems.summary.reachable}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                unwired
              </div>
            </div>
          </div>
        </div>

        {liveSystems.blockers.length > 0 ? (
          <div className="rounded-lg border border-[var(--theme-warning)]/35 bg-[color-mix(in_srgb,var(--theme-warning)_8%,transparent)] p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--theme-warning)]">
              Needs attention
            </div>
            <ul className="mt-2 space-y-1">
              {liveSystems.blockers.slice(0, 3).map((blocker) => (
                <li
                  key={blocker}
                  className="text-[11px] leading-relaxed text-[var(--theme-muted)]"
                >
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visibleSystems.map((system) => (
            <SystemRow key={system.id} system={system} />
          ))}
        </div>
      </div>
    </section>
  )
}
