import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { formatModelName } from '@/screens/dashboard/lib/formatters'

export type SessionRowData = {
  key: string
  title: string
  kind: string
  status: string
  source: string | null
  model: string | null
  messageCount: number
  toolCallCount: number
  tokenCount: number
  startedAt: number | null
  updatedAt: number | null
}

const KIND_ICONS: Record<string, string> = {
  chat: '💬',
  cron: '⏰',
  cli: '⌨️',
  api: '🔌',
  telegram: '✈️',
  discord: '🎮',
  whatsapp: '🟢',
  workspace: '🧭',
  job: '📋',
}

function relativeTime(ms: number | null): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 0) return 'just now'
  if (diff < 60_000) return '<1m ago'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

function formatTokens(n: number): string {
  if (!n || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortTitle(s: SessionRowData): string {
  const t = s.title?.trim()
  if (t && t.length > 0 && t !== s.key) return t
  // Fall back to friendly slug from the key
  return `Session ${s.key.slice(0, 8)}`
}

type SessionBadge = {
  label: string
  tone: string
  title: string
}

function buildBadges(s: SessionRowData): Array<SessionBadge> {
  const badges: Array<SessionBadge> = []
  const now = Date.now()
  // Hot: started or updated within 5 minutes and still idle/active
  if (
    s.updatedAt &&
    now - s.updatedAt < 5 * 60_000 &&
    s.status !== 'ended'
  ) {
    badges.push({
      label: 'hot',
      tone: 'var(--theme-success)',
      title: 'Active in last 5 minutes',
    })
  }
  if (s.toolCallCount >= 20) {
    badges.push({
      label: 'tool-heavy',
      tone: 'var(--theme-accent)',
      title: `${s.toolCallCount} tool calls`,
    })
  }
  if (s.tokenCount >= 50_000) {
    badges.push({
      label: 'high-token',
      tone: 'var(--theme-accent-secondary)',
      title: `${formatTokens(s.tokenCount)} tokens`,
    })
  }
  if (s.status?.toLowerCase() === 'error' || s.status?.toLowerCase() === 'failed') {
    badges.push({
      label: 'error',
      tone: 'var(--theme-danger)',
      title: 'Session ended in an error state',
    })
  }
  if (
    s.updatedAt &&
    now - s.updatedAt > 7 * 86_400_000 &&
    s.status !== 'ended'
  ) {
    badges.push({
      label: 'stale',
      tone: 'var(--theme-muted)',
      title: 'No activity in over 7 days',
    })
  }
  return badges
}

/**
 * Sessions Intelligence — replaces the legacy 14d Activity chart.
 *
 * The agent review specifically called out that Recent Sessions was
 * hex-ID dominated and useless for triage. This card surfaces the
 * meaningful signal:
 *
 * - human title (derivedTitle from /api/sessions, falling back to a
 *   short slug from the key)
 * - kind icon (chat, cron, telegram, ...)
 * - badges: hot, tool-heavy, high-token, error, stale
 * - hierarchy: model chip, msgs, tools, tokens, recency
 * - hot row gets a soft accent border so the operator sees what's
 *   running right now without scanning IDs
 *
 * Click row → navigates to /chat/<sessionKey>.
 */
export function SessionsIntelligenceCard({
  sessions,
}: {
  sessions: Array<SessionRowData>
}) {
  const navigate = useNavigate()
  const enriched = useMemo(() => {
    return sessions.map((s) => ({
      session: s,
      badges: buildBadges(s),
    }))
  }, [sessions])

  // Highlight: top hot session, otherwise top tool-heavy, otherwise top recent.
  const highlightId = useMemo(() => {
    const hot = enriched.find((e) =>
      e.badges.some((b) => b.label === 'hot'),
    )
    if (hot) return hot.session.key
    const heavy = enriched.find((e) =>
      e.badges.some((b) => b.label === 'tool-heavy'),
    )
    if (heavy) return heavy.session.key
    return enriched[0]?.session.key ?? null
  }, [enriched])

  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 90%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Sessions intelligence
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            {sessions.length} recent
          </span>
          <button
            type="button"
            onClick={() =>
              navigate({
                to: '/chat/$sessionKey',
                params: { sessionKey: 'main' },
              })
            }
            className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors hover:bg-[var(--theme-card)]/80"
            style={{
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-muted)',
            }}
          >
            Open chat →
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div
          className="flex h-[120px] items-center justify-center rounded-md border border-dashed text-[11px]"
          style={{
            borderColor: 'var(--theme-border)',
            color: 'var(--theme-muted)',
          }}
        >
          No sessions yet — start a chat.
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {enriched.slice(0, 8).map(({ session: s, badges }) => {
            const isHighlight = s.key === highlightId
            const icon = KIND_ICONS[s.kind] ?? KIND_ICONS[s.source ?? ''] ?? '💬'
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/chat/$sessionKey',
                      params: { sessionKey: s.key },
                    })
                  }
                  className="group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-[var(--theme-card)]/80"
                  style={{
                    borderColor: isHighlight
                      ? 'color-mix(in srgb, var(--theme-accent) 50%, transparent)'
                      : 'var(--theme-border)',
                    background: isHighlight
                      ? 'color-mix(in srgb, var(--theme-accent) 6%, transparent)'
                      : 'transparent',
                  }}
                >
                  <span
                    aria-hidden
                    className="text-sm"
                    style={{ filter: isHighlight ? 'none' : 'grayscale(0.2)' }}
                  >
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-[12px] font-semibold"
                        style={{ color: 'var(--theme-text)' }}
                        title={s.title}
                      >
                        {shortTitle(s)}
                      </span>
                      {badges.map((b) => (
                        <span
                          key={b.label}
                          className="hidden shrink-0 rounded px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] sm:inline-block"
                          style={{
                            background: `color-mix(in srgb, ${b.tone} 14%, transparent)`,
                            color: b.tone,
                            border: `1px solid color-mix(in srgb, ${b.tone} 32%, transparent)`,
                          }}
                          title={b.title}
                        >
                          {b.label}
                        </span>
                      ))}
                    </div>
                    <div
                      className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.05em]"
                      style={{ color: 'var(--theme-muted)' }}
                    >
                      {s.model ? (
                        <span
                          className="rounded px-1 py-0.5"
                          style={{
                            background:
                              'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                            color: 'var(--theme-accent)',
                          }}
                        >
                          {formatModelName(s.model)}
                        </span>
                      ) : null}
                      <span>{s.messageCount} msgs</span>
                      {s.toolCallCount > 0 ? (
                        <span>{s.toolCallCount} tools</span>
                      ) : null}
                      {s.tokenCount > 0 ? (
                        <span>{formatTokens(s.tokenCount)} tok</span>
                      ) : null}
                      <span className="ml-auto">
                        {relativeTime(s.updatedAt ?? s.startedAt)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
