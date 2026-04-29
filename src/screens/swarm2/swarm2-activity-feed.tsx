'use client'

import { useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { CrewMember } from '@/hooks/use-crew-status'

type RuntimeEntry = {
  workerId: string
  recentLogTail: string | null
  lastOutputAt: number | null
  lastSessionStartedAt?: number | null
  currentTask?: string | null
}

export type Swarm2ActivityFeedProps = {
  members: Array<CrewMember>
  runtimeByWorker: Map<string, RuntimeEntry>
  selectedId: string | null
  onSelect: (workerId: string) => void
  limit?: number
}

type ActivityRow = {
  id: string
  workerId: string
  workerName: string
  text: string
  ts: number | null
  kind: 'tail' | 'session' | 'task'
}

function relativeTime(ts: number | null | undefined): string {
  if (!ts) return 'just now'
  const diff = Date.now() - ts
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function stripLogPrefix(line: string): string {
  return line
    .replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[^ ]*\s+/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim()
}

function buildRows(
  members: Array<CrewMember>,
  runtime: Map<string, RuntimeEntry>,
): Array<ActivityRow> {
  const rows: Array<ActivityRow> = []
  for (const member of members) {
    const entry = runtime.get(member.id)
    if (entry?.recentLogTail) {
      const lines = entry.recentLogTail
        .split('\n')
        .map(stripLogPrefix)
        .filter(Boolean)
      const last = lines[lines.length - 1]
      if (last) {
        rows.push({
          id: `${member.id}-tail`,
          workerId: member.id,
          workerName: member.displayName || member.id,
          text: last,
          ts: entry.lastOutputAt ?? entry.lastSessionStartedAt ?? null,
          kind: 'tail',
        })
        continue
      }
    }
    if (entry?.currentTask) {
      rows.push({
        id: `${member.id}-task`,
        workerId: member.id,
        workerName: member.displayName || member.id,
        text: entry.currentTask,
        ts: entry.lastOutputAt ?? null,
        kind: 'task',
      })
      continue
    }
    if (member.lastSessionTitle) {
      rows.push({
        id: `${member.id}-session`,
        workerId: member.id,
        workerName: member.displayName || member.id,
        text: member.lastSessionTitle,
        ts: member.lastSessionAt,
        kind: 'session',
      })
    }
  }
  rows.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
  return rows
}

export function Swarm2ActivityFeed({
  members,
  runtimeByWorker,
  selectedId,
  onSelect,
  limit = 8,
}: Swarm2ActivityFeedProps) {
  const rows = useMemo(
    () => buildRows(members, runtimeByWorker).slice(0, limit),
    [members, runtimeByWorker, limit],
  )

  if (rows.length === 0) {
    return (
      <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_18px_60px_color-mix(in_srgb,var(--theme-shadow)_12%,transparent)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-text)]">
          <HugeiconsIcon icon={Activity01Icon} size={14} />
          Recent swarm activity
        </div>
        <p className="mt-3 text-sm text-[var(--theme-muted)]">
          No worker output captured yet. Once swarm TUIs emit logs they will show
          up here, ordered by latest event.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_18px_60px_color-mix(in_srgb,var(--theme-shadow)_12%,transparent)]">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-accent)]">
            <HugeiconsIcon icon={Activity01Icon} size={13} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--theme-text)]">
              Recent swarm activity
            </h2>
            <p className="text-[11px] text-[var(--theme-muted-2)]">
              Latest signals across all wired workers
            </p>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
          {rows.length} entries
        </div>
      </header>

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const isSelected = row.workerId === selectedId
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelect(row.workerId)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
                isSelected
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                  : 'border-[var(--theme-border)] bg-[var(--theme-bg)] hover:bg-[var(--theme-card2)]',
              )}
            >
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                {row.workerName}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--theme-text)]">
                {row.text}
              </span>
              <span className="shrink-0 text-[10px] text-[var(--theme-muted)]">
                {relativeTime(row.ts)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
