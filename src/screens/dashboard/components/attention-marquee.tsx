import { useNavigate } from '@tanstack/react-router'
import type {
  DashboardIncident,
  DashboardOverview,
} from '@/server/dashboard-aggregator'

const SOURCE_GLYPH: Record<DashboardIncident['source'], string> = {
  cron: 'clock',
  kanban: 'board',
  platform: 'link',
  log: 'log',
  config: 'cfg',
  gateway: 'gate',
}

const SEVERITY_COLOR: Record<DashboardIncident['severity'], string> = {
  warn: 'var(--theme-warning)',
  error: 'var(--theme-danger)',
  info: 'var(--theme-muted)',
}

function compactDetail(item: DashboardIncident): string {
  const detail = item.detail.trim()
  if (!detail) return ''

  const lower = detail.toLowerCase()
  if (
    item.source === 'cron' &&
    lower.includes('global inference config drifted')
  ) {
    return 'config drift blocked scheduled run; pin model/provider in Jobs'
  }

  if (detail.length <= 96) return detail
  return `${detail.slice(0, 92).trim()}...`
}

/**
 * Compact incident ticker. It keeps the real incident list clickable while
 * trimming verbose backend errors into a readable operator summary.
 */
export function AttentionMarquee({
  overview,
}: {
  overview: DashboardOverview | null
}) {
  const navigate = useNavigate()
  const items = overview?.incidents ?? []
  if (items.length === 0) return null

  const tracks = [...items, ...items]

  return (
    <div
      className="group relative flex items-center gap-2 overflow-hidden rounded-md border px-2 py-1"
      style={{
        background:
          'linear-gradient(90deg, color-mix(in srgb, var(--theme-warning) 10%, transparent), transparent 70%)',
        borderColor:
          'color-mix(in srgb, var(--theme-warning) 35%, transparent)',
      }}
      title={`${items.length} item${items.length === 1 ? '' : 's'} need attention`}
    >
      <span
        className="z-10 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]"
        style={{
          background:
            'color-mix(in srgb, var(--theme-warning) 18%, transparent)',
          color: 'var(--theme-warning)',
        }}
      >
        Attention · {items.length}
      </span>

      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12"
        style={{
          background: 'linear-gradient(90deg, transparent, var(--theme-card))',
        }}
      />

      <div
        className="flex min-w-0 flex-1 overflow-hidden whitespace-nowrap"
        style={{ maskImage: 'linear-gradient(90deg, black 96%, transparent)' }}
      >
        <div className="oc-marquee-track flex shrink-0 items-center gap-6 pl-3 will-change-transform">
          {tracks.map((item, idx) => {
            const handleClick = () => {
              if (item.href) {
                if (
                  item.href.startsWith('http://') ||
                  item.href.startsWith('https://')
                ) {
                  window.open(item.href, '_blank', 'noopener,noreferrer')
                  return
                }
                window.location.assign(item.href)
                return
              }
              if (item.source === 'cron') navigate({ to: '/jobs' })
              else if (item.source === 'config')
                navigate({ to: '/settings', search: {} })
              else navigate({ to: '/jobs' })
            }
            const detail = compactDetail(item)
            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                onClick={handleClick}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] hover:underline"
                style={{ color: SEVERITY_COLOR[item.severity] }}
              >
                <span
                  aria-hidden
                  className="rounded border px-1 py-0.5 text-[8px] leading-none"
                  style={{
                    borderColor:
                      'color-mix(in srgb, currentColor 35%, transparent)',
                  }}
                >
                  {SOURCE_GLYPH[item.source]}
                </span>
                <span style={{ color: 'var(--theme-text)' }}>{item.label}</span>
                {detail ? (
                  <span style={{ color: 'var(--theme-muted)' }}>
                    · {detail}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes oc-attention-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .oc-marquee-track {
          animation: oc-attention-marquee 32s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-marquee-track { animation: none; }
        }
        .group:hover .oc-marquee-track {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
