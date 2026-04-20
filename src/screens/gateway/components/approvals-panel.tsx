// TODO(orphan): ApprovalsPanel is built but not imported or rendered anywhere.
// The active approval surface is ApprovalsBell (header dropdown).
// ApprovalsPanel is a sidebar-style panel variant — consider wiring it to replace
// or complement ApprovalsBell for a richer approvals experience.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchGatewayApprovals,
  resolveGatewayApproval,
  type GatewayApprovalEntry,
} from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import type { ApprovalRequest } from '../lib/approvals-store'

type ApprovalsPanelProps = {
  visible: boolean
  fallbackApprovals?: ApprovalRequest[]
  onPendingCountChange?: (count: number) => void
}

function timeAgo(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return 'unknown'
  const delta = Math.max(0, Date.now() - ms)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Agent name → badge color (deterministic, cycling)
const AGENT_BADGE_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
]

function agentBadgeClass(agentName: string): string {
  let hash = 0
  for (let i = 0; i < agentName.length; i++) {
    hash = (hash * 31 + agentName.charCodeAt(i)) | 0
  }
  return AGENT_BADGE_COLORS[Math.abs(hash) % AGENT_BADGE_COLORS.length]!
}

function approvalActionText(approval: GatewayApprovalEntry): string {
  if (typeof approval.action === 'string' && approval.action.trim().length > 0) {
    return approval.action
  }
  if (typeof approval.tool === 'string' && approval.tool.trim().length > 0) {
    return approval.tool
  }
  if (approval.input !== undefined) {
    try {
      return JSON.stringify(approval.input)
    } catch {
      return 'Approval requested'
    }
  }
  return 'Approval requested'
}

function approvalContextText(approval: GatewayApprovalEntry): string {
  if (typeof approval.context === 'string' && approval.context.trim().length > 0) {
    return approval.context
  }
  if (approval.input !== undefined) {
    try {
      return JSON.stringify(approval.input, null, 2)
    } catch {
      return ''
    }
  }
  return ''
}

type HistoryEntry = {
  id: string
  agentName: string
  action: string
  status: 'approved' | 'denied' | 'pending'
  timestamp: number
}

