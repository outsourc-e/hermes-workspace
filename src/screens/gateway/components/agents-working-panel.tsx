import { useState } from 'react'
import { cn } from '@/lib/utils'

function formatRelativeTime(ts: number): string {
  const diffMs = Math.max(0, Date.now() - ts)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
export type AgentWorkingStatus =
  | 'spawning'
  | 'ready'
  | 'active'
  | 'idle'
  | 'paused'
  | 'error'
  | 'none'
  | 'waiting_for_input'

export type AgentWorkingRow = {
  id: string
  name: string
  modelId: string
  status: AgentWorkingStatus
  lastLine?: string
  lastAt?: number
  taskCount: number
  currentTask?: string
  sessionKey?: string
  roleDescription?: string
}

type AgentsWorkingPanelProps = {
  agents: AgentWorkingRow[]
  className?: string
  onSelectAgent?: (agentId: string) => void
  onKillAgent?: (agentId: string) => void
  onRespawnAgent?: (agentId: string) => void
  onPauseAgent?: (agentId: string, pause: boolean) => void
  onSteerAgent?: (agentId: string, message: string) => void
  selectedAgentId?: string
}

// Accent colors per agent index (cycled) — must match AGENT_ACCENT_COLORS in agent-hub-layout
const ACCENT_COLORS = [
  { bar: 'bg-orange-500', text: 'text-orange-600' },
  { bar: 'bg-blue-500',   text: 'text-blue-600' },
  { bar: 'bg-violet-500', text: 'text-violet-600' },
  { bar: 'bg-emerald-500',text: 'text-emerald-600' },
  { bar: 'bg-rose-500',   text: 'text-rose-600' },
  { bar: 'bg-amber-500',  text: 'text-amber-600' },
]

const MODEL_BADGE: Record<string, string> = {
  auto:          'border border-neutral-200 bg-neutral-100 text-neutral-600',
  opus:          'border border-orange-200 bg-orange-50 text-orange-700',
  sonnet:        'border border-blue-200 bg-blue-50 text-blue-700',
  codex:         'border border-emerald-200 bg-emerald-50 text-emerald-700',
  flash:         'border border-violet-200 bg-violet-50 text-violet-700',
  'pc1-planner': 'border border-teal-200 bg-teal-50 text-teal-700',
  'pc1-coder':   'border border-purple-200 bg-purple-50 text-purple-700',
  'pc1-critic':  'border border-indigo-200 bg-indigo-50 text-indigo-700',
  'pc1-fast':    'border border-slate-200 bg-slate-50 text-slate-700',
  'pc1-heavy':   'border border-cyan-200 bg-cyan-50 text-cyan-700',
  'pc1-fmt':      'border border-zinc-200 bg-zinc-50 text-zinc-700',
  'pc1-devstral': 'border border-rose-200 bg-rose-50 text-rose-700',
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

function getModelBadgeClass(modelId: string): string {
  return MODEL_BADGE[modelId] ?? 'border border-neutral-200 bg-neutral-50 text-neutral-700'
}

function getModelLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  return MODEL_LABEL[modelId] ?? (modelId.split('/')[1] || modelId)
}

const STATUS_TEXT: Record<AgentWorkingStatus, string> = {
  active:            '● working',
  spawning:          '◌ spawning...',
  ready:             '○ ready',
  idle:              '○ idle',
  paused:            '⏸ paused',
  error:             '✕ error',
  none:              '— no session',
  waiting_for_input: '⏳ waiting for input',
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

function AgentRow({
  agent,
  accentIndex,
  isSelected,
  onSelect,
  onKill,
  onRespawn,
  onPause,
  onSteer,
}: {
  agent: AgentWorkingRow
  accentIndex: number
  isSelected: boolean
  onSelect: () => void
  onKill?: () => void
  onRespawn?: () => void
  onPause?: (pause: boolean) => void
  onSteer?: (message: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const accent = ACCENT_COLORS[accentIndex % ACCENT_COLORS.length]
  const isActive = agent.status === 'active'
  const isSpawning = agent.status === 'spawning'
  const canSteer =
    agent.status !== 'none' &&
    agent.status !== 'error' &&
    agent.status !== 'spawning'

  const statusLine = agent.lastLine
    ? agent.lastLine
    : STATUS_TEXT[agent.status]

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      onClick={onSelect}
      className={cn(
        'group relative flex cursor-pointer items-stretch overflow-hidden rounded-lg border transition-all',
        'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
        isSelected && 'border-accent-200 bg-accent-50/40 ring-1 ring-accent-200',
      )}
    >
      {/* Left accent bar */}
      <div className={cn('w-0.5 shrink-0', accent.bar)} />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 pl-3 pr-2">
        {/* Row 1: status indicator + name + model badge + actions */}
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <span className="shrink-0">
            {isActive ? (
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            ) : isSpawning ? (
              <SpinnerIcon className="size-3 text-amber-400" />
            ) : (
              <span
                className={cn(
                  'inline-flex size-2 rounded-full',
                  agent.status === 'idle'  ? 'bg-amber-500' :
                  agent.status === 'ready' ? 'bg-blue-400' :
                  agent.status === 'error' ? 'bg-red-500' :
                  'bg-neutral-400',
                )}
              />
            )}
          </span>

          {/* Name */}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-900">
            {agent.name}
          </span>

          {/* Model badge */}
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium',
              getModelBadgeClass(agent.modelId),
            )}
          >
            {getModelLabel(agent.modelId)}
          </span>

          {/* Respawn on error */}
          {agent.status === 'error' && onRespawn ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRespawn() }}
              className="shrink-0 text-xs text-neutral-500 transition-colors hover:text-neutral-700"
              title="Respawn agent"
            >
              ↻
            </button>
          ) : null}

          {/* Context menu */}
          {onKill ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p) }}
                className="shrink-0 text-sm text-neutral-500 transition-colors group-hover:text-neutral-700 hover:text-neutral-900"
              >
                ⋯
              </button>
              {menuOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                    aria-hidden
                  />
                  <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[110px] rounded-lg border border-neutral-200 bg-white shadow-xl">
                    {canSteer && onSteer ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                          const directive = window.prompt(
                            `Send directive to ${agent.name}`,
                            '',
                          )
                          if (!directive || !directive.trim()) return
                          onSteer(directive.trim())
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                      >
                        Send directive
                      </button>
                    ) : null}
                    {canSteer && onPause ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(false)
                          onPause(agent.status !== 'paused')
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                      >
                        {agent.status === 'paused' ? 'Resume' : 'Pause'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onKill() }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-[11px] font-medium text-red-400 transition-colors hover:bg-red-950/20"
                    >
                      Kill session
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Row 2: status / last activity in monospace */}
        <p className="truncate font-mono text-[9px] text-neutral-500">
          {statusLine}
        </p>
        {agent.lastAt ? (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {formatRelativeTime(agent.lastAt)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function AgentCompactCard({
  agent,
  accentIndex,
  isSelected,
  onSelect,
}: {
  agent: AgentWorkingRow
  accentIndex: number
  isSelected: boolean
  onSelect: () => void
}) {
  const accent = ACCENT_COLORS[accentIndex % ACCENT_COLORS.length]
  const isActive = agent.status === 'active'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative w-40 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50',
        isSelected && 'border-accent-200 ring-1 ring-accent-200',
      )}
    >
      {/* Top accent bar */}
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accent.bar)} />
      <div className="flex items-center gap-1.5 pt-0.5">
        {isActive ? (
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex size-1.5 shrink-0 rounded-full',
              agent.status === 'idle' ? 'bg-amber-500' :
              agent.status === 'error' ? 'bg-red-500' :
              'bg-neutral-600',
            )}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-neutral-900">
          {agent.name}
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1 py-px font-mono text-[8px]',
            MODEL_BADGE[agent.modelId],
          )}
        >
          {MODEL_LABEL[agent.modelId]}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[9px] text-neutral-500">
        {agent.lastLine ?? (isActive ? '● working' : STATUS_TEXT[agent.status])}
      </p>
      {agent.lastAt ? (
        <span className="mt-0.5 block text-[10px] text-neutral-500 dark:text-neutral-400">
          {formatRelativeTime(agent.lastAt)}
        </span>
      ) : null}
    </button>
  )
}

