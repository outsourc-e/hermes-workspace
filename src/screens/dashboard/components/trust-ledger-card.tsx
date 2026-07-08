import type {
  DashboardTrustLedgerMilestone,
  DashboardTrustLedgerSection,
  TrustLedgerStatus,
} from '@/server/dashboard-aggregator'

const STATUS_META: Record<
  TrustLedgerStatus,
  { label: string; tone: string; bar: string }
> = {
  Unwired: {
    label: 'Unwired',
    tone: 'text-[var(--theme-muted)] border-[var(--theme-border)] bg-[var(--theme-card2)]',
    bar: 'var(--theme-muted)',
  },
  Tested: {
    label: 'Tested',
    tone: 'text-[var(--theme-warning)] border-[color-mix(in_srgb,var(--theme-warning)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-warning)_10%,transparent)]',
    bar: 'var(--theme-warning)',
  },
  Reliable: {
    label: 'Reliable',
    tone: 'text-[var(--theme-accent)] border-[color-mix(in_srgb,var(--theme-accent)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-accent)_10%,transparent)]',
    bar: 'var(--theme-accent)',
  },
  Trusted: {
    label: 'Trusted',
    tone: 'text-[var(--theme-success)] border-[color-mix(in_srgb,var(--theme-success)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-success)_10%,transparent)]',
    bar: 'var(--theme-success)',
  },
  Autonomous: {
    label: 'Autonomous',
    tone: 'text-[var(--theme-text)] border-[color-mix(in_srgb,var(--theme-accent)_45%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-accent)_16%,transparent)]',
    bar: 'var(--theme-accent)',
  },
}

function clampPercent(current: number, target: number): number {
  if (!target || target <= 0) return current > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function StatusPill({ status }: { status: TrustLedgerStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${meta.tone}`}
    >
      {meta.label}
    </span>
  )
}

function ProgressBar({
  milestone,
}: {
  milestone: DashboardTrustLedgerMilestone
}) {
  const pct = clampPercent(
    milestone.progress.current,
    milestone.progress.target,
  )
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--theme-card2)]">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${pct}%`,
          background: STATUS_META[milestone.status].bar,
          boxShadow: `0 0 12px ${STATUS_META[milestone.status].bar}`,
        }}
      />
    </div>
  )
}

function MiniList({
  title,
  items,
  empty,
}: {
  title: string
  items: Array<DashboardTrustLedgerMilestone>
  empty: string
}) {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
        {title}
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[var(--theme-text)]">
                  {item.label}
                </div>
                <div className="truncate text-[10px] text-[var(--theme-muted)]">
                  {item.weakArea ?? item.summary}
                </div>
              </div>
              <StatusPill status={item.status} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--theme-muted)]">{empty}</p>
      )}
    </div>
  )
}

function MilestoneRow({
  milestone,
}: {
  milestone: DashboardTrustLedgerMilestone
}) {
  const evidence = milestone.evidence.filter(Boolean).slice(0, 2)
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {milestone.label}
          </div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--theme-muted)]">
            {milestone.summary}
          </div>
        </div>
        <StatusPill status={milestone.status} />
      </div>

      <ProgressBar milestone={milestone} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
          {compactNumber(milestone.progress.current)} /{' '}
          {compactNumber(milestone.progress.target)} {milestone.progress.unit}
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {milestone.sourceLinks.map((link) => (
            <a
              key={`${milestone.id}-${link.href}-${link.label}`}
              href={link.href}
              className="rounded border border-[var(--theme-border)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--theme-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--theme-accent)_10%,transparent)]"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {evidence.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-[var(--theme-border)] pt-2">
          {evidence.map((line) => (
            <div
              key={`${milestone.id}-${line}`}
              className="truncate font-mono text-[10px] text-[var(--theme-muted)]"
              title={line}
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function TrustLedgerCard({
  trustLedger,
}: {
  trustLedger: DashboardTrustLedgerSection | null
}) {
  if (!trustLedger) return null

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 42%, transparent), transparent)',
        }}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Trust Ledger
            </div>
            <div className="mt-1 text-sm leading-relaxed text-[var(--theme-muted)]">
              Capability milestones from live Hermes, memory, jobs, auth, and
              vault signals.
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <div className="font-mono text-3xl font-bold tabular-nums text-[var(--theme-text)]">
              {trustLedger.score}
            </div>
            <StatusPill status={trustLedger.highestStatus} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-2">
            <div className="font-mono text-lg font-semibold tabular-nums text-[var(--theme-text)]">
              {trustLedger.counters.reliableOrBetter}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              reliable+
            </div>
          </div>
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-2">
            <div className="font-mono text-lg font-semibold tabular-nums text-[var(--theme-text)]">
              {trustLedger.counters.trustedOrBetter}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              trusted+
            </div>
          </div>
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-2">
            <div className="font-mono text-lg font-semibold tabular-nums text-[var(--theme-text)]">
              {trustLedger.counters.autonomous}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              auto
            </div>
          </div>
        </div>

        <MiniList
          title="Recent unlocks"
          items={trustLedger.recentUnlocks}
          empty="No reliable milestones proven yet."
        />
        <MiniList
          title="Weak areas"
          items={trustLedger.weakAreas}
          empty="No weak areas surfaced from current signals."
        />

        <div className="space-y-2">
          {trustLedger.milestones.map((milestone) => (
            <MilestoneRow key={milestone.id} milestone={milestone} />
          ))}
        </div>
      </div>
    </section>
  )
}
