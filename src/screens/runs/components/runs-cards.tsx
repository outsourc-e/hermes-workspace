
import { EM_DASH, formatAge, routeLabel, shortPath } from '../runs-format'
import { KanbanPill, OwnershipPill, ProviderPill, StatePill } from './run-pills'
import type { RuntimeRun } from '@/server/runtime-run-projection'
import { cn } from '@/lib/utils'

type Props = {
  runs: ReadonlyArray<RuntimeRun>
  caption: string
  selectedId: string | null
  onSelect: (run: RuntimeRun) => void
}

/** Narrow-viewport rendering of the same rows the desktop table shows. */
export function RunsCards({ runs, caption, selectedId, onSelect }: Props) {
  return (
    <section aria-label="Runs" className="md:hidden">
      <p className="px-1 pb-2 text-xs text-primary-600">{caption}</p>
      <ul className="space-y-2">
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              aria-current={run.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(run)}
              className={cn(
                'w-full rounded-xl border border-primary-200 bg-primary-50/80 p-3 text-left shadow-2xs focus-visible:ring-2 focus-visible:ring-primary-950',
                run.id === selectedId ? 'border-primary-400 bg-primary-100/70' : 'active:bg-primary-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-primary-900">{run.title}</span>
                  <span className="block truncate font-mono text-[11px] text-primary-500">{run.shortId || run.id}</span>
                </span>
                <StatePill state={run.state} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ProviderPill provider={run.provider} />
                <KanbanPill linked={run.linked} taskId={run.kanbanTaskId} />
                {run.ownership.state !== 'free' ? <OwnershipPill ownership={run.ownership} /> : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-primary-600">
                <div className="min-w-0">
                  <dt className="text-primary-500">Account</dt>
                  <dd className="truncate">{run.account || EM_DASH}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-primary-500">Model / route</dt>
                  <dd className="truncate">{routeLabel(run)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-primary-500">Project</dt>
                  <dd className="truncate">{run.project ?? shortPath(run.worktree)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-primary-500">Updated</dt>
                  <dd className="truncate">{formatAge(run.stalenessMs)}</dd>
                </div>
              </dl>
            </button>
          </li>
        ))}
      </ul>
      {runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-primary-300 px-4 py-6 text-sm text-primary-600">
          No runs match these filters.
        </p>
      ) : null}
    </section>
  )
}
