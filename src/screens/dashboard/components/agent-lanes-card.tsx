import { useQuery } from '@tanstack/react-query'
import type {
  AgentLane,
  AgentLaneRegistry,
  AgentLaneStatus,
} from '../../../server/agent-lane-registry'

async function readLanes(): Promise<AgentLaneRegistry> {
  const response = await fetch('/api/agent-lanes')
  if (!response.ok) throw new Error(`Agent lanes read failed: ${response.status}`)
  return (await response.json()) as AgentLaneRegistry
}

const STATUS_META: Record<AgentLaneStatus, { label: string; dot: string }> = {
  active: { label: 'active', dot: 'bg-[var(--theme-success)]' },
  idle: { label: 'idle', dot: 'bg-[color-mix(in_srgb,var(--theme-success)_55%,var(--theme-muted))]' },
  offline: { label: 'offline', dot: 'bg-[var(--theme-danger)]' },
  'setup-needed': { label: 'setup needed', dot: 'bg-[var(--theme-accent)]' },
  unknown: { label: 'unknown', dot: 'bg-[var(--theme-muted)]' },
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function LaneRow({ lane }: { lane: AgentLane }) {
  const meta = STATUS_META[lane.status]
  return (
    <article className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold text-[var(--theme-text)]">
              {lane.label}
            </span>
            {lane.role === 'control-tower' ? (
              <span className="rounded-full border border-[var(--theme-accent-border)] px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--theme-accent)]">
                tower
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--theme-muted)]">
            {lane.detail}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--theme-border)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-text)]">
          <span className={`size-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--theme-border)] pt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--theme-muted)]">
        {lane.model ? <span>model {lane.model}</span> : null}
        {lane.workspace ? <span className="max-w-40 truncate">ws {lane.workspace}</span> : null}
        {lane.activeTask ? <span className="max-w-48 truncate">task {lane.activeTask}</span> : null}
        <span>beat {formatTime(lane.heartbeatAt)}</span>
      </div>
      {lane.blocker ? (
        <p className="mt-1.5 text-[10px] text-[var(--theme-warning)]">
          ⚠ {lane.blocker}
        </p>
      ) : null}
    </article>
  )
}

export function AgentLanesCard() {
  const query = useQuery({
    queryKey: ['agent-lanes'],
    queryFn: readLanes,
    refetchInterval: 45_000,
    staleTime: 20_000,
  })
  const registry = query.data ?? null

  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
        Agent Lanes
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
        Who is working, on real evidence
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
        Read-only detection from session files, processes, the handoff bus,
        and swarm missions. No lane is ever invented.
      </p>
      {query.isError ? (
        <p className="mt-3 text-[11px] text-[var(--theme-danger)]">
          Lane registry endpoint unreachable.
        </p>
      ) : null}
      {registry ? (
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {registry.lanes.map((lane) => (
            <LaneRow key={lane.id} lane={lane} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