export function ApprovalsPanel({
  visible,
  fallbackApprovals = [],
  onPendingCountChange,
}: ApprovalsPanelProps) {
  const [pending, setPending] = useState<GatewayApprovalEntry[]>([])
  const [history, setHistory] = useState<GatewayApprovalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({})

  const refreshPending = useCallback(async () => {
    const response = await fetchGatewayApprovals()
    const rows = response.pending ?? response.approvals ?? []
    const normalized = rows.filter((entry) => (entry.status ?? 'pending') === 'pending')
    setPending(normalized)
    onPendingCountChange?.(normalized.length)
    return normalized
  }, [onPendingCountChange])

  const refreshHistory = useCallback(async () => {
    const response = await fetchGatewayApprovals()
    const rows = response.approvals ?? response.pending ?? []
    setHistory(rows.filter((entry) => (entry.status ?? 'pending') !== 'pending'))
  }, [])

  const refreshAll = useCallback(async () => {
    try {
      setError(null)
      await Promise.all([refreshPending(), refreshHistory()])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [refreshPending, refreshHistory])

  useEffect(() => {
    if (!visible) return
    void refreshAll()
    const interval = window.setInterval(() => {
      void refreshPending()
    }, 3_000)
    return () => window.clearInterval(interval)
  }, [refreshAll, refreshPending, visible])

  const localHistory = useMemo<HistoryEntry[]>(() => {
    return fallbackApprovals
      .filter((entry) => entry.status !== 'pending')
      .map((entry) => ({
        id: entry.id,
        agentName: entry.agentName,
        action: entry.action,
        status: entry.status === 'approved' ? 'approved' : 'denied',
        timestamp: entry.resolvedAt ?? entry.requestedAt,
      }))
  }, [fallbackApprovals])

  const mergedHistory = useMemo<HistoryEntry[]>(() => {
    const remote: HistoryEntry[] = history.map((entry) => ({
      id: entry.id,
      agentName: entry.agentName ?? entry.sessionKey ?? 'Gateway',
      action: approvalActionText(entry),
      status: entry.status === 'approved'
        ? 'approved'
        : entry.status === 'denied'
          ? 'denied'
          : 'pending',
      timestamp: entry.requestedAt ?? Date.now(),
    }))

    return [...remote, ...localHistory]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100)
  }, [history, localHistory])

  async function handleResolve(id: string, action: 'approve' | 'deny') {
    setResolvingIds((current) => ({ ...current, [id]: true }))
    try {
      const result = await resolveGatewayApproval(id, action)
      if (!result.ok) throw new Error('Failed to submit approval response')
      await Promise.all([refreshPending(), refreshHistory()])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResolvingIds((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  const pendingCount = pending.length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
            Approvals
          </span>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingCount} pending
            </span>
          ) : (
            <span className="rounded-full border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              All clear
            </span>
          )}
        </div>
        {pendingCount > 0 && (
          <span className="text-[10px] text-amber-500 dark:text-amber-400">⚠ Review required</span>
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && pending.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-sm text-neutral-500">Loading approvals...</p>
            </div>
          ) : null}

          {!loading && pending.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800">
                <span className="text-2xl">✅</span>
              </div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                No pending approvals
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Agents are running autonomously
              </p>
            </div>
          </div>
          ) : null}

          {pending.length > 0 ? (
            <div className="space-y-2 p-4">
              {pending.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                disabled={Boolean(resolvingIds[approval.id])}
                onApprove={() => void handleResolve(approval.id, 'approve')}
                onDeny={() => void handleResolve(approval.id, 'deny')}
              />
            ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 max-h-64 shrink-0 border-t border-neutral-200 bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              History
            </p>
            <span className="text-[10px] text-neutral-400">
              {mergedHistory.length} recent
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto px-4 pb-3">
            {mergedHistory.length === 0 ? (
              <p className="py-4 text-center text-xs text-neutral-400">
                No approval history yet
              </p>
            ) : (
              <div className="space-y-1.5">
                {mergedHistory.map((entry) => (
                  <div
                    key={`${entry.id}-${entry.timestamp}`}
                    className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                        {entry.agentName}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                          entry.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : entry.status === 'denied'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                        )}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-600 dark:text-neutral-400">
                      {entry.action}
                    </p>
                    <p className="mt-0.5 text-[10px] text-neutral-400">
                      {timeAgo(entry.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApprovalCard({
  approval,
  disabled,
  onApprove,
  onDeny,
}: {
  approval: GatewayApprovalEntry
  disabled: boolean
  onApprove: () => void
  onDeny: () => void
}) {
  const isPending = (approval.status ?? 'pending') === 'pending'
  const agentName = approval.agentName ?? approval.sessionKey ?? 'Gateway'
  const action = approvalActionText(approval)
  const context = approvalContextText(approval)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border transition-all duration-200',
        isPending
          ? 'border border-l-4 border-amber-200 border-l-amber-500 bg-amber-50/30 shadow-sm dark:border-amber-800/40 dark:border-l-amber-500 dark:bg-amber-950/10'
          : 'border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900',
      )}
    >
      <div className="p-4">
        {/* Agent badge + time */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold',
              agentBadgeClass(agentName),
            )}
          >
            {agentName}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-neutral-400">
            {timeAgo(approval.requestedAt)}
          </span>
        </div>

        {/* Action — monospace */}
        <p className="mb-1.5 font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">
          {action}
        </p>

        {/* Context snippet */}
        <p className="mb-3 line-clamp-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          {context}
        </p>

        {/* Actions or resolved label */}
        {isPending ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={disabled}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-all duration-200 hover:bg-emerald-700"
            >
              ✓ Approve
            </button>
            <button
              type="button"
              onClick={onDeny}
              disabled={disabled}
              className="flex-1 rounded-lg border border-red-400 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-all duration-200 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/20"
            >
              ✕ Deny
            </button>
          </div>
        ) : (
          <p
            className={cn(
              'text-[11px] font-semibold',
              approval.status === 'approved'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400',
            )}
          >
            {approval.status === 'approved' ? '✓ Approved' : '✕ Denied'}
          </p>
        )}
      </div>
    </div>
  )
}
