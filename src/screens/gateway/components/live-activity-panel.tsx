import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AgentWorkingRow, AgentWorkingStatus } from './agents-working-panel'
import { AgentOutputPanel } from './agent-output-panel'
import type { HubTask } from './task-board'

export type LiveActivityPanelProps = {
  agents: AgentWorkingRow[]
  selectedAgentId?: string
  sessionKeyByAgentId: Record<string, string>
  tasksByAgentId: Record<string, HubTask[]>
  onViewAgent: (agentId: string) => void
  onKillAgent: (agentId: string) => void
  onRespawnAgent: (agentId: string) => void
  onPauseAgent?: (agentId: string, pause: boolean) => void
  onSteerAgent?: (agentId: string, message: string) => void
  onCloseOutput: () => void
  missionRunning: boolean
}

type PanelTab = 'activity' | 'output'

const MODEL_BADGE: Record<string, string> = {
  auto:          'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  opus:          'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-400',
  sonnet:        'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400',
  codex:         'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400',
  flash:         'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-400',
  'pc1-planner': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'pc1-coder':   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'pc1-critic':  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'pc1-fast':    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'pc1-heavy':   'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'pc1-fmt':      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  'pc1-devstral': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
}

const MODEL_LABEL: Record<string, string> = {
  auto:          'Auto',
  opus:          'Opus',
  sonnet:        'Sonnet',
  codex:         'Codex',
  flash:         'Flash',
  'pc1-planner': 'PC1·Plan',
  'pc1-coder':   'PC1·Code',
  'pc1-critic':  'PC1·Critic',
  'pc1-fast':    'PC1·Fast',
  'pc1-heavy':   'PC1·Heavy',
  'pc1-fmt':      'PC1·Fmt',
  'pc1-devstral': 'PC1·Dev',
}

function statusDotEl(status: AgentWorkingStatus) {
  if (status === 'active') {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
    )
  }
  if (status === 'spawning') {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
        <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
      </span>
    )
  }
  const dotClass =
    status === 'idle' || status === 'ready' ? 'bg-amber-500' :
    status === 'error' ? 'bg-red-500' :
    status === 'paused' ? 'bg-amber-500' :
    'bg-neutral-400'
  return <span className={cn('inline-flex size-2 shrink-0 rounded-full', dotClass)} />
}

