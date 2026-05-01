'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Rocket01Icon, CheckmarkCircle02Icon, AlertCircleIcon, Clock01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { CrewMember } from '@/hooks/use-crew-status'

type WorkerResult = {
  workerId: string
  ok: boolean
  output: string
  error: string | null
  durationMs: number
  exitCode: number | null
}

type DispatchResponse = {
  dispatchedAt: number
  completedAt: number
  prompt: string
  timeoutSeconds: number
  results: WorkerResult[]
}

type SwarmComposeProps = {
  members: CrewMember[]
  roomIds: string[]
  className?: string
}

export function SwarmCompose({ members, roomIds, className }: SwarmComposeProps) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<DispatchResponse[]>([])
  const [timeoutSeconds, setTimeoutSeconds] = useState(240)

  const roomMembers = members.filter((member) => roomIds.includes(member.id))

  async function dispatch() {
    if (!prompt.trim() || roomIds.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerIds: roomIds, prompt: prompt.trim(), timeoutSeconds }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as DispatchResponse
      setHistory((current) => [data, ...current].slice(0, 5))
      setPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--theme-text)]">Compose orchestration</div>
          <div className="mt-1 text-xs text-[var(--theme-muted)]">
            Dispatched in parallel against each agent profile with the configured worker runtime.
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
          <label htmlFor="swarm-timeout" className="uppercase tracking-[0.18em] text-[10px]">timeout</label>
          <input
            id="swarm-timeout"
            type="number"
            min={10}
            max={600}
            value={timeoutSeconds}
            onChange={(event) => setTimeoutSeconds(Math.max(10, Math.min(600, Number(event.target.value) || 240)))}
            className="w-16 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-hover)] px-2 py-1 text-right text-xs text-[var(--theme-text)]"
          />
          <span className="text-[10px] uppercase tracking-[0.18em]">sec</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)]">
        <span className="text-[10px] uppercase tracking-[0.18em]">Targets</span>
        {roomMembers.length === 0 ? (
          <span className="italic">No agents selected. Tap "+" on a node to add.</span>
        ) : (
          roomMembers.map((member) => (
            <span
              key={member.id}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
            >
              {member.displayName || member.id}
            </span>
          ))
        )}
      </div>

      <textarea
        rows={4}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={busy}
        placeholder="Type a single prompt that goes out to every agent in the room…"
        className="mt-3 w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-hover)] px-3 py-2 text-sm text-[var(--theme-text)] focus:border-[#B87333]/60 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[var(--theme-muted)]">
          {prompt.trim().length} chars · {roomIds.length} target{roomIds.length === 1 ? '' : 's'}
        </div>
        <button
          type="button"
          onClick={dispatch}
          disabled={busy || !prompt.trim() || roomIds.length === 0}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
            busy
              ? 'bg-[var(--theme-hover)] text-[var(--theme-muted)]'
              : 'bg-[#f59e0b] text-black hover:bg-[#d68708] disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <HugeiconsIcon icon={Rocket01Icon} size={14} />
          {busy ? 'Dispatching…' : `Dispatch to ${roomIds.length}`}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-5 space-y-4">
          {history.map((entry) => (
            <div key={entry.dispatchedAt} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--theme-muted)]">
                <span>
                  Dispatched {new Date(entry.dispatchedAt).toLocaleTimeString()} · {entry.results.length} workers
                </span>
                <span>
                  Completed in {((entry.completedAt - entry.dispatchedAt) / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="mt-2 rounded-lg bg-[var(--theme-hover)] px-3 py-2 text-xs text-[var(--theme-text)] whitespace-pre-wrap">
                {entry.prompt}
              </div>
              <div className="mt-3 grid gap-2">
                {entry.results.map((result) => (
                  <div
                    key={result.workerId}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-xs',
                      result.ok
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-red-500/30 bg-red-500/5',
                    )}
                  >
                    <div className="flex items-center justify-between text-[var(--theme-text)]">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <HugeiconsIcon
                          icon={result.ok ? CheckmarkCircle02Icon : AlertCircleIcon}
                          size={13}
                          className={result.ok ? 'text-emerald-400' : 'text-red-400'}
                        />
                        {result.workerId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[var(--theme-muted)]">
                        <HugeiconsIcon icon={Clock01Icon} size={11} />
                        {(result.durationMs / 1000).toFixed(1)}s
                        {result.exitCode !== null ? ` · exit ${result.exitCode}` : ''}
                      </span>
                    </div>
                    {result.error ? (
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-red-200">
                        {result.error}
                      </pre>
                    ) : null}
                    {result.output ? (
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--theme-text)]">
                        {result.output.length > 4000 ? `${result.output.slice(0, 4000)}…\n[truncated]` : result.output}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
