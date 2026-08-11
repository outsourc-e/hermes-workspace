
import { EM_DASH, formatAge, routeLabel, shortPath } from '../runs-format'
import { KanbanPill, OwnershipPill, ProviderPill, StatePill } from './run-pills'
import type { RuntimeRun, RuntimeRunSortDirection, RuntimeRunSortKey } from '@/server/runtime-run-projection'
import { cn } from '@/lib/utils'

type Column = {
  key: string
  label: string
  sort?: RuntimeRunSortKey
  className?: string
}

const COLUMNS: ReadonlyArray<Column> = [
  { key: 'run', label: 'Run', sort: 'title' },
  { key: 'provider', label: 'Provider', sort: 'provider' },
  { key: 'state', label: 'State', sort: 'state' },
  { key: 'account', label: 'Account' },
  { key: 'model', label: 'Model / route' },
  { key: 'project', label: 'Project', sort: 'project' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'updated', label: 'Updated', sort: 'updated', className: 'text-right' },
]

type Props = {
  runs: ReadonlyArray<RuntimeRun>
  caption: string
  captionDetail: string
  sort: RuntimeRunSortKey
  direction: RuntimeRunSortDirection
  selectedId: string | null
  onSort: (key: RuntimeRunSortKey) => void
  onSelect: (run: RuntimeRun) => void
}

/**
 * Compact desktop grid. One row per run, no nested interactive controls beyond
 * the single row trigger, so keyboard traversal stays predictable.
 */
export function RunsTable({ runs, caption, captionDetail, sort, direction, selectedId, onSort, onSelect }: Props) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-primary-200 bg-primary-50/70 md:block">
      <table className="w-full border-collapse text-sm">
        <caption className="border-b border-primary-200 px-4 py-2 text-left text-xs text-primary-600">
          {caption}
          <span className="ml-2 text-primary-500">{captionDetail}</span>
        </caption>
        <thead>
          <tr className="border-b border-primary-200 bg-primary-50/80">
            {COLUMNS.map((column) => {
              const sorted = column.sort === sort
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={column.sort ? (sorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={cn('px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-primary-500', column.className)}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded hover:text-primary-900 focus-visible:ring-2 focus-visible:ring-primary-950"
                      onClick={() => onSort(column.sort as RuntimeRunSortKey)}
                    >
                      {column.label}
                      <span aria-hidden="true" className={cn('text-[10px]', sorted ? 'opacity-100' : 'opacity-0')}>
                        {direction === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  ) : column.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              aria-current={run.id === selectedId ? 'true' : undefined}
              className={cn(
                'border-b border-primary-100 align-middle last:border-b-0',
                run.id === selectedId ? 'bg-primary-100/70' : 'hover:bg-primary-50',
              )}
            >
              <th scope="row" className="max-w-[320px] px-3 py-2 text-left font-normal">
                <button
                  type="button"
                  className="block w-full truncate text-left font-medium text-primary-900 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-primary-950"
                  onClick={() => onSelect(run)}
                >
                  {run.title}
                </button>
                <span className="block truncate font-mono text-[11px] text-primary-500">{run.shortId || run.id}</span>
              </th>
              <td className="px-3 py-2"><ProviderPill provider={run.provider} /></td>
              <td className="px-3 py-2">
                <div className="flex flex-col items-start gap-1">
                  <StatePill state={run.state} />
                  {run.ownership.state !== 'free' ? <OwnershipPill ownership={run.ownership} /> : null}
                </div>
              </td>
              <td className="max-w-[160px] truncate px-3 py-2 text-primary-700">{run.account || EM_DASH}</td>
              <td className="max-w-[200px] truncate px-3 py-2 text-primary-700" title={run.route ?? undefined}>{routeLabel(run)}</td>
              <td className="max-w-[200px] truncate px-3 py-2 text-primary-700" title={run.worktree ?? undefined}>
                {run.project ?? shortPath(run.worktree)}
              </td>
              <td className="px-3 py-2"><KanbanPill linked={run.linked} taskId={run.kanbanTaskId} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-primary-600">{formatAge(run.stalenessMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-primary-600">No runs match these filters.</p>
      ) : null}
    </div>
  )
}
