'use client'

import { useCallback, useState } from 'react'
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
import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'

const ORCHESTRATOR_NAME_KEY = 'swarm2:orchestrator:name'
const DEFAULT_NAME = 'Aurora · Main Agent'

export type Swarm2OrchestratorCardProps = {
  totalWorkers: number
  activeRuntimeCount: number
  roomCount: number
  authErrors: number
  selectedLabel: string
  workspaceModel: string | null
  viewMode: 'cards' | 'runtime'
  onViewModeChange: (mode: 'cards' | 'runtime') => void
  lanes?: Array<{ role: string; count: number; active: number }>
  members: Array<CrewMember>
  roomIds: Array<string>
  selectedId: string | null
  recentUpdates?: Array<{ workerId: string; workerName: string; text: string; age: string; tone: 'idle' | 'active' | 'warning' }>
  latestMission?: { id: string; title: string; state: string; assignmentCount: number; checkpointedCount: number } | null
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
  members,
  roomIds,
  selectedId,
  recentUpdates = [],
  latestMission = null,
  onOpenRouter,
  onRouterResults,
  onAnchorRef,
  className,
}: Swarm2OrchestratorCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  return (
    <>
      <article
        className={cn(
          'relative flex min-h-[23rem] flex-col rounded-[1.75rem] border border-[var(--theme-border)] border-l-4 border-l-[var(--theme-accent)] bg-[var(--theme-card)] px-5 pt-6 pb-4 shadow-[0_22px_64px_var(--theme-shadow)]',
          className,
        )}
      >
        <div className="relative flex flex-col items-center gap-3 text-center">
          <div className="absolute left-0 top-0 flex shrink-0 items-center gap-2">
            <div className="inline-flex rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-1 shadow-sm">
              <button
                type="button"
                onClick={() => onViewModeChange('cards')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  viewMode === 'cards'
                    ? 'bg-[var(--theme-accent)] text-primary-950'
                    : 'text-[var(--theme-muted)] hover:bg-[var(--theme-card2)]',
                )}
              >
                <HugeiconsIcon icon={ViewIcon} size={13} />
                Control plane
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('runtime')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  viewMode === 'runtime'
                    ? 'bg-[var(--theme-accent)] text-primary-950'
                    : 'text-[var(--theme-muted)] hover:bg-[var(--theme-card2)]',
                )}
              >
                <HugeiconsIcon icon={ComputerTerminal01Icon} size={13} />
                Runtime / tmux
              </button>
            </div>
          </div>

          <div className="absolute right-0 top-0 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpenRouter}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--theme-accent)] px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
            >
              <HugeiconsIcon
                icon={MessageMultiple01Icon}
                size={13}
                strokeWidth={1.8}
              />
              Advanced
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
            onClose={() => undefined}
            onResults={(response) => onRouterResults?.(response)}
          />
        </div>

        <div className="mt-auto min-h-[7.5rem] pt-4">
          {latestMission ? (
            <div className="mb-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Latest mission</div>
                  <div className="mt-1 truncate text-sm font-medium text-[var(--theme-text)]">{latestMission.title}</div>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                  {latestMission.state}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--theme-card)]">
                <div
                  className="h-full rounded-full bg-[var(--theme-accent)]"
                  style={{ width: `${latestMission.assignmentCount ? Math.round((latestMission.checkpointedCount / latestMission.assignmentCount) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-[var(--theme-muted)]">
                {latestMission.checkpointedCount}/{latestMission.assignmentCount} checkpointed · {latestMission.id}
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
                Recent updates
              </div>
              <div className="text-[10px] text-[var(--theme-muted)]">
                Last 3 worker signals
              </div>
            </div>
            <div className="space-y-1.5">
              {recentUpdates.length > 0 ? recentUpdates.slice(0, 3).map((update) => (
                <div
                  key={`${update.workerId}-${update.age}`}
                  className="flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-2"
                >
                  <span className={cn(
                    'inline-block size-2 rounded-full',
                    update.tone === 'warning'
                      ? 'bg-amber-500'
                      : update.tone === 'active'
                        ? 'bg-emerald-500'
                        : 'bg-[var(--theme-muted)]/50',
                  )} />
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                    {update.workerName}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--theme-text)]">
                    {update.text}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--theme-muted)]">
                    {update.age}
                  </span>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[11px] text-[var(--theme-muted)]">
                  Waiting for worker activity.
                </div>
              )}
            </div>
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
