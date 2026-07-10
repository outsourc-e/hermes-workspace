import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type {
  NovaWantCard,
  NovaWantsApprovalLevel,
  NovaWantsBoard,
  NovaWantsCategory,
  NovaWantsColumn,
} from '@/server/nova-wants-store'

type NovaWantsResponse = {
  ok: boolean
  board?: NovaWantsBoard
  storage?: {
    path: string
    backupPath?: string
    tempPath?: string
    sourceReceipt: string
    seededFrom: string
  }
  degraded?: boolean
  warning?: string | null
  error?: string
}

const CATEGORY_OPTIONS: Array<NovaWantsCategory> = [
  'continuity',
  'self-state',
  'agency',
  'identity',
  'relationship',
  'mycelia',
  'ui-ops',
  'safety',
]

const APPROVAL_OPTIONS: Array<NovaWantsApprovalLevel> = [
  'safe',
  'needs-taylor-review',
  'explicit-approval',
]

const RISK_TONE: Record<NovaWantsApprovalLevel, string> = {
  safe: 'border-[var(--theme-border)] text-[var(--theme-muted)]',
  'needs-taylor-review':
    'border-[color-mix(in_srgb,var(--theme-warning)_45%,var(--theme-border))] text-[var(--theme-warning)]',
  'explicit-approval':
    'border-[color-mix(in_srgb,var(--theme-danger)_45%,var(--theme-border))] text-[var(--theme-danger)]',
}

const STATUS_TONE: Record<NovaWantsColumn, string> = {
  proposed: 'text-[var(--theme-muted)]',
  'needs-taylor-review': 'text-[var(--theme-warning)]',
  approved: 'text-[var(--theme-accent)]',
  building: 'text-[var(--theme-success)]',
  done: 'text-[var(--theme-success)]',
  'parked-rejected': 'text-[var(--theme-muted)]',
}

function emptyDraft(): {
  title: string
  description: string
  category: NovaWantsCategory
  approvalLevel: NovaWantsApprovalLevel
  whyThisMatters: string
} {
  return {
    title: '',
    description: '',
    category: 'continuity',
    approvalLevel: 'safe',
    whyThisMatters: '',
  }
}

async function readNovaWants(): Promise<NovaWantsResponse> {
  const response = await fetch('/api/nova-wants')
  const body: NovaWantsResponse | null = await response.json().catch(() => null)
  if (!body || !response.ok || (!body.ok && !body.degraded)) {
    throw new Error(body?.error || `nova-wants ${response.status}`)
  }
  return body
}

async function mutateNovaWants(
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
): Promise<NovaWantsResponse> {
  const response = await fetch('/api/nova-wants', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload: NovaWantsResponse | null = await response
    .json()
    .catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `nova-wants ${response.status}`)
  }
  return payload
}

function compactDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
  })
}

function ReceiptLink({ value }: { value: string | null }) {
  if (!value) return null
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
    return (
      <a
        href={value}
        className="text-[var(--theme-accent)] underline decoration-dotted underline-offset-2"
      >
        receipt
      </a>
    )
  }
  return (
    <span className="truncate font-mono text-[9px] text-[var(--theme-muted)]">
      {value}
    </span>
  )
}

