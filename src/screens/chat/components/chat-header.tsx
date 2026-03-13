import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder01Icon,
  EyeIcon,
  Search01Icon,
  ViewOffIcon,
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
import { CHAT_OPEN_MESSAGE_SEARCH_EVENT } from '@/screens/chat/chat-events'
import { cn } from '@/lib/utils'

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
  void _agentModel; void agentConnected; void statusMode; void activeToolName // kept for prop compat
  const showThinkingIndicator = thinkingLevel === 'adaptive'
  const focusModeLabel = isFocusMode ? 'Exit focus mode' : 'Enter focus mode'

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
    window.dispatchEvent(new CustomEvent('clawsuite:chat-agent-details'))
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
              <OpenClawStudioIcon className="size-8 rounded-xl overflow-hidden" />
            </button>
            <div className="min-w-0 max-w-[45vw] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold tracking-tight text-ink">
              {mobileTitle}
            </div>
          </div>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleFocusMode}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-primary-700 transition-transform active:scale-95"
              aria-label={focusModeLabel}
              title={focusModeLabel}
            >
              <HugeiconsIcon
                icon={isFocusMode ? ViewOffIcon : EyeIcon}
                size={20}
                strokeWidth={1.6}
              />
            </button>
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
          <div className="flex max-w-full items-center gap-1.5">
            {/* Session name — click to open session switcher */}
            <button
              type="button"
              onClick={onOpenSessions}
              className="min-w-0 truncate text-sm font-medium text-balance hover:text-accent-600 transition-colors rounded-sm text-left"
              aria-label="Switch session"
              title="Click to switch session"
            >
              {activeTitle}
            </button>
            {/* Pencil — click to rename */}
            {canRenameTitle && !renamingTitle && (
              <button
                type="button"
                onClick={startTitleEdit}
                className="shrink-0 text-xs text-primary-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary-600"
                aria-label="Rename session"
                title="Rename session"
              >
                ✏️
              </button>
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
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger
            onClick={() => {
              window.dispatchEvent(new Event(CHAT_OPEN_MESSAGE_SEARCH_EVENT))
            }}
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="mr-2 text-primary-800 hover:bg-primary-100 dark:hover:bg-primary-800"
                aria-label="Search messages"
                title="Search messages"
              >
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={18}
                  strokeWidth={1.5}
                />
              </Button>
            }
          />
          <TooltipContent side="bottom">Search messages</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
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

      </div>
    </div>
  )
}

const MemoizedChatHeader = memo(ChatHeaderComponent)

export { MemoizedChatHeader as ChatHeader }
