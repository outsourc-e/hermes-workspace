'use client'

import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { memo, useMemo, useState } from 'react'
import { SessionTreeRow } from './session-tree-row'
import type { SessionCardTreeRow } from './session-tree-row'
import type { SessionCardListWire } from '../../chat-queries'
import type { SessionCard, SessionCardChild } from '../../types'
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

type SidebarSessionsProps = {
  /** Authoritative, server-backed logical conversations. */
  sessionCards: Array<SessionCard>
  cardResolutions: SessionCardListWire['cardResolutions']
  completeness: SessionCardListWire['completeness']
  activeCardId: string
  inspectedChildCardId?: string
  defaultOpen?: boolean
  onSelect?: () => void
  onTogglePin: (card: SessionCard) => void
  onRename: (card: SessionCard) => void
  onArchive: (card: SessionCard) => void
  onBranch: (card: SessionCard) => void
  pendingCardIds?: ReadonlySet<string>
  sessionForkAvailable: boolean
  loading: boolean
  fetching: boolean
  error: string | null
  onRetry: () => void
  hasMoreOlderSessions?: boolean
  loadingOlderSessions?: boolean
  olderSessionsError?: string | null
  onLoadOlderSessions?: () => void
}

type CardRowChild = SessionCardChild & {
  childNodes?: Array<CardRowChild>
}

type CardRowNode = Pick<
  SessionCard,
  'cardId' | 'title' | 'updatedAt' | 'relationshipKind' | 'continuationCount'
> & {
  childNodes: Array<CardRowChild>
  status?: SessionCardChild['status']
}

