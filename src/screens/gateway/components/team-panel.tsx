import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HubTask } from './task-board'

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

// Presets shown in Agent Hub. 'auto' uses gateway default.
// Additional models from gateway providers show in the chat model switcher.
export const MODEL_PRESETS = [
  { id: 'auto', label: 'Auto (Gateway Default)', desc: 'Uses your configured default model' },
  { id: 'opus', label: 'Claude Opus 4.6', desc: 'Deep reasoning — Anthropic' },
  { id: 'sonnet', label: 'Claude Sonnet 4.6', desc: 'Fast & capable — Anthropic' },
  { id: 'codex', label: 'GPT-5 Codex', desc: 'Code specialist — OpenAI' },
  { id: 'flash', label: 'Gemini 2.5 Flash', desc: 'Quick & cheap — Google' },
  { id: 'minimax', label: 'MiniMax M2.5', desc: 'Cost efficient — MiniMax' },
  { id: 'pc1-coder', label: 'PC1 Coder (97 TPS)', desc: 'Qwen3-Coder 30B · Local · RTX 4090' },
  { id: 'pc1-planner', label: 'PC1 Planner (175 TPS)', desc: 'Qwen3-30B Sonnet Distill MoE · Local · RTX 4090' },
  { id: 'pc1-critic', label: 'PC1 Critic (83 TPS)', desc: 'Qwen3-14B Opus Distill · Local · RTX 4090' },
] as const

export const TEAM_TEMPLATES = [
  {
    id: 'research',
    name: 'Research Team',
    agents: ['Atlas', 'Lens', 'Cipher'],
    icon: '🔍',
  },
  {
    id: 'coding',
    name: 'Coding Sprint',
    agents: ['Forge', 'Sentinel', 'Spark'],
    icon: '💻',
  },
  {
    id: 'content',
    name: 'Content Pipeline',
    agents: ['Scout', 'Quill', 'Polish'],
    icon: '📝',
  },
  {
    id: 'pc1-loop',
    name: 'PC1 Loop (Local ⚡)',
    agents: ['Atlas', 'Forge', 'Lens'],
    icon: '⚡',
  },
] as const

export type ModelPresetId = (typeof MODEL_PRESETS)[number]['id']
export type TeamTemplateId = (typeof TEAM_TEMPLATES)[number]['id']

export type TeamMember = {
  id: string
  name: string
  avatar?: number
  modelId: string
  roleDescription: string
  goal: string        // What this agent is trying to achieve
  backstory: string   // Persona/context that shapes agent behavior
  status: string
  memoryPath?: string       // Custom memory/workspace path for this agent
  skillAllowlist?: string[] // Skills this agent is allowed to use (empty = all)
  modelOverride?: string    // Runtime model override (takes precedence over modelId)
}

export type AgentSessionStatusEntry = {
  status: 'dispatching' | 'active' | 'idle' | 'stopped' | 'error' | 'waiting_for_input'
  lastSeen: number
  lastMessage?: string
}

type GatewayModelOption = {
  value: string
  label: string
  provider: string
}

type TeamPanelProps = {
  team: TeamMember[]
  gatewayModels?: GatewayModelOption[]
  activeTemplateId?: TeamTemplateId
  agentTaskCounts?: Record<string, number>
  spawnState?: Record<string, 'idle' | 'spawning' | 'ready' | 'error'>
  agentSessionStatus?: Record<string, AgentSessionStatusEntry>
  agentSessionMap?: Record<string, string>
  agentModelNotApplied?: Record<string, boolean>
  tasks?: HubTask[]
  onRetrySpawn?: (member: TeamMember) => void
  onKillSession?: (member: TeamMember) => void
  onApplyTemplate: (templateId: TeamTemplateId) => void
  onAddAgent: () => void
  onUpdateAgent: (
    agentId: string,
    updates: Partial<Pick<TeamMember, 'modelId' | 'roleDescription' | 'goal' | 'backstory'>>,
  ) => void
  onSelectAgent?: (agentId?: string) => void
}

