import { useEffect, useId, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  Chat01Icon,
  Delete01Icon,
  GitForkIcon,
  MoreHorizontalIcon,
  Pen01Icon,
  PinIcon,
} from '@hugeicons/core-free-icons'
import type { SessionCard, SessionCardChild } from '@/screens/chat/types'
import { isWholeCardBranchAvailable } from '@/screens/chat/types'

import { cn } from '@/lib/utils'
import { useFeatureAvailable } from '@/hooks/use-feature-available'

type Props = {
  open: boolean
  onClose: () => void
  /** Authoritative, server-backed logical conversations. */
  sessionCards: Array<SessionCard>
  activeFriendlyId: string
  inspectedChildCardId?: string
  onSelectSession: (cardId: string, inspectChildCardId?: string) => void
  onNewChat: () => void
  onRenameCard: (cardId: string, nextTitle: string) => Promise<void> | void
  onTogglePin: (cardId: string) => Promise<void> | void
  onBranchCard: (cardId: string) => Promise<void> | void
  onArchiveCard: (cardId: string) => Promise<void> | void
  pendingCardIds?: ReadonlySet<string>
  hasMoreOlderSessions?: boolean
  loadingOlderSessions?: boolean
  olderSessionsError?: string | null
  onLoadOlderSessions?: () => void
}

function cardOwnsSessionKey(card: SessionCard, sessionKey: string): boolean {
  return (
    card.cardId === sessionKey ||
    card.canonicalSegmentKey === sessionKey ||
    card.continuationSegmentKeys.includes(sessionKey)
  )
}

