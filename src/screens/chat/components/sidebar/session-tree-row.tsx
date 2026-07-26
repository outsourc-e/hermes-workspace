'use client'

import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId } from 'react'
import { isWholeCardBranchAvailable } from '../../types'
import { SessionItem } from './session-item'
import type {
  SessionCard,
  SessionCardChildStatus,
  SessionCardRelationshipKind,
} from '../../types'
import { cn } from '@/lib/utils'

type SessionCardTreeRow = {
  key: string
  title: string
  updatedAt: number
  relationshipKind: SessionCardRelationshipKind
  status?: SessionCardChildStatus
  depth: number
  isExpandable: boolean
  isExpanded: boolean
  childCount: number
  continuationCount: number
  parentKey?: string
  isOrphan: boolean
}

type SessionTreeRowProps = {
  row: SessionCardTreeRow
  childrenByParent: ReadonlyMap<string, Array<SessionCardTreeRow>>
  activeCardId: string
  inspectedChildCardId?: string
  pinnedSessionKeys: ReadonlySet<string>
  cardsById: ReadonlyMap<string, SessionCard>
  pendingCardIds: ReadonlySet<string>
  sessionForkAvailable: boolean
  onToggleExpanded: (cardId: string, expanded: boolean) => void
  onSelect?: () => void
  onTogglePin: (card: SessionCard) => void
  onBranch: (card: SessionCard) => void
  onRename: (card: SessionCard) => void
  onArchive: (card: SessionCard) => void
  ancestorKeys?: ReadonlySet<string>
  rootCardId?: string
}

function getRelationshipLabel(row: SessionCardTreeRow): string | undefined {
  const identityLabel =
    row.relationshipKind === 'branch'
      ? 'Branch'
      : row.relationshipKind === 'child'
        ? 'Delegated session'
        : row.isOrphan
          ? 'Original session unavailable'
          : undefined
  if (identityLabel) {
    const relationship =
      row.continuationCount > 1
        ? `${identityLabel} · ${row.continuationCount} segments`
        : identityLabel
    return row.status && row.status !== 'idle'
      ? `${relationship} · ${row.status}`
      : relationship
  }
  if (row.continuationCount > 1) {
    return `Continued · ${row.continuationCount} segments`
  }
  return undefined
}

function SessionTreeRow({
  row,
  childrenByParent,
  activeCardId,
  inspectedChildCardId,
  pinnedSessionKeys,
  cardsById,
  pendingCardIds,
  sessionForkAvailable,
  onToggleExpanded,
  onSelect,
  onTogglePin,
  onBranch,
  onRename,
  onArchive,
  ancestorKeys = new Set<string>(),
  rootCardId,
}: SessionTreeRowProps) {
  const generatedId = useId().replaceAll(':', '')
  const childrenId = `session-tree-children-${generatedId}`
  const relationshipLabel = getRelationshipLabel(row)
  const childRows = childrenByParent.get(row.key) ?? []
  const nextAncestorKeys = new Set(ancestorKeys)
  nextAncestorKeys.add(row.key)
  const card = cardsById.get(row.key)
  const isRootCard = row.depth === 0 && card !== undefined
  const parentRouteCardId = rootCardId ?? row.key

  return (
    <div
      data-card-id={row.depth === 0 ? row.key : undefined}
      data-card-child-id={row.depth > 0 ? row.key : undefined}
      data-session-depth={row.depth}
    >
      <div
        className="relative flex min-w-0 items-center"
        style={
          row.depth > 0
            ? { paddingInlineStart: `${Math.min(row.depth, 8) * 12}px` }
            : undefined
        }
      >
        {row.isExpandable ? (
          <button
            type="button"
            className={cn(
              'mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-primary-500',
              'hover:bg-primary-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500',
            )}
            aria-label={`${row.isExpanded ? 'Collapse' : 'Expand'} related sessions for ${row.title}`}
            aria-expanded={row.isExpanded}
            aria-controls={childrenId}
            onClick={() => onToggleExpanded(row.key, !row.isExpanded)}
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={12}
              strokeWidth={2}
              className={cn(
                'transition-transform duration-150',
                row.isExpanded ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <SessionItem
            session={{
              key: row.key,
              friendlyId: parentRouteCardId,
              label: row.title,
              updatedAt: row.updatedAt,
              titleStatus: 'ready',
              titleError: null,
            }}
            routeKey={parentRouteCardId}
            inspectChildCardId={row.depth > 0 ? row.key : undefined}
            active={row.depth === 0 && row.key === activeCardId}
            isPinned={row.depth === 0 && pinnedSessionKeys.has(row.key)}
            contextLabel={relationshipLabel}
            showActions={row.depth === 0}
            inspected={row.depth > 0 && row.key === inspectedChildCardId}
            onSelect={onSelect}
            onTogglePin={isRootCard ? () => onTogglePin(card) : undefined}
            canBranch={
              isRootCard &&
              isWholeCardBranchAvailable(card, sessionForkAvailable)
            }
            pending={isRootCard && pendingCardIds.has(card.cardId)}
            onBranch={isRootCard ? () => onBranch(card) : undefined}
            onRename={isRootCard ? () => onRename(card) : undefined}
            onArchive={isRootCard ? () => onArchive(card) : undefined}
          />
        </div>
      </div>

      {row.isExpandable ? (
        <div
          id={childrenId}
          hidden={!row.isExpanded}
          className="flex flex-col gap-px"
        >
          {row.isExpanded
            ? childRows.map((childRow) =>
                nextAncestorKeys.has(childRow.key) ? null : (
                  <SessionTreeRow
                    key={childRow.key}
                    row={childRow}
                    childrenByParent={childrenByParent}
                    activeCardId={activeCardId}
                    inspectedChildCardId={inspectedChildCardId}
                    pinnedSessionKeys={pinnedSessionKeys}
                    cardsById={cardsById}
                    pendingCardIds={pendingCardIds}
                    sessionForkAvailable={sessionForkAvailable}
                    onToggleExpanded={onToggleExpanded}
                    onSelect={onSelect}
                    onTogglePin={onTogglePin}
                    onBranch={onBranch}
                    onRename={onRename}
                    onArchive={onArchive}
                    ancestorKeys={nextAncestorKeys}
                    rootCardId={parentRouteCardId}
                  />
                ),
              )
            : null}
        </div>
      ) : null}
    </div>
  )
}

export { SessionTreeRow }
export type { SessionCardTreeRow, SessionTreeRowProps }