const MODEL_BADGE_COLOR: Record<ModelPresetId, string> = {
  auto: 'bg-neutral-200 text-neutral-700',
  opus: 'bg-orange-100 text-orange-700',
  sonnet: 'bg-blue-100 text-blue-700',
  codex: 'bg-emerald-100 text-emerald-700',
  flash: 'bg-violet-100 text-violet-700',
  minimax: 'bg-amber-100 text-amber-700',
  'pc1-coder': 'bg-cyan-100 text-cyan-700',
  'pc1-planner': 'bg-indigo-100 text-indigo-700',
  'pc1-critic': 'bg-purple-100 text-purple-700',
}

const DEFAULT_MODEL_BADGE_COLOR =
  'bg-neutral-100 text-neutral-700'

type SessionDotState = 'active' | 'idle' | 'stale' | 'dead' | 'spawning' | 'none'

const DOT_COLOR: Record<SessionDotState, string> = {
  active: 'bg-emerald-500',
  idle: 'bg-emerald-500',
  stale: 'bg-amber-400',
  dead: 'bg-red-500',
  spawning: 'bg-amber-400',
  none: 'bg-neutral-300 dark:bg-neutral-600',
}

function resolveSessionDotState(
  sessionStatus: AgentSessionStatusEntry | undefined,
  spawnStatus: 'idle' | 'spawning' | 'ready' | 'error' | undefined,
  hasSession: boolean,
): SessionDotState {
  if (spawnStatus === 'spawning') return 'spawning'
  if (!hasSession) {
    if (sessionStatus?.status === 'dispatching') return 'spawning'
    // No session yet — treat spawn error as dead, otherwise none
    return spawnStatus === 'error' ? 'dead' : 'none'
  }
  if (!sessionStatus) return 'none'
  if (sessionStatus.status === 'dispatching') return 'spawning'
  if (sessionStatus.status === 'error' || sessionStatus.status === 'stopped') return 'dead'
  if (sessionStatus.status === 'waiting_for_input') return 'idle' // treat as idle dot (amber badge shows in working panel)
  const ageMs = Date.now() - sessionStatus.lastSeen
  if (ageMs < 30_000) return 'active'
  if (ageMs < 300_000) return 'idle'
  return 'stale'
}