export const SidebarSessions = memo(function SidebarSessions({
  sessionCards,
  cardResolutions,
  completeness,
  activeCardId,
  inspectedChildCardId,
  defaultOpen = true,
  onSelect,
  onTogglePin,
  onRename,
  onArchive,
  onBranch,
  pendingCardIds = new Set<string>(),
  sessionForkAvailable,
  loading,
  fetching,
  error,
  onRetry,
  hasMoreOlderSessions = false,
  loadingOlderSessions = false,
  olderSessionsError = null,
  onLoadOlderSessions = () => undefined,
}: SidebarSessionsProps) {
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(
    () => new Set(),
  )

  const resolutionByCardId = useMemo(
    () =>
      new Map(
        cardResolutions.map((resolution) => [resolution.cardId, resolution]),
      ),
    [cardResolutions],
  )
  const completeCards = useMemo(
    () =>
      sessionCards.filter(
        (card) =>
          resolutionByCardId.get(card.cardId)?.completeness === 'complete',
      ),
    [resolutionByCardId, sessionCards],
  )
  const roots = useMemo(
    () =>
      completeCards
        .filter((card) => card.parentCardId === undefined)
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
          if (left.pinned && right.pinned) {
            const pinDifference = (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0)
            if (pinDifference !== 0) return pinDifference
          }
          const activityDifference = right.updatedAt - left.updatedAt
          if (activityDifference !== 0) return activityDifference
          return left.cardId.localeCompare(right.cardId)
        }),
    [completeCards],
  )
  const pinnedRoots = useMemo(
    () => roots.filter((card) => card.pinned),
    [roots],
  )
  const visibleRoots = roots
  const inventoryIncomplete =
    completeness !== 'complete' || completeCards.length !== sessionCards.length
  const cardsById = useMemo(
    () => new Map(completeCards.map((card) => [card.cardId, card])),
    [completeCards],
  )

  const pinnedCardIds = useMemo(
    () => new Set(pinnedRoots.map((card) => card.cardId)),
    [pinnedRoots],
  )

  const cardRows = useMemo(() => {
    const childrenByParent = new Map<string, Array<SessionCardTreeRow>>()

    const buildRow = (
      node: CardRowNode,
      depth: number,
      ancestorCardIds: ReadonlySet<string>,
      parentKey?: string,
    ): { row: SessionCardTreeRow; containsInspectedChild: boolean } => {
      const nextAncestorCardIds = new Set(ancestorCardIds)
      nextAncestorCardIds.add(node.cardId)
      const childResults = node.childNodes.flatMap((child) => {
        if (nextAncestorCardIds.has(child.cardId)) return []
        const nestedCard = cardsById.get(child.cardId)
        const nestedChildNodes =
          nestedCard?.parentCardId === node.cardId
            ? nestedCard.childNodes
            : (child.childNodes ?? [])
        return [
          buildRow(
            {
              cardId: child.cardId,
              title: child.title,
              updatedAt: child.updatedAt,
              relationshipKind: child.relationshipKind,
              continuationCount: child.continuationCount,
              childNodes: nestedChildNodes,
              status: child.status,
            },
            depth + 1,
            nextAncestorCardIds,
            node.cardId,
          ),
        ]
      })
      const childRows = childResults.map((result) => result.row)
      const hasInspectedDescendant = childResults.some(
        (result) => result.containsInspectedChild,
      )
      const isExpanded =
        childRows.length > 0 &&
        (expandedCardIds.has(node.cardId) || hasInspectedDescendant)
      const row: SessionCardTreeRow = {
        key: node.cardId,
        title: node.title,
        updatedAt: node.updatedAt,
        relationshipKind: node.relationshipKind,
        status: node.status,
        depth,
        isExpandable: childRows.length > 0,
        isExpanded,
        childCount: childRows.length,
        continuationCount: node.continuationCount,
        ...(parentKey ? { parentKey } : {}),
        isOrphan: node.relationshipKind === 'orphan',
      }
      if (childRows.length > 0) childrenByParent.set(node.cardId, childRows)
      return {
        row,
        containsInspectedChild:
          node.cardId === inspectedChildCardId || hasInspectedDescendant,
      }
    }

    const rootRows = visibleRoots.map(
      (card) => buildRow(card, 0, new Set<string>()).row,
    )
    return { rootRows, childrenByParent }
  }, [cardsById, expandedCardIds, inspectedChildCardId, visibleRoots])

  const pinnedRows = cardRows.rootRows.filter((row) =>
    pinnedCardIds.has(row.key),
  )
  const unpinnedRows = cardRows.rootRows.filter(
    (row) => !pinnedCardIds.has(row.key),
  )

  function handleToggleExpanded(cardId: string, expanded: boolean) {
    setExpandedCardIds((current) => {
      const next = new Set(current)
      if (expanded) next.add(cardId)
      else next.delete(cardId)
      return next
    })
  }

  function renderRoots(rows: Array<SessionCardTreeRow>) {
    return rows.map((row) => (
      <SessionTreeRow
        key={row.key}
        row={row}
        childrenByParent={cardRows.childrenByParent}
        activeCardId={activeCardId}
        inspectedChildCardId={inspectedChildCardId}
        pinnedSessionKeys={pinnedCardIds}
        cardsById={cardsById}
        pendingCardIds={pendingCardIds}
        sessionForkAvailable={sessionForkAvailable}
        onToggleExpanded={handleToggleExpanded}
        onSelect={onSelect}
        onTogglePin={onTogglePin}
        onBranch={onBranch}
        onRename={onRename}
        onArchive={onArchive}
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
              ) : (
                <>
                  {inventoryIncomplete ? (
                    <div
                      role="status"
                      className="px-2 py-2 text-xs text-primary-500"
                    >
                      <div>Some sessions are temporarily unavailable.</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        disabled={fetching}
                        aria-label="Retry sessions"
                        onClick={onRetry}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : null}
                  {unpinnedRows.length > 0 ? (
                    <>
                      {pinnedRows.length > 0 ? (
                        <div className="my-1 border-t border-primary-200/80" />
                      ) : null}
                      <section aria-label="Sessions">
                        {renderRoots(unpinnedRows)}
                      </section>
                    </>
                  ) : pinnedRows.length > 0 ? (
                    inventoryIncomplete ? null : hasMoreOlderSessions ? (
                      <div className="px-2 py-2 text-xs text-primary-500">
                        No sessions active in the last 2 days.
                      </div>
                    ) : (
                      <div className="px-2 py-2 text-xs text-primary-500">
                        All sessions are pinned.
                      </div>
                    )
                  ) : inventoryIncomplete ? null : hasMoreOlderSessions ? (
                    <div className="px-2 py-2 text-xs text-primary-500">
                      No sessions active in the last 2 days.
                    </div>
                  ) : (
                    <div className="px-2 py-2 text-xs text-primary-500">
                      No sessions yet. Start a conversation →
                    </div>
                  )}
                  {hasMoreOlderSessions ? (
                    <div className="px-2 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={loadingOlderSessions}
                        onClick={onLoadOlderSessions}
                      >
                        {loadingOlderSessions
                          ? 'Loading…'
                          : olderSessionsError
                            ? 'Retry older sessions'
                            : 'More Sessions…'}
                      </Button>
                      {olderSessionsError ? (
                        <div className="mt-1 text-[11px] text-primary-500">
                          Older sessions could not be loaded.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              {fetching && !loading && !error && roots.length > 0 ? (
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
  if (prev.cardResolutions !== next.cardResolutions) return false
  if (prev.completeness !== next.completeness) return false
  if (prev.activeCardId !== next.activeCardId) return false
  if (prev.inspectedChildCardId !== next.inspectedChildCardId) return false
  if (prev.defaultOpen !== next.defaultOpen) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onTogglePin !== next.onTogglePin) return false
  if (prev.onArchive !== next.onArchive) return false
  if (prev.onBranch !== next.onBranch) return false
  if (prev.pendingCardIds !== next.pendingCardIds) return false
  if (prev.sessionForkAvailable !== next.sessionForkAvailable) return false
  if (prev.loading !== next.loading) return false
  if (prev.fetching !== next.fetching) return false
  if (prev.error !== next.error) return false
  if (prev.onRetry !== next.onRetry) return false
  if (prev.hasMoreOlderSessions !== next.hasMoreOlderSessions) return false
  if (prev.loadingOlderSessions !== next.loadingOlderSessions) return false
  if (prev.olderSessionsError !== next.olderSessionsError) return false
  if (prev.onLoadOlderSessions !== next.onLoadOlderSessions) return false
  return true
}
