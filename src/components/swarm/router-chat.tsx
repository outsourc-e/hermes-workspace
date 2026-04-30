'use client'

import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  FlashIcon,
  Rocket01Icon,
  SentIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'

type Mode = 'auto' | 'manual' | 'broadcast'

type Assignment = { workerId: string; task: string; rationale: string; expectedOutput?: string; dependsOn?: Array<string>; reviewRequired?: boolean }
type ParsedCheckpoint = {
  stateLabel: string
  result: string | null
  blocker: string | null
  nextAction: string | null
  filesChanged?: string | null
  commandsRun?: string | null
}

type DispatchResult = {
  workerId: string
  ok: boolean
  output: string
  error: string | null
  durationMs: number
  exitCode: number | null
  delivery?: 'tmux' | 'oneshot'
  checkpoint?: ParsedCheckpoint | null
  checkpointStatus?: 'checkpointed' | 'timeout' | 'not-requested'
}
export type DispatchResponse = {
  dispatchedAt: number
  completedAt: number
  results: Array<DispatchResult>
}

type FollowUpResponse = {
  ok: boolean
  summary?: { checkpointed: number; stale: number; waiting: number; unavailable: number }
  continuation?: { results?: Array<DispatchResult> } | null
  error?: string
}

type Props = {
  members: Array<CrewMember>
  roomIds: Array<string>
  selectedId: string | null
  open: boolean
  onOpen?: () => void
  onClose: () => void
  showClosedDock?: boolean
  embedded?: boolean
  seedPrompt?: string | null
  seedMode?: Mode
  seedKey?: string | number | null
  onResults: (response: DispatchResponse) => void
}

function roleForMember(members: Array<CrewMember>, id: string): string {
  return members.find((member) => member.id === id)?.role || 'Worker'
}


const QUICK_ROUTES = [
  'Research',
  'Builder',
  'Reviewer',
  'Docs',
  'Ops',
  'Best match',
  'Auto',
]

