'use client'

import { useCallback, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  ComputerTerminal01Icon,
  MessageMultiple01Icon,
  Settings01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { AgentProgress } from '@/components/agent-view/agent-progress'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'
import { Button } from '@/components/ui/button'
import { RouterChat, type DispatchResponse } from '@/components/swarm/router-chat'
import { OfficeView } from '@/screens/gateway/components/office-view'
import type { AgentWorkingRow } from '@/screens/gateway/components/agents-working-panel'
import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'

const ORCHESTRATOR_NAME_KEY = 'swarm2:orchestrator:name'
const DEFAULT_NAME = 'Aurora · Main Agent'

type SwarmCardMode = 'cards' | 'office'
type AgentLens = 'all' | 'working' | 'reviewing' | 'blocked' | 'ready'

const AGENT_PAGE_SIZE = 12

const AGENT_LENSES: Array<{ id: AgentLens; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'working', label: 'Run' },
  { id: 'reviewing', label: 'Review' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'ready', label: 'Ready' },
]

export type Swarm2OrchestratorCardProps = {
  totalWorkers: number
  activeRuntimeCount: number
  roomCount: number
  authErrors: number
  selectedLabel: string
  workspaceModel: string | null
  viewMode: 'cards' | 'kanban' | 'runtime' | 'reports'
  onViewModeChange: (mode: 'cards' | 'kanban' | 'runtime' | 'reports') => void
  lanes?: Array<{ role: string; count: number; active: number }>
  activeAgents?: Array<{ workerId: string; workerName: string; role: string; task: string; progress: number; state: 'working' | 'reviewing' | 'blocked' | 'ready'; age: string }>
  members: Array<CrewMember>
  roomIds: Array<string>
  selectedId: string | null
  recentUpdates?: Array<{ workerId: string; workerName: string; text: string; age: string; tone: 'idle' | 'active' | 'warning' }>
  latestMission?: { id: string; title: string; state: string; assignmentCount: number; checkpointedCount: number } | null
  inboxCounts?: { needsReview: number; blocked: number; ready: number }
  routerSeed?: { key: number; prompt: string; mode: 'auto' | 'manual' | 'broadcast' } | null
  onOpenRouter: () => void
  onRouterResults?: (response: DispatchResponse) => void
  /**
   * Bubble the bottom-center anchor of this card up to the parent so that
   * the wires SVG can originate from a real DOM rect.
   */
  onAnchorRef?: (node: HTMLDivElement | null) => void
  className?: string
}

/**
 * Compact hub card. The main agent is the orchestrator/router for the swarm,
 * not a giant embedded chat panel — that surface lives in main workspace chat.
 * This card owns identity, swarm-wide stats, the wire anchor, and the router CTA.
 */
