import { useNavigate } from '@tanstack/react-router'
import type { DashboardOverview } from '@/server/dashboard-aggregator'
import { formatSkillName } from '@/screens/dashboard/lib/formatters'

/**
 * Skills usage card. Replaces the lonely "60" tile that the Hermes
 * Agent product review (correctly) flagged as wasted space. Renders
 * a horizontal bar chart of the top-5 most-used skills in the
 * analytics window, sourced from `analytics.skills.top_skills` (the
 * agent-confirmed shape) so we no longer enumerate the full installed
 * list either.
 *
 * Falls back to the Skills installed count when usage data isn't
 * present (e.g. fresh install).
 */
export function SkillsUsageCard({
  usage,
  installedCount,
  onOpen,
}: {
  usage: DashboardOverview['skillsUsage']
  installedCount: number
  onOpen: () => void
}) {
  const navigate = useNavigate()
  const hasUsage = !!usage && usage.topSkills.length > 0
  const top = hasUsage ? usage!.topSkills : []
  const max = top[0]?.totalCount || 1

  return (
    <button
      type="button"
      onClick={() => {
        onOpen()
        navigate({ to: '/skills' })
      }}
      className="group relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--theme-card)_85%,transparent)]"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-warning), color-mix(in srgb, var(--theme-warning) 40%, transparent), transparent)',
        }}
      />
      <div className="flex items-center justify-between">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Skills usage
        </h3>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.15em] transition-colors group-hover:text-[var(--theme-accent)]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {hasUsage
            ? `${usage!.distinctSkills} of ${installedCount} used`
            : `${installedCount} installed`}
          {' · manage →'}
        </span>
      </div>

      {hasUsage ? (
        <ul className="flex flex-col gap-1.5">
          {top.slice(0, 5).map((s) => {
            const widthPct = Math.max(2, Math.round((s.totalCount / max) * 100))
            return (
              <li key={s.skill}>
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span
                    className="truncate font-mono"
                    style={{ color: 'var(--theme-text)' }}
                    title={s.skill}
                  >
                    {formatSkillName(s.skill)}
                  </span>
                  <span
                    className="font-mono text-[10px] tabular-nums"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    {s.totalCount}
                    <span className="ml-1">·</span>
                    <span className="ml-1">{s.percentage.toFixed(1)}%</span>
                  </span>
                </div>
                <div
                  className="mt-0.5 h-1 w-full overflow-hidden rounded-full"
                  style={{
                    background:
                      'color-mix(in srgb, var(--theme-border) 50%, transparent)',
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${widthPct}%`,
                      background:
                        'linear-gradient(90deg, var(--theme-warning), color-mix(in srgb, var(--theme-warning) 60%, transparent))',
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div
          className="font-mono text-[11px] uppercase tracking-[0.15em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          {installedCount === 0
            ? 'no skills installed'
            : 'no usage in this window yet'}
        </div>
      )}
    </button>
  )
}
