'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type TimelineEntry = {
  at: number
  source: 'mission' | 'outcome' | 'scheduled' | 'sweep'
  type: string
  workerId: string | null
  missionId: string | null
  message: string
}

type TimelineResponse = {
  ok: boolean
  entries: Array<TimelineEntry>
  generatedAt: string
}

const SOURCES = ['all', 'mission', 'outcome', 'scheduled', 'sweep'] as const

const SOURCE_DOT: Record<TimelineEntry['source'], string> = {
  mission: 'bg-sky-500',
  outcome: 'bg-emerald-500',
  scheduled: 'bg-violet-500',
  sweep: 'bg-amber-500',
}

async function fetchTimeline(source: string): Promise<TimelineResponse> {
  const qs = source === 'all' ? '' : `?source=${source}`
  const res = await fetch(`/api/swarm-timeline${qs}`)
  if (!res.ok) throw new Error(`swarm-timeline HTTP ${res.status}`)
  return (await res.json()) as TimelineResponse
}

function formatWhen(at: number): string {
  const d = new Date(at)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return sameDay
    ? time
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function Swarm2TimelinePanel({ className }: { className?: string }) {
  const [source, setSource] = useState<(typeof SOURCES)[number]>('all')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['swarm-timeline', source],
    queryFn: () => fetchTimeline(source),
    refetchInterval: 30_000,
  })

  const entries = data?.entries ?? []

  return (
    <div
      className={cn(
        'rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-4',
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--theme-text)]">
          Timeline
        </span>
        <div className="flex items-center gap-1">
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={cn(
                'rounded-lg border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]',
                source === s
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
                  : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Loading timeline…
        </div>
      ) : isError ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Timeline unavailable.
        </div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-[var(--theme-muted)]">
          Nothing recorded yet.
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto pr-1">
          <ul className="space-y-1.5">
            {entries.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className="flex items-start gap-2 text-xs text-[var(--theme-text)]"
              >
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    SOURCE_DOT[e.source],
                  )}
                  title={e.source}
                />
                <span className="shrink-0 tabular-nums text-[var(--theme-muted)]">
                  {formatWhen(e.at)}
                </span>
                {e.workerId ? (
                  <span className="shrink-0 font-medium">{e.workerId}</span>
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={e.message}>
                  <span className="text-[var(--theme-muted)]">{e.type}</span>{' '}
                  {e.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
