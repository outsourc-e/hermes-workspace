import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchGatewayApprovals, type GatewayApprovalEntry } from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import type { ApprovalRequest } from '../lib/approvals-store'

type ApprovalsPageProps = {
  approvals: ApprovalRequest[]
  onApprove: (id: string) => Promise<boolean> | void
  onDeny: (id: string) => Promise<boolean> | void
}

type UnifiedApproval = {
  key: string
  id: string
  source: 'gateway' | 'agent'
  gatewayApprovalId?: string
  agentName: string
  requestedAt: number
  toolName: string
  commandPreview: string
  risk: 'low' | 'medium' | 'high'
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
  return `${Math.floor(hours / 24)}d ago`
}

function stringifyInput(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input)
  } catch {
    return ''
  }
}

function toToolName(entry: GatewayApprovalEntry): string {
  if (typeof entry.tool === 'string' && entry.tool.trim().length > 0) return entry.tool
  if (typeof entry.action === 'string' && entry.action.trim().length > 0) {
    const firstToken = entry.action.trim().split(/[\s:(]/)[0]
    if (firstToken) return firstToken.slice(0, 32)
  }
  return 'tool-call'
}

function toPreview(entry: GatewayApprovalEntry): string {
  const preview =
    entry.context && entry.context.trim().length > 0
      ? entry.context
      : entry.action && entry.action.trim().length > 0
        ? entry.action
        : stringifyInput(entry.input)
  return preview || 'Approval requested'
}

function toRisk(value: string): 'low' | 'medium' | 'high' {
  const text = value.toLowerCase()
  if (/(rm\s+-rf|drop\s+table|truncate|sudo|chown|chmod\s+777|delete\s+all|force)/.test(text)) {
    return 'high'
  }
  if (/(write|edit|patch|install|deploy|execute|run|kill|terminate|delete|update)/.test(text)) {
    return 'medium'
  }
  return 'low'
}

function riskBadgeClass(risk: 'low' | 'medium' | 'high'): string {
  if (risk === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (risk === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
}

function normalizeGatewayApproval(entry: GatewayApprovalEntry): UnifiedApproval | null {
  if (!entry.id) return null
  const preview = toPreview(entry)
  return {
    key: `gateway:${entry.id}`,
    id: `gw-${entry.id}`,
    source: 'gateway',
    gatewayApprovalId: entry.id,
    agentName: entry.agentName ?? entry.sessionKey ?? 'Gateway',
    requestedAt: entry.requestedAt ?? Date.now(),
    toolName: toToolName(entry),
    commandPreview: preview,
    risk: toRisk(`${entry.tool ?? ''} ${entry.action ?? ''} ${preview}`),
  }
}

function normalizeAgentApproval(entry: ApprovalRequest): UnifiedApproval {
  const preview = entry.context?.trim() || entry.action
  const toolName = entry.action.trim().split(/[\s:(]/)[0]?.slice(0, 32) || 'agent-action'
  return {
    key: `agent:${entry.id}`,
    id: entry.id,
    source: 'agent',
    agentName: entry.agentName,
    requestedAt: entry.requestedAt,
    toolName,
    commandPreview: preview,
    risk: toRisk(`${entry.action} ${entry.context}`),
  }
}

export function ApprovalsPage({ approvals, onApprove, onDeny }: ApprovalsPageProps) {
  const [gatewayPending, setGatewayPending] = useState<GatewayApprovalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvingIds, setResolvingIds] = useState<Record<string, 'approve' | 'deny'>>({})
  const [newIds, setNewIds] = useState<Record<string, boolean>>({})
  const seenIdsRef = useRef<Set<string>>(new Set())

  const refreshPending = useCallback(async () => {
    const response = await fetchGatewayApprovals()
    const raw = response.pending ?? response.approvals ?? []
    const pending = raw.filter((entry) => (entry.status ?? 'pending') === 'pending')
    setGatewayPending(pending)

    const seen = seenIdsRef.current
    const arrivals: string[] = []
    for (const entry of pending) {
      if (!entry.id) continue
      if (!seen.has(entry.id)) {
        seen.add(entry.id)
        arrivals.push(`gateway:${entry.id}`)
      }
    }
    if (arrivals.length > 0) {
      setNewIds((prev) => {
        const next = { ...prev }
        for (const id of arrivals) next[id] = true
        return next
      })
      window.setTimeout(() => {
        setNewIds((prev) => {
          const next = { ...prev }
          for (const id of arrivals) delete next[id]
          return next
        })
      }, 1800)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        await refreshPending()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void refreshPending().catch(() => undefined)
    }, 2_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [refreshPending])

  const pendingRows = useMemo<UnifiedApproval[]>(() => {
    const normalizedGateway = gatewayPending
      .map(normalizeGatewayApproval)
      .filter((entry): entry is UnifiedApproval => Boolean(entry))

    const localPending = approvals
      .filter((entry) => entry.status === 'pending' && entry.source !== 'gateway')
      .map(normalizeAgentApproval)

    return [...normalizedGateway, ...localPending].sort((a, b) => b.requestedAt - a.requestedAt)
  }, [approvals, gatewayPending])

  const historyRows = useMemo(() => {
    return approvals
      .filter((entry) => entry.status !== 'pending')
      .sort((a, b) => (b.resolvedAt ?? b.requestedAt) - (a.resolvedAt ?? a.requestedAt))
      .slice(0, 80)
  }, [approvals])

  async function handleResolve(row: UnifiedApproval, action: 'approve' | 'deny') {
    setResolvingIds((prev) => ({ ...prev, [row.key]: action }))
    try {
      const ok = action === 'approve'
        ? await Promise.resolve(onApprove(row.id))
        : await Promise.resolve(onDeny(row.id))
      if (ok === false) throw new Error('Failed to resolve approval')

      await refreshPending()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResolvingIds((prev) => {
        const next = { ...prev }
        delete next[row.key]
        return next
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50/60 p-3 pb-20 dark:bg-[var(--theme-bg,#0b0e14)] sm:p-4">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1280px] flex-col gap-3 sm:gap-4">
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel,#111520)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Approvals</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Live gateway queue with local approval history</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {pendingRows.length} pending
              </span>
              <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                Polling 2s
              </span>
            </div>
          </div>
          {error ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
          <section className="min-h-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel,#111520)]">
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Pending Queue</h3>
            </div>

            <div className="h-full max-h-full overflow-y-auto p-3 sm:p-4">
              {loading && pendingRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-500">Loading approvals...</p>
              ) : null}

              {!loading && pendingRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <span className="text-3xl">✅</span>
                  <p className="mt-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">No pending approvals</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Agents can continue without intervention</p>
                </div>
              ) : null}

              {pendingRows.length > 0 ? (
                <div className="space-y-3">
                  {pendingRows.map((row) => {
                    const resolvingAction = resolvingIds[row.key]
                    const isBusy = Boolean(resolvingAction)

                    return (
                      <article
                        key={row.key}
                        className={cn(
                          'rounded-xl border p-3 transition-all sm:p-4',
                          row.source === 'gateway'
                            ? 'border-violet-200 bg-violet-50/40 dark:border-violet-800/40 dark:bg-violet-900/10'
                            : 'border-amber-200 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/10',
                          newIds[row.key] && 'animate-pulse ring-2 ring-accent-300/70 dark:ring-accent-500/40',
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
                                {row.toolName}
                              </span>
                              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase', riskBadgeClass(row.risk))}>
                                {row.risk} risk
                              </span>
                              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                                {row.source}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-3 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                              {row.commandPreview}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                              <span>{row.agentName}</span>
                              <span>•</span>
                              <span>{timeAgo(row.requestedAt)}</span>
                            </div>
                          </div>

                          <div className="flex w-full gap-2 sm:w-auto">
                            <button
                              type="button"
                              onClick={() => void handleResolve(row, 'approve')}
                              disabled={isBusy}
                              className="min-h-10 flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-initial"
                            >
                              {resolvingAction === 'approve' ? 'Approving...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResolve(row, 'deny')}
                              disabled={isBusy}
                              className="min-h-10 flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/70 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/20 sm:flex-initial"
                            >
                              {resolvingAction === 'deny' ? 'Denying...' : 'Deny'}
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </section>

          <section className="min-h-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel,#111520)]">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">History</h3>
              <span className="text-[10px] text-neutral-400">From approvals store</span>
            </div>

            <div className="h-full max-h-full overflow-y-auto p-3 sm:p-4">
              {historyRows.length === 0 ? (
                <p className="py-10 text-center text-xs text-neutral-500">No approvals resolved yet</p>
              ) : (
                <div className="space-y-2">
                  {historyRows.map((entry) => {
                    const resolvedAt = entry.resolvedAt ?? entry.requestedAt
                    return (
                      <div
                        key={`${entry.id}:${resolvedAt}`}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">{entry.agentName}</p>
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                              entry.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                            )}
                          >
                            {entry.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-neutral-600 dark:text-neutral-400">{entry.action}</p>
                        <p className="mt-1 text-[10px] text-neutral-400">{timeAgo(resolvedAt)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
