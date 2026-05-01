'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand02Icon,
  Bug01Icon,
  File01Icon,
  Files01Icon,
  Globe02Icon,
  Note01Icon,
  PackageIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export type Swarm2Artifact = {
  id: string
  kind: 'file' | 'diff' | 'patch' | 'build' | 'log' | 'report' | 'preview'
  label: string
  path?: string | null
  workerId?: string
  updatedAt?: number | null
  source?: 'runtime' | 'workspace' | 'plugin' | 'inferred'
  sizeBytes?: number | null
  contentType?: string | null
}

export type Swarm2Preview = {
  id: string
  label: string
  url: string
  source?: 'detected-port' | 'plugin' | 'runtime'
  status?: 'ready' | 'unknown' | 'down'
  workerId?: string
  updatedAt?: number | null
}

type Swarm2ArtifactsProps = {
  workerId: string
  artifacts: Array<Swarm2Artifact>
  previews: Array<Swarm2Preview>
  /** Optional fallback list of changed files when runtime.artifacts is empty. */
  changedFiles?: Array<string>
  className?: string
  /** Truncated chip count when not selected. */
  collapsedLimit?: number
  /** Larger chip count when selected. */
  expandedLimit?: number
  expanded?: boolean
  mode?: 'auto' | 'artifacts' | 'files'
  showHeader?: boolean
  centered?: boolean
}

function synthesizeFromChangedFiles(
  workerId: string,
  changedFiles: Array<string>,
): Array<Swarm2Artifact> {
  return changedFiles.slice(0, 12).map((path, index) => {
    const cleaned = path.replace(/\/$/, '')
    const isDir = path.endsWith('/')
    const fileName = cleaned.split('/').filter(Boolean).pop() ?? cleaned
    return {
      id: `${workerId}-cf-${index}`,
      kind: isDir ? 'file' : 'diff',
      label: fileName || cleaned,
      path: cleaned,
      workerId,
      source: 'inferred',
    } satisfies Swarm2Artifact
  })
}

function iconForKind(kind: Swarm2Artifact['kind']) {
  switch (kind) {
    case 'file':
      return File01Icon
    case 'diff':
    case 'patch':
      return Files01Icon
    case 'build':
      return PackageIcon
    case 'report':
      return Note01Icon
    case 'log':
      return Bug01Icon
    case 'preview':
      return Globe02Icon
    default:
      return File01Icon
  }
}

function shortLabel(value: string, max = 22): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function Swarm2Artifacts({
  workerId,
  artifacts,
  previews,
  changedFiles = [],
  className,
  collapsedLimit = 3,
  expandedLimit = 8,
  expanded = false,
  mode = 'auto',
  showHeader = true,
  centered = false,
}: Swarm2ArtifactsProps) {
  const declaredArtifacts = artifacts ?? []
  const changedFileArtifacts =
    changedFiles.length > 0 ? synthesizeFromChangedFiles(workerId, changedFiles) : []
  const showingChangedFiles = mode === 'files'
    ? changedFileArtifacts.length > 0
    : mode === 'artifacts'
      ? false
      : changedFileArtifacts.length > 0
  const allArtifacts = mode === 'files'
    ? changedFileArtifacts
    : showingChangedFiles
      ? changedFileArtifacts
      : declaredArtifacts
  const allPreviews = previews ?? []
  const limit = expanded ? expandedLimit : collapsedLimit
  const visibleArtifacts = allArtifacts.slice(0, limit)
  const visiblePreviews = allPreviews.slice(0, expanded ? 4 : 2)
  const overflowArtifacts = Math.max(0, allArtifacts.length - visibleArtifacts.length)
  const isEmpty = allArtifacts.length === 0 && allPreviews.length === 0

  return (
    <section
      className={cn(
        'rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-2',
        className,
      )}
    >
      {showHeader ? (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={Files01Icon} size={11} />
            {showingChangedFiles ? 'Changed files' : 'Output'}
          </span>
          <span className="font-medium normal-case tracking-normal">
            {showingChangedFiles
              ? `${allArtifacts.length} changed`
              : declaredArtifacts.length > 0
                ? `${allArtifacts.length} artifacts`
                : '0 artifacts'}
            {' · '}
            {allPreviews.length} previews
          </span>
        </div>
      ) : null}

      <div className={cn('space-y-2', centered && 'text-center')}>
        <p className={cn('text-[11px] leading-relaxed text-[var(--theme-muted)]', centered && 'mx-auto max-w-2xl')}>
          {isEmpty
            ? `No artifacts yet for ${workerId}. Will surface as the agent writes files, diffs, or build outputs.`
            : showingChangedFiles
              ? 'Inferred from git changes in the worker project. Real artifacts will replace this when the worker publishes them.'
              : 'Published by the worker runtime. Files, diffs, reports, and previews share the same card slot.'}
        </p>

        {visibleArtifacts.length > 0 ? (
          <div className={cn('flex flex-wrap gap-1.5', centered && 'justify-center')}>
            {visibleArtifacts.slice(0, expanded ? 6 : 4).map((artifact) => {
              const icon = iconForKind(artifact.kind)
              return (
                <span
                  key={artifact.id}
                  title={artifact.path ?? artifact.label}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[10px] text-[var(--theme-muted-2)]"
                >
                  <HugeiconsIcon icon={icon} size={9} />
                  <span className="truncate max-w-[10rem]">{shortLabel(artifact.label, 24)}</span>
                </span>
              )
            })}
            {overflowArtifacts > 0 ? (
              <span className="inline-flex items-center rounded-full border border-dashed border-[var(--theme-border)] px-2 py-1 text-[10px] text-[var(--theme-muted)]">
                +{overflowArtifacts} more
              </span>
            ) : null}
          </div>
        ) : null}

        {visiblePreviews.length > 0 ? (
          <div className={cn('flex flex-wrap items-center gap-1', centered && 'justify-center')}>
            {visiblePreviews.map((preview) => (
              <a
                key={preview.id}
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                title={`${preview.label} · ${preview.url}${preview.source ? ` · ${preview.source}` : ''}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors',
                  preview.status === 'down'
                    ? 'border-red-400/40 bg-red-500/10 text-red-200'
                    : 'border-[var(--theme-accent)]/40 bg-[var(--theme-accent-soft)] text-[var(--theme-text)] hover:border-[var(--theme-accent)]',
                )}
              >
                <HugeiconsIcon icon={Globe02Icon} size={9} />
                <span className="max-w-[7rem] truncate">{shortLabel(preview.label, 18)}</span>
                <HugeiconsIcon icon={ArrowExpand02Icon} size={8} />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
