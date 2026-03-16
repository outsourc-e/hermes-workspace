import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder01Icon,
} from '@hugeicons/core-free-icons'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { OrchestratorAvatar } from '@/components/orchestrator-avatar'
import { Button } from '@/components/ui/button'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { InspectorToggleButton } from '@/components/inspector/inspector-panel'

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatMobileSessionTitle(rawTitle: string): string {
  const title = rawTitle.trim()
  if (!title) return 'New Chat'

  const normalized = title.toLowerCase()

  // Agent session patterns
  if (normalized === 'agent:main:main' || normalized === 'agent:main') {
    return 'Main Chat'
  }
  const parts = title.split(':').map((part) => part.trim()).filter(Boolean)
  if (
    parts.length >= 2 &&
    parts[0].toLowerCase() === 'agent' &&
    parts[1].length > 0
  ) {
    const candidate = parts[parts.length - 1]
    if (candidate.toLowerCase() === 'main') return 'Main Chat'
    return `${toTitleCase(candidate)} Chat`
  }

  // Common system prompts → friendly names
  if (normalized.startsWith('read heartbeat')) return 'Main Chat'
  if (normalized.startsWith('generate daily')) return 'Daily Brief'
  if (normalized.startsWith('morning check')) return 'Morning Check-in'

  // If it looks like a command/prompt (starts with a verb + long), summarize it
  const MAX_LEN = 20
  if (title.length > MAX_LEN) {
    // Extract first few meaningful words
    const words = title.split(/\s+/)
    let result = ''
    for (const word of words) {
      if ((result + ' ' + word).trim().length > MAX_LEN) break
      result = (result + ' ' + word).trim()
    }
    return result.length > 0 ? `${result}…` : `${title.slice(0, MAX_LEN)}…`
  }

  return title
}


type ThinkingLevel = 'off' | 'low' | 'adaptive'

type ChatHeaderProps = {
  activeTitle: string
  onRenameTitle?: (nextTitle: string) => Promise<void> | void
  renamingTitle?: boolean
  wrapperRef?: React.Ref<HTMLDivElement>
  onOpenSessions?: () => void
  sessions?: Array<{ key?: string; friendlyId?: string; label?: string; derivedTitle?: string; title?: string }>
  activeFriendlyId?: string
  onSelectSession?: (key: string) => void
  showFileExplorerButton?: boolean
  fileExplorerCollapsed?: boolean
  onToggleFileExplorer?: () => void
  /** Timestamp (ms) of last successful history fetch */
  dataUpdatedAt?: number
  /** Callback to manually refresh history */
  onRefresh?: () => void
  /** Current thinking level for this session */
  thinkingLevel?: ThinkingLevel
  /** Current model id/name for compact mobile status */
  agentModel?: string
  /** Whether agent connection is healthy */
  agentConnected?: boolean
  /** Open agent details panel on mobile status tap */
  onOpenAgentDetails?: () => void
  /** Pull-to-refresh offset in px — header slides down */
  pullOffset?: number
  statusMode?: 'idle' | 'sending' | 'streaming' | 'tool'
  activeToolName?: string
  isFocusMode?: boolean
  onToggleFocusMode?: () => void
}

