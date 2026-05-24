import { useNavigate } from '@tanstack/react-router'
import type {
  DashboardIncident,
  DashboardOverview,
} from '@/server/dashboard-aggregator'

const SOURCE_GLYPH: Record<DashboardIncident['source'], string> = {
  cron: '⏰',
  platform: '🔌',
  log: '📜',
  config: '⚙️',
  gateway: '🛰️',
}

const SEVERITY_COLOR: Record<DashboardIncident['severity'], string> = {
  warn: 'var(--theme-warning)',
  error: 'var(--theme-danger)',
  info: 'var(--theme-muted)',
}

/**
 * Right-to-left marquee that surfaces the same `incidents[]` payload
 * the legacy `AttentionCard` used to render. Lives inside `OpsStrip`
 * so attention items occupy the same horizontal "10-second status
 * read" line operators already glance at.
 *
 * Behavior:
 * - Hidden when there are no incidents (no empty marquee row).
 * - Clones the list once so the loop animation stitches seamlessly.
 * - Pauses on hover so the operator can read a long item.
 * - Each item is a button that routes to the most context-appropriate
 *   page (cron → /jobs, config → /settings, log/gateway → /logs).
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
        ⚠️ Attention · {items.length}
      </span>

      {/* Fade mask on right edge for "ticker continues" feel. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--theme-card))',
        }}
      />

      <div
        className="flex min-w-0 flex-1 overflow-hidden whitespace-nowrap"
        style={{ maskImage: 'linear-gradient(90deg, black 96%, transparent)' }}
      >
        <div
          className="oc-marquee-track flex shrink-0 items-center gap-6 pl-3 will-change-transform"
        >
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
            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                onClick={handleClick}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] hover:underline"
                style={{ color: SEVERITY_COLOR[item.severity] }}
              >
                <span aria-hidden className="text-[12px]">
                  {SOURCE_GLYPH[item.source] ?? '•'}
                </span>
                <span style={{ color: 'var(--theme-text)' }}>
                  {item.label}
                </span>
                {item.detail ? (
                  <span style={{ color: 'var(--theme-muted)' }}>
                    · {item.detail}
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
