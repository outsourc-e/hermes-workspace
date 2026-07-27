import { HugeiconsIcon } from '@hugeicons/react'
import {
  Building01Icon,
  DatabaseIcon,
  LinkSquare02Icon,
  RefreshIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

type NotionSource = {
  name: string
  id: string
  databaseId: string
}

type NotionRecord = {
  id: string
  title: string
  properties: Record<string, string | number | boolean | string[] | null>
  recordUrl: string
  createdTime: string
  lastEditedTime: string
}

function renderValue(value: NotionRecord['properties'][string]): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined) return ''
  return String(value)
}

function usefulProperties(record: NotionRecord): Array<[string, string]> {
  return Object.entries(record.properties)
    .map(([key, value]) => [key, renderValue(value)] as [string, string])
    .filter(([, value]) => value.trim().length > 0)
    .slice(0, 10)
}

export function NotionBrowserScreen() {
  const initialParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
  const initialSource = initialParams.get('source') || 'CRM / Leads'
  const initialRecordId = initialParams.get('record') || ''
  const [selectedSource, setSelectedSource] = useState(initialSource)
  const [focusedRecordId, setFocusedRecordId] = useState(initialRecordId)
  const [searchQuery, setSearchQuery] = useState('')

  const sourcesQuery = useQuery({
    queryKey: ['notion', 'sources'],
    queryFn: async () => {
      const res = await fetch('/api/notion/sources')
      if (!res.ok) throw new Error('Failed to fetch Notion source catalog')
      return res.json() as Promise<{ sources: NotionSource[]; count: number }>
    },
    staleTime: 60_000,
  })

  const sources = sourcesQuery.data?.sources ?? []

  useEffect(() => {
    if (!sources.length) return
    if (!sources.some((source) => source.name === selectedSource)) {
      setSelectedSource(sources[0].name)
    }
  }, [selectedSource, sources])

  const recordsQuery = useQuery({
    queryKey: ['notion', 'query', selectedSource],
    queryFn: async () => {
      const params = new URLSearchParams({ source: selectedSource, limit: '100' })
      const res = await fetch(`/api/notion/query?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch Notion records')
      return res.json() as Promise<{ records: NotionRecord[]; count: number; source: string }>
    },
    enabled: selectedSource.length > 0,
    staleTime: 60_000,
  })

  const records = recordsQuery.data?.records ?? []
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return records
    return records.filter((record) => {
      const haystack = [
        record.title,
        ...Object.entries(record.properties).map(([key, value]) => `${key} ${renderValue(value)}`),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [records, searchQuery])

  const isLoading = sourcesQuery.isLoading || recordsQuery.isLoading
  const hasError = sourcesQuery.error || recordsQuery.error

  useEffect(() => {
    if (!focusedRecordId || isLoading) return
    const el = document.getElementById(`notion-record-${focusedRecordId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusedRecordId, isLoading, filteredRecords])

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 pb-[calc(var(--tabbar-h,0px)+1rem)] sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                <HugeiconsIcon icon={DatabaseIcon} size={22} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-400">
                  Notion Command Center
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--theme-text)]">
                  Workspace Notion Browser
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-[var(--theme-muted)]">
                  Browse every manifest-backed Notion data source through the Workspace server proxy. Tokens stay server-side.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void recordsQuery.refetch()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-card-hover)]"
            >
              <HugeiconsIcon icon={RefreshIcon} size={15} />
              Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 md:grid-cols-[minmax(220px,320px)_1fr]">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wider text-[var(--theme-muted)]">
            Data source
            <select
              value={selectedSource}
              onChange={(event) => {
                const nextSource = event.target.value
                setSelectedSource(nextSource)
                setFocusedRecordId('')
                window.history.replaceState(null, '', `/notion?${new URLSearchParams({ source: nextSource }).toString()}`)
              }}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--theme-text)] outline-none"
            >
              {sources.map((source) => (
                <option key={source.name} value={source.name}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wider text-[var(--theme-muted)]">
            Search records
            <div className="flex items-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2">
              <HugeiconsIcon icon={Search01Icon} size={15} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search titles, statuses, notes, relations..."
                className="min-w-0 flex-1 bg-transparent text-sm normal-case tracking-normal text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)]"
              />
            </div>
          </label>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
            <p className="text-xl font-semibold">{sourcesQuery.data?.count ?? sources.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">Sources</p>
          </div>
          <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
            <p className="text-xl font-semibold">{recordsQuery.data?.count ?? records.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">Loaded Records</p>
          </div>
          <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
            <p className="text-xl font-semibold">{filteredRecords.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">Visible</p>
          </div>
          <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
            <p className="text-xl font-semibold text-green-400">{hasError ? 'Check' : isLoading ? 'Loading' : 'Live'}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">Connection</p>
          </div>
        </div>

        {hasError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            Could not load Notion data. Check server logs, manifest access, and integration sharing.
          </div>
        )}

        <section className="grid gap-3">
          {isLoading ? (
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-center text-sm text-[var(--theme-muted)]">
              Loading Notion records...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-center text-sm text-[var(--theme-muted)]">
              No records matched this view.
            </div>
          ) : (
            filteredRecords.map((record) => {
              const isFocused = focusedRecordId === record.id
              return (
              <article
                key={record.id}
                id={`notion-record-${record.id}`}
                className={`rounded-xl border bg-[var(--theme-card)] p-4 ${isFocused ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-[var(--theme-border)]'}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                      <HugeiconsIcon icon={Building01Icon} size={13} />
                      {selectedSource}
                    </div>
                    <h2 className="mt-1 truncate text-lg font-semibold text-[var(--theme-text)]">
                      {record.title}
                    </h2>
                  </div>
                  {record.recordUrl && (
                    <a
                      href={record.recordUrl}
                      onClick={() => setFocusedRecordId(record.id)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-300 hover:text-blue-200"
                    >
                      <HugeiconsIcon icon={LinkSquare02Icon} size={14} />
                      Copyable Workspace Link
                    </a>
                  )}
                </div>
                <dl className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {usefulProperties(record).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
                        {key}
                      </dt>
                      <dd className="mt-1 break-words text-sm text-[var(--theme-text)]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
