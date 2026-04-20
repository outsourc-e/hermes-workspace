import { HugeiconsIcon } from '@hugeicons/react'
import {
  AiChat01Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  EyeIcon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AgentProgress } from './agent-progress'
import type { AgentProgressStatus } from './agent-progress'
import { KillConfirmDialog } from './kill-confirm-dialog'
import { SteerModal } from './steer-modal'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/agent-avatar'
import {
  PERSONA_COLORS,
  PixelAvatar,
} from '@/components/agent-swarm/pixel-avatar'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { toast } from '@/components/ui/toast'
import { assignPersona } from '@/lib/agent-personas'
import { formatCost, formatRuntime } from '@/hooks/use-agent-view'
import { toggleAgentPause } from '@/lib/gateway-api'
import {
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type AgentNodeStatus = AgentProgressStatus

export type AgentStatusBubbleType =
  | 'thinking'
  | 'checkpoint'
  | 'question'
  | 'error'

export type AgentStatusBubble = {
  type: AgentStatusBubbleType
  text: string
}

export type AgentNode = {
  id: string
  name: string
  task: string
  model: string
  progress: number
  runtimeSeconds: number
  tokenCount: number
  cost: number
  status: AgentNodeStatus
  isLive?: boolean
  statusBubble?: AgentStatusBubble
  isMain?: boolean
  sessionKey?: string
}

type AgentCardProps = {
  node: AgentNode
  layoutId?: string
  cardRef?: React.Ref<HTMLElement>
  viewMode?: 'expanded' | 'compact'
  /** @deprecated Use inline detail panel instead */
  onView?: (nodeId: string) => void
  onChat?: (nodeId: string) => void
  onKill?: (nodeId: string) => void
  onCancel?: (nodeId: string) => void
  className?: string
  /** Enable inline detail panel instead of navigation */
  useInlineDetail?: boolean
}

function getModelBadgeClassName(model: string): string {
  if (model === 'opus')
    return 'bg-violet-500/20 text-violet-200 ring-violet-500/40'
  if (model === 'sonnet') return 'bg-sky-500/20 text-sky-200 ring-sky-500/40'
  if (model === 'codex')
    return 'bg-accent-500/20 text-accent-200 ring-accent-500/40'
  if (model === 'swarm')
    return 'bg-primary-300/70 text-primary-800 ring-primary-400/50'
  return 'bg-primary-300/70 text-primary-800 ring-primary-400/50'
}

function getStatusRingClassName(status: AgentNodeStatus): string {
  if (status === 'failed') return 'ring-red-500/70'
  if (status === 'thinking') return 'ring-accent-500/70'
  if (status === 'complete') return 'ring-emerald-500/70'
  if (status === 'queued') return 'ring-primary-500/70'
  return 'ring-emerald-500/70'
}

function getStatusTextClassName(status: AgentNodeStatus): string {
  if (status === 'failed') return 'text-red-300'
  if (status === 'thinking') return 'text-accent-300'
  if (status === 'complete') return 'text-emerald-300'
  if (status === 'queued') return 'text-primary-700'
  return 'text-emerald-300'
}

function getStatusLabel(status: AgentNodeStatus): string {
  if (status === 'failed') return 'failed'
  if (status === 'thinking') return 'thinking'
  if (status === 'complete') return 'complete'
  if (status === 'queued') return 'queued'
  return 'running'
}

function shouldPulse(status: AgentNodeStatus): boolean {
  return status === 'running' || status === 'thinking'
}

/**
 * Extract persona name from agent name format "emoji Name — Role".
 * Returns the name portion or the full string if format doesn't match.
 */
function extractPersonaName(agentName: string): string {
  // Remove leading emoji (if any) and extract name before " — "
  const withoutEmoji = agentName.replace(/^[\p{Emoji}\s]+/u, '').trim()
  const dashIndex = withoutEmoji.indexOf(' — ')
  if (dashIndex > 0) {
    return withoutEmoji.slice(0, dashIndex)
  }
  return withoutEmoji || agentName
}

/**
 * Get persona colors for an agent based on its name.
 * Falls back to default blue/cyan if persona not found.
 */
function getPersonaColors(
  agentName: string,
  agentId: string,
): { body: string; accent: string } {
  const personaName = extractPersonaName(agentName)
  // Try direct match from PERSONA_COLORS
  const directMatch = PERSONA_COLORS[personaName] as
    | { body: string; accent: string }
    | undefined
  if (directMatch) {
    return { body: directMatch.body, accent: directMatch.accent }
  }
  // Fallback: use assignPersona to get colors based on id
  const persona = assignPersona(agentId, agentName)
  const personaMatch = PERSONA_COLORS[persona.name] as
    | { body: string; accent: string }
    | undefined
  if (personaMatch) {
    return { body: personaMatch.body, accent: personaMatch.accent }
  }
  // Default fallback
  return { body: '#3b82f6', accent: '#93c5fd' }
}

export function AgentCard({
  node,
  layoutId,
  cardRef,
  viewMode = 'expanded',
  onView,
  onChat,
  onKill,
  onCancel,
  className,
  useInlineDetail = true,
}: AgentCardProps) {
  const showActions = !node.isMain
  const isCompact = viewMode === 'compact'
  const isQueued = node.status === 'queued'
  const sessionKey = (node.sessionKey || node.id || '').trim()
  const canWardenControl = showActions && !isQueued && sessionKey.length > 0
  const [showDetail, setShowDetail] = useState(false)
  const [steerOpen, setSteerOpen] = useState(false)
  const [killConfirmOpen, setKillConfirmOpen] = useState(false)
  const [isPausePending, setIsPausePending] = useState(false)
  const [pausedOverride, setPausedOverride] = useState<boolean | null>(null)
  const isPaused = pausedOverride ?? false

  useEffect(() => {
    setSteerOpen(false)
    setKillConfirmOpen(false)
    setPausedOverride(null)
    setIsPausePending(false)
  }, [node.id])

  function handleViewClick() {
    if (useInlineDetail) {
      setShowDetail(true)
    } else {
      onView?.(node.id)
    }
  }

  function handleKillComplete() {
    onKill?.(node.id)
    setShowDetail(false)
  }

  async function handleTogglePause() {
    if (!canWardenControl || isPausePending) return
    const nextPaused = !isPaused

    setIsPausePending(true)
    try {
      const payload = await toggleAgentPause(sessionKey, nextPaused)
      const paused =
        typeof payload.paused === 'boolean' ? payload.paused : nextPaused
      setPausedOverride(paused)
      toast(`${node.name} ${paused ? 'paused' : 'resumed'}`, {
        type: 'success',
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to ${nextPaused ? 'pause' : 'resume'} agent`
      toast(message, { type: 'error' })
    } finally {
      setIsPausePending(false)
    }
  }

  function renderWardenMenu(triggerClassName: string) {
    if (!canWardenControl) return null

    return (
      <MenuRoot>
        <MenuTrigger
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-md text-primary-700 hover:bg-primary-200 hover:text-primary-900',
            'aria-expanded:bg-primary-200',
            triggerClassName,
          )}
          aria-label={`${node.name} controls`}
          title="Agent controls"
        >
          <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={1.5} />
        </MenuTrigger>
        <MenuContent side="bottom" align="end" className="min-w-[150px]">
          <MenuItem
            onClick={function onClickSteer() {
              setSteerOpen(true)
            }}
            disabled={!canWardenControl}
            className="data-disabled:pointer-events-none data-disabled:opacity-50"
          >
            <HugeiconsIcon icon={AiChat01Icon} size={16} strokeWidth={1.5} />
            Steer
          </MenuItem>
          <MenuItem
            onClick={function onClickPauseToggle() {
              void handleTogglePause()
            }}
            disabled={isPausePending}
            className="data-disabled:pointer-events-none data-disabled:opacity-50"
          >
            <HugeiconsIcon
              icon={isPaused ? PlayIcon : PauseIcon}
              size={16}
              strokeWidth={1.5}
            />
            {isPausePending
              ? isPaused
                ? 'Resuming...'
                : 'Pausing...'
              : isPaused
                ? 'Resume'
                : 'Pause'}
          </MenuItem>
          <MenuItem
            onClick={function onClickKill() {
              setKillConfirmOpen(true)
            }}
            className="text-red-700 hover:bg-red-50/80 data-highlighted:bg-red-50/80"
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
            Kill
          </MenuItem>
        </MenuContent>
      </MenuRoot>
    )
  }

  const wardenDialogs = canWardenControl ? (
    <>
      <SteerModal
        open={steerOpen}
        onOpenChange={setSteerOpen}
        agentName={node.name}
        sessionKey={sessionKey}
      />
      <KillConfirmDialog
        open={killConfirmOpen}
        onOpenChange={setKillConfirmOpen}
        agentName={node.name}
        sessionKey={sessionKey}
        onKilled={handleKillComplete}
      />
    </>
  ) : null

  const compactModelLabel =
    node.model.length > 20 ? `${node.model.slice(0, 19)}…` : node.model

  // Detail panel view
  if (showDetail) {
    return (
      <motion.article
        ref={cardRef}
        layout
        layoutId={layoutId}
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 1 }}
        className={cn(
          'group relative overflow-visible rounded-3xl border border-primary-300/80 bg-primary-100/70 shadow-md backdrop-blur-sm',
          'w-full p-3',
          isCompact ? 'col-span-2' : '',
          className,
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2"
            onClick={() => setShowDetail(false)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.5} />
            Back
          </Button>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-medium text-primary-900" title={node.name}>
              {node.name}
            </h4>
            <p className="mt-0.5 text-[11px] font-mono text-primary-700">
              {node.model}
            </p>
          </div>
          <span className="inline-flex size-2 shrink-0 rounded-full bg-emerald-500" />
          {renderWardenMenu('size-7 rounded-full')}
        </div>

        {/* Status + model row */}
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary-300/60 bg-primary-200/30 p-2.5">
          <span
            className={cn(
              'inline-flex size-2 shrink-0 rounded-full',
              node.status === 'failed' ? 'bg-red-400' :
              node.status === 'thinking' ? 'bg-accent-400 animate-pulse' :
              node.status === 'complete' ? 'bg-emerald-400' :
              node.status === 'queued' ? 'bg-primary-500' :
              'bg-emerald-400 animate-pulse',
            )}
          />
          <span className={cn('text-[11px] font-medium capitalize', getStatusTextClassName(node.status))}>
            {getStatusLabel(node.status)}
          </span>
          <span className="ml-auto font-mono text-[10px] text-primary-600 truncate max-w-[120px]">
            {node.model.split('/').pop()}
          </span>
        </div>

        {/* Last output / task preview */}
        <div className="mb-3 rounded-xl border border-primary-300/60 bg-primary-200/30 p-2.5">
          <p className="mb-1 text-[10px] font-medium text-primary-600">Last message</p>
          <p className="text-[11px] leading-relaxed text-primary-800">
            {node.task.length > 80 ? `${node.task.slice(0, 80)}…` : node.task}
          </p>
        </div>

        {/* Compact stats */}
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-primary-300/60 bg-primary-200/30 px-2.5 py-2 text-[10px] tabular-nums text-primary-600">
          <span>{formatRuntime(node.runtimeSeconds)}</span>
          <span className="text-primary-300">·</span>
          <span>{node.tokenCount.toLocaleString()} tok</span>
          <span className="text-primary-300">·</span>
          <span>${node.cost.toFixed(2)}</span>
        </div>

        {/* Actions */}
        {showActions ? (
          <div className="flex items-center gap-2">
            {onChat ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 flex-1 justify-center"
                onClick={() => onChat(node.id)}
              >
                <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.5} />
                View Output
              </Button>
            ) : null}
            {(node.status === 'running' || node.status === 'thinking') && onKill ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                onClick={() => setKillConfirmOpen(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.5} />
                Kill
              </Button>
            ) : null}
            {node.status === 'queued' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-center"
                onClick={() => onCancel?.(node.id)}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null}
        {wardenDialogs}
      </motion.article>
    )
  }

  return (
    <motion.article
      ref={cardRef}
      layout
      layoutId={layoutId}
      initial={false}
      animate={
        node.status === 'failed' ? { x: [0, -3, 3, -3, 3, 0] } : { x: 0 }
      }
      transition={{
        layout: { type: 'spring', stiffness: 300, damping: 28 },
        x: { duration: 0.3, ease: 'easeOut' },
      }}
      className={cn(
        'group relative rounded-3xl border border-primary-300/80 bg-primary-100/70 shadow-md backdrop-blur-sm',
        isCompact
          ? 'w-full min-w-0 overflow-visible rounded-xl p-2'
          : 'w-full overflow-hidden p-2.5',
        node.status === 'complete' ? 'opacity-50' : 'opacity-100',
        node.status === 'failed' ? 'shadow-red-600/35' : '',
        className,
      )}
    >
      {/* Compact mode: horizontal layout */}
      {isCompact ? (
        <>
          <div className="flex items-start gap-2.5 overflow-visible">
            <div className="relative mt-0.5 size-10 shrink-0 cursor-default">
              <AgentProgress
                value={node.progress}
                status={node.status}
                size={40}
                strokeWidth={2.5}
                className="absolute inset-0"
              />
              <div className="absolute inset-1 inline-flex items-center justify-center rounded-full border border-primary-300/70 bg-primary-200/80">
                {node.isMain ? (
                  <AgentAvatar size="sm" />
                ) : (
                  <PixelAvatar
                    color={getPersonaColors(node.name, node.id).body}
                    accentColor={getPersonaColors(node.name, node.id).accent}
                    size={26}
                    status={node.status === 'queued' ? 'idle' : node.status}
                  />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-primary-900" title={node.name}>
                  {node.name}
                </h4>
                {renderWardenMenu('size-6 shrink-0 rounded-md')}
              </div>

              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    'inline-flex size-1.5 shrink-0 rounded-full',
                    node.status === 'failed'
                      ? 'bg-red-400'
                      : node.status === 'thinking'
                        ? 'bg-accent-400'
                        : node.status === 'queued'
                          ? 'bg-primary-500'
                          : 'bg-emerald-400',
                  )}
                />
                <span className={cn('truncate font-medium', getStatusTextClassName(node.status))}>
                  {getStatusLabel(node.status)}
                </span>
              </div>

              <p
                className="mt-0.5 max-w-[20ch] truncate text-[10px] font-mono leading-none text-primary-600"
                title={node.model}
              >
                {compactModelLabel}
              </p>

              <p className="mt-1 truncate text-[11px] text-primary-700">{node.task}</p>
              <p className="mt-0.5 truncate text-[10px] tabular-nums text-primary-600">
                {formatRuntime(node.runtimeSeconds)} · {node.tokenCount.toLocaleString()} tokens · ${node.cost.toFixed(2)}
              </p>

              {showActions ? (
                <div className="mt-2 flex items-center gap-1.5">
                  {onChat ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 min-w-0 flex-1 justify-center px-2 text-[11px]"
                      onClick={function handleChatClick() {
                        onChat(node.id)
                      }}
                    >
                      <HugeiconsIcon icon={AiChat01Icon} size={13} strokeWidth={1.5} />
                      Chat
                    </Button>
                  ) : null}
                  {onView || useInlineDetail ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 min-w-0 flex-1 justify-center px-2 text-[11px]"
                      onClick={handleViewClick}
                    >
                      <HugeiconsIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                      View
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        /* Expanded mode: horizontal layout for non-main agents */
        <div className="flex items-start gap-2.5">
          {/* Left: Progress ring + avatar with tooltip */}
          <TooltipRoot>
            <TooltipTrigger className="relative flex-shrink-0 size-14 cursor-default">
              <AgentProgress
                value={node.progress}
                status={node.status}
                size={56}
                strokeWidth={3}
                className="absolute inset-0"
              />
              {shouldPulse(node.status) ? (
                <motion.span
                  aria-hidden
                  animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.08, 0.3] }}
                  transition={{
                    duration: 1.3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className={cn(
                    'absolute inset-0 rounded-full ring-2',
                    getStatusRingClassName(node.status),
                  )}
                />
              ) : null}
              <div className="absolute inset-1.5 inline-flex items-center justify-center rounded-full border border-primary-300/70 bg-primary-200/80">
                {node.isMain ? (
                  <AgentAvatar size="md" />
                ) : (
                  <PixelAvatar
                    color={getPersonaColors(node.name, node.id).body}
                    accentColor={getPersonaColors(node.name, node.id).accent}
                    size={28}
                    status={node.status === 'queued' ? 'idle' : node.status}
                  />
                )}
              </div>
              <AnimatePresence>
                {node.status === 'complete' ? (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute -right-0.5 -bottom-0.5 inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-primary-50"
                  >
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={14}
                      strokeWidth={1.5}
                    />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <span className="font-medium tabular-nums">{node.progress}%</span>{' '}
              complete
            </TooltipContent>
          </TooltipRoot>

          {/* Right: Text content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="truncate font-medium text-primary-900 text-xs" title={node.name}>
                {node.name}
              </h4>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-medium tabular-nums ring-1 text-[8px]',
                  getModelBadgeClassName(node.model),
                )}
              >
                {node.model}
              </span>
              {renderWardenMenu('ml-auto size-6 shrink-0 rounded-md')}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {node.isLive ? (
                <motion.span
                  aria-hidden
                  animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="size-1.5 rounded-full bg-emerald-400"
                />
              ) : null}
              <span
                className={cn(
                  'font-medium tabular-nums text-[10px]',
                  getStatusTextClassName(node.status),
                )}
              >
                {getStatusLabel(node.status)}
              </span>
            </div>
          </div>
        </div>
      )}

      {!isCompact ? (
        <div className="mt-2 max-h-0 overflow-hidden text-primary-700 tabular-nums opacity-0 transition-all duration-200 group-hover:max-h-48 group-hover:opacity-100">
          <p className="line-clamp-2 text-pretty text-[11px] text-primary-700">{node.task}</p>
          <p className="mt-0.5 truncate text-[10px] tabular-nums text-primary-600">
            {formatRuntime(node.runtimeSeconds)} · {node.tokenCount.toLocaleString()} tokens · {formatCost(node.cost)}
          </p>

          {showActions ? (
            <div className="mt-2">
              <div className="flex items-center gap-1.5">
                {onChat ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 flex-1 justify-center text-xs"
                    onClick={function handleChatClick() {
                      onChat(node.id)
                    }}
                  >
                    <HugeiconsIcon icon={AiChat01Icon} size={14} strokeWidth={1.5} />
                    Chat
                  </Button>
                ) : null}
                {onView || useInlineDetail ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 justify-center text-xs"
                    onClick={handleViewClick}
                  >
                    <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                    View
                  </Button>
                ) : null}
                {node.status === 'queued' ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 rounded-full"
                    onClick={function handleCancelClick() {
                      onCancel?.(node.id)
                    }}
                    title="Cancel"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {wardenDialogs}
    </motion.article>
  )
}
