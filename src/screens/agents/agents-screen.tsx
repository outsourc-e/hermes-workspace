import {
  Add01Icon,
  ChartLineData02Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  File01Icon,
  Folder01Icon,
  GlobeIcon,
  PlayCircleIcon,
  PuzzleIcon,
  RefreshIcon,
  Rocket01Icon,
  Settings01Icon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import {
  getWorkspaceAgentStats,
  listWorkspaceAgents,
  type WorkspaceAgentDirectory,
} from '@/lib/workspace-agents'
import {
  listWorkspaceCheckpoints,
  type WorkspaceCheckpoint,
} from '@/lib/workspace-checkpoints'
import { workspaceRequestJson } from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import {
  extractTaskRuns,
  type WorkspaceTaskRun,
} from '@/screens/projects/lib/workspace-types'

type AgentDetailTab =
  | 'profile'
  | 'model-limits'
  | 'system-prompt'
  | 'skills'
  | 'runs'

type AgentPromptDrafts = Record<string, string>

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`
  return formatInteger(value)
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatDuration(ms: number | null): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return 'N/A'
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const seconds = ms / 1_000
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes * 10) / 10}m`
  const hours = minutes / 60
  return `${Math.round(hours * 10) / 10}h`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatRunStatus(
  run: WorkspaceTaskRun,
  checkpoint?: WorkspaceCheckpoint,
): string {
  if (checkpoint?.status === 'pending') return 'Awaiting review'
  if (checkpoint?.status === 'approved') return 'Approved'
  if (checkpoint?.status === 'rejected') return 'Rejected'
  if (checkpoint?.status === 'revised') return 'Revision requested'

  if (run.status === 'completed') return 'Completed'
  if (run.status === 'running') return 'Running'
  if (run.status === 'failed') return 'Failed'
  if (run.status === 'paused') return 'Paused'
  if (run.status === 'stopped') return 'Stopped'
  if (run.status === 'awaiting_review') return 'Awaiting review'
  return run.status
}

function getStatusDotClass(status: WorkspaceAgentDirectory['status']): string {
  if (status === 'online') return 'bg-green-400'
  if (status === 'away') return 'bg-yellow-400'
  return 'bg-primary-600'
}

function getStatusBadgeClass(status: WorkspaceAgentDirectory['status']): string {
  if (status === 'online') {
    return 'border-green-400/20 bg-green-400/10 text-green-300'
  }
  if (status === 'away') {
    return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  }
  return 'border-primary-700 bg-primary-950/80 text-primary-300'
}

function getAvatarToneClass(tone: WorkspaceAgentDirectory['avatar_tone']): string {
  if (tone === 'accent') return 'bg-accent-500/15 text-accent-300'
  if (tone === 'green') return 'bg-green-400/10 text-primary-100'
  if (tone === 'yellow') return 'bg-yellow-400/10 text-primary-100'
  return 'bg-primary-700 text-primary-100'
}

function getProjectChipClass(index: number): string {
  const variants = [
    'border-accent-500/25 bg-accent-500/10 text-accent-300',
    'border-primary-700 bg-primary-950/80 text-primary-200',
    'border-green-400/20 bg-green-400/10 text-green-300',
  ]
  return variants[index % variants.length] ?? variants[0]
}

function matchesAgentRun(agent: WorkspaceAgentDirectory, run: WorkspaceTaskRun): boolean {
  const agentId = normalizeKey(agent.id)
  const agentName = normalizeKey(agent.name)
  return normalizeKey(run.agent_id) === agentId || normalizeKey(run.agent_name) === agentName
}

async function loadTaskRuns(): Promise<WorkspaceTaskRun[]> {
  return extractTaskRuns(await workspaceRequestJson('/api/workspace/task-runs'))
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: typeof ChartLineData02Icon
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-primary-500">
        <HugeiconsIcon icon={icon} size={16} strokeWidth={1.7} />
        <span className="text-xs uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-primary-900">{value}</div>
    </div>
  )
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-600">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function AgentsScreen() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AgentDetailTab>('profile')
  const [promptDrafts, setPromptDrafts] = useState<AgentPromptDrafts>({})

  const agentsQuery = useQuery({
    queryKey: ['workspace', 'agents-directory'],
    queryFn: listWorkspaceAgents,
  })

  const taskRunsQuery = useQuery({
    queryKey: ['workspace', 'task-runs'],
    queryFn: loadTaskRuns,
  })

  const checkpointsQuery = useQuery({
    queryKey: ['workspace', 'checkpoints', 'all'],
    queryFn: async () => listWorkspaceCheckpoints(),
  })

  const agents = agentsQuery.data ?? []

  useEffect(() => {
    if (agents.length === 0) return
    setSelectedAgentId((current) =>
      current && agents.some((agent) => agent.id === current) ? current : agents[0]!.id,
    )
  }, [agents])

  useEffect(() => {
    if (agents.length === 0) return
    setPromptDrafts((current) => {
      const next = { ...current }
      for (const agent of agents) {
        if (next[agent.id] === undefined) next[agent.id] = agent.system_prompt
      }
      return next
    })
  }, [agents])

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null

  const statsQuery = useQuery({
    queryKey: ['workspace', 'agent-stats', selectedAgent?.id],
    enabled: Boolean(selectedAgent?.id),
    queryFn: () => getWorkspaceAgentStats(selectedAgent!.id),
  })

  const recentRuns = useMemo(() => {
    if (!selectedAgent) return []

    const checkpointsByRunId = new Map(
      (checkpointsQuery.data ?? []).map((checkpoint) => [checkpoint.task_run_id, checkpoint]),
    )

    return (taskRunsQuery.data ?? [])
      .filter((run) => matchesAgentRun(selectedAgent, run))
      .sort((left, right) => {
        const leftTime = Date.parse(left.started_at ?? left.completed_at ?? '') || 0
        const rightTime = Date.parse(right.started_at ?? right.completed_at ?? '') || 0
        return rightTime - leftTime
      })
      .slice(0, 8)
      .map((run) => ({
        run,
        checkpoint: checkpointsByRunId.get(run.id),
      }))
  }, [checkpointsQuery.data, selectedAgent, taskRunsQuery.data])

  if (agentsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-primary-950 px-6">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
          <p className="text-sm text-primary-400">Loading agents directory...</p>
        </div>
      </div>
    )
  }

  if (agentsQuery.isError || !selectedAgent) {
    return (
      <div className="flex h-full items-center justify-center bg-primary-950 px-6">
        <div className="max-w-md rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-center">
          <h2 className="text-lg font-semibold text-primary-100">Agents directory unavailable</h2>
          <p className="mt-2 text-sm text-primary-300">
            {agentsQuery.error instanceof Error
              ? agentsQuery.error.message
              : 'The agents directory could not be loaded.'}
          </p>
          <Button
            className="mt-4 bg-accent-500 text-primary-950 hover:bg-accent-400"
            onClick={() => void agentsQuery.refetch()}
          >
            <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.7} />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const selectedPrompt =
    promptDrafts[selectedAgent.id] ?? selectedAgent.system_prompt
  const stats = statsQuery.data

  return (
    <div className="h-full overflow-hidden bg-surface text-primary-900">
      <div className="flex h-full flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-primary-200 bg-primary-50/70 md:w-[220px] md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-primary-200 px-4 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-500">
                Agents
              </p>
              <p className="mt-1 text-xs text-primary-500">
                {agents.length} registered
              </p>
            </div>
            <Button
              size="sm"
              className="bg-accent-500 text-primary-950 hover:bg-accent-400"
              onClick={() => toast('Agent creation is not wired yet.', { type: 'info' })}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
              New Agent
            </Button>
          </div>

          <div className="overflow-y-auto p-2">
            {agents.map((agent) => {
              const isActive = agent.id === selectedAgent.id
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelectedAgentId(agent.id)
                    setActiveTab('profile')
                  }}
                  className={cn(
                    'mb-1 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                    isActive
                      ? 'border-accent-500/30 bg-accent-500/10'
                      : 'border-transparent bg-transparent hover:border-primary-200 hover:bg-white',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg',
                      getAvatarToneClass(agent.avatar_tone),
                    )}
                  >
                    <span aria-hidden="true">{agent.avatar}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary-900">
                      {agent.name}
                    </p>
                    <p className="truncate text-xs text-primary-500">
                      {agent.role} · {agent.model ?? agent.adapter_type}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      getStatusDotClass(agent.status),
                    )}
                  />
                </button>
              )
            })}
          </div>
        </aside>

        <section className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
            <div className="rounded-xl border border-primary-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className={cn(
                        'flex size-14 items-center justify-center rounded-3xl text-2xl',
                        getAvatarToneClass(selectedAgent.avatar_tone),
                      )}
                    >
                      <span aria-hidden="true">{selectedAgent.avatar}</span>
                    </div>
                    <div>
                      <h1 className="text-2xl font-semibold text-primary-900">
                        {selectedAgent.name}
                      </h1>
                      <p className="mt-1 text-sm text-primary-500">
                        {selectedAgent.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]',
                        getStatusBadgeClass(selectedAgent.status),
                      )}
                    >
                      {selectedAgent.status}
                    </span>
                    <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-primary-700">
                      {selectedAgent.role}
                    </span>
                    <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-600">
                      {selectedAgent.provider}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="border border-primary-700 bg-primary-950/80 text-primary-100 hover:bg-primary-800"
                    onClick={() => toast('Configuration flow is not wired yet.', { type: 'info' })}
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.7} />
                    Configure
                  </Button>
                  <Button
                    variant="secondary"
                    className="border border-primary-700 bg-primary-950/80 text-primary-100 hover:bg-primary-800"
                    onClick={() => toast('Project assignment flow is not wired yet.', { type: 'info' })}
                  >
                    <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.7} />
                    Assign to Project
                  </Button>
                  <Button
                    className="bg-accent-500 text-primary-950 hover:bg-accent-400"
                    onClick={() => toast('Test run trigger is not wired yet.', { type: 'info' })}
                  >
                    <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={1.7} />
                    Test Run
                  </Button>
                </div>
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as AgentDetailTab)}
              className="gap-4"
            >
              <TabsList className="w-full flex-wrap rounded-xl border border-primary-200 bg-primary-50/80 p-1 text-primary-500">
                <TabsTrigger
                  value="profile"
                  className="rounded-lg px-4 text-primary-500 data-active:bg-white data-active:text-primary-900"
                >
                  Profile
                </TabsTrigger>
                <TabsTrigger
                  value="model-limits"
                  className="rounded-lg px-4 text-primary-500 data-active:bg-white data-active:text-primary-900"
                >
                  Model &amp; Limits
                </TabsTrigger>
                <TabsTrigger
                  value="system-prompt"
                  className="rounded-lg px-4 text-primary-500 data-active:bg-white data-active:text-primary-900"
                >
                  System Prompt
                </TabsTrigger>
                <TabsTrigger
                  value="skills"
                  className="rounded-lg px-4 text-primary-500 data-active:bg-white data-active:text-primary-900"
                >
                  Skills
                </TabsTrigger>
                <TabsTrigger
                  value="runs"
                  className="rounded-lg px-4 text-primary-500 data-active:bg-white data-active:text-primary-900"
                >
                  Runs
                </TabsTrigger>
              </TabsList>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${selectedAgent.id}:${activeTab}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="space-y-4"
                >
                  <TabsContent value="profile" className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard
                        icon={ChartLineData02Icon}
                        label="Tokens Today"
                        value={statsQuery.isLoading ? '...' : formatTokens(stats?.tokens_today ?? 0)}
                      />
                      <StatCard
                        icon={ChartLineData02Icon}
                        label="Cost Today"
                        value={statsQuery.isLoading ? '...' : formatCurrency(stats?.cost_cents_today ?? 0)}
                      />
                      <StatCard
                        icon={Task01Icon}
                        label="Success Rate"
                        value={statsQuery.isLoading ? '...' : formatPercent(stats?.success_rate ?? 0)}
                      />
                      <StatCard
                        icon={Clock01Icon}
                        label="Avg Response"
                        value={statsQuery.isLoading ? '...' : formatDuration(stats?.avg_response_ms ?? null)}
                      />
                    </div>

                    <SectionCard title="Model & Provider">
                      <div className="grid gap-3 text-sm text-primary-200 sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Model</p>
                          <p className="mt-1 font-medium text-primary-100">
                            {selectedAgent.model ?? selectedAgent.adapter_type}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Provider</p>
                          <p className="mt-1 font-medium text-primary-100">{selectedAgent.provider}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Max Tokens</p>
                          <p className="mt-1 font-medium text-primary-100">
                            {formatInteger(selectedAgent.limits.max_tokens)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Cost</p>
                          <p className="mt-1 font-medium text-primary-100">
                            {selectedAgent.limits.cost_label}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Concurrency</p>
                          <p className="mt-1 font-medium text-primary-100">
                            {selectedAgent.limits.concurrency_limit}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-primary-400">Memory Scope</p>
                          <p className="mt-1 font-medium text-primary-100">
                            {selectedAgent.limits.memory_scope}
                          </p>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Capabilities">
                      <div className="space-y-3">
                        {[
                          {
                            key: 'repo_write',
                            label: 'Repo Write',
                            description: 'Create, edit, and delete files in the workspace.',
                            icon: File01Icon,
                          },
                          {
                            key: 'shell_commands',
                            label: 'Shell Commands',
                            description: 'Execute commands in the active workspace.',
                            icon: ComputerTerminal01Icon,
                          },
                          {
                            key: 'git_operations',
                            label: 'Git Operations',
                            description: 'Create commits and manage branches.',
                            icon: Folder01Icon,
                          },
                          {
                            key: 'browser',
                            label: 'Browser',
                            description: 'Inspect or automate web content.',
                            icon: GlobeIcon,
                          },
                          {
                            key: 'network',
                            label: 'Network',
                            description: 'Access external APIs and web services.',
                            icon: PuzzleIcon,
                          },
                        ].map((item) => {
                          const enabled = selectedAgent.capabilities[
                            item.key as keyof WorkspaceAgentDirectory['capabilities']
                          ]

                          return (
                            <div
                              key={item.key}
                              className="flex items-center justify-between gap-4 rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-3"
                            >
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="mt-0.5 rounded-xl bg-primary-800 p-2 text-primary-300">
                                  <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.7} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-primary-100">{item.label}</p>
                                  <p className="text-sm text-primary-400">{item.description}</p>
                                </div>
                              </div>
                              <Switch checked={enabled} disabled aria-label={item.label} />
                            </div>
                          )
                        })}
                      </div>
                    </SectionCard>

                    <SectionCard title="Assigned Projects">
                      {selectedAgent.assigned_projects.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedAgent.assigned_projects.map((project, index) => (
                            <span
                              key={project}
                              className={cn(
                                'rounded-full border px-3 py-1 text-sm',
                                getProjectChipClass(index),
                              )}
                            >
                              {project}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-primary-400">No projects assigned yet.</p>
                      )}
                    </SectionCard>
                  </TabsContent>

                  <TabsContent
                    value="model-limits"
                    className="space-y-4"
                  >
                    <SectionCard title="Runtime Envelope">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-4">
                          <div className="mb-2 flex items-center gap-2 text-primary-300">
                            <HugeiconsIcon icon={ChartLineData02Icon} size={16} strokeWidth={1.7} />
                            <span className="text-sm font-medium">Token Window</span>
                          </div>
                          <p className="text-2xl font-semibold text-primary-100">
                            {formatInteger(selectedAgent.limits.max_tokens)}
                          </p>
                          <p className="mt-1 text-sm text-primary-400">
                            Maximum context available to this agent profile.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-4">
                          <div className="mb-2 flex items-center gap-2 text-primary-300">
                            <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={1.7} />
                            <span className="text-sm font-medium">Runs Today</span>
                          </div>
                          <p className="text-2xl font-semibold text-primary-100">
                            {statsQuery.isLoading ? '...' : formatInteger(stats?.runs_today ?? 0)}
                          </p>
                          <p className="mt-1 text-sm text-primary-400">
                            Total runs started today for this agent profile.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-4">
                          <div className="mb-2 flex items-center gap-2 text-primary-300">
                            <HugeiconsIcon icon={PlayCircleIcon} size={16} strokeWidth={1.7} />
                            <span className="text-sm font-medium">Concurrency</span>
                          </div>
                          <p className="text-2xl font-semibold text-primary-100">
                            {selectedAgent.limits.concurrency_limit}
                          </p>
                          <p className="mt-1 text-sm text-primary-400">
                            Parallel runs allowed before new work queues.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-4">
                          <div className="mb-2 flex items-center gap-2 text-primary-300">
                            <HugeiconsIcon icon={Folder01Icon} size={16} strokeWidth={1.7} />
                            <span className="text-sm font-medium">Memory Scope</span>
                          </div>
                          <p className="text-2xl font-semibold text-primary-100">
                            {selectedAgent.limits.memory_scope}
                          </p>
                          <p className="mt-1 text-sm text-primary-400">
                            Where this agent is allowed to retain task context.
                          </p>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Provider Policy">
                      <div className="space-y-3 text-sm text-primary-300">
                        <div className="flex items-center justify-between rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-3">
                          <span>Provider</span>
                          <span className="font-medium text-primary-100">{selectedAgent.provider}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-3">
                          <span>Adapter</span>
                          <span className="font-medium text-primary-100">{selectedAgent.adapter_type}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-3">
                          <span>Cost Profile</span>
                          <span className="font-medium text-primary-100">{selectedAgent.limits.cost_label}</span>
                        </div>
                      </div>
                    </SectionCard>
                  </TabsContent>

                  <TabsContent
                    value="system-prompt"
                    className="space-y-4"
                  >
                    <SectionCard
                      title="SOUL / System Prompt"
                      action={
                        <span className="text-xs text-primary-400">
                          Last edited {formatTimestamp(selectedAgent.prompt_updated_at)}
                        </span>
                      }
                    >
                      <textarea
                        value={selectedPrompt}
                        onChange={(event) =>
                          setPromptDrafts((current) => ({
                            ...current,
                            [selectedAgent.id]: event.target.value,
                          }))
                        }
                        className="min-h-[320px] w-full rounded-3xl border border-primary-800 bg-primary-950/80 px-4 py-4 font-mono text-sm text-primary-100 outline-none transition-colors focus:border-accent-500"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          className="bg-accent-500 text-primary-950 hover:bg-accent-400"
                          onClick={() => toast('Prompt draft saved for this session.', { type: 'success' })}
                        >
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          className="border border-primary-700 bg-primary-950/80 text-primary-100 hover:bg-primary-800"
                          onClick={() =>
                            setPromptDrafts((current) => ({
                              ...current,
                              [selectedAgent.id]: selectedAgent.system_prompt,
                            }))
                          }
                        >
                          Reset
                        </Button>
                      </div>
                    </SectionCard>
                  </TabsContent>

                  <TabsContent value="skills" className="space-y-4">
                    <SectionCard title="Skills">
                      <div className="flex flex-wrap gap-2">
                        {selectedAgent.skills.length > 0 ? (
                          selectedAgent.skills.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-full border border-primary-700 bg-primary-950/80 px-3 py-1.5 text-sm text-primary-200"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-primary-400">No specific skills configured yet.</p>
                        )}
                      </div>
                    </SectionCard>

                    <SectionCard title="Operational Notes">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-4">
                          <div className="mb-2 flex items-center gap-2 text-primary-300">
                            <HugeiconsIcon icon={PuzzleIcon} size={16} strokeWidth={1.7} />
                            <span className="text-sm font-medium">Focus Area</span>
                          </div>
                          <p className="text-sm text-primary-200">
                            {selectedAgent.role} coverage with {selectedAgent.provider} runtime.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 p-4">
                          <div className="mb-2 flex items-center gap-2 text-primary-300">
                            <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={1.7} />
                            <span className="text-sm font-medium">Recommended Use</span>
                          </div>
                          <p className="text-sm text-primary-200">
                            Use this agent when the task fits its role and capability envelope.
                          </p>
                        </div>
                      </div>
                    </SectionCard>
                  </TabsContent>

                  <TabsContent value="runs" className="space-y-4">
                    <SectionCard
                      title="Recent Runs"
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          className="border border-primary-700 bg-primary-950/80 text-primary-100 hover:bg-primary-800"
                          onClick={() => {
                            void taskRunsQuery.refetch()
                            void checkpointsQuery.refetch()
                            void statsQuery.refetch()
                          }}
                        >
                          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.7} />
                          Refresh
                        </Button>
                      }
                    >
                      {taskRunsQuery.isLoading ? (
                        <div className="py-10 text-center text-sm text-primary-400">
                          Loading recent runs...
                        </div>
                      ) : recentRuns.length === 0 ? (
                        <div className="rounded-2xl border border-primary-800 bg-primary-950/60 px-4 py-10 text-center text-sm text-primary-400">
                          No runs found for this agent yet.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-primary-800">
                          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px_120px_120px] gap-3 bg-primary-950/80 px-4 py-3 text-xs uppercase tracking-[0.16em] text-primary-400 max-md:hidden">
                            <span>Task</span>
                            <span>Project</span>
                            <span>Status</span>
                            <span>Duration</span>
                            <span>Tokens</span>
                          </div>
                          <div className="divide-y divide-primary-800">
                            {recentRuns.map(({ run, checkpoint }) => {
                              const tokenTotal = run.input_tokens + run.output_tokens
                              const durationMs =
                                run.started_at && run.completed_at
                                  ? Date.parse(run.completed_at) - Date.parse(run.started_at)
                                  : null

                              return (
                                <div
                                  key={run.id}
                                  className="grid gap-3 bg-primary-900/60 px-4 py-4 text-sm text-primary-200 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px_120px_120px] md:items-center"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-primary-100">
                                      {run.task_name}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-primary-400">
                                      {run.mission_name ?? 'Unknown mission'}
                                    </p>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-primary-100">
                                      {run.project_name ?? 'Unknown project'}
                                    </p>
                                    <p className="mt-1 text-xs text-primary-400">
                                      {run.started_at ? formatTimestamp(run.started_at) : 'No start time'}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="rounded-full border border-primary-700 bg-primary-950/80 px-3 py-1 text-xs text-primary-200">
                                      {formatRunStatus(run, checkpoint)}
                                    </span>
                                  </div>
                                  <div className="text-primary-300">
                                    {formatDuration(durationMs)}
                                  </div>
                                  <div className="text-primary-300">
                                    {formatTokens(tokenTotal)}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </SectionCard>
                  </TabsContent>
                </motion.div>
              </AnimatePresence>
            </Tabs>
          </div>
        </section>
      </div>
    </div>
  )
}
