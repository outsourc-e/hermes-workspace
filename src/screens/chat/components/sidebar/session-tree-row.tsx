'use client'

import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId } from 'react'
import { isSessionForkEligible } from '../../session-fork'
import { SessionItem } from './session-item'
import type {
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
}

function getRelationshipLabel(row: SessionTreeRowModel): string | undefined {
  const identityLabel =
    row.relationshipKind === 'branch'
      ? 'Branch'
      : row.relationshipKind === 'child'
        ? 'Delegated session'
        : row.isOrphan
          ? 'Original session unavailable'
          : undefined
  if (identityLabel) {
    return row.continuationCount > 1
      ? `${identityLabel} · ${row.continuationCount} segments`
      : identityLabel
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
}: SessionTreeRowProps) {
  const generatedId = useId().replaceAll(':', '')
  const childrenId = `session-tree-children-${generatedId}`
  const relationshipLabel = getRelationshipLabel(row)
  const childRows = childrenByParent.get(row.key) ?? []
  const nextAncestorKeys = new Set(ancestorKeys)
  nextAncestorKeys.add(row.key)

  return (
    <div data-session-key={row.key} data-session-depth={row.depth}>
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
            active={
              activeSessionKey
                ? row.key === activeSessionKey
                : row.session.friendlyId === activeFriendlyId
            }
            isPinned={pinnedSessionKeys.has(row.key)}
            contextLabel={relationshipLabel}
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
