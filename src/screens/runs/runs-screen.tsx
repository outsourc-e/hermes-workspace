// Runs — a provider-neutral control-center for every runtime Workspace has
// discovered.
//
// Contract this screen keeps:
//   • Loading it reads metadata only (GET /api/runtime-runs). It never starts a
//     provider process, never launches a CLI, never takes a writer lease.
//   • Provider discovery is one explicit button that posts {action:'refresh'}
//     and then re-reads metadata with the filters the user still has applied.
//   • The URL holds filters and one selected run ID. Prompts, instructions, and
//     action payloads are never written to the URL or to storage.
//   • Actions are enabled only when the projection says the operation is
//     invokable today; anything else is disabled with the real reason attached.

import { useCallback, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'


import { RunDetailDrawer } from './components/run-detail-drawer'
import { RunsCards } from './components/runs-cards'
import { RunsFilters } from './components/runs-filters'
import { RunsHeader } from './components/runs-header'
import { RunsPagination } from './components/runs-pagination'
import { RunsSummaryStrip } from './components/runs-summary-strip'
import { RunsTable } from './components/runs-table'
import { pluralRuns } from './runs-format'
import {
  normalizeDirection,
  normalizeSize,
  normalizeSort,
  normalizeView,
  viewHasInventory
} from './runs-search'
import { useRunsInventory } from './use-runs-inventory'
import type {RunsPageSize, RunsSearch, RunsView} from './runs-search';
import type { RuntimeRun, RuntimeRunSortKey } from '@/server/runtime-run-projection'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ARCHIVED_EXPLANATION =
  'Archived runs need durable archive metadata — a recorded archive time and the identity that archived it. The provider runtime registry does not persist that yet, so an "archived" list here could only be a guess. Archive from a run\'s detail panel is reported per runtime.'

function uniqueSorted(values: ReadonlyArray<string | null>): Array<string> {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
}

export function RunsScreen() {
  const search = useSearch({ from: '/runs' })
  const navigate = useNavigate()

  const view = normalizeView(search.view)
  const sort = normalizeSort(search.sort)
  const direction = normalizeDirection(search.direction)
  const size = normalizeSize(search.size)
  const hasInventory = viewHasInventory(view)

  const { status, data, error, discoveryError, discovering, reload, discover, dispatch } = useRunsInventory(search, hasInventory)

  const update = useCallback((patch: RunsSearch, replace = false) => {
    void navigate({
      to: '/runs',
      search: (previous: RunsSearch) => ({ ...previous, ...patch }),
      ...(replace ? { replace: true } : {}),
    })
  }, [navigate])

  const runs = data?.runs ?? []
  const page = data?.page ?? null
  const selectedId = typeof search.run === 'string' && search.run ? search.run : null
  const selected = selectedId
    ? runs.find((run) => run.id === selectedId) ?? (data?.selectedRun?.id === selectedId ? data.selectedRun : null)
    : null

  const accounts = useMemo(() => uniqueSorted(runs.map((run) => run.account)), [runs])
  const projects = useMemo(() => uniqueSorted(runs.map((run) => run.project)), [runs])

  const first = page && page.total > 0 ? (page.number - 1) * page.size + 1 : 0
  const caption = page && page.total > 0
    ? `Runs ${first}–${first + runs.length - 1} of ${page.total}`
    : 'No runs match these filters'
  const captionDetail = page
    ? `Page ${page.number} of ${page.pages} · sorted by ${sort}, ${direction === 'asc' ? 'ascending' : 'descending'}`
    : ''

  const statusText = !hasInventory
    ? 'Archived runs are unavailable — no durable archive metadata exists.'
    : status === 'error'
      ? `Runs unavailable — ${error ?? 'the inventory could not be read'}`
      : !data
        ? 'Loading runs…'
        : `${pluralRuns(page?.total ?? 0)} matched · showing ${runs.length} on this page`

  const onSort = useCallback((key: RuntimeRunSortKey) => {
    update(key === sort
      ? { direction: direction === 'asc' ? 'desc' : 'asc', page: 1 }
      : { sort: key, direction: 'desc', page: 1 })
  }, [direction, sort, update])

  const onSelect = useCallback((run: RuntimeRun) => update({ run: run.id }), [update])
  const onCloseDrawer = useCallback(() => update({ run: undefined }, true), [update])
  const onView = useCallback((next: RunsView) => update({ view: next, page: 1, run: undefined }), [update])

  return (
    <main className="min-h-full bg-surface px-3 pb-24 pt-5 text-primary-900 md:px-5 md:pt-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-4">
        <RunsHeader
          view={view}
          discovering={discovering}
          generatedAt={data?.generatedAt ?? null}
          statusText={statusText}
          discoveryError={discoveryError}
          truncated={Boolean(data?.inventory.truncated)}
          onView={onView}
          onRefresh={() => void discover()}
        />

        <RunsSummaryStrip summary={data?.summary ?? null} />

        <RunsFilters search={search} accounts={accounts} projects={projects} onChange={update} />

        {!hasInventory ? (
          <section className="rounded-xl border border-dashed border-primary-300 bg-primary-50/60 px-4 py-8 text-center">
            <h2 className="text-sm font-semibold text-primary-900">Archived runs are unavailable</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-primary-600">{ARCHIVED_EXPLANATION}</p>
            <button type="button" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-4')} onClick={() => onView('recent')}>
              Back to recent runs
            </button>
          </section>
        ) : status === 'error' && !data ? (
          <section role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-8 text-center">
            <h2 className="text-sm font-semibold text-red-800">Runs could not be loaded</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-red-700">{error}</p>
            <button type="button" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-4')} onClick={() => void reload()}>
              Try again
            </button>
          </section>
        ) : !data ? (
          <section className="rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-10 text-center text-sm text-primary-600">
            Reading runtime metadata…
          </section>
        ) : (
          <>
            {selectedId && !selected ? (
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                The linked run is not in the current filters or page.{' '}
                <button type="button" className="underline underline-offset-2" onClick={onCloseDrawer}>Clear the selection</button>
              </p>
            ) : null}
            <RunsTable
              runs={runs}
              caption={caption}
              captionDetail={captionDetail}
              sort={sort}
              direction={direction}
              selectedId={selectedId}
              onSort={onSort}
              onSelect={onSelect}
            />
            <RunsCards runs={runs} caption={`${caption} · ${captionDetail}`} selectedId={selectedId} onSelect={onSelect} />
            {page ? (
              <RunsPagination
                page={page}
                size={size}
                busy={status === 'reloading'}
                onPage={(next) => update({ page: next })}
                onSize={(next: RunsPageSize) => update({ size: next, page: 1 })}
              />
            ) : null}
          </>
        )}

        {selected ? <RunDetailDrawer run={selected} availableRoutes={data?.availableRoutes ?? []} onClose={onCloseDrawer} onAction={dispatch} /> : null}
      </div>
    </main>
  )
}