export function AgentsWorkingPanel({
  agents,
  className,
  onSelectAgent,
  onKillAgent,
  onRespawnAgent,
  onPauseAgent,
  onSteerAgent,
  selectedAgentId,
}: AgentsWorkingPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const activeCount = agents.filter(
    (a) => a.status === 'active' || a.status === 'spawning',
  ).length

  return (
    <div
      className={cn(
        'rounded-xl border border-neutral-200 bg-white shadow-sm',
        className,
      )}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500" style={{ fontVariant: 'small-caps' }}>
            Agents Working
          </h3>
          {activeCount > 0 ? (
            <div className="flex items-center gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="font-mono text-[10px] font-medium text-emerald-600">
                {activeCount} live
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-neutral-500">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-0.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={collapsed ? 'Expand agents panel' : 'Collapse agents panel'}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')}
              aria-hidden
            >
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {!collapsed ? (
        agents.length === 0 ? (
          <p className="px-3 pb-3 text-center font-mono text-[10px] text-neutral-500">
            // no agents configured
          </p>
        ) : (
          <>
            {/* Desktop: vertical card list */}
            <div className="hidden space-y-1 px-2 pb-2 md:block">
              {agents.map((agent, i) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  accentIndex={i}
                  isSelected={selectedAgentId === agent.id}
                  onSelect={() => onSelectAgent?.(agent.id)}
                  onKill={onKillAgent ? () => onKillAgent(agent.id) : undefined}
                  onRespawn={onRespawnAgent ? () => onRespawnAgent(agent.id) : undefined}
                  onPause={
                    onPauseAgent ? (pause) => onPauseAgent(agent.id, pause) : undefined
                  }
                  onSteer={
                    onSteerAgent
                      ? (message) => onSteerAgent(agent.id, message)
                      : undefined
                  }
                />
              ))}
            </div>

            {/* Mobile: horizontal scrollable compact cards */}
            <div className="flex gap-2 overflow-x-auto px-2 pb-2 md:hidden">
              {agents.map((agent, i) => (
                <AgentCompactCard
                  key={agent.id}
                  agent={agent}
                  accentIndex={i}
                  isSelected={selectedAgentId === agent.id}
                  onSelect={() => onSelectAgent?.(agent.id)}
                />
              ))}
            </div>
          </>
        )
      ) : null}
    </div>
  )
}
