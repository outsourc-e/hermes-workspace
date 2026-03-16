import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDiamondIcon,
  ArrowTurnBackwardIcon,
  PencilEdit02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { formatSessionKey } from '../../lib/format-session-name'
import { formatModelName } from '../../lib/format-model-name'

type ThinkingValue =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'adaptive'

type SessionEntry = {
  key: string
  friendlyId?: string
  kind?: string
  displayName?: string
  label?: string
  model?: string
  modelProvider?: string
  origin?: { surface?: string; chatType?: string; label?: string }
  updatedAt?: number
  totalTokens?: number
  contextTokens?: number
  tokenLimit?: number
  tokenUsagePercent?: number
  thinking?: string
  fast?: boolean
  verbose?: boolean
  reasoning?: boolean
  status?: string
}

type SessionsData = {
  count?: number
  sessions?: SessionEntry[]
}

type PatchPayload = {
  sessionKey: string
  label?: string
  thinking?: ThinkingValue
  fast?: boolean
  verbose?: boolean
  reasoning?: boolean
}

const THINKING_OPTIONS: Array<{ label: string; value: ThinkingValue }> = [
  { label: 'Off', value: 'off' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'XHigh', value: 'xhigh' },
  { label: 'Adaptive', value: 'adaptive' },
]

function timeAgo(ts?: number) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatTokens(value?: number) {
  if (!value || value <= 0) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1000)}k`
  return value.toLocaleString()
}

function normalizeThinking(value?: string): ThinkingValue {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === 'off' ||
    normalized === 'minimal' ||
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'xhigh' ||
    normalized === 'adaptive'
  ) {
    return normalized
  }
  return 'off'
}

function KindBadge({ kind }: { kind?: string }) {
  const colors: Record<string, string> = {
    main: 'bg-primary-100 text-primary-900 border-primary-300',
    direct: 'bg-primary-100 text-primary-700 border-primary-200',
    cron: 'bg-primary-50 text-primary-700 border-primary-200',
    subagent: 'bg-primary-50 text-primary-600 border-primary-200',
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${colors[kind || ''] || 'bg-primary-50 text-primary-600 border-primary-200'}`}
    >
      {kind || 'unknown'}
    </span>
  )
}

function TokenUsageCell({ session }: { session: SessionEntry }) {
  const used = session.totalTokens || 0
  const limit = session.tokenLimit || session.contextTokens || 0
  const percent =
    session.tokenUsagePercent ??
    (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0)

  return (
    <div className="min-w-[148px]">
      <div className="flex items-center justify-between gap-2 text-[11px] text-primary-600">
        <span className="font-medium text-primary-900">
          {formatTokens(used)}
        </span>
        <span>{limit > 0 ? `/ ${formatTokens(limit)}` : ''}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-100">
        <div
          className="h-full rounded-full bg-primary-900 transition-[width]"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
    </div>
  )
}

