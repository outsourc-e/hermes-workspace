import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon } from '@hugeicons/core-free-icons'
import { buildSessionTree } from '../session-lineage'
import { projectSessionCards } from '../session-cards'
import type { SessionCard, SessionMeta } from '../types'
import { Button } from '@/components/ui/button'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { openHamburgerMenu } from '@/components/mobile-hamburger-menu'

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
  const parts = title
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)
  if (
    parts.length >= 2 &&
    parts[0]?.toLowerCase() === 'agent' &&
    (parts[1]?.length ?? 0) > 0
  ) {
    const candidate = parts.at(-1)
    if (!candidate) return 'New Chat'
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

function getSessionTitle(session: SessionMeta): string {
  const candidates = [
    session.label,
    session.derivedTitle,
    session.title,
    session.friendlyId,
  ]
  for (const candidate of candidates) {
    const title = candidate?.trim()
    if (title) return title
  }
  return 'Session'
}

function sessionForCardKey(
  sessions: Array<SessionMeta>,
  key: string,
): SessionMeta | undefined {
  return sessions.find(
    (session) =>
      session.key === key ||
      session.backendKey === key ||
      session.friendlyId === key,
  )
}

function cardOwnsSessionKey(card: SessionCard, sessionKey: string): boolean {
  return (
    card.cardId === sessionKey ||
    card.canonicalSegmentKey === sessionKey ||
    card.continuationSegmentKeys.includes(sessionKey)
  )
}

type ActiveLineageContextProps = {
  parentSession?: SessionMeta
  continuationCount: number
  onOpenParent?: () => void
  backToParent?: boolean
}

function ActiveLineageContext({
  parentSession,
  continuationCount,
  onOpenParent,
  backToParent = false,
}: ActiveLineageContextProps) {
  const segmentStatus =
    continuationCount > 1 ? (
      <span
        className="shrink-0 whitespace-nowrap text-[10px] font-medium text-primary-500"
        aria-label={`Logical conversation with ${continuationCount} segments`}
      >
        {continuationCount} segments
      </span>
    ) : null

  if (!parentSession) return segmentStatus

  const parentTitle = getSessionTitle(parentSession)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-primary-500">
      <Link
        to="/chat/$sessionKey"
        params={{ sessionKey: parentSession.friendlyId }}
        onClick={onOpenParent}
        aria-label={
          backToParent
            ? 'Back to parent conversation'
            : `Open parent session ${parentTitle}`
        }
        className="min-w-0 truncate rounded-sm underline decoration-primary-300 underline-offset-2 hover:text-accent-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        title={`Parent: ${parentTitle}`}
      >
        {backToParent
          ? 'Back to parent conversation'
          : `Parent: ${parentTitle}`}
      </Link>
      {segmentStatus}
    </span>
  )
}

type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'adaptive'

type ChatHeaderProps = {
  activeTitle: string
  onRenameTitle?: (nextTitle: string) => Promise<void> | void
  renamingTitle?: boolean
  wrapperRef?: React.Ref<HTMLDivElement>
  onOpenSessions?: () => void
  sessions?: Array<SessionMeta>
  /** Server-backed Cards take precedence. Legacy sessions remain a safe fallback. */
  sessionCards?: Array<SessionCard>
  activeFriendlyId?: string
  inspectedChildCardId?: string
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
  onUndo?: () => void
  onClear?: () => void
}

