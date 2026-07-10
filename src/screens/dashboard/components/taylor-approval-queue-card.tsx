import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  TaylorApprovalItem,
  TaylorApprovalQueue,
} from '../../../server/taylor-approval-queue'

type QueueResponse = {
  ok: boolean
  queue: TaylorApprovalQueue
}

async function readQueue(): Promise<QueueResponse> {
  const response = await fetch('/api/taylor-approvals')
  if (!response.ok) throw new Error(`Approval queue read failed: ${response.status}`)
  return (await response.json()) as QueueResponse
}

const RISK_TONE: Record<string, string> = {
  critical: 'border-[var(--theme-danger)] text-[var(--theme-danger)]',
  high: 'border-[var(--theme-accent)] text-[var(--theme-accent)]',
  medium: 'border-[var(--theme-border)] text-[var(--theme-text)]',
  low: 'border-[var(--theme-border)] text-[var(--theme-muted)]',
}

const KIND_LABEL: Record<TaylorApprovalItem['kind'], string> = {
  'fabric-review': 'Fabric review',
  'self-state-proposal': 'Self-state proposal',
  'protected-want': 'Protected want',
  'blocked-action': 'Blocked action',
}

function RiskPill({ risk }: { risk: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${RISK_TONE[risk] ?? RISK_TONE.medium}`}
    >
      {risk}
    </span>
  )
}

function ItemRow({
  item,
  onStatus,
  busy,
}: {
  item: TaylorApprovalItem
  onStatus: (reviewId: string, status: 'approved' | 'rejected' | 'parked') => void
  busy: boolean
}) {
  return (
    <article className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/52 p-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--theme-text)]">
            {item.title}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
            {item.why}
          </p>
        </div>
        <RiskPill risk={item.riskLevel} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--theme-muted)]">
        <span>{KIND_LABEL[item.kind]}</span>
        <span aria-hidden="true">·</span>
        <span>{item.targetSystem}</span>
        {item.links.slice(0, 2).map((link) => (
          <span key={`${item.id}-${link.value}`} className="truncate">
            {link.label}: {link.value}
          </span>
        ))}
      </div>
      {item.actionable && item.reviewId ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {(['approved', 'rejected', 'parked'] as const).map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy}
              onClick={() => onStatus(item.reviewId as string, status)}
              className="rounded border border-[var(--theme-border)] px-2 py-0.5 text-[10px] text-[var(--theme-text)] hover:bg-[var(--theme-card)] disabled:opacity-50"
            >
              {status === 'approved'
                ? 'Approve'
                : status === 'rejected'
                  ? 'Reject'
                  : 'Park'}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-[var(--theme-muted)]">
          Read-only here — resolves at its source system.
        </p>
      )}
    </article>
  )
}

export function TaylorApprovalQueueCard() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['taylor-approvals'],
    queryFn: readQueue,
    staleTime: 5_000,
    refetchInterval: 30_000,
  })

  const mutation = useMutation({
    mutationFn: async (input: {
      reviewId: string
      status: 'approved' | 'rejected' | 'parked'
    }) => {
      const response = await fetch('/api/taylor-approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`Approval update failed: ${response.status}`)
      return (await response.json()) as QueueResponse
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['taylor-approvals'], data)
      void queryClient.invalidateQueries({ queryKey: ['nova-fabric'] })
      void queryClient.invalidateQueries({ queryKey: ['nova-wants'] })
    },
  })

  const queue = query.data?.queue

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--theme-text)]">
            Taylor approval queue
          </h3>
          <p className="text-[11px] text-[var(--theme-muted)]">
            Everything waiting on you, with server-side receipts behind every
            decision.
          </p>
        </div>
        {queue ? (
          <span className="text-[11px] text-[var(--theme-muted)]">
            {queue.counts.total} waiting · {queue.counts.actionable} actionable
          </span>
        ) : null}
      </header>
      {query.isLoading ? (
        <p className="text-[11px] text-[var(--theme-muted)]">Loading queue…</p>
      ) : null}
      {query.isError ? (
        <p className="text-[11px] text-[var(--theme-danger,var(--theme-accent))]">
          Approval queue unreachable — gateway or server offline.
        </p>
      ) : null}
      {queue?.degraded ? (
        <p className="text-[11px] text-[var(--theme-muted)]">
          Fabric snapshot degraded — showing partial queue.
        </p>
      ) : null}
      {queue && queue.items.length === 0 ? (
        <p className="text-[11px] text-[var(--theme-muted)]">
          Nothing needs you right now.
        </p>
      ) : null}
      <div className="space-y-2">
        {queue?.items.slice(0, 8).map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            busy={mutation.isPending}
            onStatus={(reviewId, status) =>
              mutation.mutate({ reviewId, status })
            }
          />
        ))}
      </div>
    </section>
  )
}
