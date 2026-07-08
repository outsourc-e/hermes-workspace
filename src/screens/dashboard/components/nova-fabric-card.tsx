import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  NovaFabric,
  NovaFabricApprovalLevel,
  NovaFabricConsolidationReviewRecord,
  NovaFabricEventRecord,
  NovaFabricReviewStatus,
  NovaFabricRiskLevel,
  NovaFabricSelfStateRecord,
  NovaFabricSourceMapRecord,
  NovaFabricVerificationState,
} from '@/server/nova-fabric-store'
import type { NovaWantsBoard } from '@/server/nova-wants-store'

type NovaFabricResponse = {
  ok: boolean
  fabric: NovaFabric | null
  storage?: {
    path: string
    backupPath: string
    tempPath: string
    seededFrom: string
  }
  degraded?: boolean
  warning?: string | null
  error?: string
}

type NovaWantsResponse = {
  ok: boolean
  board?: NovaWantsBoard
  error?: string
}

const RISK_STYLE: Record<NovaFabricRiskLevel, string> = {
  low: 'text-[var(--theme-muted)] border-[var(--theme-border)]',
  medium:
    'text-[var(--theme-warning)] border-[color-mix(in_srgb,var(--theme-warning)_42%,var(--theme-border))]',
  high: 'text-[var(--theme-danger)] border-[color-mix(in_srgb,var(--theme-danger)_42%,var(--theme-border))]',
  critical:
    'text-[var(--theme-danger)] border-[color-mix(in_srgb,var(--theme-danger)_70%,var(--theme-border))]',
}

const VERIFY_STYLE: Record<NovaFabricVerificationState, string> = {
  draft: 'text-[var(--theme-warning)]',
  inferred: 'text-[var(--theme-muted)]',
  'tool-verified': 'text-[var(--theme-success)]',
  'taylor-approved': 'text-[var(--theme-accent)]',
}

async function readNovaFabric(): Promise<NovaFabricResponse> {
  const response = await fetch('/api/nova-fabric')
  const body: NovaFabricResponse | null = await response
    .json()
    .catch(() => null)
  if (!response.ok || !body) {
    throw new Error(body?.error || `nova-fabric ${response.status}`)
  }
  return body
}

async function readNovaWants(): Promise<NovaWantsResponse> {
  const response = await fetch('/api/nova-wants')
  const body: NovaWantsResponse | null = await response.json().catch(() => null)
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error || `nova-wants ${response.status}`)
  }
  return body
}

async function mutateNovaFabric(
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
): Promise<NovaFabricResponse> {
  const response = await fetch('/api/nova-fabric', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload: NovaFabricResponse | null = await response
    .json()
    .catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `nova-fabric ${response.status}`)
  }
  return payload
}

function compactDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Pill({
  children,
  tone = 'normal',
}: {
  children: React.ReactNode
  tone?: 'normal' | 'risk' | 'accent'
}) {
  const toneClass =
    tone === 'risk'
      ? 'border-[color-mix(in_srgb,var(--theme-danger)_42%,var(--theme-border))] text-[var(--theme-danger)]'
      : tone === 'accent'
        ? 'border-[color-mix(in_srgb,var(--theme-accent)_42%,var(--theme-border))] text-[var(--theme-accent)]'
        : 'border-[var(--theme-border)] text-[var(--theme-muted)]'
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${toneClass}`}
    >
      {children}
    </span>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/72 p-3">
      <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
        {title}
      </h4>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function RecordMeta({
  riskLevel,
  approvalLevel,
  verificationState,
}: {
  riskLevel: NovaFabricRiskLevel
  approvalLevel: NovaFabricApprovalLevel
  verificationState: NovaFabricVerificationState
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span
        className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${RISK_STYLE[riskLevel]}`}
      >
        {riskLevel}
      </span>
      <Pill tone={approvalLevel === 'none' ? 'normal' : 'risk'}>
        {approvalLevel}
      </Pill>
      <span
        className={`font-mono text-[9px] uppercase tracking-[0.1em] ${VERIFY_STYLE[verificationState]}`}
      >
        {verificationState}
      </span>
    </div>
  )
}

function ContinuityList({ events }: { events: Array<NovaFabricEventRecord> }) {
  return (
    <div className="space-y-2">
      {events
        .slice(-6)
        .reverse()
        .map((event) => (
          <article
            key={event.id}
            className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/52 p-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[var(--theme-text)]">
                  {event.title}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
                  {event.summary}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
                {compactDate(event.createdAt)}
              </span>
            </div>
            <RecordMeta
              riskLevel={event.riskLevel}
              approvalLevel={event.approvalLevel}
              verificationState={event.verificationState}
            />
          </article>
        ))}
    </div>
  )
}