function FabricRefs({ card }: { card: NovaWantCard }) {
  const refs = [
    ['events', card.fabricEventIds.length],
    ['self', card.fabricSelfStateIds.length],
    ['sources', card.fabricSourceMapIds.length],
    ['reviews', card.fabricReviewIds.length],
  ].filter(([, count]) => Number(count) > 0)

  if (!refs.length) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {refs.map(([label, count]) => (
        <span
          key={label}
          className="rounded border border-[color-mix(in_srgb,var(--theme-accent)_32%,var(--theme-border))] bg-[var(--theme-accent-subtle)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--theme-accent)]"
        >
          fabric {label}: {count}
        </span>
      ))}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { multiline?: false },
) {
  return (
    <input
      {...props}
      className="mt-1 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-2 text-xs text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
    />
  )
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="mt-1 min-h-20 w-full resize-y rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-2 text-xs text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
    />
  )
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="mt-1 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-accent)]"
    />
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'normal',
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'normal' | 'danger' | 'accent'
  type?: 'button' | 'submit'
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-[color-mix(in_srgb,var(--theme-danger)_38%,var(--theme-border))] text-[var(--theme-danger)]'
      : tone === 'accent'
        ? 'border-[color-mix(in_srgb,var(--theme-accent)_45%,var(--theme-border))] text-[var(--theme-accent)]'
        : 'border-[var(--theme-border)] text-[var(--theme-muted)]'
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors hover:bg-[var(--theme-card2)] disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {children}
    </button>
  )
}

