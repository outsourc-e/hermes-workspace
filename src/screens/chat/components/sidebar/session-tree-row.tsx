'use client'

import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId } from 'react'
import { isSessionForkEligible } from '../../session-fork'
import { SessionItem } from './session-item'
import type {
  SessionCardChildStatus,
  SessionMeta,
  SessionTreeRow as SessionTreeRowModel,
} from '../../types'
import { cn } from '@/lib/utils'

type SessionTreeRowProps = {
  row: SessionTreeRowModel
  childrenByParent: ReadonlyMap<string, Array<SessionTreeRowModel>>
  activeFriendlyId: string
  activeSessionKey?: string
  pinnedSessionKeys: ReadonlySet<string>
  onToggleExpanded: (sessionKey: string, expanded: boolean) => void
  onSelect?: () => void
  onTogglePin: (session: SessionMeta) => void
  sessionForkAvailable?: boolean
  forkingSessionKey?: string | null
  onFork?: (session: SessionMeta) => void
  onRename: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
  ancestorKeys?: ReadonlySet<string>
  rootCardId?: string
  cardRouteMode?: boolean
  childStatusByCardId?: ReadonlyMap<string, SessionCardChildStatus>
}

function getRelationshipLabel(
  row: SessionTreeRowModel,
  status?: SessionCardChildStatus,
): string | undefined {
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
    return status && status !== 'idle'
      ? `${relationship} · ${status}`
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
  activeFriendlyId,
  activeSessionKey,
  pinnedSessionKeys,
  onToggleExpanded,
  onSelect,
  onTogglePin,
  sessionForkAvailable = false,
  forkingSessionKey,
  onFork = () => {},
  onRename,
  onDelete,
  ancestorKeys = new Set<string>(),
  rootCardId,
  cardRouteMode = false,
  childStatusByCardId = new Map(),
}: SessionTreeRowProps) {
  const generatedId = useId().replaceAll(':', '')
  const childrenId = `session-tree-children-${generatedId}`
  const relationshipLabel = getRelationshipLabel(
    row,
    childStatusByCardId.get(row.key),
  )
  const childRows = childrenByParent.get(row.key) ?? []
  const nextAncestorKeys = new Set(ancestorKeys)
  nextAncestorKeys.add(row.key)

  return (
    <div
      data-session-key={row.session.key}
      data-session-depth={row.depth}
      data-card-id={row.depth === 0 ? row.key : undefined}
      data-card-child-id={row.depth > 0 ? row.key : undefined}
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
            aria-label={`${row.isExpanded ? 'Collapse' : 'Expand'} related sessions for ${row.session.friendlyId}`}
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
            session={row.session}
            routeKey={
              cardRouteMode ? (rootCardId ?? row.key) : row.session.friendlyId
            }
            active={
              row.depth === 0
                ? activeSessionKey
                  ? row.key === activeSessionKey
                  : row.session.friendlyId === activeFriendlyId
                : false
            }
            isPinned={row.depth === 0 && pinnedSessionKeys.has(row.key)}
            contextLabel={relationshipLabel}
            showActions={row.depth === 0}
            inspected={
              row.depth > 0 &&
              (row.session.friendlyId === activeFriendlyId ||
                row.session.key === activeFriendlyId)
            }
            onSelect={onSelect}
            onTogglePin={onTogglePin}
            canFork={sessionForkAvailable && isSessionForkEligible(row.session)}
            isForking={forkingSessionKey === row.session.backendKey}
            onFork={onFork}
            onRename={onRename}
            onDelete={onDelete}
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
                    activeFriendlyId={activeFriendlyId}
                    activeSessionKey={activeSessionKey}
                    pinnedSessionKeys={pinnedSessionKeys}
                    onToggleExpanded={onToggleExpanded}
                    onSelect={onSelect}
                    onTogglePin={onTogglePin}
                    sessionForkAvailable={sessionForkAvailable}
                    forkingSessionKey={forkingSessionKey}
                    onFork={onFork}
                    onRename={onRename}
                    onDelete={onDelete}
                    ancestorKeys={nextAncestorKeys}
                    rootCardId={rootCardId ?? row.key}
                    cardRouteMode={cardRouteMode}
                    childStatusByCardId={childStatusByCardId}
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
export type { SessionTreeRowProps }