export function Swarm2OrchestratorCard({
  totalWorkers,
  activeRuntimeCount,
  roomCount,
  authErrors,
  selectedLabel,
  workspaceModel,
  viewMode,
  onViewModeChange,
  lanes = [],
  activeAgents = [],
  members,
  roomIds,
  selectedId,
  recentUpdates = [],
  latestMission = null,
  inboxCounts = { needsReview: 0, blocked: 0, ready: 0 },
  routerSeed = null,
  onOpenRouter,
  onRouterResults,
  onAnchorRef,
  className,
}: Swarm2OrchestratorCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [swarmCardMode, setSwarmCardMode] = useState<SwarmCardMode>('cards')
  const [agentLens, setAgentLens] = useState<AgentLens>('all')
  const [agentPage, setAgentPage] = useState(0)
  const [name, setName] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_NAME
    return window.localStorage.getItem(ORCHESTRATOR_NAME_KEY) || DEFAULT_NAME
  })
  const [draftName, setDraftName] = useState(name)
  const anchorCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      onAnchorRef?.(node)
    },
    [onAnchorRef],
  )

  function openSettings() {
    setDraftName(name)
    setSettingsOpen(true)
  }

  function saveSettings() {
    const next = draftName.trim() || DEFAULT_NAME
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ORCHESTRATOR_NAME_KEY, next)
    }
    setName(next)
    setSettingsOpen(false)
  }

  const isActive = activeRuntimeCount > 0
  const lensIndex = AGENT_LENSES.findIndex((lens) => lens.id === agentLens)
  const filteredAgents = useMemo(
    () => activeAgents.filter((agent) => agentLens === 'all' || agent.state === agentLens),
    [activeAgents, agentLens],
  )
  const agentCounts = useMemo(() => {
    const counts: Record<AgentLens, number> = { all: activeAgents.length, working: 0, reviewing: 0, blocked: 0, ready: 0 }
    for (const agent of activeAgents) counts[agent.state] += 1
    return counts
  }, [activeAgents])

  const agentPageCount = Math.max(1, Math.ceil(filteredAgents.length / AGENT_PAGE_SIZE))
  const visibleAgents = filteredAgents.slice(agentPage * AGENT_PAGE_SIZE, agentPage * AGENT_PAGE_SIZE + AGENT_PAGE_SIZE)
  const officeAgents = useMemo<AgentWorkingRow[]>(() => activeAgents.map((agent) => ({
    id: agent.workerId,
    name: agent.workerName,
    modelId: agent.role,
    status: agent.state === 'blocked' ? 'error' : agent.state === 'ready' ? 'done' : 'active',
    lastLine: agent.task,
    lastAt: Date.now(),
    taskCount: agent.state === 'ready' ? 0 : 1,
    currentTask: agent.task,
    roleDescription: agent.role,
  })), [activeAgents])

  function cycleAgentPage(delta: -1 | 1) {
    setAgentPage((page) => (page + delta + agentPageCount) % agentPageCount)
  }

  function selectAgentLens(lens: AgentLens) {
    setAgentLens(lens)
    setAgentPage(0)
  }

  return (
    <>
      <article
        className={cn(
          'relative flex min-h-[23rem] flex-col rounded-[1.75rem] border border-[var(--theme-border)] border-l-4 border-l-[var(--theme-accent)] bg-[var(--theme-card)] px-5 pt-6 pb-4 shadow-[0_22px_64px_var(--theme-shadow)]',
          className,
        )}
      >
        <div className="relative flex flex-col items-center gap-3 text-center">
          <div className="absolute left-0 top-0 flex shrink-0 items-center gap-1 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-1 shadow-sm">
            {([
              ['cards', 'Control'],
              ['kanban', 'Board'],
              ['reports', 'Inbox'],
              ['runtime', 'Runtime'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  viewMode === mode
                    ? 'bg-[var(--theme-accent)] text-primary-950'
                    : 'text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="absolute right-0 top-0 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpenRouter}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
            >
              <HugeiconsIcon
                icon={MessageMultiple01Icon}
                size={13}
                strokeWidth={1.8}
              />
              Router
            </button>
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
              aria-label="Orchestrator settings"
              title="Orchestrator settings"
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                size={16}
                strokeWidth={1.8}
              />
            </button>
          </div>

          <div className="relative flex size-14 shrink-0 items-center justify-center">
            <AgentProgress
              value={isActive ? 82 : 16}
              status={isActive ? 'running' : 'queued'}
              size={56}
              strokeWidth={2.5}
              className="text-emerald-500"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <PixelAvatar
                size={42}
                color="#f59e0b"
                accentColor="#fbbf24"
                status={isActive ? 'running' : 'idle'}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center justify-center gap-2">
              <h2 className="truncate text-[1.05rem] font-semibold text-[var(--theme-text)]">
                {name}
              </h2>
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full bg-emerald-500',
                  isActive && 'animate-pulse',
                )}
                aria-label="Active"
                title={isActive ? 'Active' : 'Idle'}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--theme-muted)]">
              <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1">
                {totalWorkers} workers
              </span>
              <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1">
                {activeRuntimeCount} live
              </span>
              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-amber-700">
                Review {inboxCounts.needsReview}
              </span>
              <span className="rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-red-700">
                Blocked {inboxCounts.blocked}
              </span>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-700">
                Ready {inboxCounts.ready}
              </span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              Reviewer gate pinned to swarm6
            </div>
          </div>
        </div>

        <div className="mt-6 min-h-[12.5rem] flex-1">
          <RouterChat
            members={members}
            roomIds={roomIds}
            selectedId={selectedId}
            open
            embedded
            showClosedDock={false}
            seedPrompt={routerSeed?.prompt ?? null}
            seedMode={routerSeed?.mode}
            seedKey={routerSeed?.key ?? null}
            onClose={() => undefined}
            onResults={(response) => onRouterResults?.(response)}
          />
        </div>

        <div className="mt-auto pt-4">
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2.5 text-left">
            <div className="mb-2 grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
              <div className="flex flex-wrap justify-center gap-1 md:justify-start">
                {AGENT_LENSES.map((lens) => (
                  <button
                    key={lens.id}
                    type="button"
                    onClick={() => selectAgentLens(lens.id)}
                    className={cn(
                      'rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] transition-colors',
                      agentLens === lens.id
                        ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                        : 'border-transparent bg-transparent text-[var(--theme-muted)] hover:border-[var(--theme-border)] hover:bg-[var(--theme-card)] hover:text-[var(--theme-text)]',
                    )}
                  >
                    {lens.label}{lens.id !== 'all' && agentCounts[lens.id] ? ` ${agentCounts[lens.id]}` : ''}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 justify-self-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-1">
                <button
                  type="button"
                  onClick={() => setSwarmCardMode('cards')}
                  className={cn('rounded-lg px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em]', swarmCardMode === 'cards' ? 'bg-[var(--theme-accent)] text-primary-950' : 'text-[var(--theme-muted)] hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]')}
                >
                  Active Swarm
                </button>
                <button
                  type="button"
                  onClick={() => setSwarmCardMode('office')}
                  className={cn('rounded-lg px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em]', swarmCardMode === 'office' ? 'bg-[var(--theme-accent)] text-primary-950' : 'text-[var(--theme-muted)] hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]')}
                >
                  Office
                </button>
              </div>
              <div className={cn('flex items-center justify-center gap-1 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-1 justify-self-center md:justify-self-end', swarmCardMode === 'office' && 'opacity-40')}>
                <button
                  type="button"
                  onClick={() => cycleAgentPage(-1)}
                  disabled={filteredAgents.length <= AGENT_PAGE_SIZE}
                  className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--theme-muted)] hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Previous agent page"
                >
                  ←
                </button>
                <div className="flex items-center gap-1 px-1" aria-label={`Agent page ${Math.min(agentPage + 1, agentPageCount)} of ${agentPageCount}`}>
                  {Array.from({ length: Math.min(agentPageCount, 5) }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        'size-1.5 rounded-full',
                        index === agentPage % 5 ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-muted)]/30',
                      )}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => cycleAgentPage(1)}
                  disabled={filteredAgents.length <= AGENT_PAGE_SIZE}
                  className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--theme-muted)] hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Next agent page"
                >
                  →
                </button>
              </div>
            </div>

            {swarmCardMode === 'office' ? (
              <div className="h-[360px] overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
                <OfficeView
                  agentRows={officeAgents}
                  missionRunning={activeAgents.some((agent) => agent.state === 'working' || agent.state === 'reviewing')}
                  onViewOutput={() => undefined}
                  containerHeight={360}
                  hideHeader
                />
              </div>
            ) : visibleAgents.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {visibleAgents.map((agent) => {
                  const isBlocked = agent.state === 'blocked'
                  const isReview = agent.state === 'reviewing'
                  return (
                    <div key={agent.workerId} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          <PixelAvatar
                            size={30}
                            color={isBlocked ? '#ef4444' : isReview ? '#f59e0b' : '#34d399'}
                            accentColor={isBlocked ? '#fecaca' : isReview ? '#fde68a' : '#bbf7d0'}
                            status={isBlocked ? 'failed' : isReview ? 'thinking' : 'running'}
                          />
                          <span className={cn('absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[var(--theme-card)]', isBlocked ? 'bg-red-500' : isReview ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold text-[var(--theme-text)]">{agent.workerName}</div>
                          <div className="truncate text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">{agent.state}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 truncate text-[10px] text-[var(--theme-muted-2)]" title={agent.task}>{agent.task}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--theme-bg)]">
                        <div className={cn('h-full rounded-full transition-all', isBlocked ? 'bg-red-500' : isReview ? 'bg-amber-500' : 'bg-[var(--theme-accent)]')} style={{ width: `${agent.progress}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[11px] text-[var(--theme-muted)]">
                {activeAgents.length ? `No ${AGENT_LENSES[lensIndex]?.label.toLowerCase() ?? 'matching'} agents right now.` : 'Dispatch a mission to see each worker appear here with progress.'}
              </div>
            )}
          </div>
        </div>

        <div
          ref={anchorCallbackRef}
          aria-hidden="true"
          className="pointer-events-none mt-3 h-px w-full"
          data-swarm2-anchor="orchestrator"
        />
      </article>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_48%,transparent)] px-4 py-6 backdrop-blur-md"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-6 shadow-[0_30px_100px_var(--theme-shadow)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-accent)]">
                  <HugeiconsIcon
                    icon={Settings01Icon}
                    size={20}
                    strokeWidth={1.8}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--theme-text)]">
                    Orchestrator Settings
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
                    Update the display name for the hub.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                aria-label="Close orchestrator settings"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </button>
            </div>

            <label className="mt-6 block space-y-2">
              <span className="text-sm font-medium text-[var(--theme-text)]">
                Display name
              </span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={DEFAULT_NAME}
                className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)]"
              />
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSettingsOpen(false)}
              >
                Close
              </Button>
              <Button type="button" onClick={saveSettings}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
