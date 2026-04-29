'use client'

import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  GitBranchIcon,
  Globe02Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type SwarmProject = {
  workerId: string
  cwd: string | null
  projectName: string | null
  branch: string | null
  changedFiles: Array<string>
  previewUrls: Array<string>
  packageScripts: Array<string>
  previewSource?: 'runtime' | 'script-port' | 'none'
  fetchedAt: number
  error?: string
}

type Swarm2ProjectBadgeProps = {
  workerId: string
  className?: string
}

async function fetchProject(workerId: string): Promise<SwarmProject> {
  const res = await fetch(`/api/swarm-project?workerId=${encodeURIComponent(workerId)}`)
  if (!res.ok) throw new Error(`project HTTP ${res.status}`)
  return (await res.json()) as SwarmProject
}

function shortPath(path: string | null): string {
  if (!path) return 'No workspace'
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return `…/${parts.slice(-2).join('/')}`
}

export function Swarm2ProjectBadge({ workerId, className }: Swarm2ProjectBadgeProps) {
  const query = useQuery({
    queryKey: ['swarm2', 'project', workerId],
    queryFn: () => fetchProject(workerId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    enabled: Boolean(workerId),
  })

  const project = query.data
  const previewUrl = project?.previewUrls?.[0]
  const previewSource = project?.previewSource ?? 'none'
  const previewLabel = 'Preview'
  const previewTitle =
    previewSource === 'runtime'
      ? 'Preview URL declared in runtime.json'
      : previewSource === 'script-port'
        ? 'Preview URL matches explicit dev script port for this worker'
        : 'No preview detected for this worker'
  const changedCount = project?.changedFiles?.length ?? 0
  const scriptCount = project?.packageScripts?.length ?? 0

  return (
    <section
      className={cn(
        'rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-2',
        className,
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
        <span className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={SourceCodeIcon} size={11} />
          Project
        </span>
        {project?.branch ? (
          <span className="inline-flex max-w-[9rem] items-center gap-1 truncate rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-[var(--theme-muted-2)]">
            <HugeiconsIcon icon={GitBranchIcon} size={9} />
            <span className="truncate">{project.branch}</span>
          </span>
        ) : null}
      </div>

      {query.isPending ? (
        <p className="text-[11px] text-[var(--theme-muted)]">Loading project…</p>
      ) : project?.error || query.error ? (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--theme-muted)]">
          {project?.error || query.error?.message || 'Project unavailable'}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-[var(--theme-text)]">
              {project?.projectName || 'Unknown project'}
            </div>
            <div className="truncate text-[10px] text-[var(--theme-muted)]">
              {shortPath(project?.cwd ?? null)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--theme-muted)]">
            <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-1.5 py-0.5">
              {changedCount} changed
            </span>
            <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-1.5 py-0.5">
              {scriptCount} scripts
            </span>
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                title={previewTitle}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-accent)]/40 bg-[var(--theme-accent-soft)] px-1.5 py-0.5 text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
              >
                <HugeiconsIcon icon={Globe02Icon} size={9} />
                {previewLabel}
              </a>
            ) : (
              <span
                title={previewTitle}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--theme-border)] bg-transparent px-1.5 py-0.5 text-[var(--theme-muted)]"
              >
                <HugeiconsIcon icon={Globe02Icon} size={9} />
                No preview
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
