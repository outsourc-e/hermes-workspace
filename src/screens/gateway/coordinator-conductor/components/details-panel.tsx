import { evidenceFor, formatTime } from '../lib'
import { Action, NodeStateBadge, PanelMessage, classNames } from './shared'
import type { Snapshot } from '../types'

const RETRY_STATES: Array<string> = [
  'failed',
  'blocked',
  'needs_input',
  'retry_wait',
]

export function DetailsPanel({
  snapshot,
  selectedNodeId,
  onSelectNode,
  onRun,
  busy,
}: {
  snapshot: Snapshot | null
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onRun: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  busy: boolean
}) {
  if (!snapshot?.mission) {
    return (
      <aside className="h-fit rounded-2xl border border-dashed border-primary-300 bg-primary-50/30 p-6 text-sm text-primary-600 xl:sticky xl:top-5">
        <h2 className="font-semibold text-ink">Mission inspector</h2>
        <p className="mt-2 leading-6">
          Select a mission to inspect run evidence, checkpoint proof, and
          scheduler decisions.
        </p>
      </aside>
    )
  }

  const { mission, preflight, events, evidence } = snapshot
  const selectedNode = selectedNodeId
    ? (mission.nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null
  const evidenceByNode = new Map(
    evidence.map((item) => [item.nodeId, item.evidence]),
  )

  return (
    <aside className="h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-primary-200 bg-primary-50/50 p-5 shadow-sm xl:sticky xl:top-5">
      <h2 className="text-lg font-semibold">Mission inspector</h2>
      <p className="mt-1 text-xs text-primary-600">
        {mission.id} · graph v{mission.version} · max {mission.maxParallelism}
      </p>

      {preflight?.conflicts && preflight.conflicts.length > 0 ? (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-700">
          <strong className="block">Lock conflicts</strong>
          {preflight.conflicts.map((conflict) => (
            <p key={conflict.nodeId} className="mt-1">
              {conflict.nodeId}: {conflict.reason}
            </p>
          ))}
        </div>
      ) : null}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
        Evidence
      </h3>
      <div className="mt-3 space-y-3">
        {mission.nodes.map((node) => {
          const nodeEvidence = evidenceByNode.get(node.id) ?? evidenceFor(node)
          const isSelected = selectedNode?.id === node.id

          return (
            <button
              key={node.id}
              onClick={() => onSelectNode(isSelected ? null : node.id)}
              className={classNames(
                'w-full rounded-xl border p-3 text-left transition',
                isSelected
                  ? 'border-accent-500 bg-accent-500/5'
                  : 'border-primary-200 bg-surface hover:border-primary-300',
              )}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{node.title}</span>
                <NodeStateBadge state={node.state} />
              </div>
              <p className="mt-2 text-xs text-primary-600">
                Run {nodeEvidence.runId ?? '—'} ·{' '}
                {nodeEvidence.runStatus ?? 'not reported'} ·{' '}
                {nodeEvidence.outcome ?? 'no outcome'}
              </p>
              {nodeEvidence.summary ? (
                <p className="mt-2 text-xs leading-5 text-primary-800">
                  {nodeEvidence.summary}
                </p>
              ) : null}
              {nodeEvidence.checkpoint ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-primary-100 p-2 text-[10px] text-primary-800">
                  {nodeEvidence.checkpoint}
                </pre>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {RETRY_STATES.includes(node.state) ? (
                  <Action
                    warning
                    onClick={() =>
                      onRun({
                        action: 'retry',
                        missionId: mission.id,
                        nodeId: node.id,
                        owner: 'conductor-ui',
                      })
                    }
                    disabled={busy}
                  >
                    Retry
                  </Action>
                ) : null}
                {node.state === 'blocked' || node.state === 'needs_input' ? (
                  <Action
                    onClick={() =>
                      onRun({
                        action: 'status',
                        missionId: mission.id,
                        nodeId: node.id,
                        status: 'ready',
                      })
                    }
                    disabled={busy}
                  >
                    Mark ready
                  </Action>
                ) : null}
                {(node.state === 'verifying' || node.state === 'review') &&
                nodeEvidence.verifiedAt ? (
                  <Action
                    accent
                    onClick={() =>
                      onRun({
                        action: 'complete',
                        missionId: mission.id,
                        nodeId: node.id,
                        owner: 'conductor-ui',
                      })
                    }
                    disabled={busy}
                  >
                    Complete
                  </Action>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
        Decision timeline
      </h3>
      <div className="mt-3 space-y-3">
        {events
          .slice(-20)
          .reverse()
          .map((event, index) => (
            <div
              className="border-l-2 border-primary-300 pl-3 text-xs"
              key={`${event.createdAt}-${index}`}
            >
              <p className="font-medium">{event.type}</p>
              <p className="text-primary-600">{formatTime(event.createdAt)}</p>
              {Object.keys(event.payload).length > 0 ? (
                <pre className="mt-1 max-h-24 overflow-auto rounded bg-primary-100 p-2 text-[10px] text-primary-800">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        {events.length === 0 ? (
          <p className="text-xs text-primary-600">No events yet.</p>
        ) : null}
      </div>
    </aside>
  )
}
