import { useEffect, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Chat01Icon } from '@hugeicons/core-free-icons'
import type { SessionMeta, SessionTreeRow } from '@/screens/chat/types'
import { buildSessionTree } from '@/screens/chat/session-lineage'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  sessions: Array<SessionMeta>
  activeFriendlyId: string
  onSelectSession: (key: string) => void
  onNewChat: () => void
}

function normalizeLabel(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function getSessionTitle(session: SessionMeta): string {
  const label = normalizeLabel(session.label)
  if (label) return label
  const derivedTitle = normalizeLabel(session.derivedTitle)
  if (derivedTitle) return derivedTitle
  const title = normalizeLabel(session.title)
  if (title) return title
  return `Session ${session.friendlyId.slice(0, 8)}`
}

function getRelationshipLabel(row: SessionTreeRow): string | undefined {
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
  activeFriendlyId,
  onSelectSession,
  onNewChat,
}: Props) {
  const activeSessionKey = useMemo(
    () =>
      sessions.find(
        (session) =>
          session.friendlyId === activeFriendlyId ||
          session.key === activeFriendlyId,
      )?.key,
    [activeFriendlyId, sessions],
  )
  const tree = useMemo(
    () => buildSessionTree(sessions, { activeSessionKey }),
    [activeSessionKey, sessions],
  )
  const activeTreeKey = activeSessionKey
    ? (tree.visibleKeyBySessionKey.get(activeSessionKey) ?? activeSessionKey)
    : undefined

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
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
            {sessions.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-primary-500">
                <HugeiconsIcon icon={Chat01Icon} size={24} strokeWidth={1.6} />
                <p className="text-sm">No sessions yet.</p>
                <p className="text-xs text-primary-400">
                  Start a conversation to see it here.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {tree.rows.map((row) => {
                  const { session } = row
                  const active = activeTreeKey
                    ? row.key === activeTreeKey
                    : session.friendlyId === activeFriendlyId
                  const timestamp = formatUpdatedAt(session.updatedAt)
                  const relationshipLabel = getRelationshipLabel(row)
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => onSelectSession(session.friendlyId)}
                      aria-current={active ? 'page' : undefined}
                      data-session-key={row.key}
                      data-session-depth={row.depth}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-accent-300 bg-accent-50'
                          : 'border-transparent bg-primary-50 hover:border-primary-200',
                      )}
                      style={
                        row.depth > 0
                          ? {
                              paddingInlineStart: `${12 + Math.min(row.depth, 8) * 16}px`,
                            }
                          : undefined
                      }
                    >
                      <div className="truncate text-sm font-medium text-ink">
                        {getSessionTitle(session)}
                      </div>
                      {relationshipLabel ? (
                        <div className="mt-0.5 truncate text-[11px] font-medium text-primary-600">
                          {relationshipLabel}
                        </div>
                      ) : null}
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-primary-500">
                        <span className="truncate">{session.friendlyId}</span>
                        {timestamp ? <span>{timestamp}</span> : null}
                      </div>
                    </button>
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
