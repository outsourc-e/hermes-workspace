import { useMemo, useState } from 'react'
import { STATUS_TONE } from '../lib/status-meta'
import type {
  ControlLoopSourceStatus,
  ControlLoopStatus,
  DashboardControlLoop,
  DashboardControlLoopsSection,
} from '@/server/dashboard-aggregator'
import type {
  ControlLoopRunResult,
  RunnableControlLoopId,
} from '@/server/control-loop-runner'

const RUNNABLE_LOOP_IDS: ReadonlySet<string> = new Set([
  'cost-route-watch',
  'morning-command-center',
  'jobboard-caretaker',
])

type RunResponse = {
  ok: boolean
  result: ControlLoopRunResult
  receiptId: string | null
}

function loopStatusPillClass(status: ControlLoopStatus): string {
  const meta = STATUS_TONE(status)
  return `${meta.tone} bg-[color-mix(in_srgb,var(--theme-border)_0%,transparent)]`
}

const SOURCE_STATUS_MAP: Record<ControlLoopSourceStatus, string> = {
  connected: 'operational',
  available: 'setup-needed',
  'not-wired': 'not-wired',
  unavailable: 'offline',
}

function formatStatus(status: ControlLoopStatus): string {
  if (status === 'not-wired') return 'not wired'
  return status
}

