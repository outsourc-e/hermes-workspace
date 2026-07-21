import { HugeiconsIcon } from '@hugeicons/react'
import { BrainIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type ExternalMemoryProvider = {
  id: string
  label: string
  capabilities: Array<string>
  dbPath: string
  configPath: string
  available: boolean
}

type MemoryState = 'candidate' | 'approved' | 'rejected' | 'all'

type StateCounts = Partial<Record<MemoryState, number>>

const MEMORY_STATES: ReadonlyArray<MemoryState> = [
  'candidate',
  'approved',
  'rejected',
  'all',
]

type ExternalMemoryCandidate = {
  provider: string
  id: string
  text: string
  source: string
  metadata: Record<string, unknown>
  state: string
  contentSha256: string
  createdAt: number
  updatedAt: number
}

type ProviderResponse = {
  active: string
  providers: Array<ExternalMemoryProvider>
}

type CandidateResponse = {
  provider: string
  state: string
  count: number
  total: number
  counts?: StateCounts
  candidates?: Array<ExternalMemoryCandidate>
}

type SearchResponse = {
  provider: string
  query: string
  count: number
  results?: Array<ExternalMemoryCandidate>
}

type CandidateAction = 'edit' | 'approve' | 'reject' | 'delete'

async function mutateCandidate(options: {
  action: CandidateAction
  provider: string
  id: string
  text?: string
  reason?: string
}): Promise<void> {
  const response =
    options.action === 'delete'
      ? await fetch(
          `/api/external-memory/candidates?provider=${encodeURIComponent(options.provider)}&id=${encodeURIComponent(options.id)}`,
          { method: 'DELETE' },
        )
      : await fetch('/api/external-memory/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || `Action failed (${response.status})`)
  }
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

function formatTimestamp(value: number): string {
  if (!value) return 'Unknown'
  const millis = value < 10_000_000_000 ? value * 1000 : value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(millis))
}

function stateClasses(state: string): string {
  if (state === 'approved')
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (state === 'rejected')
    return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
}

function metadataPreview(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata).slice(0, 4)
  if (entries.length === 0) return 'No metadata'
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ')
}

export function formatStateFilterLabel(
  state: MemoryState,
  counts: StateCounts,
): string {
  const count = counts[state]
  return typeof count === 'number' ? `${state} (${count})` : state
}

export function candidateActionLabels(
  candidate: Pick<ExternalMemoryCandidate, 'state'>,
): Array<string> {
  const labels = ['Edit']
  if (candidate.state !== 'approved') labels.push('Approve')
  if (candidate.state !== 'rejected') labels.push('Reject')
  labels.push('Delete')
  return labels
}

async function readStateCounts(providerId: string): Promise<StateCounts> {
  const entries = await Promise.all(
    MEMORY_STATES.map(async (state) => {
      const response = await readJson<CandidateResponse>(
        `/api/external-memory/candidates?provider=${encodeURIComponent(providerId)}&state=${encodeURIComponent(state)}&limit=1`,
      )
      return [state, response.total] as const
    }),
  )
  return Object.fromEntries(entries) as StateCounts
}

