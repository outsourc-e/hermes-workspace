import { classNames } from './shared'

export function Header({
  live,
  syncing,
  onRefresh,
}: {
  live: boolean
  syncing: boolean
  onRefresh: () => void
}) {
  return (
    <header className="mb-7 flex flex-col gap-5 border-b border-primary-200/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="cc-fade-in mb-3 inline-flex items-center gap-2 rounded-full border border-accent-400/30 bg-gradient-to-r from-accent-500/10 to-accent-600/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-700">
          <span className="size-1.5 rounded-full bg-accent-500 shadow-sm shadow-accent-500/50" />
          Coordinator Conductor
        </div>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          One mission. <br className="sm:hidden" /> One next action.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-700">
          Hermes executes. Workspace sequences the work, protects ownership, and
          waits for proof.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-primary-600">
        <button
          onClick={onRefresh}
          className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 font-medium transition hover:border-accent-500 hover:shadow-sm active:scale-95"
          title="Refresh (r)"
        >
          Refresh
        </button>
        <span className="flex items-center gap-2">
          <span
            className={classNames(
              'size-2 rounded-full',
              live ? 'cc-live-dot bg-[var(--theme-success)]' : 'bg-[var(--theme-danger)]',
            )}
          />
          {live ? 'Live projection' : 'Coordinator offline'}
          {syncing ? ' · syncing' : ''}
        </span>
      </div>
    </header>
  )
}
