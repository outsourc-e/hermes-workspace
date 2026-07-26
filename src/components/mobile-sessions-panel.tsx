import { useEffect, useId, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  Chat01Icon,
} from '@hugeicons/core-free-icons'
import type {
  SessionCard,
  SessionCardChild,
  SessionMeta,
} from '@/screens/chat/types'
import { projectSessionCards } from '@/screens/chat/session-cards'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  sessions: Array<SessionMeta>
  /** Server-backed Cards take precedence. Legacy sessions remain a safe fallback. */
  sessionCards?: Array<SessionCard>
  activeFriendlyId: string
  onSelectSession: (key: string) => void
  onNewChat: () => void
}

function normalizeLabel(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function getSessionTitle(session: SessionMeta | undefined): string {
  const label = normalizeLabel(session?.label)
  if (label) return label
  const derivedTitle = normalizeLabel(session?.derivedTitle)
  if (derivedTitle) return derivedTitle
  const title = normalizeLabel(session?.title)
  if (title) return title
  return session ? `Session ${session.friendlyId.slice(0, 8)}` : 'Conversation'
}

function sessionForKey(
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

export function MobileSessionsPanel({
  open,
  onClose,
  sessions,
  sessionCards,
  activeFriendlyId,
  onSelectSession,
  onNewChat,
}: Props) {
  const disclosurePrefix = useId().replaceAll(':', '')
  const [collapsedCardIds, setCollapsedCardIds] = useState<Set<string>>(
    () => new Set(),
  )
  const activeSessionKey = useMemo(
    () =>
      sessions.find(
        (session) =>
          session.friendlyId === activeFriendlyId ||
          session.key === activeFriendlyId ||
          session.backendKey === activeFriendlyId,
      )?.key ?? activeFriendlyId,
    [activeFriendlyId, sessions],
  )
  const legacyProjection = useMemo(
    () => projectSessionCards(sessions, { activeSessionKey }),
    [activeSessionKey, sessions],
  )
  const roots = sessionCards ?? legacyProjection.roots
  const cardsById = useMemo(
    () =>
      new Map(
        (sessionCards ?? legacyProjection.cards).map((card) => [
          card.cardId,
          card,
        ]),
      ),
    [legacyProjection.cards, sessionCards],
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
        return card.cardId === rootCardId
          ? { rootCardId }
          : { rootCardId, childCardId: card.cardId }
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
  }, [activeSessionKey, cardsById, roots])

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

  if (!open) return null

  const toggleCard = (cardId: string, expanded: boolean) => {
    setCollapsedCardIds((current) => {
      const next = new Set(current)
      if (expanded) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const renderChild = (
    child: SessionCardChild,
    depth: number,
    visited: ReadonlySet<string>,
  ): React.ReactNode => {
    if (visited.has(child.cardId)) return null
    const nextVisited = new Set(visited)
    nextVisited.add(child.cardId)
    const session = sessionForKey(sessions, child.sessionKey)
    const title = sessionCards ? child.title : getSessionTitle(session)
    const fullCard = cardsById.get(child.cardId)
    const inspected = activeCard.childCardId === child.cardId
    const routeKey = session?.friendlyId ?? child.sessionKey
    const grandchildren = fullCard?.childNodes ?? []
    const expanded = !collapsedCardIds.has(child.cardId)
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
            onClick={() => onSelectSession(routeKey)}
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
                  renderChild(grandchild, depth + 1, nextVisited),
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
            {roots.length === 0 ? (
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
                  const session = sessionForKey(
                    sessions,
                    card.canonicalSegmentKey,
                  )
                  const title = sessionCards
                    ? card.title
                    : getSessionTitle(session)
                  const timestamp = formatUpdatedAt(card.updatedAt)
                  const active = activeCard.rootCardId === card.cardId
                  const inspectedChild =
                    active && activeCard.childCardId !== undefined
                  const expanded =
                    card.childNodes.length > 0 &&
                    (!collapsedCardIds.has(card.cardId) || inspectedChild)
                  const childrenId = `${disclosurePrefix}-${card.cardId}-children`
                  const routeKey =
                    session?.friendlyId ?? card.canonicalSegmentKey
                  return (
                    <div key={card.cardId} data-card-container={card.cardId}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Open card ${title}`}
                          onClick={() => onSelectSession(routeKey)}
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
                            <span className="truncate">{routeKey}</span>
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
                      </div>
                      {card.childNodes.length > 0 ? (
                        <div
                          id={childrenId}
                          hidden={!expanded}
                          className="space-y-1 pt-1"
                        >
                          {expanded
                            ? card.childNodes.map((child) =>
                                renderChild(child, 1, new Set([card.cardId])),
                              )
                            : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