function AgentCard({
  agent,
  isSelected,
  onView,
  onKill,
  onRespawn,
  onPause,
  onSteer,
}: {
  agent: AgentWorkingRow
  isSelected: boolean
  onView: () => void
  onKill: () => void
  onRespawn: () => void
  onPause?: (pause: boolean) => void
  onSteer?: (message: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/70 backdrop-blur dark:bg-neutral-900/50 dark:border-white/10 p-3 transition-all',
        isSelected
          ? 'border-emerald-200 ring-1 ring-emerald-500/30 dark:border-emerald-800/50'
          : 'border-neutral-200 dark:border-neutral-800',
      )}
    >
      {/* Row 1: status dot + agent name + model badge */}
      <div className="flex items-center gap-2">
        {statusDotEl(agent.status)}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
          {agent.name}
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium',
            MODEL_BADGE[agent.modelId],
          )}
        >
          {MODEL_LABEL[agent.modelId]}
        </span>
      </div>

      {/* Row 2: current task */}
      <p className="mt-1.5 truncate text-[11px] text-neutral-600 dark:text-neutral-400">
        {agent.currentTask
          ? agent.currentTask
          : agent.status === 'none'
            ? 'No session'
            : agent.status === 'spawning'
              ? 'Spawning…'
              : 'Waiting for mission…'}
      </p>

      {/* Row 3: most recent output line (dimmed, monospace) */}
      {agent.lastLine ? (
        <p className="mt-1 truncate font-mono text-[9px] text-neutral-400 dark:text-neutral-600">
          {agent.lastLine}
        </p>
      ) : (
        <p className="mt-1 font-mono text-[9px] text-neutral-300 dark:text-neutral-700">
          {agent.status === 'active' ? '// working…' : '// idle'}
        </p>
      )}

      {/* Row 4: View button + ⋯ overflow */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onView}
          className={cn(
            'flex-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
            isSelected
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200',
          )}
        >
          {isSelected ? '✓ Viewing' : 'View'}
        </button>

        {/* ⋯ Overflow menu — warden controls */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((p) => !p)
            }}
            className="rounded-lg px-2 py-1 text-[13px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Agent options"
          >
            ⋯
          </button>
          {menuOpen ? (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div
                className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-xl border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
                style={{ overflow: 'visible' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onView()
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[11px] text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  View Output
                </button>
                {agent.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onRespawn()
                    }}
                    className="block w-full px-3 py-1.5 text-left text-[11px] text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20"
                  >
                    Respawn
                  </button>
                ) : null}
                {agent.status !== 'none' && agent.status !== 'error' ? (
                  <>
                    <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                    <p className="px-3 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
                      Warden
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        if (!onSteer) return
                        const directive = window.prompt(
                          `Send directive to ${agent.name}`,
                          '',
                        )
                        if (!directive || !directive.trim()) return
                        onSteer(directive.trim())
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      Steer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onPause?.(agent.status !== 'paused')
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      {agent.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  </>
                ) : null}
                <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onKill()
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[11px] text-red-500 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                >
                  Kill session
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function LiveActivityPanel({
  agents,
  selectedAgentId,
  sessionKeyByAgentId,
  tasksByAgentId,
  onViewAgent,
  onKillAgent,
  onRespawnAgent,
  onPauseAgent,
  onSteerAgent,
  onCloseOutput,
  missionRunning,
}: LiveActivityPanelProps) {
  const [tab, setTab] = useState<PanelTab>('activity')
  const [pinnedOutput, setPinnedOutput] = useState(false)

  const activeCount = agents.filter((a) => a.status === 'active').length
  const idleCount = agents.filter(
    (a) => a.status === 'idle' || a.status === 'ready',
  ).length

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  // Switch to output tab when View is clicked
  function handleViewAgent(agentId: string) {
    onViewAgent(agentId)
    setTab('output')
  }

  function handleCloseOutput() {
    if (!pinnedOutput) {
      setTab('activity')
    }
    onCloseOutput()
  }

  const sessionKey = selectedAgentId
    ? (sessionKeyByAgentId[selectedAgentId] ?? null)
    : null
  const outputTasks = selectedAgentId ? (tasksByAgentId[selectedAgentId] ?? []) : []

  function countLabel() {
    if (activeCount > 0 && idleCount > 0) {
      return (
        <span className="font-mono text-[9px]">
          <span className="text-emerald-500">{activeCount} active</span>
          <span className="text-neutral-400"> · </span>
          <span className="text-neutral-500">{idleCount} idle</span>
        </span>
      )
    }
    if (activeCount > 0) {
      return (
        <span className="font-mono text-[9px] text-emerald-500">{activeCount} active</span>
      )
    }
    return (
      <span className="font-mono text-[9px] text-neutral-500">
        {agents.length} agent{agents.length !== 1 ? 's' : ''}
      </span>
    )
  }

  return (
    <div className="flex h-full flex-col border-l border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950">
      {/* ── Panel header + tab switcher ──────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white/80 px-3 py-2 backdrop-blur dark:border-white/10 dark:bg-neutral-950/70">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            Agents Working
          </h3>
          {missionRunning && activeCount > 0 ? (
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
          ) : null}
          {countLabel()}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => setTab('activity')}
            className={cn(
              'rounded-md px-2.5 py-0.5 text-[10px] font-medium transition-colors',
              tab === 'activity'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300',
            )}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setTab('output')}
            className={cn(
              'rounded-md px-2.5 py-0.5 text-[10px] font-medium transition-colors',
              tab === 'output'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300',
            )}
          >
            Output
            {selectedAgentId && tab !== 'output' ? (
              <span className="ml-1 inline-flex size-1.5 rounded-full bg-emerald-500" />
            ) : null}
          </button>
        </div>
      </div>

      {/* ── Activity tab ─────────────────────────────────────────────────── */}
      {tab === 'activity' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {agents.length === 0 ? (
            <div className="flex h-full items-center justify-center py-12">
              <div className="text-center">
                <p className="mb-1 text-2xl">🤖</p>
                <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-600">
                  // no agents configured
                </p>
                <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-600">
                  Add agents in the Team tab
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgentId === agent.id}
                  onView={() => handleViewAgent(agent.id)}
                  onKill={() => onKillAgent(agent.id)}
                  onRespawn={() => onRespawnAgent(agent.id)}
                  onPause={
                    onPauseAgent
                      ? (pause) => onPauseAgent(agent.id, pause)
                      : undefined
                  }
                  onSteer={
                    onSteerAgent
                      ? (message) => onSteerAgent(agent.id, message)
                      : undefined
                  }
                />
              ))}

              {/* Status legend */}
              <div className="mt-1 flex flex-wrap items-center justify-end gap-3 px-1 pt-1">
                <span className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-600">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Active
                </span>
                <span className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-600">
                  <span className="size-1.5 rounded-full bg-amber-500" /> Idle
                </span>
                <span className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-600">
                  <span className="size-1.5 rounded-full bg-neutral-400" /> No session
                </span>
                <span className="flex items-center gap-1 text-[9px] text-neutral-400 dark:text-neutral-600">
                  <span className="size-1.5 rounded-full bg-red-500" /> Error
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Output tab ───────────────────────────────────────────────────── */}
      {tab === 'output' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Output tab sub-header */}
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {selectedAgent ? selectedAgent.name : 'No agent selected'}
              </span>
              {selectedAgentId && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  live
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPinnedOutput((p) => !p)}
                title={pinnedOutput ? 'Unpin output tab' : 'Pin output tab (stay here when closing)'}
                className={cn(
                  'rounded p-1 text-[11px] transition-colors',
                  pinnedOutput
                    ? 'text-accent-500'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300',
                )}
              >
                📌
              </button>
              <button
                type="button"
                onClick={handleCloseOutput}
                className="rounded p-1 text-[11px] text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
                aria-label="Close output"
              >
                ✕
              </button>
            </div>
          </div>

          {/* No agent selected state */}
          {!selectedAgentId ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="text-center">
                <p className="mb-2 text-2xl opacity-40">📡</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-600">
                  Click{' '}
                  <strong className="text-neutral-700 dark:text-neutral-400">View</strong>{' '}
                  on an agent to stream their output here.
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              <AgentOutputPanel
                agentName={selectedAgent?.name ?? ''}
                sessionKey={sessionKey}
                tasks={outputTasks}
                onClose={handleCloseOutput}
                modelId={selectedAgent?.modelId}
                compact
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
