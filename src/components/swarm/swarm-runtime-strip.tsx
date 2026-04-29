'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ComputerTerminal01Icon,
  RefreshIcon,
  RotateClockwiseIcon,
  Wifi01Icon,
  WifiOffIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type RuntimeEntry = {
  workerId: string
  source: 'runtime.json' | 'fallback'
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  currentTask: string | null
  tmuxSession: string | null
  tmuxAttachable: boolean
  recentLogTail: string | null
  lastSessionStartedAt: number | null
}

async function fetchRuntime() {
  const res = await fetch('/api/swarm-runtime')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<{ checkedAt: number; entries: RuntimeEntry[] }>
}

function relative(ts: number | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function SwarmRuntimeStrip({ workerId, className }: { workerId: string; className?: string }) {
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['swarm', 'runtime'],
    queryFn: fetchRuntime,
    refetchInterval: 30_000,
  })
  const [tickLabel, setTickLabel] = useState('')

  useEffect(() => {
    function update() {
      if (!data) return setTickLabel('')
      const diff = Math.floor((Date.now() - data.checkedAt) / 1000)
      if (diff < 5) setTickLabel('just now')
      else if (diff < 60) setTickLabel(`${diff}s ago`)
      else setTickLabel(`${Math.floor(diff / 60)}m ago`)
    }
    update()
    const interval = setInterval(update, 5_000)
    return () => clearInterval(interval)
  }, [data])

  const entry = data?.entries.find((row) => row.workerId === workerId)

  return (
    <div className={cn('rounded-2xl border border-emerald-400/15 bg-black/35 p-4 backdrop-blur', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80 inline-flex items-center gap-1">
          <HugeiconsIcon icon={ComputerTerminal01Icon} size={12} />
          Live runtime · {workerId}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-emerald-100/55">
          <span>{tickLabel ? `Checked ${tickLabel}` : isFetching ? 'Checking…' : ''}</span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/70 hover:text-white"
          >
            <HugeiconsIcon icon={RefreshIcon} size={11} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {isError ? (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Failed to load runtime metadata.
        </div>
      ) : null}

      {entry ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <RuntimeTile
            label="Source"
            value={entry.source === 'runtime.json' ? 'runtime.json' : 'fallback (no runtime.json)'}
          />
          <RuntimeTile label="PID" value={entry.pid != null ? String(entry.pid) : '—'} />
          <RuntimeTile label="Started" value={relative(entry.startedAt)} />
          <RuntimeTile label="Last output" value={relative(entry.lastOutputAt)} />
          <RuntimeTile
            label="tmux"
            tone={entry.tmuxAttachable ? 'good' : 'warn'}
            value={entry.tmuxAttachable ? `attachable (${entry.tmuxSession})` : 'no live tmux session'}
            icon={entry.tmuxAttachable ? Wifi01Icon : WifiOffIcon}
          />
          <RuntimeTile label="Working dir" value={entry.cwd ?? '—'} />
          <div className="sm:col-span-2 rounded-xl border border-emerald-400/10 bg-black/35 px-3 py-2 text-[11px] text-emerald-100/65">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/55">Current task</div>
            <div className="mt-1 text-emerald-50">{entry.currentTask ?? '—'}</div>
          </div>
          {entry.recentLogTail ? (
            <div className="sm:col-span-2 rounded-xl border border-emerald-400/10 bg-black/45 px-3 py-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-emerald-100/55">
                <span>agent.log tail</span>
                <span>{relative(entry.lastSessionStartedAt)}</span>
              </div>
              <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words text-[11px] text-emerald-50/85">
                {entry.recentLogTail}
              </pre>
            </div>
          ) : null}
          {!entry.tmuxAttachable ? (
            <div className="sm:col-span-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              <div className="font-semibold">No tmux session detected for this worker.</div>
              <div className="mt-1">
                Suggested wrapper change to make TUI attach work consistently:
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-black/35 p-2 text-[11px] text-amber-50">
{`#!/bin/sh
NAME="swarm-${entry.workerId}"
export CLAUDE_HOME="$HOME/.claude/profiles/${entry.workerId}"
if tmux has-session -t "$NAME" 2>/dev/null; then
  exec tmux attach-session -t "$NAME"
fi
exec tmux new-session -A -s "$NAME" claude "$@"`}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-emerald-400/10 bg-black/30 px-3 py-3 text-xs text-emerald-100/55">
          No runtime info yet. Wrappers will populate this once they write <code>runtime.json</code> or run inside tmux.
        </div>
      )}
    </div>
  )
}

function RuntimeTile({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn'
  icon?: typeof Wifi01Icon
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2 backdrop-blur',
        tone === 'good' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' :
        tone === 'warn' ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' :
        'border-emerald-400/15 bg-black/30 text-emerald-50/80',
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/55">
        {icon ? <HugeiconsIcon icon={icon} size={11} /> : <HugeiconsIcon icon={RotateClockwiseIcon} size={11} />}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}
