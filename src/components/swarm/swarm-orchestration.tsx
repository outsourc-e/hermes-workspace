'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  FlashIcon,
  Rocket01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { CrewMember } from '@/hooks/use-crew-status'

type OrchestrationProps = {
  members: CrewMember[]
  className?: string
}

type Assignment = {
  workerId: string
  task: string
  rationale: string
}

type DecomposeResponse = {
  ok: boolean
  decomposedAt?: number
  model?: string
  assignments?: Assignment[]
  unassigned?: string[]
  error?: string
}

type DispatchResult = {
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
  results: DispatchResult[]
}

function deriveRole(memberId: string): string {
  const m = memberId.match(/(\d+)/)
  const n = m ? m[1] : ''
  switch (n) {
    case '1': return 'PR / Issues lane'
    case '2': return 'Qwen tuning on PC1'
    case '3': return 'BenchLoop benchmarks'
    case '4': return 'Research / web'
    case '5': return 'Builder / refactors'
    case '6': return 'Reviewer / critique'
    case '7': return 'Docs / scribe'
    case '8': return 'Ops / monitoring'
    default:  return 'Generalist worker'
  }
}

export function SwarmOrchestration({ members, className }: OrchestrationProps) {
  const [prompt, setPrompt] = useState('')
  const [decomposing, setDecomposing] = useState(false)
  const [decomposeError, setDecomposeError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [unassigned, setUnassigned] = useState<string[]>([])
  const [decomposeMeta, setDecomposeMeta] = useState<{ at: number; model: string } | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatchResults, setDispatchResults] = useState<DispatchResponse | null>(null)

  const eligibleWorkers = members.map((member) => ({
    id: member.id,
    role: deriveRole(member.id),
    model: member.model,
    notes: `${member.sessionCount} sessions logged, model ${member.model}`,
  }))

  function updateAssignment(idx: number, patch: Partial<Assignment>) {
    setAssignments((current) => current.map((entry, i) => i === idx ? { ...entry, ...patch } : entry))
  }

  function removeAssignment(idx: number) {
    setAssignments((current) => current.filter((_, i) => i !== idx))
  }

  async function decompose() {
    if (!prompt.trim()) return
    setDecomposing(true)
    setDecomposeError(null)
    setDispatchResults(null)
    try {
      const res = await fetch('/api/swarm-decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), workers: eligibleWorkers }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as DecomposeResponse
      if (!data.ok) throw new Error(data.error || 'decompose failed')
      setAssignments(data.assignments ?? [])
      setUnassigned(data.unassigned ?? [])
      setDecomposeMeta({ at: data.decomposedAt ?? Date.now(), model: data.model ?? 'unknown' })
    } catch (err) {
      setDecomposeError(err instanceof Error ? err.message : 'decompose failed')
    } finally {
      setDecomposing(false)
    }
  }

  async function dispatch() {
    if (assignments.length === 0) return
    setDispatching(true)
    setDispatchError(null)
    setDispatchResults(null)
    try {
      const flatPrompts = assignments.map((entry) => `[orchestrator brief]\n${entry.task}`)
      // Run sequentially per worker via swarm-dispatch (server already parallelizes per call).
      const res = await fetch('/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerIds: assignments.map((entry) => entry.workerId),
          prompt: flatPrompts.join('\n\n----\n\n'),
          timeoutSeconds: 300,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as DispatchResponse
      setDispatchResults(data)
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'dispatch failed')
    } finally {
      setDispatching(false)
    }
  }

  return (
    <section className={cn('rounded-3xl border border-emerald-400/20 bg-[#08110d]/85 p-5 backdrop-blur', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-300">Auto decompose & route</div>
          <h3 className="mt-1 text-xl font-semibold text-white">Mission compose</h3>
          <p className="mt-1 max-w-2xl text-sm text-emerald-50/65">
            Drop a high-level mission. The orchestrator splits it into focused worker tasks. Approve or edit, then dispatch in parallel.
          </p>
        </div>
        {decomposeMeta ? (
          <div className="rounded-xl border border-emerald-400/15 bg-black/35 px-3 py-2 text-[11px] text-emerald-100/65">
            Last decompose <span className="text-emerald-100">{new Date(decomposeMeta.at).toLocaleTimeString()}</span> · model <span className="text-emerald-100">{decomposeMeta.model}</span>
          </div>
        ) : null}
      </div>

      <textarea
        rows={3}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={decomposing}
        placeholder="High-level mission, e.g. 'Sweep open PRs, then summarize the new BenchLoop run from PC1, then draft a launch tweet.'"
        className="mt-3 w-full resize-none rounded-2xl border border-emerald-400/20 bg-black/35 px-3 py-2 text-sm text-emerald-50 focus:border-emerald-300/50 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-emerald-50/55">
          {prompt.trim().length} chars · roster has {members.length} workers
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setAssignments([]); setUnassigned([]); setDispatchResults(null); setDecomposeError(null); setDispatchError(null) }}
            className="rounded-full border border-emerald-400/15 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-emerald-100/70 hover:text-white"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={decompose}
            disabled={decomposing || !prompt.trim()}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold',
              decomposing ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-400 text-black hover:bg-emerald-300 disabled:opacity-50',
            )}
          >
            <HugeiconsIcon icon={Settings01Icon} size={12} />
            {decomposing ? 'Decomposing…' : 'Auto decompose'}
          </button>
        </div>
      </div>

      {decomposeError ? (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {decomposeError}
        </div>
      ) : null}

      {assignments.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/60">Routing plan ({assignments.length})</div>
          {assignments.map((assignment, idx) => (
            <div key={`${assignment.workerId}-${idx}`} className="rounded-2xl border border-emerald-400/15 bg-black/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">{assignment.workerId}</span>
                  <span className="text-emerald-100/65">{deriveRole(assignment.workerId)}</span>
                </span>
                <button type="button" onClick={() => removeAssignment(idx)} className="text-emerald-100/55 hover:text-red-300">
                  Remove
                </button>
              </div>
              <textarea
                rows={3}
                value={assignment.task}
                onChange={(event) => updateAssignment(idx, { task: event.target.value })}
                className="mt-2 w-full resize-none rounded-xl border border-emerald-400/15 bg-black/45 px-2 py-1.5 text-xs text-emerald-50 focus:border-emerald-300/50 focus:outline-none"
              />
              {assignment.rationale ? (
                <div className="mt-2 text-[11px] italic text-emerald-100/55">Rationale: {assignment.rationale}</div>
              ) : null}
            </div>
          ))}

          {unassigned.length > 0 ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200">Unrouted notes</div>
              <ul className="mt-1 list-disc pl-4 text-[11px]">
                {unassigned.map((note, idx) => <li key={idx}>{note}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={dispatch}
              disabled={dispatching}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold',
                dispatching ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-400 text-black hover:bg-emerald-300 disabled:opacity-50',
              )}
            >
              <HugeiconsIcon icon={Rocket01Icon} size={14} />
              {dispatching ? 'Dispatching…' : `Dispatch all (${assignments.length})`}
            </button>
          </div>
        </div>
      ) : null}

      {dispatchError ? (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {dispatchError}
        </div>
      ) : null}

      {dispatchResults ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-emerald-100/60">
            <span>Dispatch results</span>
            <span className="inline-flex items-center gap-1 text-emerald-100/55">
              <HugeiconsIcon icon={Clock01Icon} size={11} />
              {((dispatchResults.completedAt - dispatchResults.dispatchedAt) / 1000).toFixed(1)}s total
            </span>
          </div>
          {dispatchResults.results.map((result) => (
            <div
              key={result.workerId}
              className={cn(
                'rounded-xl border px-3 py-2 text-xs',
                result.ok ? 'border-emerald-400/30 bg-emerald-500/8' : 'border-red-500/30 bg-red-500/8',
              )}
            >
              <div className="flex items-center justify-between text-[11px] text-emerald-100">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <HugeiconsIcon
                    icon={result.ok ? CheckmarkCircle02Icon : AlertCircleIcon}
                    size={12}
                    className={result.ok ? 'text-emerald-300' : 'text-red-300'}
                  />
                  {result.workerId}
                </span>
                <span className="text-emerald-100/55">
                  {(result.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
              {result.error ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-red-100">{result.error}</pre>
              ) : null}
              {result.output ? (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-emerald-50">
                  {result.output.length > 4000 ? `${result.output.slice(0, 4000)}…\n[truncated]` : result.output}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/50">
        <HugeiconsIcon icon={FlashIcon} size={10} />
        Decompose uses workspace default model · approve before dispatch
      </div>
    </section>
  )
}
