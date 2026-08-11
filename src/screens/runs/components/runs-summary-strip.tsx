import { formatCount, providerLabel } from '../runs-format'
import type { RuntimeRunSummary } from '@/server/runtime-run-projection'


type Tile = { label: string; value: number; hint: string }

function tilesFor(summary: RuntimeRunSummary): Array<Tile> {
  return [
    { label: 'Matched', value: summary.total, hint: 'Runs matching the current filters.' },
    { label: 'Active', value: summary.active, hint: 'Provider hosts reported as running.' },
    { label: 'Idle', value: summary.idle, hint: 'Discovered but not running.' },
    { label: 'Stopped', value: summary.stopped, hint: 'Host process has exited.' },
    { label: 'Attention', value: summary.attention, hint: 'Host or writer-lease state is unverified.' },
    { label: 'Resumable', value: summary.idleResumable, hint: 'Idle or stopped runs a provider may be able to resume.' },
    { label: 'Kanban linked', value: summary.linkedKanban, hint: 'Kanban stays authoritative; linkage is metadata only.' },
    { label: 'Leased', value: summary.owned, hint: 'A writer lease is currently held.' },
    { label: 'Recoverable', value: summary.recoverable, hint: 'Abandoned writer lease that can be recovered.' },
    { label: 'Stale', value: summary.stale, hint: 'No metadata update for more than 15 minutes.' },
  ]
}

export function RunsSummaryStrip({ summary }: { summary: RuntimeRunSummary | null }) {
  if (!summary) return null
  const providers = Object.entries(summary.byProvider).filter(([, count]) => count > 0)
  return (
    <section aria-labelledby="runs-summary-heading" className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-3 md:px-4">
      <h2 id="runs-summary-heading" className="sr-only">Run inventory summary</h2>
      <dl className="flex snap-x gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:gap-3 md:overflow-visible lg:grid-cols-10">
        {tilesFor(summary).map((tile) => (
          <div
            key={tile.label}
            title={tile.hint}
            className="min-w-[104px] shrink-0 snap-start rounded-lg border border-primary-200 bg-primary-50/70 px-3 py-2 md:min-w-0"
          >
            <dt className="text-[11px] font-medium uppercase tracking-wide text-primary-500">{tile.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-primary-900">{formatCount(tile.value)}</dd>
          </div>
        ))}
      </dl>
      {providers.length > 0 ? (
        <p className="mt-2 text-xs text-primary-600">
          By provider: {providers.map(([provider, count]) => `${providerLabel(provider)} ${formatCount(count)}`).join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
