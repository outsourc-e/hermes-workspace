import { Action, PanelMessage, Stat, classNames } from './shared'
import type { Mission } from '@/server/mission-coordinator/types'

type MissionListProps = {
  missions: Array<Mission>
  selectedId: string | null
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
  onRun: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  busy: boolean
}

export function MissionList({
  missions,
  selectedId,
  loading,
  error,
  onSelect,
  onRun,
  busy,
}: MissionListProps) {
  if (loading)
    return (
      <PanelMessage
        title="Loading missions"
        body="Reading the coordinator projection…"
      />
    )
  if (error)
    return <PanelMessage title="Mission queue unavailable" body={error} error />
  if (missions.length === 0) {
    return (
      <PanelMessage
        title="No missions yet"
        body="Create a mission above to start with Inspect → Design → Build → Review → QA → Integrate."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mission queue</h2>
          <p className="mt-1 text-xs text-primary-600">
            Choose a mission to inspect its proof and decisions.
          </p>
        </div>
        <Action
          onClick={() => onRun({ action: 'reconcile-all' })}
          disabled={busy}
        >
          Reconcile all
        </Action>
      </div>

      <div className="space-y-3">
        {missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            selected={mission.id === selectedId}
            onSelect={() => onSelect(mission.id)}
            onRun={onRun}
            busy={busy}
          />
        ))}
      </div>
    </div>
  )
}

function MissionCard({
  mission,
  selected,
  onSelect,
  onRun,
  busy,
}: {
  mission: Mission
  selected: boolean
  onSelect: () => void
  onRun: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  busy: boolean
}) {
  const active = mission.nodes.filter((node) =>
    ['leased', 'dispatched', 'running', 'verifying'].includes(node.state),
  ).length
  const waiting = mission.nodes.filter(
    (node) => node.state === 'blocked_by_dependency',
  ).length
  const needs = mission.nodes.filter((node) =>
    ['blocked', 'needs_input', 'review'].includes(node.state),
  ).length
  const done = mission.nodes.filter((node) => node.state === 'done').length

  return (
    <article
      className={classNames(
        'cc-card-lift overflow-hidden rounded-2xl border bg-primary-50/50 shadow-sm transition',
        selected
          ? 'border-accent-500 ring-2 ring-accent-500/20 shadow-accent-500/10'
          : 'border-primary-200 hover:border-primary-300 hover:shadow-md',
      )}
    >
      <button onClick={onSelect} className="group w-full p-5 text-left">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{mission.title}</h3>
            <p className="mt-1 truncate text-xs text-primary-600">
              {mission.id} · graph v{mission.version} · max{' '}
              {mission.maxParallelism}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-primary-200 px-2 py-1 text-xs text-primary-700 transition group-hover:border-accent-400/40">
            {mission.nodes.length} steps
          </span>
        </div>
      </button>

      <div className="grid grid-cols-4 gap-px overflow-hidden border-y border-primary-200 bg-primary-200">
        <Stat label="Now" value={active} />
        <Stat label="Waiting" value={waiting} />
        <Stat label="Needs you" value={needs} />
        <Stat label="Done" value={done} />
      </div>

      <div className="flex flex-wrap gap-2 p-4">
        <Action
          onClick={() => onRun({ action: 'preflight', missionId: mission.id })}
          disabled={busy}
        >
          Preflight
        </Action>
        <Action
          onClick={() => onRun({ action: 'provision', missionId: mission.id })}
          disabled={busy}
        >
          Link tasks
        </Action>
        <Action
          onClick={() => onRun({ action: 'lifecycle', missionId: mission.id })}
          disabled={busy}
        >
          Lifecycle
        </Action>
        <Action
          onClick={() =>
            onRun({
              action: 'claim',
              missionId: mission.id,
              owner: 'conductor-ui',
            })
          }
          disabled={busy}
        >
          Claim
        </Action>
        <Action
          accent
          onClick={() =>
            onRun({
              action: 'dispatch',
              missionId: mission.id,
              owner: 'conductor-ui',
            })
          }
          disabled={busy}
        >
          Dispatch
        </Action>
        <Action
          danger
          onClick={() =>
            onRun({
              action: 'cancel',
              missionId: mission.id,
              owner: 'conductor-ui',
            })
          }
          disabled={busy}
        >
          Cancel
        </Action>
        <Action
          danger
          onClick={() =>
            onRun({
              action: 'delete',
              missionId: mission.id,
            })
          }
          disabled={busy}
        >
          Delete
        </Action>
      </div>
    </article>
  )
}
