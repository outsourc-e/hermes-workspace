'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { memo, useEffect, useMemo, useState } from 'react'
import { buildSessionTree } from '../../session-lineage'
import { SessionTreeRow } from './session-tree-row'
import type {
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

export const SidebarSessions = memo(function SidebarSessions({
  sessions,
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

  const [collapsedLogicalRootKeys, setCollapsedLogicalRootKeys] = useState<
    Set<string>
  >(() => new Set())
  const activeSessionKey = useMemo(
    () =>
      sessions.find(
        (session) =>
          session.friendlyId === activeFriendlyId ||
          session.key === activeFriendlyId,
      )?.key,
    [activeFriendlyId, sessions],
  )
  const projectionTree = useMemo(
    () => buildSessionTree(sessions, { activeSessionKey }),
    [activeSessionKey, sessions],
  )
  const expandedSessionKeys = useMemo(
    () =>
      sessions
        .filter(
          (session) =>
            !collapsedLogicalRootKeys.has(
              projectionTree.logicalRootKeyBySessionKey.get(session.key) ??
                session.key,
            ),
        )
        .map((session) => session.key),
    [collapsedLogicalRootKeys, projectionTree, sessions],
  )
  const tree = useMemo(
    () =>
      buildSessionTree(sessions, {
        activeSessionKey,
        expandedSessionKeys,
      }),
    [activeSessionKey, expandedSessionKeys, sessions],
  )
  const childrenByParent = useMemo(() => {
    const children = new Map<string, Array<SessionTreeRowModel>>()
    for (const row of tree.rows) {
      if (!row.parentKey) continue
      const siblings = children.get(row.parentKey) ?? []
      siblings.push(row)
      children.set(row.parentKey, siblings)
    }
    return children
  }, [tree.rows])
  const activeTreeKey = activeSessionKey
    ? (tree.visibleKeyBySessionKey.get(activeSessionKey) ?? activeSessionKey)
    : undefined
  const logicalPinnedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const pinnedKey of pinnedSessionKeys) {
      keys.add(tree.visibleKeyBySessionKey.get(pinnedKey) ?? pinnedKey)
    }
    return keys
  }, [pinnedSessionKeys, tree.visibleKeyBySessionKey])
  useEffect(() => {
    if (loading || fetching || error) return
    for (const pinnedKey of pinnedSessionKeys) {
      const visibleKey = tree.visibleKeyBySessionKey.get(pinnedKey)
      if (visibleKey && visibleKey !== pinnedKey) {
        migratePinnedSession(pinnedKey, visibleKey)
      }
    }
  }, [
    error,
    fetching,
    loading,
    migratePinnedSession,
    pinnedSessionKeys,
    tree.visibleKeyBySessionKey,
  ])
  const pinnedRows = useMemo(
    () =>
      tree.rows
        .filter((row) => logicalPinnedKeys.has(row.key))
        .map((row) => ({
          ...row,
          depth: 0,
          isExpandable: false,
          isExpanded: false,
          childCount: 0,
          parentKey: undefined,
        })),
    [logicalPinnedKeys, tree.rows],
  )
  const unpinnedProjection = useMemo(() => {
    const roots: Array<SessionTreeRowModel> = []
    const children = new Map<string, Array<SessionTreeRowModel>>()

    function appendRows(
      rows: Array<SessionTreeRowModel>,
      depth: number,
      parentKey?: string,
    ): Array<SessionTreeRowModel> {
      const projectedRows: Array<SessionTreeRowModel> = []
      for (const row of rows) {
        const childRows = childrenByParent.get(row.key) ?? []
        if (logicalPinnedKeys.has(row.key)) {
          projectedRows.push(...appendRows(childRows, depth, parentKey))
          continue
        }

        const projectedChildren = appendRows(childRows, depth + 1, row.key)
        const projectedRow: SessionTreeRowModel = {
          ...row,
          depth,
          isExpandable: projectedChildren.length > 0,
          isExpanded: projectedChildren.length > 0 && row.isExpanded,
          childCount: projectedChildren.length,
          ...(parentKey ? { parentKey } : { parentKey: undefined }),
        }
        projectedRows.push(projectedRow)
        if (projectedChildren.length > 0) {
          children.set(projectedRow.key, projectedChildren)
        }
      }
      return projectedRows
    }

    roots.push(...appendRows(tree.roots, 0))
    return { roots, children }
  }, [childrenByParent, logicalPinnedKeys, tree.roots])

  function handleTogglePin(session: SessionMeta) {
    const storedKeys = pinnedSessionKeys.filter(
      (pinnedKey) =>
        (tree.visibleKeyBySessionKey.get(pinnedKey) ?? pinnedKey) ===
        session.key,
    )
    if (storedKeys.length > 0) {
      for (const key of storedKeys) togglePinnedSession(key)
      return
    }
    togglePinnedSession(session.key)
  }

  function handleToggleExpanded(sessionKey: string, expanded: boolean) {
    const logicalRootKey =
      tree.logicalRootKeyBySessionKey.get(sessionKey) ?? sessionKey
    setCollapsedLogicalRootKeys((current) => {
      const next = new Set(current)
      if (expanded) next.delete(logicalRootKey)
      else next.add(logicalRootKey)
      return next
    })
  }

  function renderRoots(
    roots: Array<SessionTreeRowModel>,
    rowChildren: ReadonlyMap<string, Array<SessionTreeRowModel>>,
  ) {
    return roots.map((row) => (
      <SessionTreeRow
        key={row.key}
        row={row}
        childrenByParent={rowChildren}
        activeFriendlyId={activeFriendlyId}
        activeSessionKey={activeTreeKey}
        pinnedSessionKeys={logicalPinnedKeys}
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

      {/* Pinned sessions — always visible (outside collapsible panel) */}
      {pinnedRows.length > 0 ? (
        <section
          aria-label="Pinned sessions"
          className="flex shrink-0 flex-col gap-px pl-3 pr-2 pt-1"
        >
          {renderRoots(pinnedRows, new Map())}
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
              ) : unpinnedProjection.roots.length > 0 ? (
                <>
                  {pinnedRows.length > 0 ? (
                    <div className="my-1 border-t border-primary-200/80" />
                  ) : null}
                  <section aria-label="Sessions">
                    {renderRoots(
                      unpinnedProjection.roots,
                      unpinnedProjection.children,
                    )}
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