function SelfStateList({
  records,
  onPropose,
}: {
  records: Array<NovaFabricSelfStateRecord>
  onPropose: (record: NovaFabricSelfStateRecord) => void
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {records
        .filter((record) => record.current)
        .map((record) => (
          <article
            key={record.id}
            className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/52 p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[var(--theme-text)]">
                  {record.title}
                </div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                  v{record.version} / {record.category}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPropose(record)}
                className="rounded border border-[var(--theme-border)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-accent)]"
              >
                propose
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              {record.body}
            </p>
            <RecordMeta
              riskLevel={record.riskLevel}
              approvalLevel={record.approvalLevel}
              verificationState={record.verificationState}
            />
          </article>
        ))}
    </div>
  )
}

function SourceMapTable({
  records,
}: {
  records: Array<NovaFabricSourceMapRecord>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-[11px]">
        <thead className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
          <tr>
            <th className="pb-2">domain</th>
            <th className="pb-2">source of truth</th>
            <th className="pb-2">policy</th>
            <th className="pb-2">Mission Control behavior</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--theme-border)]">
          {records.map((record) => (
            <tr key={record.id}>
              <td className="py-2 pr-3 font-semibold text-[var(--theme-text)]">
                {record.domain}
              </td>
              <td className="py-2 pr-3 font-mono text-[10px] text-[var(--theme-muted)]">
                {record.sourceOfTruth}
              </td>
              <td className="py-2 pr-3">
                <Pill
                  tone={
                    record.policy === 'local-writable' ? 'accent' : 'normal'
                  }
                >
                  {record.policy}
                </Pill>
              </td>
              <td className="py-2 text-[var(--theme-muted)]">
                {record.missionControlBehavior}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReviewQueue({
  records,
  onStatus,
}: {
  records: Array<NovaFabricConsolidationReviewRecord>
  onStatus: (
    record: NovaFabricConsolidationReviewRecord,
    status: NovaFabricReviewStatus,
  ) => void
}) {
  const visible = records.filter((record) => record.status === 'pending')
  if (!visible.length) {
    return (
      <p className="text-[11px] text-[var(--theme-muted)]">
        No pending consolidation proposals.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {visible.slice(0, 5).map((record) => (
        <article
          key={record.id}
          className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/52 p-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[var(--theme-text)]">
                {record.title}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
                {record.reason}
              </p>
            </div>
            <Pill tone="risk">{record.targetType}</Pill>
          </div>
          <RecordMeta
            riskLevel={record.riskLevel}
            approvalLevel={record.approvalLevel}
            verificationState={record.verificationState}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onStatus(record, 'approved')}
              className="rounded border border-[var(--theme-accent-border)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-accent)]"
            >
              mark approved
            </button>
            <button
              type="button"
              onClick={() => onStatus(record, 'parked')}
              className="rounded border border-[var(--theme-border)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]"
            >
              park
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

export function NovaFabricCard() {
  const queryClient = useQueryClient()
  const [eventTitle, setEventTitle] = useState('')
  const [eventSummary, setEventSummary] = useState('')
  const [proposalTarget, setProposalTarget] =
    useState<NovaFabricSelfStateRecord | null>(null)
  const [proposalBody, setProposalBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fabricQuery = useQuery({
    queryKey: ['nova-fabric'],
    queryFn: readNovaFabric,
    staleTime: 5_000,
    refetchInterval: 30_000,
  })
  const wantsQuery = useQuery({
    queryKey: ['nova-wants'],
    queryFn: readNovaWants,
    staleTime: 10_000,
    refetchInterval: 45_000,
  })

  const mutation = useMutation({
    mutationFn: ({
      method,
      body,
    }: {
      method: 'POST' | 'PATCH'
      body: Record<string, unknown>
    }) => mutateNovaFabric(method, body),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['nova-fabric'] })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Nova Fabric update failed')
    },
  })

  const fabric = fabricQuery.data?.fabric ?? null
  const fabricLinkedWantCount = useMemo(() => {
    const cards = wantsQuery.data?.board?.cards ?? []
    return cards.filter(
      (card) =>
        card.fabricEventIds.length ||
        card.fabricSelfStateIds.length ||
        card.fabricSourceMapIds.length ||
        card.fabricReviewIds.length,
    ).length
  }, [wantsQuery.data?.board?.cards])

  const appendEvent = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate({
      method: 'POST',
      body: {
        action: 'append-event',
        title: eventTitle,
        summary: eventSummary,
        verificationState: 'draft',
      },
    })
    setEventTitle('')
    setEventSummary('')
  }

  const submitProposal = (event: FormEvent) => {
    event.preventDefault()
    if (!proposalTarget) return
    mutation.mutate({
      method: 'PATCH',
      body: {
        action: 'propose-self-state',
        targetId: proposalTarget.id,
        proposedDiff: { body: proposalBody },
        reason: 'Mission Control self-state proposal; requires Taylor review.',
      },
    })
    setProposalTarget(null)
    setProposalBody('')
  }

  if (fabricQuery.isLoading) {
    return (
      <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 text-sm text-[var(--theme-muted)]">
        Loading Nova Fabric...
      </div>
    )
  }

  if (fabricQuery.data?.degraded || !fabric) {
    return (
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--theme-danger)_45%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-danger)_10%,var(--theme-card))] p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-danger)]">
          Fabric degraded
        </div>
        <p className="mt-2 text-sm text-[var(--theme-text)]">
          {fabricQuery.data?.warning ||
            fabricQuery.error?.message ||
            'Fabric degraded: continuity file needs repair.'}
        </p>
        <p className="mt-2 font-mono text-[10px] text-[var(--theme-muted)]">
          {fabricQuery.data?.storage?.path}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]/82 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]">
            Nova Fabric
          </div>
          <h3 className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
            Continuity fabric
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--theme-muted)]">
            Local, source-linked continuity state. Mission Control is a lens;
            external systems stay read-only or proposal-gated here.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="accent">{fabric.events.length} events</Pill>
          <Pill>
            {fabric.selfState.filter((record) => record.current).length}{' '}
            self-state
          </Pill>
          <Pill>{fabric.sourceMap.length} sources</Pill>
          <Pill tone="risk">
            {
              fabric.reviewQueue.filter((record) => record.status === 'pending')
                .length
            }{' '}
            reviews
          </Pill>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--theme-danger)_45%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-danger)_10%,transparent)] p-2 text-xs text-[var(--theme-danger)]">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <Section title="Continuity">
          <ContinuityList events={fabric.events} />
          <form
            onSubmit={appendEvent}
            className="mt-3 rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/40 p-2"
          >
            <div className="grid gap-2 md:grid-cols-[0.8fr_1.2fr_auto]">
              <input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                required
                placeholder="Event title"
                className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-2 text-xs text-[var(--theme-text)] outline-none"
              />
              <input
                value={eventSummary}
                onChange={(event) => setEventSummary(event.target.value)}
                required
                placeholder="Meaningful continuity/work receipt"
                className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-2 text-xs text-[var(--theme-text)] outline-none"
              />
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-md border border-[var(--theme-accent-border)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-accent)] disabled:opacity-45"
              >
                append
              </button>
            </div>
          </form>
        </Section>

        <Section title="Self-State">
          <SelfStateList
            records={fabric.selfState}
            onPropose={(record) => {
              setProposalTarget(record)
              setProposalBody(record.body)
            }}
          />
          {proposalTarget ? (
            <form
              onSubmit={submitProposal}
              className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--theme-warning)_42%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-warning)_8%,transparent)] p-2"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-warning)]">
                risky edit becomes review proposal
              </div>
              <textarea
                value={proposalBody}
                onChange={(event) => setProposalBody(event.target.value)}
                className="mt-2 min-h-24 w-full resize-y rounded-md border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-2 text-xs text-[var(--theme-text)] outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  className="rounded border border-[var(--theme-accent-border)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-accent)]"
                >
                  create proposal
                </button>
                <button
                  type="button"
                  onClick={() => setProposalTarget(null)}
                  className="rounded border border-[var(--theme-border)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]"
                >
                  cancel
                </button>
              </div>
            </form>
          ) : null}
        </Section>

        <Section title="Source Map">
          <SourceMapTable records={fabric.sourceMap} />
        </Section>

        <Section title="Review Queue">
          <ReviewQueue
            records={fabric.reviewQueue}
            onStatus={(record, status) =>
              mutation.mutate({
                method: 'PATCH',
                body: {
                  action: 'update-review-status',
                  id: record.id,
                  status,
                },
              })
            }
          />
          <div className="mt-3 rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)]/45 p-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              Wants lens
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--theme-muted)]">
              {fabricLinkedWantCount} Nova Wants cards are linked to Fabric
              records. The board remains the request lane; this panel is the
              continuity spine.
            </p>
            <p className="mt-2 font-mono text-[9px] text-[var(--theme-muted)]">
              {fabricQuery.data?.storage?.path}
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}
