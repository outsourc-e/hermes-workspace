import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ApprovalRequest } from '../lib/approvals-store'

type InlineApprovalCardProps = {
  approval: ApprovalRequest
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

export function InlineApprovalCard({ approval, onApprove, onDeny }: InlineApprovalCardProps) {
  const [resolved, setResolved] = useState<'approved' | 'denied' | null>(
    approval.status !== 'pending' ? approval.status : null,
  )

  const isPending = !resolved && approval.status === 'pending'
  const age = Date.now() - approval.requestedAt
  const ageLabel = age < 60_000
    ? `${Math.floor(age / 1000)}s ago`
    : age < 3_600_000
      ? `${Math.floor(age / 60_000)}m ago`
      : `${Math.floor(age / 3_600_000)}h ago`

  return (
    <div
      className={cn(
        'my-2 rounded-lg border p-3 transition-all',
        isPending
          ? 'border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/40 animate-pulse-subtle'
          : resolved === 'approved'
            ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
            : 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">
          {isPending ? '⚠️' : resolved === 'approved' ? '✅' : '🚫'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Approval Required
            </span>
            <span className="text-[10px] text-neutral-500">{ageLabel}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
            {approval.action}
          </p>
          {approval.context && (
            <pre className="mt-1.5 max-h-[80px] overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-100 p-1.5 font-mono text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              {approval.context.slice(0, 500)}
            </pre>
          )}
          {isPending ? (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setResolved('approved'); onApprove(approval.id) }}
                className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                ✓ Approve
              </button>
              <button
                type="button"
                onClick={() => { setResolved('denied'); onDeny(approval.id) }}
                className="rounded-md border border-red-300 bg-white px-3 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:bg-neutral-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                ✕ Deny
              </button>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] font-medium text-neutral-500">
              {resolved === 'approved' ? 'Approved' : 'Denied'}
              {approval.resolvedAt ? ` at ${new Date(approval.resolvedAt).toLocaleTimeString()}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
