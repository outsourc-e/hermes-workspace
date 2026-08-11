import { Link } from '@tanstack/react-router'

import { RUNS_VIEWS  } from '../runs-search'
import { formatTimestamp } from '../runs-format'
import type {RunsView} from '../runs-search';
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'


type Props = {
  view: RunsView
  discovering: boolean
  generatedAt: number | null
  statusText: string
  discoveryError: string | null
  truncated: boolean
  onView: (view: RunsView) => void
  onRefresh: () => void
}

/**
 * Provider discovery is a deliberate, visible act: it is only ever started by
 * this button, never by rendering the screen.
 */
export function RunsHeader({ view, discovering, generatedAt, statusText, discoveryError, truncated, onView, onRefresh }: Props) {
  const active = RUNS_VIEWS.find((entry) => entry.id === view)
  return (
    <header className="rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-primary-900">Runs</h1>
          <p className="mt-1 text-sm text-primary-600">
            Every provider runtime Workspace has discovered — Hermes, Claude, and Codex — as read-only metadata.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/conductor" className={cn(buttonVariants({ variant: 'default', size: 'default' }))}>New run</Link>
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'secondary', size: 'default' }))}
              disabled={discovering}
              onClick={onRefresh}
            >
              {discovering ? 'Refreshing…' : 'Refresh from providers'}
            </button>
          </div>
          <p className="text-xs text-primary-500">
            {generatedAt ? `Inventory read ${formatTimestamp(generatedAt)}` : 'Inventory not read yet'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 rounded-xl border border-primary-200 bg-primary-50/70 p-1">
        {RUNS_VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === view}
            aria-describedby={entry.id === view ? 'runs-view-hint' : undefined}
            title={entry.hint}
            onClick={() => onView(entry.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              entry.id === view ? 'bg-primary-950 text-primary-50' : 'text-primary-600 hover:bg-primary-100',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p id="runs-view-hint" className="mt-2 text-xs text-primary-500">{active?.hint}</p>

      <p aria-live="polite" className="mt-2 text-sm text-primary-700">{statusText}</p>

      {truncated ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The registry exceeds the bounded 5,000-run projection. Additional history needs an indexed registry cursor before it can be shown safely.
        </p>
      ) : null}
      {discoveryError ? (
        <p role="alert" className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {discoveryError} — the metadata below is the last successful read.
        </p>
      ) : null}
    </header>
  )
}
