'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ApprovalRequest } from '../lib/approvals-store'

type ApprovalsBellProps = {
  approvals: ApprovalRequest[]
  onApprove: (id: string) => Promise<boolean> | void
  onDeny: (id: string) => Promise<boolean> | void
}

function timeAgo(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const s = Math.floor(delta / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export function ApprovalsBell({ approvals, onApprove, onDeny }: ApprovalsBellProps) {
  const [open, setOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [prevCount, setPrevCount] = useState(0)
  const [actingIds, setActingIds] = useState<Record<string, 'approve' | 'deny'>>({})
  const ref = useRef<HTMLDivElement>(null)

  const pending = useMemo(
    () => approvals.filter((entry) => entry.status === 'pending').sort((a, b) => b.requestedAt - a.requestedAt),
    [approvals],
  )
  const count = pending.length
  const latestThree = pending.slice(0, 3)

  useEffect(() => {
    if (count > prevCount) {
      setPulse(true)
      const timer = window.setTimeout(() => setPulse(false), 1200)
      setPrevCount(count)
      return () => window.clearTimeout(timer)
    }
    setPrevCount(count)
  }, [count, prevCount])

  useEffect(() => {
    if (count === 0) {
      setOpen(false)
      setActingIds({})
      return
    }

    setActingIds((current) => {
      const pendingIds = new Set(pending.map((entry) => entry.id))
      const next: Record<string, 'approve' | 'deny'> = {}
      for (const [id, action] of Object.entries(current)) {
        if (pendingIds.has(id)) next[id] = action
      }
      return next
    })
  }, [count, pending])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleQuickAction(id: string, action: 'approve' | 'deny') {
    setActingIds((current) => ({ ...current, [id]: action }))
    try {
      if (action === 'approve') {
        await Promise.resolve(onApprove(id))
      } else {
        await Promise.resolve(onDeny(id))
      }
    } finally {
      setActingIds((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
          count > 0
            ? open
              ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30'
            : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
          pulse && 'ring-2 ring-amber-400/50',
        )}
        aria-label={`Approvals${count > 0 ? ` — ${count} pending` : ''}`}
      >
        {pulse ? (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-lg border-2 border-amber-400 opacity-30" />
        ) : null}

        <span aria-hidden className="text-sm leading-none">{count > 0 ? '🔔' : '🔕'}</span>

        {count > 0 ? (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            'absolute right-0 top-full z-50 mt-2 flex w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white',
            'shadow-[0_8px_30px_rgba(0,0,0,0.15)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
          )}
          role="dialog"
          aria-label="Pending approvals"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--theme-text)]">Approvals</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {count} pending
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="max-h-[420px] flex-1 space-y-2 overflow-y-auto p-3">
            {latestThree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="mb-2 text-2xl">🛡️</span>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">All clear</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">No pending approvals</p>
              </div>
            ) : (
              latestThree.map((approval) => {
                const busy = actingIds[approval.id]
                return (
                  <article
                    key={approval.id}
                    className={cn(
                      'rounded-lg border p-3',
                      approval.source === 'gateway'
                        ? 'border-violet-200/60 bg-violet-50/40 dark:border-violet-500/20 dark:bg-violet-900/10'
                        : 'border-amber-200/70 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-900/10',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">{approval.agentName}</p>
                      <span className="shrink-0 text-[10px] text-neutral-400">{timeAgo(approval.requestedAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-neutral-700 dark:text-neutral-300">{approval.action}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleQuickAction(approval.id, 'approve')}
                        disabled={Boolean(busy)}
                        className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy === 'approve' ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleQuickAction(approval.id, 'deny')}
                        disabled={Boolean(busy)}
                        className="flex-1 rounded-lg border border-red-200 bg-white py-1.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/50 dark:bg-neutral-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {busy === 'deny' ? 'Denying...' : 'Deny'}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          {count > latestThree.length ? (
            <div className="border-t border-neutral-200 px-4 py-2 text-[10px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              +{count - latestThree.length} more pending in Approvals tab
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
