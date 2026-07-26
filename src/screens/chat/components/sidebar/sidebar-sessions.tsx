'use client'

import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { memo, useEffect, useMemo, useState } from 'react'
import { projectSessionCards } from '../../session-cards'
import { SessionTreeRow } from './session-tree-row'
import type {
  SessionCard,
  SessionCardChildStatus,
  SessionMeta,
  SessionTreeRow as SessionTreeRowModel,
} from '../../types'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'

type SidebarSessionsProps = {
  sessions: Array<SessionMeta>
  /** Server-backed Cards take precedence. Legacy sessions remain a safe fallback. */
  sessionCards?: Array<SessionCard>
  activeFriendlyId: string
  defaultOpen?: boolean
  onSelect?: () => void
  onRename: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
  sessionForkAvailable?: boolean
  forkingSessionKey?: string | null
  onFork?: (session: SessionMeta) => void
  loading: boolean
  fetching: boolean
  error: string | null
  onRetry: () => void
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

function legacySessionTitle(session: SessionMeta | undefined): string {
  const candidates = [
    session?.label,
    session?.derivedTitle,
    session?.title,
    session?.friendlyId,
  ]
  for (const candidate of candidates) {
    const title = candidate?.trim()
    if (title) return title
  }
  return 'New conversation'
}

function cardSession(
  sessions: Array<SessionMeta>,
  sessionKey: string,
  title: string,
): SessionMeta {
  const session = sessionForKey(sessions, sessionKey)
  if (session && legacySessionTitle(session) === title) return session
  return {
    ...(session ?? { key: sessionKey, friendlyId: sessionKey }),
    label: title,
    title: undefined,
    derivedTitle: undefined,
    titleStatus: 'ready',
    titleError: null,
  }
}

function cardOwnsSessionKey(card: SessionCard, sessionKey: string): boolean {
  return (
    card.cardId === sessionKey ||
    card.canonicalSegmentKey === sessionKey ||
    card.continuationSegmentKeys.includes(sessionKey)
  )
}

function findRootCardForSession(
  roots: Array<SessionCard>,
  cardsById: ReadonlyMap<string, SessionCard>,
  sessionKey: string | undefined,
): { rootCardId?: string; childCardId?: string } {
  if (!sessionKey) return {}

  const visit = (
    rootCardId: string,
    card: SessionCard,
    visited: Set<string>,
  ): { rootCardId: string; childCardId?: string } | undefined => {
    if (visited.has(card.cardId)) return undefined
    visited.add(card.cardId)
    if (cardOwnsSessionKey(card, sessionKey)) {
      return card.cardId === rootCardId
        ? { rootCardId }
        : { rootCardId, childCardId: card.cardId }
    }
    for (const child of card.childNodes) {
      if (child.cardId === sessionKey || child.sessionKey === sessionKey) {
        return { rootCardId, childCardId: child.cardId }
      }
      const childCard = cardsById.get(child.cardId)
      if (childCard) {
        const match = visit(rootCardId, childCard, visited)
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
}

export const SidebarSessions = memo(function SidebarSessions({
  sessions,
  sessionCards,
  activeFriendlyId,
  defaultOpen = true,
  onSelect,
  onRename,
  onDelete,
  sessionForkAvailable = false,
  forkingSessionKey,
  onFork = () => {},
  loading,
  fetching,
  error,
  onRetry,
}: SidebarSessionsProps) {
  const { pinnedSessionKeys, togglePinnedSession, migratePinnedSession } =
    usePinnedSessions()
  const [collapsedCardIds, setCollapsedCardIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [pinOverrides, setPinOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map())

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
  const cardsById = useMemo(() => {
    const cards = sessionCards ?? legacyProjection.cards
    return new Map(cards.map((card) => [card.cardId, card]))
  }, [legacyProjection.cards, sessionCards])
  const activeCard = useMemo(
    () => findRootCardForSession(roots, cardsById, activeSessionKey),
    [activeSessionKey, cardsById, roots],
  )

  const pinnedCardIds = useMemo(() => {
    const result = new Set<string>()
    for (const card of roots) {
      const legacyPinned = pinnedSessionKeys.some(
        (key) => key === card.cardId || cardOwnsSessionKey(card, key),
      )
      const overridden = pinOverrides.get(card.cardId)
      if (overridden ?? (card.pinned || legacyPinned)) result.add(card.cardId)
    }
    return result
  }, [pinOverrides, pinnedSessionKeys, roots])

  useEffect(() => {
    if (loading || fetching || error) return
    for (const pinnedKey of pinnedSessionKeys) {
      const owner = roots.find(
        (card) =>
          pinnedKey === card.cardId || cardOwnsSessionKey(card, pinnedKey),
      )
      if (owner && owner.cardId !== pinnedKey) {
        migratePinnedSession(pinnedKey, owner.cardId)
      }
    }
  }, [error, fetching, loading, migratePinnedSession, pinnedSessionKeys, roots])

  const cardRows = useMemo(() => {
    const childrenByParent = new Map<string, Array<SessionTreeRowModel>>()
    const childStatusByCardId = new Map<string, SessionCardChildStatus>()
    const rowsByCardId = new Map<string, SessionTreeRowModel>()

    const buildRow = (
      card: SessionCard,
      depth: number,
      parentKey?: string,
      edgeTitle?: string,
      edgeSessionKey?: string,
    ): SessionTreeRowModel => {
      const sessionKey = edgeSessionKey ?? card.canonicalSegmentKey
      const sourceSession = sessionForKey(sessions, sessionKey)
      const title =
        edgeTitle ??
        (sessionCards ? card.title : legacySessionTitle(sourceSession))
      const childRows: Array<SessionTreeRowModel> = []
      for (const child of card.childNodes) {
        childStatusByCardId.set(child.cardId, child.status)
        const fullChildCard = cardsById.get(child.cardId)
        const childCard: SessionCard = fullChildCard ?? {
          cardId: child.cardId,
          title: child.title,
          titleSource: 'default',
          canonicalSegmentKey: child.sessionKey,
          continuationSegmentKeys: [child.sessionKey],
          continuationCount: child.continuationCount,
          relationshipKind: child.relationshipKind,
          parentCardId: card.cardId,
          childNodes: [],
          updatedAt: child.updatedAt,
          archived: false,
          pinned: false,
        }
        childRows.push(
          buildRow(
            childCard,
            depth + 1,
            card.cardId,
            sessionCards
              ? child.title
              : legacySessionTitle(sessionForKey(sessions, child.sessionKey)),
            child.sessionKey,
          ),
        )
      }
      const hasInspectedDescendant =
        activeCard.rootCardId ===
          roots.find((root) => root.cardId === card.cardId)?.cardId &&
        activeCard.childCardId !== undefined
      const isExpanded =
        childRows.length > 0 &&
        (!collapsedCardIds.has(card.cardId) || hasInspectedDescendant)
      const row: SessionTreeRowModel = {
        key: card.cardId,
        session: cardSession(sessions, sessionKey, title),
        relationshipKind: card.relationshipKind,
        depth,
        isExpandable: childRows.length > 0,
        isExpanded,
        childCount: childRows.length,
        continuationCount: card.continuationCount,
        ...(parentKey ? { parentKey } : {}),
        isOrphan: card.relationshipKind === 'orphan',
      }
      rowsByCardId.set(card.cardId, row)
      if (childRows.length > 0) childrenByParent.set(card.cardId, childRows)
      return row
    }

    const rootRows = roots.map((card) => buildRow(card, 0))
    return { rootRows, rowsByCardId, childrenByParent, childStatusByCardId }
  }, [
    activeCard.childCardId,
    activeCard.rootCardId,
    cardsById,
    collapsedCardIds,
    roots,
    sessionCards,
    sessions,
  ])

  const pinnedRows = cardRows.rootRows.filter((row) =>
    pinnedCardIds.has(row.key),
  )
  const unpinnedRows = cardRows.rootRows.filter(
    (row) => !pinnedCardIds.has(row.key),
  )

  function handleTogglePin(session: SessionMeta) {
    const card = roots.find(
      (candidate) =>
        candidate.canonicalSegmentKey === session.key ||
        candidate.canonicalSegmentKey === session.backendKey ||
        sessionForKey(sessions, candidate.canonicalSegmentKey)?.friendlyId ===
          session.friendlyId,
    )
    if (!card) return
    const nextPinned = !pinnedCardIds.has(card.cardId)
    setPinOverrides((current) => {
      const next = new Map(current)
      next.set(card.cardId, nextPinned)
      return next
    })
    const storedKeys = pinnedSessionKeys.filter(
      (key) => key === card.cardId || cardOwnsSessionKey(card, key),
    )
    if (storedKeys.length > 0) {
      for (const key of storedKeys) togglePinnedSession(key)
    } else {
      togglePinnedSession(card.cardId)
    }
  }

  function handleToggleExpanded(cardId: string, expanded: boolean) {
    setCollapsedCardIds((current) => {
      const next = new Set(current)
      if (expanded) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  function renderRoots(rows: Array<SessionTreeRowModel>) {
    return rows.map((row) => (
      <SessionTreeRow
        key={row.key}
        row={row}
        childrenByParent={cardRows.childrenByParent}
        childStatusByCardId={cardRows.childStatusByCardId}
        cardRouteMode={sessionCards !== undefined}
        activeFriendlyId={activeFriendlyId}
        activeSessionKey={activeCard.rootCardId}
        pinnedSessionKeys={pinnedCardIds}
        onToggleExpanded={handleToggleExpanded}
        onSelect={onSelect}
        onTogglePin={handleTogglePin}
        sessionForkAvailable={sessionForkAvailable}
        forkingSessionKey={forkingSessionKey}
        onFork={onFork}
        onRename={onRename}
        onDelete={onDelete}
      />
    ))
  }

  return (
    <Collapsible
      className="flex h-full flex-col flex-1 min-h-0 w-full"
      defaultOpen={defaultOpen}
    >
      <CollapsibleTrigger className="w-full flex items-center gap-1.5 rounded-none px-5 pt-3 pb-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider hover:bg-transparent data-panel-open:text-primary-500">
        <span className="select-none">Sessions</span>
        <span className="ml-auto p-0.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors">
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className="text-primary-500 transition-transform duration-150 -rotate-90 group-data-panel-open:rotate-0"
          />
        </span>
      </CollapsibleTrigger>

      {pinnedRows.length > 0 ? (
        <section
          aria-label="Pinned sessions"
          className="flex shrink-0 flex-col gap-px pl-3 pr-2 pt-1"
        >
          {renderRoots(pinnedRows)}
        </section>
      ) : null}

      <CollapsiblePanel
        className="w-full min-h-0 flex-1"
        contentClassName="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <ScrollAreaRoot className="flex-1 min-h-0">
          <ScrollAreaViewport className="min-h-0">
            <div className="flex flex-col gap-px pl-3 pr-2">
              {loading ? (
                <div className="px-2 py-2 text-xs text-primary-500">
                  Loading sessions…
                </div>
              ) : error ? (
                <div className="px-2 py-2 text-xs text-primary-500">
                  <div className="mb-2">Failed to load sessions.</div>
                  <div className="text-[11px] opacity-80">{error}</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={onRetry}
                  >
                    Retry
                  </Button>
                </div>
              ) : unpinnedRows.length > 0 ? (
                <>
                  {pinnedRows.length > 0 ? (
                    <div className="my-1 border-t border-primary-200/80" />
                  ) : null}
                  <section aria-label="Sessions">
                    {renderRoots(unpinnedRows)}
                  </section>
                </>
              ) : (
                <div className="px-2 py-2 text-xs text-primary-500">
                  {pinnedRows.length > 0
                    ? 'All sessions are pinned.'
                    : 'No sessions yet. Start a conversation →'}
                </div>
              )}
              {fetching && !loading && !error && sessions.length > 0 ? (
                <div className="px-2 py-1 text-[11px] text-primary-400">
                  Updating…
                </div>
              ) : null}
            </div>
          </ScrollAreaViewport>
          <ScrollAreaScrollbar orientation="vertical">
            <ScrollAreaThumb />
          </ScrollAreaScrollbar>
        </ScrollAreaRoot>
      </CollapsiblePanel>
    </Collapsible>
  )
}, areSidebarSessionsEqual)

function areSidebarSessionsEqual(
  prev: SidebarSessionsProps,
  next: SidebarSessionsProps,
) {
  if (prev.sessionCards !== next.sessionCards) return false
  if (prev.activeFriendlyId !== next.activeFriendlyId) return false
  if (prev.defaultOpen !== next.defaultOpen) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.sessionForkAvailable !== next.sessionForkAvailable) return false
  if (prev.forkingSessionKey !== next.forkingSessionKey) return false
  if (prev.onFork !== next.onFork) return false
  if (prev.loading !== next.loading) return false
  if (prev.fetching !== next.fetching) return false
  if (prev.error !== next.error) return false
  if (prev.onRetry !== next.onRetry) return false
  if (prev.sessions === next.sessions) return true
  if (prev.sessions.length !== next.sessions.length) return false
  for (let i = 0; i < prev.sessions.length; i += 1) {
    const prevSession = prev.sessions[i]
    const nextSession = next.sessions[i]
    if (!prevSession || !nextSession) return false
    if (prevSession.key !== nextSession.key) return false
    if (prevSession.backendKey !== nextSession.backendKey) return false
    if (prevSession.friendlyId !== nextSession.friendlyId) return false
    if (prevSession.label !== nextSession.label) return false
    if (prevSession.title !== nextSession.title) return false
    if (prevSession.derivedTitle !== nextSession.derivedTitle) return false
    if (prevSession.updatedAt !== nextSession.updatedAt) return false
    if (prevSession.titleStatus !== nextSession.titleStatus) return false
    if (prevSession.titleSource !== nextSession.titleSource) return false
    if (prevSession.titleError !== nextSession.titleError) return false
    if (prevSession.lastMessage !== nextSession.lastMessage) return false
    if (!areSessionLineagesEqual(prevSession, nextSession)) return false
  }
  return true
}

function areSessionLineagesEqual(
  prevSession: SessionMeta,
  nextSession: SessionMeta,
): boolean {
  const prev = prevSession.lineage
  const next = nextSession.lineage
  if (prev === next) return true
  if (!prev || !next) return false
  return (
    prev.parentSessionId === next.parentSessionId &&
    prev.relationshipType === next.relationshipType &&
    prev.relationshipKind === next.relationshipKind &&
    prev.parentTitle === next.parentTitle &&
    prev.parentSource === next.parentSource &&
    prev.sessionSource === next.sessionSource &&
    prev.lineageRootId === next.lineageRootId &&
    prev.lineageTipId === next.lineageTipId &&
    prev.compressionSegmentCount === next.compressionSegmentCount &&
    prev.parentLineageRootId === next.parentLineageRootId &&
    prev.parentLineageTipId === next.parentLineageTipId &&
    prev.isCrossSurfaceChild === next.isCrossSurfaceChild &&
    prev.isPreCompressionSnapshot === next.isPreCompressionSnapshot &&
    prev.source === next.source &&
    prev.endReason === next.endReason &&
    prev.startedAt === next.startedAt &&
    prev.endedAt === next.endedAt
  )
}

export { areSessionLineagesEqual }
