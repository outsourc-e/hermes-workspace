import type { DashboardGitWorkSection } from '@/server/dashboard-aggregator'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5 text-center">
      <div className="font-mono text-sm font-semibold text-[var(--theme-text)]">
        {value}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
        {label}
      </div>
    </div>
  )
}

function RemoteRow({
  name,
  fetchUrl,
  pushUrl,
}: {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}) {
  return (
    <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/45 p-2">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text)]">
        {name}
      </div>
      <div className="mt-1 space-y-0.5 font-mono text-[9px] text-[var(--theme-muted)]">
        <div className="truncate">fetch: {fetchUrl ?? 'missing'}</div>
        <div className="truncate">push: {pushUrl ?? 'missing'}</div>
      </div>
    </div>
  )
}

export function GitWorkCard({ gitWork }: { gitWork: DashboardGitWorkSection | null }) {
  if (!gitWork) return null
  const stateTone = gitWork.clean
    ? 'text-[var(--theme-success)] border-[color-mix(in_srgb,var(--theme-success)_35%,var(--theme-border))]'
    : 'text-[var(--theme-warning)] border-[color-mix(in_srgb,var(--theme-warning)_35%,var(--theme-border))]'

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-accent), var(--theme-warning), transparent)',
        }}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              GitHub / PR Work
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
              Local branch status, read-only
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              Mirrors local git state and configured remotes. This card does not
              push, open PRs, or mutate GitHub.
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.13em] ${stateTone}`}
          >
            {gitWork.clean ? 'clean' : `${gitWork.changedFiles} changed`}
          </span>
        </div>

        {gitWork.warning ? (
          <div className="rounded-lg border border-[var(--theme-warning)]/35 bg-[color-mix(in_srgb,var(--theme-warning)_8%,transparent)] p-3 text-xs text-[var(--theme-warning)]">
            {gitWork.warning}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Stat label="ahead" value={gitWork.ahead} />
          <Stat label="behind" value={gitWork.behind} />
          <Stat label="changes" value={gitWork.changedFiles} />
          <Stat label="remotes" value={gitWork.remotes.length} />
        </div>

        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
            Current branch
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-[var(--theme-text)]">
            {gitWork.branch ?? 'unknown branch'}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-[var(--theme-muted)]">
            upstream: {gitWork.upstream ?? 'not configured'}
          </div>
          {gitWork.latestCommit ? (
            <div className="mt-2 rounded-md border border-[var(--theme-border)] bg-[var(--theme-card)]/60 p-2">
              <span className="font-mono text-[10px] text-[var(--theme-accent)]">
                {gitWork.latestCommit.hash}
              </span>{' '}
              <span className="text-xs text-[var(--theme-muted)]">
                {gitWork.latestCommit.subject}
              </span>
            </div>
          ) : null}
        </div>

        {gitWork.prUrl ? (
          <a
            href={gitWork.prUrl}
            className="block rounded-lg border border-[color-mix(in_srgb,var(--theme-accent)_35%,var(--theme-border))] bg-[var(--theme-accent-subtle)] p-3 text-xs text-[var(--theme-accent)] underline decoration-dotted underline-offset-2"
          >
            Open linked PR receipt
          </a>
        ) : null}

        {gitWork.remotes.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {gitWork.remotes.slice(0, 4).map((remote) => (
              <RemoteRow key={remote.name} {...remote} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