function ChatHeaderComponent({
  activeTitle,
  onRenameTitle,
  renamingTitle = false,
  wrapperRef,
  onOpenSessions,
  sessions = [],
  activeFriendlyId = '',
  onSelectSession,
  showFileExplorerButton = false,
  fileExplorerCollapsed = true,
  onToggleFileExplorer,
  dataUpdatedAt = 0,
  onRefresh,
  agentModel: _agentModel = '',
  agentConnected = true,
  onOpenAgentDetails,
  pullOffset = 0,
  statusMode = 'idle',
  activeToolName,
  thinkingLevel = 'low',
  isFocusMode = false,
  onToggleFocusMode,
}: ChatHeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const sessionPopoverRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sessionPopoverOpen) return
    const handler = (e: MouseEvent) => {
      if (sessionPopoverRef.current?.contains(e.target as Node)) return
      setSessionPopoverOpen(false); setSessionSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sessionPopoverOpen])
  const [titleDraft, setTitleDraft] = useState(activeTitle)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const isSavingTitleRef = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const isStale = dataUpdatedAt > 0 && Date.now() - dataUpdatedAt > 15000
  const mobileTitle = formatMobileSessionTitle(activeTitle)
  void _agentModel; void agentConnected; void statusMode; void activeToolName; void isFocusMode; void onToggleFocusMode // kept for prop compat
  const showThinkingIndicator = thinkingLevel === 'adaptive'

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return
    setIsRefreshing(true)
    onRefresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }, [onRefresh])

  const handleOpenAgentDetails = useCallback(() => {
    if (onOpenAgentDetails) {
      onOpenAgentDetails()
      return
    }
    window.dispatchEvent(new CustomEvent('hermes:chat-agent-details'))
  }, [onOpenAgentDetails])

  useEffect(() => {
    if (isEditingTitle) return
    setTitleDraft(activeTitle)
  }, [activeTitle, isEditingTitle])

  useEffect(() => {
    if (!isEditingTitle) return
    const id = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(id)
  }, [isEditingTitle])

  const canRenameTitle = Boolean(onRenameTitle && !isMobile)

  const startTitleEdit = useCallback(() => {
    if (!canRenameTitle || renamingTitle) return
    setTitleDraft(activeTitle)
    setIsEditingTitle(true)
  }, [activeTitle, canRenameTitle, renamingTitle])

  const cancelTitleEdit = useCallback(() => {
    setTitleDraft(activeTitle)
    setIsEditingTitle(false)
  }, [activeTitle])

  const saveTitleEdit = useCallback(async () => {
    if (!onRenameTitle || isSavingTitleRef.current) return

    const trimmed = titleDraft.trim()
    if (!trimmed) {
      cancelTitleEdit()
      return
    }

    if (trimmed === activeTitle.trim()) {
      setIsEditingTitle(false)
      return
    }

    isSavingTitleRef.current = true
    try {
      await onRenameTitle(trimmed)
      setIsEditingTitle(false)
    } finally {
      isSavingTitleRef.current = false
    }
  }, [activeTitle, cancelTitleEdit, onRenameTitle, titleDraft])

  if (isMobile) {
    return (
      <div
        ref={wrapperRef}
        className="shrink-0 border-b border-primary-200 bg-surface transition-transform"
        style={pullOffset > 0 ? { transform: `translateY(${pullOffset}px)` } : undefined}
      >
        <div className="px-4 h-12 flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSessions}
              className="shrink-0 min-h-11 min-w-11 rounded-lg transition-transform active:scale-95"
              aria-label="Open sessions"
            >
              <img src="/hermes-avatar.webp" alt="Hermes" className="size-8 rounded-xl" />
            </button>
            <div className="min-w-0 max-w-[45vw] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold tracking-tight text-ink">
              {mobileTitle}
            </div>
          </div>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleOpenAgentDetails}
              className="relative min-h-11 min-w-11 rounded-full transition-transform active:scale-90"
              aria-label="Open agent details"
            >
              <OrchestratorAvatar size={28} compact />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="shrink-0 border-b border-primary-200 bg-surface"
    >
      <div className="px-4 h-12 flex items-center">
        {showFileExplorerButton ? (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                onClick={onToggleFileExplorer}
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="mr-2 text-primary-800 hover:bg-primary-100 dark:hover:bg-primary-800"
                    aria-label={
                      fileExplorerCollapsed ? 'Show files' : 'Hide files'
                    }
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </Button>
                }
              />
              <TooltipContent side="bottom">
                {fileExplorerCollapsed ? 'Show files' : 'Hide files'}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        ) : null}
        <div className="group min-w-0 flex-1">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            disabled={renamingTitle}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              void saveTitleEdit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveTitleEdit()
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelTitleEdit()
              }
            }}
            className="h-7 w-full min-w-0 border-b border-transparent bg-transparent px-0 text-sm font-medium text-balance text-ink outline-none transition-colors focus:border-primary-300"
            aria-label="Session name"
          />
        ) : (
          <div className="relative flex items-center gap-1" ref={sessionPopoverRef}>
            <button type="button" onClick={() => setSessionPopoverOpen((p) => !p)}
              className="min-w-0 truncate text-sm font-medium text-balance hover:text-accent-600 transition-colors rounded-sm text-left"
              title="Click to switch session">
              {activeTitle}
            </button>
            {canRenameTitle && !renamingTitle && (
              <button type="button" onClick={startTitleEdit}
                className="text-xs text-primary-400 opacity-0 group-hover:opacity-100 hover:text-primary-600 transition-opacity shrink-0"
                title="Rename session">✏️</button>
            )}
            {sessionPopoverOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-80 rounded-xl border border-primary-200 bg-surface shadow-lg overflow-hidden">
                <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input autoFocus type="text" placeholder="Search sessions..." value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none text-neutral-700 placeholder-neutral-400 dark:text-neutral-200" />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {sessions.filter((s) => {
                    if (!sessionSearch.trim()) return true
                    const q = sessionSearch.toLowerCase()
                    return (s.label || s.derivedTitle || s.title || '').toLowerCase().includes(q) || s.friendlyId?.toLowerCase().includes(q)
                  }).slice(0, 20).map((s) => {
                    const label = s.label || s.derivedTitle || s.title || s.friendlyId?.slice(0, 8) || 'Session'
                    const isActive = Boolean(activeFriendlyId) && (s.friendlyId === activeFriendlyId || s.key?.endsWith(`:${activeFriendlyId}`))
                    return (
                      <button key={s.key || s.friendlyId} type="button"
                        onClick={() => { setSessionPopoverOpen(false); setSessionSearch(''); onSelectSession?.(s.key || s.friendlyId || '') }}
                        className={cn('flex w-full items-center gap-2 px-3 py-2 text-sm text-left border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors', isActive && 'bg-neutral-50 font-medium text-neutral-900')}>
                        <span className="flex-1 min-w-0 truncate text-neutral-700 dark:text-neutral-200">{label}</span>
                        {isActive && <span className="size-1.5 rounded-full bg-accent-500 shrink-0" />}
                      </button>
                    )
                  })}
                  {sessions.length === 0 && <p className="px-3 py-4 text-sm text-neutral-400">No sessions</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {renamingTitle ? (
        <span
          className="mr-1 inline-flex size-3 animate-spin rounded-full border border-primary-300 border-t-primary-700"
          aria-label="Saving session name"
        />
      ) : null}
      {showThinkingIndicator ? (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              render={
                <span
                  className="mr-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  aria-label="Thinking: Adaptive"
                  role="status"
                  style={{ boxShadow: '0 0 6px 1px rgba(251,191,36,0.4)' }}
                >
                  🧠
                </span>
              }
            />
            <TooltipContent side="bottom">
              Thinking: Adaptive — Claude reasons before responding
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      ) : null}
      {dataUpdatedAt > 0 ? (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                onClick={onRefresh ? handleRefresh : undefined}
                render={
                  <button
                    type="button"
                    aria-label={isStale ? 'Stale — click to sync' : 'Live'}
                    className={cn(
                      'mr-2 inline-flex items-center justify-center rounded-full transition-colors',
                      isRefreshing && 'animate-pulse',
                      onRefresh ? 'cursor-pointer hover:opacity-70' : 'cursor-default',
                    )}
                  >
                    <span
                      className={cn(
                        'block size-2 rounded-full transition-colors duration-500',
                        isStale ? 'bg-amber-400' : 'bg-emerald-500',
                      )}
                    />
                  </button>
                }
              />
              <TooltipContent side="bottom">
                {isStale ? 'Stale — click to sync' : 'Live'}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        ) : null}
        <InspectorToggleButton className="ml-2" />
      </div>
    </div>
  )
}

const MemoizedChatHeader = memo(ChatHeaderComponent)

export { MemoizedChatHeader as ChatHeader }
