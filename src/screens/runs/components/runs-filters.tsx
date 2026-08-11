import { useEffect, useId, useState } from 'react'

import {
  CLEARED_FILTERS,
  RUNS_OWNERSHIPS,
  RUNS_PROVIDERS,
  RUNS_STATES,
  RUNS_WINDOWS,
  hasActiveFilters,
  normalizeKanban,
  normalizeView,
  normalizeWindow
} from '../runs-search'
import { ownershipLabel, providerLabel, stateLabel } from '../runs-format'
import type {RunsSearch} from '../runs-search';
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'


const FIELD = 'h-9 w-full rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-sm text-primary-900 shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-primary-950 disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'text-[11px] font-medium uppercase tracking-wide text-primary-500'

type Props = {
  search: RunsSearch
  accounts: ReadonlyArray<string>
  projects: ReadonlyArray<string>
  onChange: (patch: RunsSearch) => void
}

/**
 * Filter controls. Every control writes to the URL, so a filtered inventory is
 * shareable — and nothing but filters is ever written there.
 */
export function RunsFilters({ search, accounts, projects, onChange }: Props) {
  const view = normalizeView(search.view)
  const stateFromView = view === 'active' || view === 'attention'
  const ids = useId()
  const accountListId = `${ids}-accounts`
  const projectListId = `${ids}-projects`
  const stateHelpId = `${ids}-state-help`

  // Local echo of the query so typing stays responsive; the URL is the source
  // of truth and wins whenever it changes underneath us.
  const [query, setQuery] = useState(search.q ?? '')
  useEffect(() => { setQuery(search.q ?? '') }, [search.q])

  return (
    <section aria-labelledby="runs-filters-heading" className="rounded-xl border border-primary-200 bg-primary-50/70 p-3 md:p-4">
      <h2 id="runs-filters-heading" className="sr-only">Filter runs</h2>
      <form
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          onChange({ q: query.trim() || undefined, page: 1 })
        }}
      >
        <div className="lg:col-span-2">
          <label className={LABEL} htmlFor={`${ids}-q`}>Search</label>
          <div className="mt-1 flex gap-2">
            <input
              id={`${ids}-q`}
              type="search"
              className={FIELD}
              maxLength={200}
              placeholder="Title, task, account, model, worktree, run ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => { if ((search.q ?? '') !== query.trim()) onChange({ q: query.trim() || undefined, page: 1 }) }}
            />
            <button type="submit" className={cn(buttonVariants({ variant: 'secondary', size: 'default' }), 'shrink-0')}>
              Search
            </button>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-provider`}>Provider</label>
          <select
            id={`${ids}-provider`}
            className={cn(FIELD, 'mt-1')}
            value={search.provider ?? ''}
            onChange={(event) => onChange({ provider: event.target.value || undefined, page: 1 })}
          >
            <option value="">Any provider</option>
            {RUNS_PROVIDERS.map((provider) => <option key={provider} value={provider}>{providerLabel(provider)}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-state`}>State</label>
          <select
            id={`${ids}-state`}
            className={cn(FIELD, 'mt-1')}
            disabled={stateFromView}
            aria-describedby={stateFromView ? stateHelpId : undefined}
            value={stateFromView ? view : (search.state ?? '')}
            onChange={(event) => onChange({ state: event.target.value || undefined, page: 1 })}
          >
            <option value="">Any state</option>
            {RUNS_STATES.map((state) => <option key={state} value={state}>{stateLabel(state)}</option>)}
          </select>
          {stateFromView ? (
            <p id={stateHelpId} className="mt-1 text-xs text-primary-500">
              The {view === 'active' ? 'Active' : 'Attention'} view already pins the state filter. Switch to Recent to choose a state.
            </p>
          ) : null}
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-account`}>Account</label>
          <input
            id={`${ids}-account`}
            className={cn(FIELD, 'mt-1')}
            list={accountListId}
            maxLength={200}
            placeholder="Any account"
            defaultValue={search.account ?? ''}
            key={`account:${search.account ?? ''}`}
            onBlur={(event) => {
              const value = event.target.value.trim()
              if (value !== (search.account ?? '')) onChange({ account: value || undefined, page: 1 })
            }}
          />
          <datalist id={accountListId}>
            {accounts.map((account) => <option key={account} value={account} />)}
          </datalist>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-project`}>Project</label>
          <input
            id={`${ids}-project`}
            className={cn(FIELD, 'mt-1')}
            list={projectListId}
            maxLength={200}
            placeholder="Any project"
            defaultValue={search.project ?? ''}
            key={`project:${search.project ?? ''}`}
            onBlur={(event) => {
              const value = event.target.value.trim()
              if (value !== (search.project ?? '')) onChange({ project: value || undefined, page: 1 })
            }}
          />
          <datalist id={projectListId}>
            {projects.map((project) => <option key={project} value={project} />)}
          </datalist>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-kanban`}>Kanban</label>
          <select
            id={`${ids}-kanban`}
            className={cn(FIELD, 'mt-1')}
            value={normalizeKanban(search.kanban)}
            onChange={(event) => onChange({ kanban: event.target.value as RunsSearch['kanban'], page: 1 })}
          >
            <option value="all">Linked and unlinked</option>
            <option value="linked">Linked to a task</option>
            <option value="unlinked">Not linked</option>
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-ownership`}>Writer lease</label>
          <select
            id={`${ids}-ownership`}
            className={cn(FIELD, 'mt-1')}
            value={search.ownership ?? ''}
            onChange={(event) => onChange({ ownership: event.target.value || undefined, page: 1 })}
          >
            <option value="">Any lease state</option>
            {RUNS_OWNERSHIPS.map((state) => <option key={state} value={state}>{ownershipLabel(state)}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor={`${ids}-window`}>Last updated</label>
          <select
            id={`${ids}-window`}
            className={cn(FIELD, 'mt-1')}
            value={normalizeWindow(search.window)}
            onChange={(event) => onChange({ window: event.target.value as RunsSearch['window'], from: undefined, to: undefined, page: 1 })}
          >
            {RUNS_WINDOWS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>

        <div className="flex items-end justify-between gap-2 md:col-span-2 lg:col-span-4">
          <p className="text-xs text-primary-500">
            Filters live in the URL, so any view here can be shared or bookmarked. Prompts and action payloads never are.
          </p>
          <button
            type="button"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
            disabled={!hasActiveFilters(search)}
            onClick={() => onChange(CLEARED_FILTERS)}
          >
            Clear filters
          </button>
        </div>
      </form>
    </section>
  )
}
