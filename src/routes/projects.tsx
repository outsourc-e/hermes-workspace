import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  Building01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  SourceCodeCircleIcon,
} from '@hugeicons/core-free-icons'
import type { RepoData } from './api/projects/list'
import { usePageTitle } from '@/hooks/use-page-title'

export const Route = createFileRoute('/projects')({
  ssr: false,
  component: ProjectsRoute,
})

interface ProjectsResponse {
  repos: Array<RepoData & { error?: string }>
  cachedAt: number
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str
}

function CIPill({ status }: { status: RepoData['latestCI'] }) {
  const styles: Record<RepoData['latestCI'], string> = {
    success: 'bg-[#1a3a1a] text-[#3fb950] border border-[#238636]',
    failure: 'bg-[#3a1a1a] text-[#f85149] border border-[#da3633]',
    cancelled: 'bg-[#2d2d1a] text-[#d29922] border border-[#9e6a03]',
    unknown: 'bg-[#21262d] text-[#6e7681] border border-[#30363d]',
  }
  const labels: Record<RepoData['latestCI'], string> = {
    success: '✓ passing',
    failure: '✗ failing',
    cancelled: '◌ cancelled',
    unknown: '? unknown',
  }
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono ${styles[status]}`}
    >
      {labels[status]}
    </span>
  )
}

function RepoCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-[#21262d] bg-[#0d1117] p-4">
      <div className="mb-3 h-5 w-48 rounded bg-[#21262d]" />
      <div className="mb-2 h-3 w-24 rounded bg-[#21262d]" />
      <div className="h-3 w-64 rounded bg-[#21262d]" />
    </div>
  )
}

function RepoCard({ repo }: { repo: RepoData & { error?: string } }) {
  const shortMsg = repo.lastCommit
    ? truncate(repo.lastCommit.message.split('\n')[0] ?? '', 80)
    : null

  return (
    <div className="rounded-lg border border-[#21262d] bg-[#0d1117] p-4 font-mono transition hover:border-[#30363d]">
      {/* Header row */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <a
          href={`https://github.com/${repo.owner}/${repo.name}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm font-semibold text-[#58a6ff] hover:underline"
        >
          <HugeiconsIcon
            icon={SourceCodeCircleIcon}
            size={14}
            strokeWidth={1.5}
          />
          {repo.owner}/{repo.name}
        </a>
        <CIPill status={repo.latestCI} />
      </div>

      {/* Error state */}
      {repo.error && (
        <p className="mb-2 text-xs text-[#f85149]">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={12}
            strokeWidth={1.5}
            className="inline mr-1"
          />
          {repo.error}
        </p>
      )}

      {/* PRs */}
      <div className="mb-2 text-xs text-[#8b949e]">
        <span
          className={`mr-2 font-semibold ${repo.openPRs > 0 ? 'text-[#d29922]' : 'text-[#6e7681]'}`}
        >
          {repo.openPRs} open PR{repo.openPRs !== 1 ? 's' : ''}
        </span>
        {repo.prTitles.length > 0 && (
          <span className="text-[#6e7681]">
            {repo.prTitles.map((t, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {truncate(t, 50)}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Last commit */}
      {repo.lastCommit && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#6e7681]">
          <code className="rounded bg-[#161b22] px-1 py-0.5 text-[#c4b5fd]">
            {repo.lastCommit.sha}
          </code>
          <span className="flex-1 truncate">{shortMsg}</span>
          <span className="shrink-0 text-[#4d5566]">
            {timeAgo(repo.lastCommit.date)}
          </span>
        </div>
      )}
    </div>
  )
}

function ProjectsRoute() {
  usePageTitle('Projects')

  const { data, isLoading, isError, refetch } = useQuery<ProjectsResponse>({
    queryKey: ['projects-list'],
    queryFn: () => fetch('/api/projects/list').then((r) => r.json()),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  })

  const repos = data?.repos ?? []
  const trackedCount = repos.length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#0a0e14] p-4 text-[#c9d1d9] md:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HugeiconsIcon
            icon={Building01Icon}
            size={22}
            strokeWidth={1.5}
            className="text-[#c4b5fd]"
          />
          <div>
            <h1 className="font-mono text-lg font-bold tracking-wide text-[#e6edf3]">
              Projects
            </h1>
            <p className="font-mono text-xs text-[#6e7681]">
              GitHub repos · {trackedCount} tracked
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded border border-[#30363d] bg-[#161b22] px-3 py-1.5 font-mono text-xs text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff] transition"
        >
          ↻ refresh
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          <RepoCardSkeleton />
          <RepoCardSkeleton />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-[#da3633] bg-[#1a0a0a] p-4 font-mono text-sm text-[#f85149]">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={16}
            strokeWidth={1.5}
            className="inline mr-2"
          />
          Failed to load projects. Check that the VM has GitHub CLI access.
        </div>
      )}

      {/* Repos */}
      {!isLoading && !isError && repos.length === 0 && (
        <p className="font-mono text-sm text-[#6e7681]">
          No repos configured. Set{' '}
          <code className="text-[#c4b5fd]">HUD_TRACKED_REPOS</code> env var.
        </p>
      )}

      {!isLoading && repos.length > 0 && (
        <div className="flex flex-col gap-3">
          {repos.map((repo) => (
            <RepoCard key={`${repo.owner}/${repo.name}`} repo={repo} />
          ))}
        </div>
      )}

      {/* Cache age */}
      {data?.cachedAt && (
        <p className="mt-4 font-mono text-[10px] text-[#4d5566]">
          data as of {timeAgo(new Date(data.cachedAt).toISOString())} ·
          refreshes every 5 min
        </p>
      )}
    </div>
  )
}
