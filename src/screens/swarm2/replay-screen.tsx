'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type ReplayHeader = {
  id: string
  at: number
  workerId: string
  ok: boolean
  durationMs: number
  mode: 'tmux' | 'oneshot'
  checkpointState: string | null
  taskPreview: string
}

type ReplayDetail = ReplayHeader & {
  task: string
  output: string
  checkpointResult: string | null
}

type DailyStat = {
  day: string
  dispatches: number
  ok: number
  failed: number
  minutes: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

function when(at: number): string {
  return new Date(at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CostChart({ daily }: { daily: Array<DailyStat> }) {
  if (!daily.length) return null
  const max = Math.max(...daily.map((d) => d.dispatches), 1)
  return (
    <div className="rounded-xl border border-primary-200 bg-white p-4 mb-4">
      <h3 className="text-sm font-semibold text-primary-900 mb-2">
        Activity — last {daily.length} day(s)
      </h3>
      <div className="flex items-end gap-1 h-24">
        {daily.map((d) => (
          <div
            key={d.day}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${d.day}: ${d.dispatches} dispatches, ${d.ok} ok, ${d.failed} failed, ~${d.minutes} min`}
          >
            <div className="w-full flex flex-col justify-end h-20">
              <div
                className="w-full rounded-t bg-rose-400"
                style={{ height: `${(d.failed / max) * 100}%` }}
              />
              <div
                className="w-full rounded-t bg-emerald-400"
                style={{ height: `${(d.ok / max) * 100}%` }}
              />
            </div>
            <span className="text-[9px] text-primary-400">
              {d.day.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReplayScreen() {
  const [selected, setSelected] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['swarm-replay-list'],
    queryFn: () =>
      fetchJson<{ replays: Array<ReplayHeader> }>('/api/swarm-replay'),
    refetchInterval: 30_000,
  })
  const daily = useQuery({
    queryKey: ['swarm-replay-daily'],
    queryFn: () =>
      fetchJson<{ daily: Array<DailyStat> }>('/api/swarm-replay?daily=1'),
    refetchInterval: 120_000,
  })
  const detail = useQuery({
    queryKey: ['swarm-replay', selected],
    queryFn: () =>
      fetchJson<{ replay: ReplayDetail }>(`/api/swarm-replay?id=${selected}`),
    enabled: Boolean(selected),
  })

  const replays = list.data?.replays ?? []

  return (
    <div className="h-full overflow-y-auto bg-primary-50 p-4">
      <h1 className="text-lg font-bold text-primary-900 mb-3">
        Session Replay
      </h1>
      <CostChart daily={daily.data?.daily ?? []} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {replays.length === 0 && (
            <p className="text-sm text-primary-500">
              No dispatches recorded yet.
            </p>
          )}
          {replays.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={cn(
                'w-full text-left rounded-lg border p-3 bg-white hover:border-accent-400 transition-colors',
                selected === r.id
                  ? 'border-accent-500'
                  : 'border-primary-200',
              )}
            >
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full',
                    r.ok ? 'bg-emerald-500' : 'bg-rose-500',
                  )}
                />
                <span className="font-semibold text-primary-900">
                  {r.workerId}
                </span>
                <span className="text-primary-400">{when(r.at)}</span>
                <span className="text-primary-400">
                  {Math.round(r.durationMs / 1000)}s · {r.mode}
                  {r.checkpointState ? ` · ${r.checkpointState}` : ''}
                </span>
              </div>
              <p className="text-sm text-primary-700 mt-1 line-clamp-2">
                {r.taskPreview}
              </p>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-primary-200 bg-white p-4 min-h-[200px] lg:sticky lg:top-4 lg:self-start lg:max-h-[80vh] lg:overflow-y-auto">
          {!selected && (
            <p className="text-sm text-primary-500">
              Select a dispatch to view its full transcript.
            </p>
          )}
          {detail.isLoading && selected && (
            <p className="text-sm text-primary-500">Loading transcript…</p>
          )}
          {detail.data?.replay && (
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary-400">
                  Task
                </h3>
                <pre className="text-xs text-primary-800 whitespace-pre-wrap mt-1">
                  {detail.data.replay.task}
                </pre>
              </div>
              {detail.data.replay.checkpointResult && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-primary-400">
                    Checkpoint result
                  </h3>
                  <pre className="text-xs text-primary-800 whitespace-pre-wrap mt-1">
                    {detail.data.replay.checkpointResult}
                  </pre>
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary-400">
                  Full output
                </h3>
                <pre className="text-[11px] text-primary-700 whitespace-pre-wrap mt-1 bg-primary-50 rounded p-2 overflow-x-auto">
                  {detail.data.replay.output || '(no output captured)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
