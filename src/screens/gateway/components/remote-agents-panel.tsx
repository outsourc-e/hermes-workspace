import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { fetchSessions, type GatewaySession } from '@/lib/gateway-api'

export type RemoteAgentsPanelProps = {
  localSessionKeys: string[]
}

function shouldHideSession(session: GatewaySession): boolean {
  const label = session.label ?? ''
  const title = session.title ?? ''
  const normalizedLabel = label.toLowerCase()
  const normalizedTitle = title.toLowerCase()

  if (/^cron[:\s]/i.test(label)) return true
  if (/^cron[:\s]/i.test(title)) return true
  if (session.kind === 'cron') return true
  if (normalizedLabel.includes('untrusted metadata')) return true

  const hasNoiseMarker = [
    'memory-consolidator',
    'morning brief',
    'evening wrap',
    'weekly',
  ].some((marker) => normalizedLabel.includes(marker) || normalizedTitle.includes(marker))

  return hasNoiseMarker
}

function timeAgo(ts: number | string | undefined): string {
  if (!ts) return ''
  const rawTime = typeof ts === 'string' ? new Date(ts).getTime() : ts
  if (!Number.isFinite(rawTime)) return ''
  const diff = Date.now() - rawTime
  if (diff < 0) return 'just now'
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'active': case 'running': return 'bg-emerald-500 animate-pulse'
    case 'idle': case 'waiting': return 'bg-amber-400'
    case 'error': return 'bg-red-500'
    case 'completed': case 'done': return 'bg-blue-400'
    default: return 'bg-neutral-400'
  }
}

function getLastMessageText(session: GatewaySession): string {
  if (!session.lastMessage) return ''
  if (session.lastMessage.text) return session.lastMessage.text
  if (session.lastMessage.content) {
    return session.lastMessage.content
      .filter((p) => p.type === 'text' || !p.type)
      .map((p) => p.text ?? '')
      .join(' ')
  }
  return ''
}

export function RemoteAgentsPanel({ localSessionKeys }: RemoteAgentsPanelProps) {
  const [sessions, setSessions] = useState<GatewaySession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const localSet = useMemo(() => new Set(localSessionKeys), [localSessionKeys])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSessions()
      const remote = (res.sessions ?? []).filter((s) => s.key && !localSet.has(s.key) && !shouldHideSession(s))
      setSessions(remote)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch sessions')
    } finally {
      setLoading(false)
    }
  }, [localSet])

  useEffect(() => {
    void refresh()
    const poll = setInterval(() => void refresh(), 15000)
    return () => clearInterval(poll)
  }, [refresh])

  if (sessions.length === 0 && !loading && !error) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-slate-900 p-6 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">No remote agents found</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
          Remote Agents
          <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
            {sessions.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => {
          const preview = getLastMessageText(s).slice(0, 120)
          return (
            <div
              key={s.key}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-slate-900 p-3 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('size-2 shrink-0 rounded-full', statusColor(s.status))} />
                <span className="flex-1 truncate text-sm font-semibold text-neutral-900 dark:text-white">
                  {s.label || s.title || s.derivedTitle || s.key?.slice(0, 20) || 'Unknown'}
                </span>
                <span className="text-[10px] text-neutral-400">{timeAgo(s.updatedAt)}</span>
              </div>

              {s.model && (
                <span className="inline-block rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  {s.model.split('/').pop() ?? s.model}
                </span>
              )}

              {s.task && (
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">{s.task}</p>
              )}

              {preview && (
                <p className="text-[10px] text-neutral-400 line-clamp-1">{preview}</p>
              )}

              <div className="mt-2 flex items-center gap-2 text-[10px] text-neutral-400">
                {s.tokenCount != null && <span>{(s.tokenCount).toLocaleString()} tok</span>}
                {s.cost != null && s.cost > 0 && <span>· ${s.cost.toFixed(4)}</span>}
                {s.status && <span className="ml-auto capitalize">{s.status}</span>}
              </div>

              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!s.key) return
                    window.location.href = `/chat?session=${encodeURIComponent(s.key)}`
                  }}
                  className={cn(
                    'inline-flex items-center rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors',
                    'border-neutral-200 text-neutral-700 hover:bg-neutral-50',
                    'dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800',
                  )}
                >
                  Open Session
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