function relationshipLabel(child: SessionCardChild): string {
  const kind =
    child.relationshipKind === 'branch' ? 'Branch' : 'Delegated session'
  const segments =
    child.continuationCount > 1 ? ` · ${child.continuationCount} segments` : ''
  return child.status === 'idle'
    ? `${kind}${segments}`
    : `${kind}${segments} · ${child.status}`
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatUpdatedAt(updatedAt?: number): string {
  if (typeof updatedAt !== 'number') return ''
  const value = new Date(updatedAt)
  const now = new Date()
  if (value.toDateString() === now.toDateString()) {
    return timeFormatter.format(value)
  }
  return dayFormatter.format(value)
}

function MobileCardActions({
  card,
  open,
  pending,
  canBranch,
  onToggle,
  onClose,
  onRenameCard,
  onTogglePin,
  onBranchCard,
  onArchiveCard,
}: {
  card: SessionCard
  open: boolean
  pending: boolean
  canBranch: boolean
  onToggle: () => void
  onClose: () => void
  onRenameCard: Props['onRenameCard']
  onTogglePin: Props['onTogglePin']
  onBranchCard: Props['onBranchCard']
  onArchiveCard: Props['onArchiveCard']
}) {
  const [mode, setMode] = useState<'actions' | 'rename' | 'archive'>('actions')
  const [renameDraft, setRenameDraft] = useState(card.title)

  const close = () => {
    setMode('actions')
    onClose()
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Card actions for ${card.title}`}
        aria-expanded={open}
        onClick={() => {
          setMode('actions')
          setRenameDraft(card.title)
          onToggle()
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
      </button>
      {open ? (
        <div
          className="mb-1 ml-3 basis-full rounded-lg border border-primary-200 bg-primary-50 p-2"
          data-card-actions={card.cardId}
        >
          {mode === 'rename' ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                const nextTitle = renameDraft.trim()
                if (!nextTitle || pending) return
                void onRenameCard(card.cardId, nextTitle)
                close()
              }}
            >
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                aria-label={`Rename ${card.title}`}
                autoFocus
                className="h-9 w-full rounded-md border border-primary-200 bg-surface px-2 text-sm text-ink outline-none focus:border-accent-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-2 py-1 text-xs text-primary-600"
                >
                  Cancel rename
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-accent-500 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Save rename
                </button>
              </div>
            </form>
          ) : mode === 'archive' ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-primary-600">
                Archive this Card?
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-2 py-1 text-xs text-primary-600"
                >
                  Cancel archive
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (pending) return
                    void onArchiveCard(card.cardId)
                    close()
                  }}
                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Confirm archive
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (pending) return
                  void onTogglePin(card.cardId)
                  close()
                }}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                <HugeiconsIcon icon={PinIcon} size={15} strokeWidth={1.8} />
                {card.pinned ? 'Unpin card' : 'Pin card'}
              </button>
              {canBranch ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (pending) return
                    void onBranchCard(card.cardId)
                    close()
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                >
                  <HugeiconsIcon
                    icon={GitForkIcon}
                    size={15}
                    strokeWidth={1.8}
                  />
                  Branch conversation
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode('rename')}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                <HugeiconsIcon icon={Pen01Icon} size={15} strokeWidth={1.8} />
                Rename
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode('archive')}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <HugeiconsIcon
                  icon={Delete01Icon}
                  size={15}
                  strokeWidth={1.8}
                />
                Archive card
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

export function MobileSessionsPanel({
  open,
  onClose,
  sessionCards,
  activeFriendlyId,
  inspectedChildCardId,
  onSelectSession,
  onNewChat,
  onRenameCard,
  onTogglePin,
  onBranchCard,
  onArchiveCard,
  pendingCardIds = new Set<string>(),
  hasMoreOlderSessions = false,
  loadingOlderSessions = false,
  olderSessionsError = null,
  onLoadOlderSessions,
}: Props) {
  const sessionForkAvailable = useFeatureAvailable('sessionFork')
  const disclosurePrefix = useId().replaceAll(':', '')
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [actionCardId, setActionCardId] = useState<string>()
  const activeSessionKey = activeFriendlyId
  const roots = sessionCards
  const cardsById = useMemo(
    () => new Map(sessionCards.map((card) => [card.cardId, card])),
    [sessionCards],
  )
  const activeCard = useMemo<{
    rootCardId?: string
    childCardId?: string
  }>(() => {
    if (!activeSessionKey) return {}
    const visit = (
      rootCardId: string,
      card: SessionCard,
      visited: Set<string>,
    ): { rootCardId: string; childCardId?: string } | undefined => {
      if (visited.has(card.cardId)) return undefined
      visited.add(card.cardId)
      if (cardOwnsSessionKey(card, activeSessionKey)) {
        if (card.cardId !== rootCardId) {
          return { rootCardId, childCardId: card.cardId }
        }
        return card.childNodes.some(
          (child) => child.cardId === inspectedChildCardId,
        )
          ? { rootCardId, childCardId: inspectedChildCardId }
          : { rootCardId }
      }
      for (const child of card.childNodes) {
        if (
          child.cardId === activeSessionKey ||
          child.sessionKey === activeSessionKey
        ) {
          return { rootCardId, childCardId: child.cardId }
        }
        const fullChild = cardsById.get(child.cardId)
        if (fullChild) {
          const match = visit(rootCardId, fullChild, visited)
          if (match) return match
        }
      }
      return undefined
    }
    for (const root of roots) {
      const match = visit(root.cardId, root, new Set())
      if (match) return match
    }
    return {}
  }, [activeSessionKey, cardsById, inspectedChildCardId, roots])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (
      actionCardId &&
      !sessionCards.some(
        (card) =>
          card.cardId === actionCardId && card.relationshipKind === 'root',
      )
    ) {
      setActionCardId(undefined)
    }
  }, [actionCardId, sessionCards])

  if (!open) return null

  const toggleCard = (cardId: string, expanded: boolean) => {
    setExpandedCardIds((current) => {
      const next = new Set(current)
      if (expanded) next.add(cardId)
      else next.delete(cardId)
      return next
    })
  }

  const closeCardActions = () => {
    setActionCardId(undefined)
  }

  const renderChild = (
    child: SessionCardChild,
    rootCardId: string,
    depth: number,
    visited: ReadonlySet<string>,
  ): React.ReactNode => {
    if (visited.has(child.cardId)) return null
    const nextVisited = new Set(visited)
    nextVisited.add(child.cardId)
    const title = child.title
    const fullCard = cardsById.get(child.cardId)
    const inspected = activeCard.childCardId === child.cardId
    const grandchildren = fullCard?.childNodes ?? []
    const expanded = expandedCardIds.has(child.cardId)
    const childrenId = `${disclosurePrefix}-${child.cardId}-children`

    return (
      <div
        key={child.cardId}
        data-card-child-id={child.cardId}
        data-session-depth={depth}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectSession(rootCardId, child.cardId)}
            aria-label={`Inspect ${child.relationshipKind === 'branch' ? 'branch' : 'delegated session'} ${title}`}
            data-card-child-id={child.cardId}
            data-session-depth={depth}
            data-inspected={inspected ? 'true' : undefined}
            className={cn(
              'min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition-colors',
              inspected
                ? 'border-accent-300 bg-accent-50'
                : 'border-transparent bg-primary-50 hover:border-primary-200',
            )}
            style={{
              paddingInlineStart: `${12 + Math.min(depth, 8) * 16}px`,
            }}
          >
            <div className="truncate text-sm font-medium text-ink">{title}</div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-primary-600">
              {relationshipLabel(child)}
            </div>
          </button>
          {grandchildren.length > 0 ? (
            <button
              type="button"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} child activity for ${title}`}
              aria-expanded={expanded}
              aria-controls={childrenId}
              onClick={() => toggleCard(child.cardId, !expanded)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100"
            >
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={1.8}
                className={cn(!expanded && '-rotate-90')}
              />
            </button>
          ) : null}
        </div>
        {grandchildren.length > 0 ? (
          <div id={childrenId} hidden={!expanded} className="space-y-1 pt-1">
            {expanded
              ? grandchildren.map((grandchild) =>
                  renderChild(grandchild, rootCardId, depth + 1, nextVisited),
                )
              : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[97] no-swipe md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        aria-label="Close sessions panel"
        onClick={onClose}
      />

      <aside
        className="no-swipe absolute inset-y-0 left-0 w-[80vw] max-w-sm border-r shadow-2xl animate-in slide-in-from-left-8 duration-200"
        style={{
          background: 'var(--color-surface, #fff)',
          borderColor: 'var(--color-border, #e5e7eb)',
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-primary-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Sessions</h2>
            <button
              type="button"
              onClick={onNewChat}
              className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:border-accent-200 hover:text-accent-600"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
              New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {roots.length === 0 && !hasMoreOlderSessions ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-primary-500">
                <HugeiconsIcon icon={Chat01Icon} size={24} strokeWidth={1.6} />
                <p className="text-sm">No sessions yet.</p>
                <p className="text-xs text-primary-400">
                  Start a conversation to see it here.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {roots.map((card) => {
                  const title = card.title
                  const timestamp = formatUpdatedAt(card.updatedAt)
                  const active = activeCard.rootCardId === card.cardId
                  const inspectedChild =
                    active && activeCard.childCardId !== undefined
                  const expanded =
                    card.childNodes.length > 0 &&
                    (expandedCardIds.has(card.cardId) || inspectedChild)
                  const childrenId = `${disclosurePrefix}-${card.cardId}-children`
                  const actionsOpen = actionCardId === card.cardId
                  const pending = pendingCardIds.has(card.cardId)
                  const isActionableCard = card.relationshipKind === 'root'

                  return (
                    <div key={card.cardId} data-card-container={card.cardId}>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Open card ${title}`}
                          onClick={() => onSelectSession(card.cardId)}
                          aria-current={active ? 'page' : undefined}
                          data-card-id={card.cardId}
                          data-session-key={card.canonicalSegmentKey}
                          data-session-depth={0}
                          className={cn(
                            'min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition-colors',
                            active
                              ? 'border-accent-300 bg-accent-50'
                              : 'border-transparent bg-primary-50 hover:border-primary-200',
                          )}
                        >
                          <div className="truncate text-sm font-medium text-ink">
                            {title}
                          </div>
                          {card.continuationCount > 1 ? (
                            <div className="mt-0.5 truncate text-[11px] font-medium text-primary-600">
                              Continued · {card.continuationCount} segments
                            </div>
                          ) : null}
                          {card.relationshipKind === 'orphan' ? (
                            <div className="mt-0.5 truncate text-[11px] font-medium text-primary-600">
                              Original session unavailable
                            </div>
                          ) : null}
                          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-primary-500">
                            <span className="truncate">{card.cardId}</span>
                            {timestamp ? <span>{timestamp}</span> : null}
                          </div>
                        </button>
                        {card.childNodes.length > 0 ? (
                          <button
                            type="button"
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} child activity for ${title}`}
                            aria-expanded={expanded}
                            aria-controls={childrenId}
                            onClick={() => toggleCard(card.cardId, !expanded)}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100"
                          >
                            <HugeiconsIcon
                              icon={ArrowDown01Icon}
                              size={14}
                              strokeWidth={1.8}
                              className={cn(!expanded && '-rotate-90')}
                            />
                          </button>
                        ) : null}
                        {isActionableCard ? (
                          <MobileCardActions
                            card={card}
                            open={actionsOpen}
                            pending={pending}
                            canBranch={isWholeCardBranchAvailable(
                              card,
                              sessionForkAvailable,
                            )}
                            onToggle={() =>
                              setActionCardId(
                                actionsOpen ? undefined : card.cardId,
                              )
                            }
                            onClose={closeCardActions}
                            onRenameCard={onRenameCard}
                            onTogglePin={onTogglePin}
                            onBranchCard={onBranchCard}
                            onArchiveCard={onArchiveCard}
                          />
                        ) : null}
                      </div>
                      {card.childNodes.length > 0 ? (
                        <div
                          id={childrenId}
                          hidden={!expanded}
                          className="space-y-1 pt-1"
                        >
                          {expanded
                            ? card.childNodes.map((child) =>
                                renderChild(
                                  child,
                                  card.cardId,
                                  1,
                                  new Set([card.cardId]),
                                ),
                              )
                            : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
            {hasMoreOlderSessions ? (
              <div className="px-2 py-3 text-center">
                {olderSessionsError ? (
                  <p className="mb-2 text-xs text-primary-500">
                    Older sessions could not be loaded.
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={loadingOlderSessions || !onLoadOlderSessions}
                  onClick={onLoadOlderSessions}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-accent-600 hover:bg-accent-50 disabled:opacity-50"
                >
                  {loadingOlderSessions
                    ? 'Loading…'
                    : olderSessionsError
                      ? 'Retry older sessions'
                      : 'More Sessions…'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  )
}