function formatTime(value: string | null): string {
  if (!value) return 'not scheduled'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return 'unknown'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: ControlLoopStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${loopStatusPillClass(status)}`}
    >
      {formatStatus(status)}
    </span>
  )
}

function LoopCard({
  loop,
  active,
  onDryRun,
}: {
  loop: DashboardControlLoop
  active: boolean
  onDryRun: (loop: DashboardControlLoop) => void
}) {
  return (
    <article className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {loop.label}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
            {loop.purpose}
          </p>
        </div>
        <StatusBadge status={loop.status} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/50 px-2 py-1.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
            readiness
          </div>
          <div className="mt-1 text-[11px] text-[var(--theme-text)]">
            {loop.readiness}
          </div>
        </div>
        <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/50 px-2 py-1.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
            next
          </div>
          <div className="mt-1 text-[11px] text-[var(--theme-text)]">
            {formatTime(loop.nextScheduledAt)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {loop.connectedSystems.map((system) => (
          <span
            key={`${loop.id}-${system.label}`}
            title={system.detail}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)]/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--theme-muted)]"
          >
            <span
              className={`size-1.5 rounded-full ${STATUS_TONE(SOURCE_STATUS_MAP[system.status]).dot}`}
            />
            {system.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDryRun(loop)}
          className="rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-accent-subtle)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-accent-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--theme-accent)_16%,transparent)]"
        >
          dry run
        </button>
        <a
          href="/chat/main"
          className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-text)]"
        >
          open chat
        </a>
        {active ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-success)]">
            prompt ready
          </span>
        ) : null}
      </div>
    </article>
  )
}

export function ControlLoopsCard({
  controlLoops,
}: {
  controlLoops: DashboardControlLoopsSection | null
}) {
  const [activeLoopId, setActiveLoopId] = useState<string | null>(null)
  const [runState, setRunState] = useState<
    | { phase: 'idle' }
    | { phase: 'running'; loopId: string }
    | { phase: 'done'; loopId: string; response: RunResponse }
    | { phase: 'error'; loopId: string; message: string }
  >({ phase: 'idle' })
  const activeLoop = useMemo(
    () => controlLoops?.loops.find((loop) => loop.id === activeLoopId) ?? null,
    [activeLoopId, controlLoops?.loops],
  )

  if (!controlLoops) return null

  async function handleDryRun(loop: DashboardControlLoop) {
    setActiveLoopId(loop.id)
    if (RUNNABLE_LOOP_IDS.has(loop.id)) {
      // Real server-side dry run: gathers live sources, writes a fabric
      // receipt, and refuses every external write without approval.
      setRunState({ phase: 'running', loopId: loop.id })
      try {
        const response = await fetch('/api/control-loops/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loopId: loop.id as RunnableControlLoopId }),
        })
        if (!response.ok) throw new Error(`run failed: ${response.status}`)
        const payload = (await response.json()) as RunResponse
        setRunState({ phase: 'done', loopId: loop.id, response: payload })
      } catch (error) {
        setRunState({
          phase: 'error',
          loopId: loop.id,
          message: error instanceof Error ? error.message : 'run failed',
        })
      }
      return
    }
    setRunState({ phase: 'idle' })
    try {
      await navigator.clipboard.writeText(loop.dryRunPrompt)
    } catch {
      // Clipboard can be blocked on non-secure origins; the prompt still renders.
    }
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 42%, transparent), transparent)',
        }}
      />

      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Control Loops
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
              Operational loops, dry-run gated
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              Reads Hermes, job board, OAuth, analytics, cron, and vault
              signals. It does not duplicate source-of-truth state.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-success)]">
                {controlLoops.summary.ready}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                ready
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-warning)]">
                {controlLoops.summary.partial}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                partial
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-2 py-1.5">
              <div className="font-mono text-sm font-semibold text-[var(--theme-muted)]">
                {controlLoops.summary.notWired}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                unwired
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {controlLoops.loops.map((loop) => (
            <LoopCard
              key={loop.id}
              loop={loop}
              active={activeLoop?.id === loop.id}
              onDryRun={handleDryRun}
            />
          ))}
        </div>

        {runState.phase === 'running' ? (
          <div className="rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-card2)]/65 p-3 text-[11px] text-[var(--theme-muted)]">
            Running {runState.loopId} against live sources…
          </div>
        ) : null}
        {runState.phase === 'error' ? (
          <div className="rounded-lg border border-[var(--theme-danger)]/40 bg-[color-mix(in_srgb,var(--theme-danger)_8%,transparent)] p-3 text-[11px] text-[var(--theme-danger)]">
            {runState.loopId}: {runState.message}
          </div>
        ) : null}
        {runState.phase === 'done' ? (
          <div className="rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-card2)]/65 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-accent-secondary)]">
                {runState.response.result.loopId} · dry run{' '}
                {runState.response.result.ok ? 'completed' : 'degraded'}
              </div>
              {runState.response.receiptId ? (
                <span className="font-mono text-[9px] text-[var(--theme-success)]">
                  receipt {runState.response.receiptId.slice(0, 14)}…
                </span>
              ) : (
                <span className="font-mono text-[9px] text-[var(--theme-warning)]">
                  no receipt written
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-[var(--theme-text)]">
              {runState.response.result.summary}
            </p>
            <ul className="mt-1 space-y-0.5">
              {runState.response.result.findings.map((finding) => (
                <li key={finding} className="text-[11px] text-[var(--theme-muted)]">
                  • {finding}
                </li>
              ))}
            </ul>
            {runState.response.result.refusals.length > 0 ? (
              <div className="mt-2 border-t border-[var(--theme-border)] pt-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-warning)]">
                  Refused without Taylor approval
                </div>
                <ul className="mt-1 space-y-0.5">
                  {runState.response.result.refusals.map((refusal) => (
                    <li
                      key={refusal}
                      className="text-[10px] leading-relaxed text-[var(--theme-muted)]"
                    >
                      {refusal}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {activeLoop && runState.phase === 'idle' ? (
          <div className="rounded-lg border border-[var(--theme-accent-border)] bg-[var(--theme-card2)]/65 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-accent-secondary)]">
              Dry-run prompt copied when allowed
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--theme-text)]">
              {activeLoop.dryRunPrompt}
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-[color-mix(in_srgb,var(--theme-warning)_28%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-warning)_7%,transparent)] p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-warning)]">
            Risk gates
          </div>
          <div className="mt-2 space-y-1.5">
            {controlLoops.riskGates.map((gate) => (
              <p
                key={gate}
                className="text-[11px] leading-relaxed text-[var(--theme-muted)]"
              >
                {gate}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