export function ExternalMemoryBrowserScreen() {
  const queryClient = useQueryClient()
  const [providerId, setProviderId] = useState('')
  const [state, setState] = useState<MemoryState>('candidate')
  const [searchInput, setSearchInput] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(searchInput)
  const searchTerm = deferredSearch.trim()

  const providersQuery = useQuery({
    queryKey: ['external-memory', 'providers'],
    queryFn: () => readJson<ProviderResponse>('/api/external-memory/providers'),
  })

  const providers = providersQuery.data?.providers ?? []
  useEffect(() => {
    if (providerId || providers.length === 0) return
    setProviderId(providersQuery.data?.active || providers[0]?.id || '')
  }, [providerId, providers, providersQuery.data?.active])

  const listQuery = useQuery({
    queryKey: ['external-memory', 'candidates', providerId, state],
    queryFn: () =>
      readJson<CandidateResponse>(
        `/api/external-memory/candidates?provider=${encodeURIComponent(providerId)}&state=${encodeURIComponent(state)}`,
      ),
    enabled: Boolean(providerId) && !searchTerm,
  })

  const countsQuery = useQuery({
    queryKey: ['external-memory', 'candidate-counts', providerId],
    queryFn: () => readStateCounts(providerId),
    enabled: Boolean(providerId) && !searchTerm,
  })

  const searchQuery = useQuery({
    queryKey: ['external-memory', 'search', providerId, searchTerm],
    queryFn: () =>
      readJson<SearchResponse>(
        `/api/external-memory/search?provider=${encodeURIComponent(providerId)}&q=${encodeURIComponent(searchTerm)}`,
      ),
    enabled: Boolean(providerId) && Boolean(searchTerm),
  })

  const candidates = searchTerm
    ? (searchQuery.data?.results ?? [])
    : (listQuery.data?.candidates ?? [])
  const stateCounts = listQuery.data?.counts ?? countsQuery.data ?? {}

  useEffect(() => {
    if (
      selectedId &&
      candidates.some((candidate) => candidate.id === selectedId)
    )
      return
    setSelectedId(candidates[0]?.id ?? null)
  }, [candidates, selectedId])

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? null,
    [candidates, selectedId],
  )
  const activeProvider =
    providers.find((provider) => provider.id === providerId) ?? null
  const isLoading =
    providersQuery.isLoading || listQuery.isLoading || searchQuery.isLoading
  const error = providersQuery.error || listQuery.error || searchQuery.error

  async function refreshCandidates() {
    await queryClient.invalidateQueries({ queryKey: ['external-memory'] })
  }

  async function runAction(action: CandidateAction) {
    if (!selected) return
    let text: string | undefined
    let reason: string | undefined
    if (action === 'edit') {
      text = window.prompt('Edit memory candidate', selected.text) || ''
      if (!text.trim() || text === selected.text) return
    }
    if (action === 'reject') {
      reason = window.prompt('Reason for rejection', '') || ''
    }
    if (
      action === 'delete' &&
      !window.confirm('Delete this external memory row?')
    ) {
      return
    }
    await mutateCandidate({
      action,
      provider: selected.provider,
      id: selected.id,
      text,
      reason,
    })
    if (action === 'delete') setSelectedId(null)
    await refreshCandidates()
  }

  if (!providersQuery.isLoading && providers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-xl rounded-2xl border border-primary-200 bg-primary-50 p-6 text-center dark:border-neutral-800 dark:bg-neutral-950">
          <HugeiconsIcon
            icon={BrainIcon}
            className="mx-auto mb-3 size-8 text-primary-500"
          />
          <h2 className="text-lg font-semibold text-primary-900 dark:text-neutral-100">
            No external memory providers
          </h2>
          <p className="mt-2 text-sm text-primary-600 dark:text-neutral-400">
            Register providers in $HERMES_HOME/external_memory_providers.json to
            inspect external memory review queues here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-primary-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 lg:border-r lg:border-b-0">
        <div className="space-y-3 border-b border-primary-200 p-4 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-primary-900 dark:text-neutral-100">
              External memory
            </h2>
            <p className="text-xs text-primary-500 dark:text-neutral-400">
              Review queues backed by custom providers.
            </p>
          </div>

          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-primary-400"
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search text, metadata, source..."
              className="w-full rounded-xl border border-primary-200 bg-white py-2 pr-3 pl-9 text-sm text-primary-900 outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="grid grid-cols-4 gap-1 text-xs">
            {MEMORY_STATES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setState(item)}
                disabled={Boolean(searchTerm)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 capitalize transition disabled:opacity-40',
                  state === item
                    ? 'border-primary-500 bg-primary-100 text-primary-900 dark:border-blue-500 dark:bg-blue-500/15 dark:text-blue-100'
                    : 'border-primary-200 text-primary-600 hover:bg-primary-50 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900',
                )}
              >
                {formatStateFilterLabel(item, stateCounts)}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <p className="p-3 text-sm text-primary-500 dark:text-neutral-400">
              Loading...
            </p>
          ) : null}
          {error ? (
            <p className="p-3 text-sm text-rose-600">
              {error instanceof Error ? error.message : String(error)}
            </p>
          ) : null}
          {!isLoading && candidates.length === 0 ? (
            <p className="p-3 text-sm text-primary-500 dark:text-neutral-400">
              No memory rows found.
            </p>
          ) : null}
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setSelectedId(candidate.id)}
                className={cn(
                  'w-full rounded-xl border p-3 text-left transition',
                  selectedId === candidate.id
                    ? 'border-primary-500 bg-primary-50 dark:border-blue-500 dark:bg-blue-500/10'
                    : 'border-primary-200 bg-white hover:bg-primary-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900',
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-primary-500 dark:text-neutral-400">
                    {candidate.id}
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] capitalize',
                      stateClasses(candidate.state),
                    )}
                  >
                    {candidate.state}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-primary-900 dark:text-neutral-100">
                  {candidate.text}
                </p>
                <p className="mt-2 text-xs text-primary-500 dark:text-neutral-500">
                  {formatTimestamp(candidate.updatedAt)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto bg-primary-50 p-4 dark:bg-neutral-950/80">
        {selected ? (
          <article className="mx-auto max-w-4xl space-y-4 rounded-2xl border border-primary-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary-100 pb-4 dark:border-neutral-800">
              <div>
                <p className="font-mono text-xs text-primary-500 dark:text-neutral-400">
                  {selected.id}
                </p>
                <h1 className="mt-1 text-xl font-semibold text-primary-950 dark:text-neutral-50">
                  {activeProvider?.label || selected.provider}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs capitalize',
                    stateClasses(selected.state),
                  )}
                >
                  {selected.state}
                </span>
                {candidateActionLabels(selected).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      runAction(label.toLowerCase() as CandidateAction)
                    }
                    className={cn(
                      'rounded-lg border px-3 py-1 text-xs transition',
                      label === 'Delete'
                        ? 'border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-300'
                        : 'border-primary-200 text-primary-700 hover:bg-primary-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm leading-7 whitespace-pre-wrap text-primary-950 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
              {selected.text}
            </div>

            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                  Source
                </dt>
                <dd className="mt-1 text-primary-900 dark:text-neutral-100">
                  {selected.source}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                  Updated
                </dt>
                <dd className="mt-1 text-primary-900 dark:text-neutral-100">
                  {formatTimestamp(selected.updatedAt)}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                  Metadata
                </dt>
                <dd className="mt-1 text-primary-900 dark:text-neutral-100">
                  {metadataPreview(selected.metadata)}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-primary-400 dark:text-neutral-500">
                  SHA-256
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-primary-700 dark:text-neutral-300">
                  {selected.contentSha256}
                </dd>
              </div>
            </dl>
          </article>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-primary-500 dark:text-neutral-400">
            Select a memory row.
          </div>
        )}
      </main>
    </div>
  )
}
