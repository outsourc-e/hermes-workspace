import type {
  DashboardNotebookBridgeSection,
  NotebookBridgeStageStatus,
} from '@/server/dashboard-aggregator'

const STATUS_STYLE: Record<NotebookBridgeStageStatus, string> = {
  Ready:
    'border-[color-mix(in_srgb,var(--theme-success)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-success)_10%,transparent)] text-[var(--theme-success)]',
  Manual:
    'border-[color-mix(in_srgb,var(--theme-warning)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-warning)_10%,transparent)] text-[var(--theme-warning)]',
  Draft:
    'border-[color-mix(in_srgb,var(--theme-accent)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-accent)_10%,transparent)] text-[var(--theme-accent)]',
  Blocked:
    'border-[color-mix(in_srgb,var(--theme-danger)_35%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-danger)_10%,transparent)] text-[var(--theme-danger)]',
}

function StatusBadge({ status }: { status: NotebookBridgeStageStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  )
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function formatDate(value: string | null): string {
  if (!value) return 'no vault pulse'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return 'vault pulse unknown'
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function NotebookLmBridgeCard({
  bridge,
}: {
  bridge: DashboardNotebookBridgeSection | null
}) {
  if (!bridge) return null

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-warning), color-mix(in srgb, var(--theme-warning) 38%, transparent), transparent)',
        }}
      />

      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              NotebookLM Bridge
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
              Synthesis lane, not source of truth
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              Obsidian sources move through NotebookLM, then reviewed drafts
              return with source links.
            </p>
          </div>
          <span className="w-fit rounded-full border border-[var(--theme-border)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-warning)]">
            manual
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-2">
            <div className="font-mono text-lg font-semibold tabular-nums text-[var(--theme-text)]">
              {formatCompact(bridge.vaultNotes)}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              notes
            </div>
          </div>
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-2">
            <div className="font-mono text-lg font-semibold tabular-nums text-[var(--theme-text)]">
              {formatCompact(bridge.vaultLinks)}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              links
            </div>
          </div>
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-2">
            <div className="truncate font-mono text-xs font-semibold text-[var(--theme-text)]">
              {formatDate(bridge.lastVaultUpdate)}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
              pulse
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
            Flow
          </div>
          <div className="mt-2 grid gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--theme-text)]">
            <div>{bridge.canonicalSource} sources</div>
            <div className="text-[var(--theme-muted)]">
              to {bridge.synthesisLayer} synthesis
            </div>
            <div>drafts to {bridge.writebackTargets.join(' / ')}</div>
          </div>
        </div>

        <div className="space-y-2">
          {bridge.stages.map((stage) => (
            <div
              key={stage.id}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/70 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--theme-text)]">
                    {stage.label}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
                    {stage.summary}
                  </p>
                </div>
                <StatusBadge status={stage.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {stage.sourceLinks.map((link) => (
                  <a
                    key={`${stage.id}-${link.href}-${link.label}`}
                    href={link.href}
                    className="rounded border border-[var(--theme-border)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--theme-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--theme-accent)_10%,transparent)]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-[color-mix(in_srgb,var(--theme-warning)_28%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-warning)_7%,transparent)] p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-warning)]">
            Guardrails
          </div>
          <div className="mt-2 space-y-1.5">
            {bridge.guardrails.map((guardrail) => (
              <p
                key={guardrail}
                className="text-[11px] leading-relaxed text-[var(--theme-muted)]"
              >
                {guardrail}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