function ChatHeaderComponent({
  activeTitle,
  onRenameTitle,
  renamingTitle = false,
  wrapperRef,
  onOpenSessions,
  sessions = [],
  sessionCards,
  activeFriendlyId = '',
  inspectedChildCardId,
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
  onUndo,
  onClear,
}: ChatHeaderProps) {
  const [clearConfirm, setClearConfirm] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const sessionPopoverRef = useRef<HTMLDivElement | null>(null)
  const closeSessionPopover = useCallback(() => {
    setSessionPopoverOpen(false)
    setSessionSearch('')
  }, [])
  const activeSessionKey = useMemo(
    () =>
      sessions.find(
        (session) =>
          session.friendlyId === activeFriendlyId ||
          session.key === activeFriendlyId,
      )?.key ?? activeFriendlyId,
    [activeFriendlyId, sessions],
  )
  const sessionTree = useMemo(
    () => buildSessionTree(sessions, { activeSessionKey }),
    [activeSessionKey, sessions],
  )
  const legacyCardProjection = useMemo(
    () => projectSessionCards(sessions, { activeSessionKey }),
    [activeSessionKey, sessions],
  )
  const activeTreeKey = activeSessionKey
    ? (sessionTree.visibleKeyBySessionKey.get(activeSessionKey) ??
      activeSessionKey)
    : undefined
  const activeTreeRow = activeTreeKey
    ? sessionTree.indexByKey.get(activeTreeKey)
    : undefined
  const parentSession =
    activeTreeRow?.parentKey &&
    (activeTreeRow.relationshipKind === 'branch' ||
      activeTreeRow.relationshipKind === 'child')
      ? sessionTree.indexByKey.get(activeTreeRow.parentKey)?.session
      : undefined
  const continuationCount = activeTreeRow?.continuationCount ?? 1
  const availableCards = sessionCards ?? legacyCardProjection.roots
  const cardContext = useMemo(() => {
    if (!activeSessionKey) return undefined
    for (const card of availableCards) {
      const inspectedChild = card.childNodes.find(
        (child) =>
          child.cardId === inspectedChildCardId ||
          (!inspectedChildCardId &&
            (child.cardId === activeSessionKey ||
              child.sessionKey === activeSessionKey)),
      )
      if (inspectedChild) return { card, inspectedChild }
      if (cardOwnsSessionKey(card, activeSessionKey)) {
        return { card, inspectedChild: undefined }
      }
    }
    return undefined
  }, [activeSessionKey, availableCards, inspectedChildCardId])
  const legacyCardSession = cardContext
    ? sessionForCardKey(sessions, cardContext.card.canonicalSegmentKey)
    : undefined
  const displayedTitle = cardContext
    ? sessionCards
      ? cardContext.card.title
      : legacyCardSession
        ? getSessionTitle(legacyCardSession)
        : activeTitle
    : activeTitle
  const displayedContinuationCount =
    cardContext?.card.continuationCount ?? continuationCount
  const displayedParentSession = cardContext?.inspectedChild
    ? (sessionForCardKey(sessions, cardContext.card.canonicalSegmentKey) ?? {
        key: cardContext.card.canonicalSegmentKey,
        friendlyId: cardContext.card.canonicalSegmentKey,
      })
    : parentSession
  const switcherSessions = useMemo(() => {
    return availableCards.map((card) => {
      const session = sessionForCardKey(sessions, card.canonicalSegmentKey)
      const cardTitle = sessionCards
        ? card.title
        : getSessionTitle(
            session ?? {
              key: card.canonicalSegmentKey,
              friendlyId: card.canonicalSegmentKey,
            },
          )
      return {
        ...(session ?? {
          key: card.canonicalSegmentKey,
          friendlyId: card.canonicalSegmentKey,
        }),
        label: cardTitle,
        title: undefined,
        derivedTitle: undefined,
      }
    })
  }, [availableCards, sessionCards, sessions])

  useEffect(() => {
    if (!sessionPopoverOpen) return
    const handler = (e: MouseEvent) => {
      if (sessionPopoverRef.current?.contains(e.target as Node)) return
      closeSessionPopover()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [closeSessionPopover, sessionPopoverOpen])
  const [titleDraft, setTitleDraft] = useState(displayedTitle)
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
  const mobileTitle = formatMobileSessionTitle(displayedTitle)
  void _agentModel
  void agentConnected
  void statusMode
  void activeToolName
  void isFocusMode
  void onToggleFocusMode // kept for prop compat
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
    window.dispatchEvent(new CustomEvent('claude:chat-agent-details'))
  }, [onOpenAgentDetails])

  useEffect(() => {
    if (isEditingTitle) return
    setTitleDraft(displayedTitle)
  }, [displayedTitle, isEditingTitle])

  useEffect(() => {
    if (!isEditingTitle) return
    const id = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(id)
  }, [isEditingTitle])

  const canRenameTitle = Boolean(
    onRenameTitle && !isMobile && !cardContext?.inspectedChild,
  )

  const startTitleEdit = useCallback(() => {
    if (!canRenameTitle || renamingTitle) return
    setTitleDraft(displayedTitle)
    setIsEditingTitle(true)
  }, [canRenameTitle, displayedTitle, renamingTitle])

  const cancelTitleEdit = useCallback(() => {
    setTitleDraft(displayedTitle)
    setIsEditingTitle(false)
  }, [displayedTitle])

  const saveTitleEdit = useCallback(async () => {
    if (!onRenameTitle || isSavingTitleRef.current) return

    const trimmed = titleDraft.trim()
    if (!trimmed) {
      cancelTitleEdit()
      return
    }

    if (trimmed === displayedTitle.trim()) {
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
  }, [cancelTitleEdit, displayedTitle, onRenameTitle, titleDraft])

  if (isMobile) {
    return (
      <div
        ref={wrapperRef}
        className="shrink-0 bg-surface transition-transform"
        style={
          pullOffset > 0
            ? { transform: `translateY(${pullOffset}px)` }
            : undefined
        }
      >
        <div className="px-3 h-12 flex items-center gap-0">
          {/* Hamburger lines — ChatGPT style, large tap target */}
          <button
            type="button"
            onClick={openHamburgerMenu}
            className="shrink-0 flex items-center justify-center w-11 h-11 -ml-1 rounded-xl active:bg-white/10 transition-colors z-10"
            aria-label="Open navigation menu"
          >
            <svg
              width="20"
              height="16"
              viewBox="0 0 20 16"
              fill="none"
              className="text-ink opacity-70"
            >
              <path
                d="M1 1.5H19M1 8H19M1 14.5H13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Session name and compact lineage context */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSessions}
              className="flex min-w-0 max-w-[55vw] items-center gap-1 rounded-full bg-primary-100/70 px-3 py-1.5 transition-colors hover:bg-primary-200/80 dark:bg-neutral-700/80 dark:hover:bg-neutral-600/80"
              aria-label="Switch session"
            >
              <span className="truncate text-[13px] font-medium text-primary-600 dark:text-primary-300">
                {mobileTitle === 'new' ? 'New Chat' : mobileTitle}
              </span>
              <svg
                width="8"
                height="5"
                viewBox="0 0 8 5"
                fill="none"
                className="shrink-0 opacity-40"
              >
                <path
                  d="M1 1L4 4L7 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <ActiveLineageContext
              parentSession={displayedParentSession}
              continuationCount={displayedContinuationCount}
              backToParent={Boolean(cardContext?.inspectedChild)}
            />
          </div>

          <div className="flex-1" />
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="shrink-0 bg-surface">
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
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
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
            <div
              className="relative flex items-center gap-1"
              ref={sessionPopoverRef}
            >
              <button
                type="button"
                onClick={() => setSessionPopoverOpen((p) => !p)}
                className="min-w-0 truncate text-sm font-medium text-balance hover:text-accent-600 transition-colors rounded-sm text-left"
                title="Click to switch session"
              >
                {displayedTitle}
              </button>
              {canRenameTitle && !renamingTitle && (
                <button
                  type="button"
                  onClick={startTitleEdit}
                  className="text-xs text-primary-400 opacity-0 group-hover:opacity-100 hover:text-primary-600 transition-opacity shrink-0"
                  title="Rename session"
                >
                  ✏️
                </button>
              )}
              <ActiveLineageContext
                parentSession={displayedParentSession}
                continuationCount={displayedContinuationCount}
                onOpenParent={closeSessionPopover}
                backToParent={Boolean(cardContext?.inspectedChild)}
              />
              {sessionPopoverOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-80 overflow-hidden rounded-xl border border-[var(--theme-border)] shadow-2xl">
                  <div
                    className="border-b px-3 py-2"
                    style={{
                      background: 'var(--theme-card)',
                      borderColor: 'var(--theme-border)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="shrink-0 text-[var(--theme-muted)]"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search sessions..."
                        value={sessionSearch}
                        onChange={(e) => setSessionSearch(e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none"
                        style={{ color: 'var(--theme-text)' }}
                      />
                    </div>
                  </div>
                  <div
                    className="max-h-60 overflow-y-auto p-1"
                    style={{
                      background: 'var(--theme-card)',
                      boxShadow: '0 18px 48px rgba(0,0,0,0.38)',
                      opacity: 1,
                    }}
                  >
                    {switcherSessions
                      .filter((s) => {
                        if (!sessionSearch.trim()) return true
                        const q = sessionSearch.toLowerCase()
                        return (
                          getSessionTitle(s).toLowerCase().includes(q) ||
                          s.friendlyId.toLowerCase().includes(q)
                        )
                      })
                      .slice(0, 20)
                      .map((s) => {
                        const label = getSessionTitle(s)
                        const isActive =
                          Boolean(activeFriendlyId) &&
                          (s.friendlyId === activeFriendlyId ||
                            s.key.endsWith(`:${activeFriendlyId}`))
                        return (
                          <button
                            key={s.key || s.friendlyId}
                            type="button"
                            onClick={() => {
                              closeSessionPopover()
                              onSelectSession?.(s.key || s.friendlyId || '')
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                              'border-b border-[var(--theme-border)] last:border-0 hover:bg-[var(--theme-card2)]',
                              isActive && 'bg-[var(--theme-card2)] font-medium',
                            )}
                          >
                            <span
                              className="flex-1 min-w-0 truncate"
                              style={{ color: 'var(--theme-text)' }}
                            >
                              {label}
                            </span>
                            {isActive && (
                              <span className="size-1.5 rounded-full bg-accent-500 shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    {switcherSessions.length === 0 && (
                      <p className="px-3 py-4 text-sm text-neutral-400">
                        No sessions
                      </p>
                    )}
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
                Thinking: Adaptive — Hermes reasons before responding
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
                      onRefresh
                        ? 'cursor-pointer hover:opacity-70'
                        : 'cursor-default',
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
        {/* Undo / Clear actions */}
        {onUndo && (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                onClick={onUndo}
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800"
                    aria-label="Undo last message"
                  >
                    <span className="text-sm">↩️</span>
                  </Button>
                }
              />
              <TooltipContent side="bottom">Undo last message</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        )}
        {onClear && (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                onClick={() => {
                  if (clearConfirm) {
                    onClear()
                    setClearConfirm(false)
                  } else {
                    setClearConfirm(true)
                    setTimeout(() => setClearConfirm(false), 3000)
                  }
                }}
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className={cn(
                      'hover:bg-primary-100 dark:hover:bg-primary-800',
                      clearConfirm ? 'text-red-500' : 'text-primary-500',
                    )}
                    aria-label={
                      clearConfirm ? 'Confirm clear' : 'Clear session'
                    }
                  >
                    <span className="text-sm">
                      {clearConfirm ? '⚠️' : '🗑️'}
                    </span>
                  </Button>
                }
              />
              <TooltipContent side="bottom">
                {clearConfirm ? 'Click again to confirm' : 'Clear session'}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

const MemoizedChatHeader = memo(ChatHeaderComponent)

export { MemoizedChatHeader as ChatHeader }
