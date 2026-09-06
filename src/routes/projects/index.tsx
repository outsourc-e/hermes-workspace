/**
 * Projects SSH Page — browse home PC worktrees via SSH
 * Lists all CliniTrack worktrees and their status.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { usePageTitle } from '@/hooks/use-page-title'

type Worktree = {
  path: string
  branch: string
  status: 'clean' | 'dirty' | 'unknown'
  ahead: number
  behind: number
}

type Remote = {
  url: string
  name: string
}

const HOME_PC = 'root@100.92.120.31'
const CLINITRACK_BASE =
  '/home/nick-weiland-oc381816/Projects/Praxentis/active/CliniTrack'

function statusColor(s: string): string {
  switch (s) {
    case 'clean':
      return 'bg-emerald-500'
    case 'dirty':
      return 'bg-amber-500'
    default:
      return 'bg-[var(--theme-muted)]'
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'clean':
      return 'clean'
    case 'dirty':
      return 'unsaved changes'
    default:
      return 'unknown'
  }
}

export const Route = createFileRoute('/projects/')({
  component: ProjectsRoute,
})

function ProjectsRoute() {
  usePageTitle('Projects')
  const [worktrees, setWorktrees] = useState<Array<Worktree>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/projects/worktrees')
        if (!r.ok) throw new Error('API unavailable')
        const data = await r.json()
        setWorktrees(data)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load')
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleRefresh = () => {
    setLoading(true)
    setError(null)
    fetch('/api/projects/worktrees')
      .then((r) => r.json())
      .then(setWorktrees)
      .catch(() => setError('Refresh failed'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="flex min-h-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--theme-accent)] bg-opacity-20">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-current text-[var(--theme-accent)]"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--theme-text)]">
              Projects
            </h1>
            <p className="text-sm text-[var(--theme-muted)]">
              CliniTrack-Suite worktrees on home PC
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          ↻ Refresh
        </button>
      </div>

      {loading && (
        <div className="text-sm text-[var(--theme-muted)]">
          Loading worktrees…
        </div>
      )}

      {error && (
        <div className="rounded border border-red-900/50 bg-red-900/20 p-3 text-sm text-red-400">
          {error} — make sure you're on Tailscale
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--theme-border)] text-left text-xs text-[var(--theme-muted)] uppercase tracking-wider">
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Worktree</th>
                <th className="pb-2 pr-4">Branch</th>
                <th className="pb-2">Remote</th>
              </tr>
            </thead>
            <tbody>
              {worktrees.map((wt) => (
                <tr
                  key={wt.path}
                  className="border-b border-[var(--theme-border)]/50"
                >
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`h-2 w-2 rounded-full ${statusColor(wt.status)}`}
                      />
                      <span className="text-xs text-[var(--theme-muted)]">
                        {statusLabel(wt.status)}
                      </span>
                      {wt.ahead > 0 && (
                        <span className="text-[10px] text-emerald-500">
                          ↑{wt.ahead}
                        </span>
                      )}
                      {wt.behind > 0 && (
                        <span className="text-[10px] text-amber-500">
                          ↓{wt.behind}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--theme-text)]">
                    {wt.path.replace(CLINITRACK_BASE + '/', '')}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    <span className="rounded bg-[var(--theme-accent)]/20 px-1.5 py-0.5 text-[var(--theme-accent)]">
                      {wt.branch}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <a
                        href={`/projects/terminal?path=${encodeURIComponent(wt.path)}`}
                        className="rounded bg-[var(--theme-card)] px-2 py-0.5 text-[10px] text-[var(--theme-muted)] border border-[var(--theme-border)] hover:text-[var(--theme-accent)]"
                      >
                        SSH
                      </a>
                      <a
                        href={`https://github.com/SPACEMAN1898/CliniTrack-Suite`}
                        target="_blank"
                        rel="noopener"
                        className="rounded bg-[var(--theme-card)] px-2 py-0.5 text-[10px] text-[var(--theme-muted)] border border-[var(--theme-border)] hover:text-[var(--theme-accent)]"
                      >
                        GitHub →
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href="/projects/terminal"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → Terminal
        </a>
        <a
          href="https://github.com/SPACEMAN1898/CliniTrack-Suite"
          target="_blank"
          rel="noopener"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → GitHub Repo
        </a>
        <a
          href="/swarm"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → Swarm
        </a>
      </div>
    </div>
  )
}