export function TeamPanel({
  team,
  gatewayModels,
  activeTemplateId,
  agentTaskCounts,
  spawnState,
  agentSessionStatus,
  agentSessionMap,
  agentModelNotApplied,
  tasks,
  onRetrySpawn,
  onKillSession,
  onApplyTemplate,
  onAddAgent,
  onUpdateAgent,
  onSelectAgent,
}: TeamPanelProps) {
  const [expandedAgentId, setExpandedAgentId] = useState<string>()

  useEffect(() => {
    if (!expandedAgentId) return
    const exists = team.some((member) => member.id === expandedAgentId)
    if (exists) return
    setExpandedAgentId(undefined)
    onSelectAgent?.(undefined)
  }, [expandedAgentId, onSelectAgent, team])

  const modelLabelById = useMemo(
    () =>
      new Map<string, string>([
        ...MODEL_PRESETS.map((preset) => [preset.id, preset.label] as const),
        ...(gatewayModels ?? []).map((model) => [model.value, model.label] as const),
      ]),
    [gatewayModels],
  )

  function getModelLabel(modelId: string): string {
    const preset = modelLabelById.get(modelId)
    if (preset) return preset
    if (!modelId) return 'Unknown'
    const parts = modelId.split('/')
    return parts[parts.length - 1] || modelId
  }

  function getModelBadgeColor(modelId: string): string {
    return MODEL_BADGE_COLOR[modelId as ModelPresetId] ?? DEFAULT_MODEL_BADGE_COLOR
  }

  function handleToggleAgent(agentId: string) {
    setExpandedAgentId((current) => {
      const next = current === agentId ? undefined : agentId
      onSelectAgent?.(next)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col border-r border-primary-200 bg-primary-50/40 dark:bg-neutral-900/20">
      <div className="border-b border-primary-200 px-3 pb-3 pt-2">
        <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
          Team Setup
        </h2>
        <p className="text-[11px] text-primary-500">Choose a template or build your own.</p>
        <div className="mt-2 space-y-1.5">
          {TEAM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onApplyTemplate(template.id)}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between rounded-lg border border-primary-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-accent-400 hover:bg-accent-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-700 dark:hover:bg-accent-950/10',
                activeTemplateId === template.id &&
                  'border-accent-400 bg-accent-50/60 dark:border-accent-700 dark:bg-accent-950/10',
              )}
            >
              <span className="text-xs font-medium text-primary-800 dark:text-neutral-100">
                {template.icon} {template.name}
              </span>
              <span className="text-[10px] text-primary-500">{template.agents.length} agents</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-primary-200 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
            Your Team
          </h3>
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-neutral-800 dark:text-neutral-300">
            {team.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {team.length === 0 ? (
          <div className="rounded-lg border border-dashed border-primary-300 bg-white/70 px-3 py-4 text-center text-xs text-primary-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
            No agents yet. Apply a template or add one manually.
          </div>
        ) : null}

        {team.map((agent) => {
          const agentSpawnStatus = spawnState?.[agent.id]
          const agentSessionEntry = agentSessionStatus?.[agent.id]
          const agentSessionKey = agentSessionMap?.[agent.id]
          const dotState = resolveSessionDotState(
            agentSessionEntry,
            agentSpawnStatus,
            Boolean(agentSessionKey),
          )
          const dotColorClass = DOT_COLOR[dotState]
          const showPulse = dotState === 'active' || dotState === 'spawning'
          const showRetry = dotState === 'dead' && Boolean(onRetrySpawn)
          const expanded = expandedAgentId === agent.id
          const modelLabel = getModelLabel(agent.modelId)
          const taskCount = agentTaskCounts?.[agent.id] ?? 0
          const cardTitle = agentSessionKey ? `Session: ${agentSessionKey}` : undefined

          // Assigned tasks for this agent (non-done)
          const assignedTasks = tasks?.filter(
            (t) => t.agentId === agent.id && t.status !== 'done',
          ) ?? []

          return (
            <div
              key={agent.id}
              title={cardTitle}
              className={cn(
                'rounded-xl border border-primary-200 bg-white/90 p-2 shadow-sm transition-colors dark:border-neutral-700 dark:bg-neutral-900/70',
                expanded &&
                  'border-accent-300 dark:border-accent-700 bg-accent-50/60 dark:bg-accent-950/10',
              )}
            >
              {/* Header row: toggle button + optional retry button */}
              <div className="flex items-start">
                <button
                  type="button"
                  onClick={() => handleToggleAgent(agent.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  {/* Status dot */}
                  <span className="relative mt-1 inline-flex size-2.5 shrink-0">
                    {showPulse ? (
                      <span
                        className={cn(
                          'absolute inset-0 animate-ping rounded-full',
                          dotState === 'spawning' ? 'bg-amber-400/70' : 'bg-emerald-400/70',
                        )}
                      />
                    ) : null}
                    <span className={cn('relative inline-flex size-2.5 rounded-full', dotColorClass)} />
                  </span>

                  {/* Name + badges */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary-900 dark:text-neutral-100">
                      {agent.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          getModelBadgeColor(agent.modelId),
                        )}
                      >
                        {modelLabel}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-primary-500">
                        {agent.status}
                      </span>
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                    {agentSessionEntry?.lastSeen ? (
                      <p className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                        {formatRelativeTime(agentSessionEntry.lastSeen)}
                      </p>
                    ) : null}
                    {agentModelNotApplied?.[agent.id] ? (
                      <p className="mt-0.5 text-[9px] text-neutral-400 dark:text-neutral-500">
                        Gateway used default model
                      </p>
                    ) : null}
                  </div>

                  {/* Expand arrow */}
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 shrink-0 text-sm text-primary-400 transition-transform',
                      expanded && 'rotate-90 text-accent-500',
                    )}
                  >
                    ›
                  </span>
                </button>

                {/* Retry spawn button — only shown when session is dead/error */}
                {showRetry ? (
                  <button
                    type="button"
                    title="Retry spawn"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRetrySpawn?.(agent)
                    }}
                    className="ml-1 mt-0.5 shrink-0 rounded p-0.5 text-sm leading-none text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
                  >
                    ↻
                  </button>
                ) : null}
              </div>

              {expanded ? (
                <div className="mt-2 space-y-2 border-t border-primary-200 pt-2 dark:border-neutral-700">
                  {/* Quick-look: Model + Session */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-primary-50/60 px-2 py-1.5 text-[10px] dark:bg-neutral-800/60">
                    <span className="flex items-center gap-1">
                      <span className="text-primary-400 dark:text-neutral-500">Model:</span>
                      <span className={cn('rounded px-1.5 py-0.5 font-medium', getModelBadgeColor(agent.modelId))}>
                        {modelLabel}
                      </span>
                    </span>
                    {agentSessionKey ? (
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-primary-400 dark:text-neutral-500">Session:</span>
                        <code className="max-w-[14ch] truncate rounded bg-white px-1 font-mono text-primary-700 dark:bg-neutral-900 dark:text-neutral-400">
                          {agentSessionKey}
                        </code>
                      </span>
                    ) : (
                      <span className="text-primary-300 dark:text-neutral-600">No session</span>
                    )}
                  </div>
                  {agentSessionEntry?.lastMessage ? (
                    <p className="truncate text-[10px] italic text-primary-400 dark:text-neutral-500">
                      {agentSessionEntry.lastMessage}
                    </p>
                  ) : null}

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                      Model
                    </span>
                    <select
                      value={agent.modelId}
                      onChange={(event) => {
                        onUpdateAgent(agent.id, {
                          modelId: event.target.value,
                        })
                      }}
                      className="w-full rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    >
                      <optgroup label="Presets">
                        {MODEL_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </optgroup>
                      {(gatewayModels?.length ?? 0) > 0 ? (
                        <optgroup label="Available Models">
                          {gatewayModels?.map((model) => (
                            <option key={model.value} value={model.value}>
                              {model.label} ({model.provider})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                      Role Description
                    </span>
                    <textarea
                      value={agent.roleDescription}
                      onChange={(event) => {
                        onUpdateAgent(agent.id, {
                          roleDescription: event.target.value,
                        })
                      }}
                      rows={3}
                      placeholder="Define responsibilities and deliverables"
                      className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                      Goal
                    </span>
                    <textarea
                      value={agent.goal}
                      onChange={(event) => {
                        onUpdateAgent(agent.id, {
                          goal: event.target.value,
                        })
                      }}
                      rows={3}
                      placeholder="e.g. Find the most actionable competitive insights"
                      className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                      Backstory
                    </span>
                    <textarea
                      value={agent.backstory}
                      onChange={(event) => {
                        onUpdateAgent(agent.id, {
                          backstory: event.target.value,
                        })
                      }}
                      rows={3}
                      placeholder="e.g. You have 10 years of experience in competitive intelligence..."
                      className="w-full resize-none rounded-md border border-primary-200 bg-white px-2 py-1.5 text-xs text-primary-900 outline-none ring-accent-400 focus:ring-1 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </label>

                  {/* Session key display */}
                  {agentSessionKey ? (
                    <div>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                        Session Key
                      </span>
                      <p className="truncate rounded-md bg-primary-50 px-2 py-1.5 font-mono text-[10px] text-primary-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {agentSessionKey}
                      </p>
                    </div>
                  ) : null}

                  {/* Assigned tasks list */}
                  {assignedTasks.length > 0 ? (
                    <div>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-primary-500">
                        Active Tasks
                      </span>
                      <ul className="space-y-1">
                        {assignedTasks.map((task) => (
                          <li
                            key={task.id}
                            className="truncate rounded-md bg-primary-50 px-2 py-1 text-[10px] text-primary-700 dark:bg-neutral-800 dark:text-neutral-300"
                          >
                            • {task.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Kill session button */}
                  {agentSessionKey ? (
                    <button
                      type="button"
                      onClick={() => onKillSession?.(agent)}
                      className="w-full rounded-md bg-red-500 px-2 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-red-600"
                    >
                      Kill Session
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={onAddAgent}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary-300 py-2.5 text-xs font-semibold text-primary-500 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-accent-700 dark:hover:text-accent-300"
        >
          <span aria-hidden>+</span>
          <span>Add Agent</span>
        </button>
      </div>
    </div>
  )
}