export function SessionsScreen() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['gateway', 'sessions-gateway'],
    queryFn: async () => {
      const res = await fetch('/api/gateway/sessions')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Gateway error')
      return json.data as SessionsData
    },
    refetchInterval: 10_000,
    retry: 1,
  })

  const patchMutation = useMutation({
    mutationFn: async (payload: PatchPayload) => {
      setPendingKey(payload.sessionKey)
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      return json
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['gateway', 'sessions-gateway'],
      })
    },
    onError: (error) => {
      toast(
        error instanceof Error ? error.message : 'Unable to update session',
        { type: 'error' },
      )
    },
    onSettled: () => {
      setPendingKey(null)
    },
  })

  const lastUpdated = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toLocaleTimeString()
    : null
  const sessions = query.data?.sessions || []

  const filteredSessions = useMemo(() => {
    const search = filter.trim().toLowerCase()
    const rows = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    if (!search) return rows
    return rows.filter((session) => {
      const haystack = [
        session.key,
        session.friendlyId,
        session.label,
        session.displayName,
        session.kind,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [filter, sessions])

  function startEditing(session: SessionEntry) {
    setEditingKey(session.key)
    setDraftLabel(session.label || session.displayName || formatSessionKey(session.key))
  }

  async function saveLabel(session: SessionEntry) {
    if (editingKey !== session.key) return
    const nextLabel = draftLabel.trim()
    const currentLabel = (session.label || '').trim()
    if (!nextLabel || nextLabel === currentLabel) {
      setEditingKey(null)
      return
    }
    await patchMutation.mutateAsync({
      sessionKey: session.key,
      label: nextLabel,
    })
    setEditingKey(null)
  }

  async function updateOverride(
    sessionKey: string,
    payload: Omit<PatchPayload, 'sessionKey'>,
  ) {
    await patchMutation.mutateAsync({
      sessionKey,
      ...payload,
    })
  }

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-semibold text-primary-900">
                Sessions
              </h1>
              <p className="text-xs text-primary-500">
                {sessions.length} active sessions
              </p>
            </div>
            {query.isFetching && !query.isLoading ? (
              <span className="animate-pulse text-[10px] text-primary-500">
                syncing…
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-[260px]">
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-500"
              />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by key, label, or kind"
                className="pl-9"
                nativeInput
              />
            </div>
            {lastUpdated ? (
              <span className="text-[11px] text-primary-500">
                Updated {lastUpdated}
              </span>
            ) : null}
            <span
              className={`inline-block size-2 rounded-full ${query.isError ? 'bg-red-500' : query.isSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          </div>
        </header>

        <div className="overflow-hidden rounded-xl border border-primary-200 bg-white shadow-sm">
          {query.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="flex items-center gap-2 text-primary-500">
                <div className="size-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
                <span className="text-sm">Connecting to Hermes…</span>
              </div>
            </div>
          ) : query.isError ? (
            <div className="flex h-32 flex-col items-center justify-center gap-3">
              <HugeiconsIcon
                icon={AlertDiamondIcon}
                size={24}
                strokeWidth={1.5}
                className="text-red-500"
              />
              <p className="text-sm text-primary-600">
                {query.error instanceof Error
                  ? query.error.message
                  : 'Failed to fetch'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
                className="gap-1.5"
              >
                <HugeiconsIcon
                  icon={ArrowTurnBackwardIcon}
                  size={14}
                  strokeWidth={1.5}
                />
                Retry
              </Button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-primary-500">
              {sessions.length === 0
                ? 'No active sessions.'
                : 'No sessions match the current filter.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-[13px]">
                <thead>
                  <tr className="border-b border-primary-200 bg-primary-50/60 text-left">
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Session
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Kind
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Model
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Tokens
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Thinking
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Fast
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Verbose
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Reasoning
                    </th>
                    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Origin
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => {
                    const isEditing = editingKey === session.key
                    const isPending = pendingKey === session.key
                    const sessionLabel =
                      session.label ||
                      session.displayName ||
                      formatSessionKey(session.key)
                    const chatSessionKey = session.friendlyId || session.key

                    return (
                      <tr
                        key={session.key}
                        className="border-b border-primary-100 align-top transition-colors hover:bg-primary-50/70"
                      >
                        <td className="px-4 py-3">
                          <div className="flex min-w-[250px] flex-col gap-2">
                            <div className="flex items-start gap-2">
                              {isEditing ? (
                                <input
                                  value={draftLabel}
                                  onChange={(event) =>
                                    setDraftLabel(event.target.value)
                                  }
                                  onBlur={() => void saveLabel(session)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      void saveLabel(session)
                                    }
                                    if (event.key === 'Escape') {
                                      setEditingKey(null)
                                      setDraftLabel('')
                                    }
                                  }}
                                  autoFocus
                                  className="w-full rounded-md border border-primary-300 bg-white px-2 py-1 text-[13px] font-medium text-primary-900 outline-none ring-0"
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditing(session)}
                                    className="max-w-[280px] truncate text-left font-medium text-primary-900 hover:text-primary-700"
                                  >
                                    {sessionLabel}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditing(session)}
                                    className="rounded p-1 text-primary-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                                    aria-label={`Edit label for ${session.key}`}
                                  >
                                    <HugeiconsIcon
                                      icon={PencilEdit02Icon}
                                      size={14}
                                      strokeWidth={1.6}
                                    />
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <Link
                                to="/chat/$sessionKey"
                                params={{ sessionKey: chatSessionKey }}
                                className="truncate text-[11px] text-primary-600 underline-offset-2 hover:text-primary-900 hover:underline"
                              >
                                {session.key}
                              </Link>
                              {session.status ? (
                                <span className="text-[11px] text-primary-500">
                                  {session.status}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <KindBadge kind={session.kind} />
                        </td>
                        <td className="px-4 py-3 text-primary-700">
                          <div className="min-w-[160px]">
                            <div className="font-medium text-primary-900">
                              {formatModelName(session.model) || '—'}
                            </div>
                            {session.modelProvider ? (
                              <div className="text-[11px] text-primary-500">
                                {session.modelProvider}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <TokenUsageCell session={session} />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={normalizeThinking(session.thinking)}
                            onChange={(event) =>
                              void updateOverride(session.key, {
                                thinking: event.target.value as ThinkingValue,
                              })
                            }
                            disabled={isPending}
                            className="h-9 min-w-[110px] rounded-md border border-primary-200 bg-white px-2 text-[12px] text-primary-900 outline-none disabled:opacity-60"
                          >
                            {THINKING_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={Boolean(session.fast)}
                            disabled={isPending}
                            onCheckedChange={(checked) =>
                              void updateOverride(session.key, { fast: checked })
                            }
                            aria-label={`Toggle fast override for ${session.key}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={Boolean(session.verbose)}
                            disabled={isPending}
                            onCheckedChange={(checked) =>
                              void updateOverride(session.key, { verbose: checked })
                            }
                            aria-label={`Toggle verbose override for ${session.key}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={Boolean(session.reasoning)}
                            disabled={isPending}
                            onCheckedChange={(checked) =>
                              void updateOverride(session.key, {
                                reasoning: checked,
                              })
                            }
                            aria-label={`Toggle reasoning override for ${session.key}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-primary-600">
                          {session.origin?.surface || session.origin?.label || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-primary-600">
                          {isPending ? 'Saving…' : timeAgo(session.updatedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
