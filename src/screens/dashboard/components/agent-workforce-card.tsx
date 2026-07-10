import type {
  AgentWorkerStatus,
  DashboardAgentWorker,
  DashboardAgentWorkforceSection,
} from '@/server/dashboard-aggregator'
import { STATUS_TONE } from '../lib/status-meta'

const WORKER_STATUS_MAP: Record<AgentWorkerStatus, string> = {
  idle: 'idle',
  queued: 'setup-needed',
  running: 'active',
  blocked: 'offline',
  reviewing: 'degraded',
  done: 'not-wired',
}

function formatTime(value: string | null): string {
  if (!value) return 'no heartbeat'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return 'unknown'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function WorkerRow({ worker }: { worker: DashboardAgentWorker }) {
  const meta = STATUS_TONE(WORKER_STATUS_MAP[worker.status])
  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {worker.workerId}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--theme-muted)]">
            {worker.currentTask ?? 'No active assignment'}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.13em] ${meta.tone}`}
        >
          <span className={`size-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-[var(--theme-border)] pt-2 text-center">
        <Metric label="active" value={worker.activeAssignments} />
        <Metric label="done" value={worker.completedAssignments} />
        <Metric label="blocked" value={worker.blockedAssignments} />
        <Metric label="review" value={worker.reviewAssignments} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
        <span className="truncate">{worker.missionId ?? 'no mission'}</span>
        <span>{formatTime(worker.lastSeenAt)}</span>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-xs font-semibold text-[var(--theme-text)]">
        {value}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
        {label}
      </div>
    </div>
  )
}

export function AgentWorkforceCard({
  workforce,
}: {
  workforce: DashboardAgentWorkforceSection | null
}) {
  if (!workforce) return null
  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-accent), var(--theme-success), var(--theme-warning), transparent)',
        }}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Agent Workforce
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
              Swarm missions, read-only
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              Mirrors existing mission receipts. No dispatch, cancel, or review
              actions from this card.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <Metric label="workers" value={workforce.summary.workers} />
            <Metric label="active" value={workforce.summary.active} />
            <Metric label="blocked" value={workforce.summary.blocked} />
            <Metric label="review" value={workforce.summary.reviewing} />
          </div>
        </div>

        {workforce.workers.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {workforce.workers.slice(0, 8).map((worker) => (
              <WorkerRow key={worker.workerId} worker={worker} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-3 text-xs text-[var(--theme-muted)]">
            No swarm mission receipts yet. Agent work will appear here after a
            mission is created or checkpointed.
          </div>
        )}

        {workforce.recentMissions.length > 0 ? (
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
              Recent missions
            </div>
            <div className="mt-2 space-y-1.5">
              {workforce.recentMissions.slice(0, 3).map((mission) => (
                <div
                  key={mission.id}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <span className="truncate text-[var(--theme-text)]">
                    {mission.title}
                  </span>
                  <span className="shrink-0 font-mono uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                    {mission.state} · {mission.assignments}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
