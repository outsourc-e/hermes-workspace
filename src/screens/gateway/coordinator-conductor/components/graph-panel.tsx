import { useMemo } from 'react'
import { computeLevels, evidenceFor } from '../lib'
import { Action, PanelMessage, STATE_MAP, classNames } from './shared'
import type { Mission, MissionNode } from '@/server/mission-coordinator/types'

const RETRY_STATES = new Set(['failed', 'blocked', 'needs_input', 'retry_wait'])

export function GraphPanel({
  mission,
  selectedNodeId,
  onSelectNode,
  onRun,
  busy,
}: {
  mission: Mission | null
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onRun: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  busy: boolean
}) {
  if (!mission) {
    return (
      <PanelMessage
        title="No mission selected"
        body="Select a mission from the queue to see its dependency graph and execution flow."
      />
    )
  }

  return (
    <div className="cc-fade-in flex min-h-[500px] flex-col rounded-2xl border border-primary-200 bg-primary-50/50 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Execution graph</h2>
          <p className="mt-1 text-xs text-primary-600">
            {mission.id} · max parallelism {mission.maxParallelism}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-primary-200 bg-surface p-4">
        <GraphView
          mission={mission}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onRun={onRun}
          busy={busy}
        />
      </div>
    </div>
  )
}

function GraphView({
  mission,
  selectedNodeId,
  onSelectNode,
  onRun,
  busy,
}: {
  mission: Mission
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onRun: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  busy: boolean
}) {
  const levels = useMemo(() => computeLevels(mission.nodes), [mission.nodes])
  const columns = useMemo(() => {
    const map = new Map<number, Array<MissionNode>>()
    for (const node of mission.nodes) {
      const level = levels.get(node.id) ?? 0
      const column = map.get(level) ?? []
      column.push(node)
      map.set(level, column)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([, nodes]) => nodes)
  }, [levels, mission.nodes])

  const colWidth = 260
  const rowHeight = 110
  const gapX = 40
  const gapY = 24

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    columns.forEach((column, colIndex) => {
      const x = colIndex * (colWidth + gapX) + gapX / 2
      column.forEach((node, rowIndex) => {
        const y = rowIndex * (rowHeight + gapY) + gapY / 2
        map.set(node.id, { x, y })
      })
    })
    return map
  }, [columns])

  const width = Math.max(0, columns.length * (colWidth + gapX))
  const height = Math.max(
    300,
    columns.reduce(
      (max, column) => Math.max(max, column.length * (rowHeight + gapY) + gapY),
      0,
    ),
  )

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      style={{
        minWidth: `${Math.max(width, 600)}px`,
        minHeight: `${Math.max(height, 300)}px`,
      }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary-400" />
        </marker>
        <linearGradient id="cc-edge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" className="stop-primary-300" />
          <stop offset="100%" className="stop-accent-400" />
        </linearGradient>
        <filter id="cc-node-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
        </filter>
      </defs>

      {mission.nodes.flatMap((node) =>
        node.dependsOn.map((parentId) => {
          const start = positions.get(parentId)
          const end = positions.get(node.id)
          if (!start || !end) return null
          const midX = (start.x + colWidth + end.x) / 2
          return (
            <path
              key={`${parentId}->${node.id}`}
              d={`M ${start.x + colWidth} ${start.y + rowHeight / 2} C ${midX} ${start.y + rowHeight / 2}, ${midX} ${end.y + rowHeight / 2}, ${end.x} ${end.y + rowHeight / 2}`}
              className="fill-none stroke-primary-300"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          )
        }),
      )}

      {mission.nodes.map((node) => {
        const pos = positions.get(node.id)
        if (!pos) return null
        const style = STATE_MAP[node.state]
        const selected = selectedNodeId === node.id
        const evidence = evidenceFor(node)

        return (
          <g
            key={node.id}
            transform={`translate(${pos.x}, ${pos.y})`}
            className="cursor-pointer"
            onClick={() => onSelectNode(node.id)}
          >
            <rect
              width={colWidth}
              height={rowHeight}
              rx={12}
              className={classNames(
                'transition',
                style.bg,
                selected
                  ? 'stroke-accent-500 stroke-[3]'
                  : 'stroke-primary-200',
              )}
              strokeWidth={selected ? 3 : 1}
            />
            <foreignObject width={colWidth} height={rowHeight}>
              <div className="flex h-full flex-col justify-between p-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {node.title}
                    </span>
                    <span
                      className={classNames(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        style.bg,
                        style.color,
                        style.border,
                      )}
                    >
                      {node.state.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-primary-600">
                    {node.objective}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {node.locks.length ? (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                        {node.locks.length} lock
                        {node.locks.length > 1 ? 's' : ''}
                      </span>
                    ) : null}
                    {evidence.verifiedAt ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                        verified
                      </span>
                    ) : null}
                    {node.hermesTaskId ? (
                      <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[9px] font-medium text-primary-700">
                        hermes
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    {(node.state === 'verifying' || node.state === 'review') &&
                    evidence.verifiedAt ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          void onRun({
                            action: 'complete',
                            missionId: mission.id,
                            nodeId: node.id,
                            owner: 'conductor-ui',
                          })
                        }}
                        disabled={busy}
                        className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Complete
                      </button>
                    ) : null}
                    {RETRY_STATES.has(node.state) ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          void onRun({
                            action: 'retry',
                            missionId: mission.id,
                            nodeId: node.id,
                            owner: 'conductor-ui',
                          })
                        }}
                        disabled={busy}
                        className="rounded bg-amber-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </foreignObject>
          </g>
        )
      })}
    </svg>
  )
}