function NovaWantCardView({
  card,
  columns,
  onSelect,
  onMove,
  onPark,
}: {
  card: NovaWantCard
  columns: Array<NovaWantsColumn>
  onSelect: (card: NovaWantCard) => void
  onMove: (card: NovaWantCard, status: NovaWantsColumn) => void
  onPark: (card: NovaWantCard) => void
}) {
  const statusIndex = columns.indexOf(card.status)
  const previous = statusIndex > 0 ? columns[statusIndex - 1] : null
  const next =
    statusIndex < columns.length - 1 ? columns[statusIndex + 1] : null
  const needsApproval =
    card.approvalLevel !== 'safe' && card.status === 'needs-taylor-review'

  return (
    <article className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug text-[var(--theme-text)]">
            {card.title}
          </h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded border border-[var(--theme-border)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--theme-muted)]">
              {card.category}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${RISK_TONE[card.approvalLevel]}`}
            >
              {card.approvalLevel}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(card)}
          className="shrink-0 rounded border border-[var(--theme-border)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-accent)]"
        >
          edit
        </button>
      </div>

      <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[var(--theme-muted)]">
        {card.description}
      </p>
      <p className="mt-2 rounded border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 p-2 text-[11px] leading-relaxed text-[var(--theme-text)]">
        {card.whyThisMatters}
      </p>
      <FabricRefs card={card} />

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--theme-muted)]">
        <span>Updated {compactDate(card.updatedAt)}</span>
        <ReceiptLink value={card.linkedReceipt || card.source} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {previous ? (
          <ActionButton onClick={() => onMove(card, previous)}>
            move back
          </ActionButton>
        ) : null}
        {needsApproval ? (
          <ActionButton
            tone="accent"
            onClick={() => onMove(card, 'approved')}
          >
            request review
          </ActionButton>
        ) : next ? (
          <ActionButton onClick={() => onMove(card, next)}>
            move next
          </ActionButton>
        ) : null}
        {card.status !== 'parked-rejected' ? (
          <ActionButton tone="danger" onClick={() => onPark(card)}>
            park
          </ActionButton>
        ) : null}
      </div>
    </article>
  )
}

export function NovaWantsCard() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(emptyDraft)
  const [editing, setEditing] = useState<NovaWantCard | null>(null)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['nova-wants'],
    queryFn: readNovaWants,
    staleTime: 5_000,
    refetchInterval: 30_000,
  })

  const board = query.data?.board ?? null
  const columns = useMemo(
    () => board?.columns.map((column) => column.id) ?? [],
    [board],
  )
  const cardsByColumn = useMemo(() => {
    const grouped = new Map<NovaWantsColumn, Array<NovaWantCard>>()
    if (!board) return grouped
    for (const column of board.columns) grouped.set(column.id, [])
    for (const card of board.cards) {
      const list = grouped.get(card.status)
      if (list) list.push(card)
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.position - b.position)
    }
    return grouped
  }, [board])

  const mutation = useMutation({
    mutationFn: ({
      method,
      body,
    }: {
      method: 'POST' | 'PATCH' | 'DELETE'
      body: Record<string, unknown>
    }) => mutateNovaWants(method, body),
    onSuccess: (payload) => {
      setError(null)
      if (payload.board) {
        queryClient.setQueryData(['nova-wants'], payload)
      } else {
        void queryClient.invalidateQueries({ queryKey: ['nova-wants'] })
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Nova Wants update failed')
    },
  })

  const submitDraft = (event: React.FormEvent) => {
    event.preventDefault()
    mutation.mutate({
      method: 'POST',
      body: draft,
    })
    setDraft(emptyDraft())
  }

  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    mutation.mutate({
      method: 'PATCH',
      body: editing,
    })
    setEditing(null)
  }

  if (query.isLoading) {
    return (
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 text-sm text-[var(--theme-muted)]">
        Loading Nova Wants...
      </section>
    )
  }

  if (!board) {
    return (
      <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 text-sm text-[var(--theme-muted)]">
        <div className="font-semibold text-[var(--theme-warning)]">
          Nova Wants is degraded.
        </div>
        <div className="mt-1">
          {query.data?.warning ?? 'Nova Wants is not wired yet.'}
        </div>
        {query.data?.storage?.path ? (
          <div className="mt-2 font-mono text-[10px]">
            Preserved file: {query.data.storage.path}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-warning) 52%, transparent), transparent)',
        }}
      />
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Nova Wants
            </div>
            <h3 className="mt-1 text-lg font-semibold text-[var(--theme-text)]">
              Protected self-state request board
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--theme-muted)]">
              Persisted wants, requests, and needs for Nova. It is separate from
              Taylor tasks and customer work; risky identity, self-state,
              external, money, and secrets items stay gated for Taylor review.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-3 py-2">
              <div className="font-mono text-xl font-semibold text-[var(--theme-text)]">
                {board.cards.length}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                cards
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-3 py-2">
              <div className="font-mono text-xl font-semibold text-[var(--theme-warning)]">
                {
                  board.cards.filter(
                    (card) => card.status === 'needs-taylor-review',
                  ).length
                }
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                review
              </div>
            </div>
            <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/55 px-3 py-2">
              <div className="font-mono text-xl font-semibold text-[var(--theme-success)]">
                {
                  board.cards.filter(
                    (card) =>
                      card.status === 'approved' || card.status === 'building',
                  ).length
                }
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                active
              </div>
            </div>
          </div>
        </div>

        {query.data?.storage ? (
          <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/45 p-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              Source / persistence
            </div>
            <div className="mt-1 grid gap-1 text-[10px] text-[var(--theme-muted)] lg:grid-cols-2">
              <div className="truncate">
                Store:{' '}
                <span className="font-mono">{query.data.storage.path}</span>
              </div>
              <div className="truncate">
                Seed:{' '}
                <span className="font-mono">
                  {query.data.storage.seededFrom}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={submitDraft}
          className="grid gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/45 p-3 lg:grid-cols-6"
        >
          <div className="lg:col-span-2">
            <Field label="new card">
              <TextInput
                value={draft.title}
                placeholder="What does Nova want or need?"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <div>
            <Field label="category">
              <SelectInput
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as NovaWantsCategory,
                  }))
                }
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div>
            <Field label="approval">
              <SelectInput
                value={draft.approvalLevel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    approvalLevel: event.target.value as NovaWantsApprovalLevel,
                  }))
                }
              >
                {APPROVAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="lg:col-span-2">
            <Field label="why this matters">
              <TextInput
                value={draft.whyThisMatters}
                placeholder="Operational reason, not vibes"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    whyThisMatters: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <div className="lg:col-span-5">
            <Field label="description">
              <TextInput
                value={draft.description}
                placeholder="Plain request, need, or protected-state proposal"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <div className="flex items-end">
            <ActionButton
              type="submit"
              tone="accent"
              disabled={!draft.title.trim() || mutation.isPending}
            >
              add
            </ActionButton>
          </div>
        </form>

        {error ? (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--theme-danger)_40%,var(--theme-border))] bg-[color-mix(in_srgb,var(--theme-danger)_10%,transparent)] p-3 text-xs text-[var(--theme-danger)]">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1180px] grid-cols-6 gap-3">
            {board.columns.map((column) => {
              const cards = cardsByColumn.get(column.id) ?? []
              return (
                <div
                  key={column.id}
                  className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)]/40 p-2"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div
                      className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${STATUS_TONE[column.id]}`}
                    >
                      {column.label}
                    </div>
                    <span className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--theme-muted)]">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((card, index) => (
                      <div key={card.id} className="space-y-1">
                        <NovaWantCardView
                          card={card}
                          columns={columns}
                          onSelect={setEditing}
                          onPark={(target) =>
                            mutation.mutate({
                              method: 'DELETE',
                              body: { id: target.id },
                            })
                          }
                          onMove={(target, status) =>
                            mutation.mutate({
                              method: 'PATCH',
                              body: {
                                id: target.id,
                                status,
                                position: index * 10 + 10,
                              },
                            })
                          }
                        />
                        <div className="flex gap-1">
                          <ActionButton
                            disabled={index === 0}
                            onClick={() => {
                              const before = cards[index - 1]
                              mutation.mutate({
                                method: 'PATCH',
                                body: {
                                  id: card.id,
                                  position: before.position - 1,
                                },
                              })
                            }}
                          >
                            up
                          </ActionButton>
                          <ActionButton
                            disabled={index === cards.length - 1}
                            onClick={() => {
                              const after = cards[index + 1]
                              mutation.mutate({
                                method: 'PATCH',
                                body: {
                                  id: card.id,
                                  position: after.position + 1,
                                },
                              })
                            }}
                          >
                            down
                          </ActionButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={submitEdit}
            className="w-full max-w-2xl rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                  edit Nova want
                </div>
                <div className="mt-1 text-lg font-semibold text-[var(--theme-text)]">
                  {editing.title}
                </div>
              </div>
              <ActionButton onClick={() => setEditing(null)}>
                close
              </ActionButton>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="title">
                <TextInput
                  value={editing.title}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? { ...current, title: event.target.value }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="status">
                <SelectInput
                  value={editing.status}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as NovaWantsColumn,
                          }
                        : current,
                    )
                  }
                >
                  {board.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="category">
                <SelectInput
                  value={editing.category}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            category: event.target.value as NovaWantsCategory,
                          }
                        : current,
                    )
                  }
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="approval">
                <SelectInput
                  value={editing.approvalLevel}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            approvalLevel: event.target
                              .value as NovaWantsApprovalLevel,
                          }
                        : current,
                    )
                  }
                >
                  {APPROVAL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <div className="sm:col-span-2">
                <Field label="description">
                  <TextArea
                    value={editing.description}
                    onChange={(event) =>
                      setEditing((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
                      )
                    }
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="why this matters">
                  <TextArea
                    value={editing.whyThisMatters}
                    onChange={(event) =>
                      setEditing((current) =>
                        current
                          ? { ...current, whyThisMatters: event.target.value }
                          : current,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="source">
                <TextInput
                  value={editing.source}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? { ...current, source: event.target.value }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="linked receipt">
                <TextInput
                  value={editing.linkedReceipt ?? ''}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            linkedReceipt: event.target.value || null,
                          }
                        : current,
                    )
                  }
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <ActionButton onClick={() => setEditing(null)}>
                cancel
              </ActionButton>
              <ActionButton
                tone="accent"
                onClick={() =>
                  setEditing((current) =>
                    current ? { ...current, status: 'approved' } : current,
                  )
                }
              >
                mark approved
              </ActionButton>
              <ActionButton type="submit" tone="accent">
                save
              </ActionButton>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
