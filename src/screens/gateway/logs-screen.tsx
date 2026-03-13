import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowTurnBackwardIcon,
  Download01Icon,
  Notification03Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

type LogEntry = {
  id: string
  timestamp: number | null
  level: LogLevel
  source: string
  message: string
  raw: string
}

type GatewayLogsData = {
  entries: Array<LogEntry>
  filePath: string | null
  method: string
}

const LOG_LEVELS: Array<LogLevel> = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]

const LEVEL_STYLES: Record<LogLevel, string> = {
  trace: 'border-primary-200 bg-primary-50 text-primary-600',
  debug: 'border-slate-200 bg-slate-100 text-slate-700',
  info: 'border-blue-200 bg-blue-100 text-blue-700',
  warn: 'border-amber-200 bg-amber-100 text-amber-800',
  error: 'border-red-200 bg-red-100 text-red-700',
  fatal: 'border-red-300 bg-red-200 text-red-900',
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

function formatFullTimestamp(timestamp: number | null): string {
  if (!timestamp) return 'Unknown timestamp'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

async function fetchGatewayLogs(): Promise<
  | { unavailable: true; message: string }
  | { unavailable: false; data: GatewayLogsData }
> {
  const response = await fetch('/api/gateway/logs?limit=500')
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    unavailable?: boolean
    error?: string
    data?: GatewayLogsData
  }

  if (response.status === 501 || payload.unavailable) {
    return {
      unavailable: true,
      message:
        payload.error ||
        'Gateway logs not available via RPC — check gateway.logs config',
    }
  }

  if (!response.ok || payload.ok === false || !payload.data) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }

  return {
    unavailable: false,
    data: payload.data,
  }
}

export function GatewayLogsScreen() {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedLevels, setSelectedLevels] = useState<Array<LogLevel>>(LOG_LEVELS)
  const [autoFollow, setAutoFollow] = useState(true)

  const query = useQuery({
    queryKey: ['gateway', 'logs'],
    queryFn: fetchGatewayLogs,
    refetchInterval: autoFollow ? 5000 : false,
    retry: false,
  })

  const data = query.data && !query.data.unavailable ? query.data.data : null
  const unavailableMessage =
    query.data && query.data.unavailable ? query.data.message : null
  const entries = data?.entries ?? []
  const selectedLevelSet = useMemo(
    () => new Set(selectedLevels),
    [selectedLevels],
  )

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return entries.filter((entry) => {
      if (!selectedLevelSet.has(entry.level)) return false
      if (!normalizedSearch) return true
      return `${entry.message}\n${entry.source}\n${entry.raw}`
        .toLowerCase()
        .includes(normalizedSearch)
    })
  }, [entries, searchText, selectedLevelSet])

  useEffect(() => {
    if (!autoFollow || !viewportRef.current) return
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight
  }, [autoFollow, filteredEntries.length, query.dataUpdatedAt])

  function toggleLevel(level: LogLevel) {
    setSelectedLevels((current) => {
      if (current.includes(level)) {
        if (current.length === 1) return current
        return current.filter((entry) => entry !== level)
      }
      return [...current, level]
    })
  }

  function exportVisibleLogs() {
    const lines = filteredEntries.map((entry) => {
      const timestamp = entry.timestamp
        ? new Date(entry.timestamp).toISOString()
        : 'unknown-time'
      return `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gateway-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const lastUpdated = query.dataUpdatedAt
    ? new Date(query.dataUpdatedAt).toLocaleTimeString()
    : null

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-700">
                <HugeiconsIcon
                  icon={Notification03Icon}
                  size={18}
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-primary-900">
                  Gateway Logs
                </h1>
                <p className="text-sm text-primary-600">
                  Live log viewer with level filters, search, and export.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-primary-600">
              <span>{filteredEntries.length} visible entries</span>
              {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
              {data?.method ? <span>RPC {data.method}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <HugeiconsIcon
                icon={ArrowTurnBackwardIcon}
                size={14}
                strokeWidth={1.5}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportVisibleLogs}
              disabled={filteredEntries.length === 0}
            >
              <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.5} />
              Export
            </Button>
          </div>
        </header>

        <section className="rounded-xl border border-primary-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {LOG_LEVELS.map((level) => {
                const selected = selectedLevelSet.has(level)
                return (
                  <Button
                    key={level}
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    className="rounded-full px-3"
                    onClick={() => toggleLevel(level)}
                    aria-pressed={selected}
                  >
                    {level}
                  </Button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[260px] flex-1 items-center gap-2 lg:min-w-[320px]">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={16}
                  strokeWidth={1.5}
                  className="text-primary-500"
                />
                <Input
                  type="search"
                  size="sm"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search visible logs"
                  aria-label="Search gateway logs"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-primary-700">
                <Switch
                  checked={autoFollow}
                  onCheckedChange={(checked) => setAutoFollow(Boolean(checked))}
                  aria-label="Toggle auto follow"
                />
                Auto-follow
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-primary-600">
            <span>
              File:{' '}
              <span className="font-mono text-primary-900">
                {data?.filePath || 'Unavailable'}
              </span>
            </span>
            {query.isFetching && !query.isPending ? <span>Refreshing…</span> : null}
            <span>{autoFollow ? 'Polling every 5s' : 'Polling paused'}</span>
          </div>
        </section>

        <section className="rounded-xl border border-primary-200 bg-white shadow-sm">
          {query.isPending ? (
            <div className="px-5 py-12 text-center text-sm text-primary-600">
              Loading gateway logs…
            </div>
          ) : unavailableMessage ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-primary-900">
                {unavailableMessage}
              </p>
              <p className="mt-2 text-xs text-primary-600">
                The gateway did not expose a supported logs RPC method.
              </p>
            </div>
          ) : query.isError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-red-700">
                {query.error instanceof Error
                  ? query.error.message
                  : 'Failed to load gateway logs'}
              </p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-primary-600">
              No log entries match the current level filters and search.
            </div>
          ) : (
            <div
              ref={viewportRef}
              className="max-h-[68vh] overflow-y-auto px-3 py-3"
            >
              <div className="space-y-1.5">
                {filteredEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="grid gap-3 rounded-lg border border-primary-200 bg-primary-50/35 px-3 py-2.5 md:grid-cols-[100px_80px_120px_minmax(0,1fr)] md:items-start"
                  >
                    <div
                      className="font-mono text-xs text-primary-600"
                      title={formatFullTimestamp(entry.timestamp)}
                    >
                      {formatTime(entry.timestamp)}
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${LEVEL_STYLES[entry.level]}`}
                      >
                        {entry.level}
                      </span>
                    </div>
                    <div className="text-xs font-medium uppercase tracking-wide text-primary-600">
                      {entry.source || 'gateway'}
                    </div>
                    <div className="min-w-0 break-words text-sm text-primary-900">
                      {entry.message}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        {autoFollow && filteredEntries.length > 0 ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!viewportRef.current) return
                viewportRef.current.scrollTop = viewportRef.current.scrollHeight
              }}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
              Jump to latest
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