export function RouterChat({
  members,
  roomIds,
  selectedId,
  open,
  onOpen,
  onClose,
  showClosedDock = false,
  embedded = false,
  seedPrompt,
  seedMode,
  seedKey,
  onResults,
}: Props) {
  const [mode, setMode] = useState<Mode>('auto')
  const [prompt, setPrompt] = useState('')
  const [decomposing, setDecomposing] = useState(false)
  const [decomposeError, setDecomposeError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Array<Assignment>>([])
  const [unassigned, setUnassigned] = useState<Array<string>>([])
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [results, setResults] = useState<DispatchResponse | null>(null)
  const [followUp, setFollowUp] = useState<FollowUpResponse | null>(null)

  useEffect(() => {
    if (!seedPrompt?.trim()) return
    setPrompt(seedPrompt)
    if (seedMode) setMode(seedMode)
    setAssignments([])
    setUnassigned([])
    setResults(null)
    setFollowUp(null)
    setDecomposeError(null)
    setDispatchError(null)
  }, [seedKey, seedMode, seedPrompt])

  useEffect(() => {
    if (
      mode === 'manual' &&
      selectedId &&
      assignments.length === 0 &&
      prompt.trim()
    ) {
      setAssignments([
        {
          workerId: selectedId,
          task: prompt.trim(),
          rationale: 'Manual target.',
        },
      ])
    }
  }, [mode, selectedId, assignments.length, prompt])

  if (!open) {
    if (!showClosedDock || !onOpen) return null

    const targetLabel = selectedId
      ? selectedId
      : roomIds.length
        ? `${roomIds.length} in room`
        : `${members.length} workers`

    return (
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-xl px-4 pb-3">
        <RouterClosedDock targetLabel={targetLabel} mode={mode} onOpen={onOpen} />
      </div>
    )
  }

  const eligibleWorkers = members.map((m) => ({
    id: m.id,
    role: m.role,
    model: m.model,
    specialty: m.specialty,
    mission: m.mission || m.lastSessionTitle || undefined,
    skills: m.skills ?? [],
    capabilities: m.capabilities ?? [],
    notes: [
      m.specialty,
      m.mission || m.lastSessionTitle,
      m.skills?.length ? `skills=${m.skills.join(',')}` : '',
      `${m.sessionCount} sess · ${m.totalTokens} tok`,
    ].filter(Boolean).join(' · '),
  }))

  async function autoDecompose(): Promise<Array<Assignment> | null> {
    if (!prompt.trim()) return null
    setDecomposing(true)
    setDecomposeError(null)
    try {
      const res = await fetch('/api/swarm-decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          workers: eligibleWorkers,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as {
        ok: boolean
        assignments?: Array<Assignment>
        unassigned?: Array<string>
        error?: string
      }
      if (!data.ok) throw new Error(data.error || 'decompose failed')
      const nextAssignments = data.assignments ?? []
      setAssignments(nextAssignments)
      setUnassigned(data.unassigned ?? [])
      return nextAssignments
    } catch (err) {
      setDecomposeError(err instanceof Error ? err.message : 'decompose failed')
      return null
    } finally {
      setDecomposing(false)
    }
  }

  async function dispatch() {
    let plan: Array<Assignment> = []
    if (mode === 'auto') {
      if (assignments.length === 0) {
        const nextAssignments = await autoDecompose()
        if (!nextAssignments || nextAssignments.length === 0) return
        plan = nextAssignments
      } else {
        plan = assignments
      }
    } else if (mode === 'manual') {
      if (!selectedId) return
      plan = [
        {
          workerId: selectedId,
          task: prompt.trim(),
          rationale: 'Manual single-target.',
        },
      ]
    } else {
      const targets = roomIds.length > 0 ? roomIds : members.map((m) => m.id)
      plan = targets.map((id) => ({
        workerId: id,
        task: prompt.trim(),
        rationale: 'Broadcast.',
      }))
    }
    if (plan.length === 0) return
    setDispatching(true)
    setDispatchError(null)
    setResults(null)
    setFollowUp(null)
    try {
      const res = await fetch('/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: plan,
          timeoutSeconds: 300,
          waitForCheckpoint: true,
          checkpointPollSeconds: 90,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as DispatchResponse
      setResults(data)
      onResults(data)
      if (plan.length > 1 && data.results.some((result) => result.checkpointStatus === 'checkpointed')) {
        const reviewer = members.find((member) => member.id === 'swarm6') ?? members.find((member) => /review|qa|critic/i.test(`${member.role} ${member.specialty ?? ''}`))
        const follow = await fetch('/api/swarm-orchestrator-loop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workerIds: [...new Set([...plan.map((item) => item.workerId), ...(reviewer ? [reviewer.id] : [])])],
            staleMinutes: 3,
            autoContinue: true,
            allowExecution: false,
            reviewWorkerId: reviewer?.id,
          }),
        })
        const followData = (await follow.json().catch(() => null)) as FollowUpResponse | null
        if (followData) setFollowUp(followData)
      }
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'dispatch failed')
    } finally {
      setDispatching(false)
    }
  }

  function reset() {
    setPrompt('')
    setAssignments([])
    setUnassigned([])
    setResults(null)
    setFollowUp(null)
    setDecomposeError(null)
    setDispatchError(null)
  }

  return (
    <div className={cn(embedded ? 'w-full' : 'fixed inset-x-0 bottom-0 z-40 mx-auto max-w-6xl px-4 pb-3')}>
      <div className={cn(
        'overflow-hidden rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)]',
        embedded
          ? 'max-h-none shadow-none'
          : 'max-h-[min(58vh,460px)] shadow-[0_-18px_50px_var(--theme-shadow)]',
      )}>
        <div className={cn('flex flex-wrap items-start justify-between gap-3', embedded ? 'px-3 pt-3' : 'px-5 pt-4')}>
          <div>
            {!embedded ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--theme-muted)]">
                  <HugeiconsIcon icon={FlashIcon} size={11} />
                  Agent Router Chat
                </div>
                <div className="mt-1 text-sm text-[var(--theme-muted-2)]">
                  Type a mission, choose routing, dispatch. Keep workers selected in cards.
                </div>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!embedded ? <ModeToggle mode={mode} setMode={setMode} /> : null}
            {!embedded ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>

        <div className={cn(
          'grid gap-3 overflow-y-auto py-3',
          embedded
            ? 'max-h-none px-3'
            : 'max-h-[330px] px-5 lg:grid-cols-[1.35fr_minmax(280px,1fr)]',
        )}>
          <div className="flex flex-col gap-2">
            <textarea
              rows={embedded ? 5 : 7}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={decomposing || dispatching}
              placeholder={
                mode === 'auto'
                  ? "Describe the mission, e.g. 'Sweep open PRs, then summarise BenchLoop runs from PC1, draft a launch tweet.'"
                  : mode === 'manual'
                    ? `Message ${selectedId ?? 'select a worker first'}…`
                    : "Broadcast to the room (or all workers if no room): 'Status check.'"
              }
              className="min-h-[8rem] resize-y rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)] focus:outline-none"
            />
            {!embedded ? (
              <div className="flex flex-wrap items-center gap-2">
                {QUICK_ROUTES.map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => {
                      setMode('auto')
                      setPrompt((cur) =>
                        cur
                          ? cur
                          : `Use the ${quick.toLowerCase()} specialist for this:`,
                      )
                    }}
                    className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
                  >
                    {quick}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {embedded ? (
                <div className="flex flex-wrap items-center gap-3">
                  <ModeToggle mode={mode} setMode={setMode} />
                </div>
              ) : (
                <div className="text-[11px] text-[var(--theme-muted)]">
                  {`${prompt.trim().length} chars · ${mode === 'auto'
                    ? 'auto-route by role'
                    : mode === 'manual'
                      ? `→ ${selectedId ?? 'no target'}`
                      : `broadcast to ${roomIds.length || members.length}`}`}
                </div>
              )}
              <div className="flex items-center gap-2">
                {!embedded ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={dispatch}
                  disabled={
                    dispatching ||
                    decomposing ||
                    !prompt.trim() ||
                    (mode === 'manual' && !selectedId)
                  }
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold',
                    dispatching || decomposing
                      ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
                      : 'bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)] disabled:opacity-50',
                  )}
                >
                  <HugeiconsIcon
                    icon={mode === 'manual' ? SentIcon : mode === 'auto' ? Settings01Icon : Rocket01Icon}
                    size={12}
                  />
                  {dispatching || decomposing
                    ? mode === 'auto'
                      ? 'Routing…'
                      : 'Sending…'
                    : mode === 'manual'
                      ? `Send to ${selectedId ?? '—'}`
                      : mode === 'broadcast'
                        ? `Broadcast to ${roomIds.length || members.length}`
                        : 'Route mission'}
                </button>
              </div>
            </div>
            {decomposeError ? (
              <div className="rounded-xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-3 py-2 text-xs text-[var(--theme-text)]">
                {decomposeError}
              </div>
            ) : null}
            {dispatchError ? (
              <div className="rounded-xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-3 py-2 text-xs text-[var(--theme-text)]">
                {dispatchError}
              </div>
            ) : null}
          </div>

          {!embedded ? (
          <div className="flex min-h-[180px] flex-col gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Routing plan
            </div>
            {assignments.length === 0 ? (
              <div className="text-[12px] text-[var(--theme-muted-2)]">
                {mode === 'auto'
                  ? 'Hit Auto decompose to see proposed routing here.'
                  : mode === 'manual'
                    ? 'Single target dispatch.'
                    : 'Broadcast — no per-target plan needed.'}
              </div>
            ) : (
              <ol className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-[12px]">
                {assignments.map((a, idx) => (
                  <li
                    key={`${a.workerId}-${idx}`}
                    className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
                      <span>
                        → {a.workerId} · {roleForMember(members, a.workerId)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAssignments((c) => c.filter((_, i) => i !== idx))
                        }
                        className="text-[var(--theme-muted)] hover:text-[var(--theme-danger)]"
                      >
                        remove
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={a.task}
                      onChange={(e) =>
                        setAssignments((c) =>
                          c.map((entry, i) =>
                            i === idx
                              ? { ...entry, task: e.target.value }
                              : entry,
                          ),
                        )
                      }
                      className="mt-1 w-full resize-none rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[11px] text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                    {a.rationale ? (
                      <div className="mt-1 text-[10px] italic text-[var(--theme-muted-2)]">
                        {a.rationale}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {unassigned.length > 0 ? (
              <div className="rounded-md border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-2 py-1 text-[11px] text-[var(--theme-text)]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
                  Unrouted notes
                </div>
                <ul className="list-disc pl-4">
                  {unassigned.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          ) : null}
        </div>

        {!embedded && results ? (
          <div className="max-h-64 overflow-y-auto border-t border-[var(--theme-border)] px-5 py-3">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              <span>Dispatch results</span>
              <span className="inline-flex items-center gap-1 text-[var(--theme-muted)]">
                <HugeiconsIcon icon={Clock01Icon} size={11} />
                {((results.completedAt - results.dispatchedAt) / 1000).toFixed(
                  1,
                )}
                s
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.results.map((r) => (
                <div
                  key={r.workerId}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-[11px]',
                    r.ok
                      ? 'border-[var(--theme-border)] bg-[var(--theme-card)]'
                      : 'border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)]',
                  )}
                >
                  <div className="flex items-center justify-between text-[var(--theme-text)]">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <HugeiconsIcon
                        icon={r.ok ? CheckmarkCircle02Icon : AlertCircleIcon}
                        size={11}
                        className={r.ok ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-danger)]'}
                      />
                      {r.workerId}
                    </span>
                    <span className="text-[var(--theme-muted)]">
                      {(r.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  {r.error ? (
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-[var(--theme-danger)]">
                      {r.error}
                    </pre>
                  ) : null}
                  {r.checkpoint ? (
                    <div className="mt-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                        Checkpoint · {r.checkpoint.stateLabel}
                      </div>
                      {r.checkpoint.result ? (
                        <div className="mt-1 line-clamp-4 text-[11px] text-[var(--theme-text)]">
                          {r.checkpoint.result}
                        </div>
                      ) : null}
                      {r.checkpoint.nextAction ? (
                        <div className="mt-1 text-[10px] text-[var(--theme-muted)]">
                          Next: {r.checkpoint.nextAction}
                        </div>
                      ) : null}
                    </div>
                  ) : r.checkpointStatus === 'timeout' ? (
                    <div className="mt-2 rounded-lg border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] p-2 text-[11px] text-[var(--theme-text)]">
                      Delivered, waiting for checkpoint. Orchestrator loop can follow up.
                    </div>
                  ) : null}
                  {r.output ? (
                    <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[var(--theme-text)]">
                      {r.output.length > 1800
                        ? `${r.output.slice(0, 1800)}…\n[truncated]`
                        : r.output}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!embedded && followUp ? (
          <div className="border-t border-[var(--theme-border)] px-5 py-3 text-[11px] text-[var(--theme-text)]">
            <div className="font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Orchestrator follow-up
            </div>
            <div className="mt-1 text-[var(--theme-muted-2)]">
              Parsed {followUp.summary?.checkpointed ?? 0} checkpoints · stale {followUp.summary?.stale ?? 0} · continuation {followUp.continuation ? 'sent' : 'not needed'}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  )
}

function RouterClosedDock({
  targetLabel,
  mode,
  onOpen,
}: {
  targetLabel: string
  mode: Mode
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-left text-[var(--theme-text)] shadow-[0_-12px_34px_var(--theme-shadow)] transition-colors hover:border-[var(--theme-accent)]"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <HugeiconsIcon icon={FlashIcon} size={14} className="text-[var(--theme-accent)]" />
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-muted)]">
            Router
          </span>
          <span className="block truncate text-sm text-[var(--theme-text)]">
            {mode} · {targetLabel}
          </span>
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-[var(--theme-accent)] px-3 py-1 text-xs font-semibold text-primary-950">
        Open
      </span>
    </button>
  )
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: Mode
  setMode: (m: Mode) => void
}) {
  return (
    <div className="flex rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-1 text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
      {(['auto', 'manual', 'broadcast'] as Array<Mode>).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={cn(
            'rounded-lg px-3 py-1 transition-colors',
            mode === m ? 'bg-[var(--theme-accent)] text-primary-950' : 'hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]',
          )}
        >
          {m === 'manual' ? 'one agent' : m}
        </button>
      ))}
    </div>
  )
}
