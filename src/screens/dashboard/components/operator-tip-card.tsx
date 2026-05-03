import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Idea01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

type Tip = {
  id: string
  /** When this tip is most relevant. Highest score wins. */
  score: (overview: DashboardOverview | null) => number
  title: string
  body: string
  /** Optional internal route the CTA jumps to. */
  href?: string
  /** Optional CTA label. Defaults to "Open" when href is set. */
  cta?: string
  /** Visual tone. */
  tone?: 'info' | 'positive' | 'warn'
}

/**
 * Catalog of operator tips. Each tip carries a `score` function that
 * looks at the live overview payload and returns 0..100 — higher
 * meaning "this tip matters right now". We pick the highest-scoring
 * tip on first render, then let the operator cycle through the rest
 * via the refresh affordance.
 *
 * This is intentionally local + heuristic. The bottom of the main
 * column was empty and Eric asked for a 'standard / tip of the day'
 * card to fill it; making the tips contextual is just a small
 * upgrade over a static random one.
 */
const TIPS: ReadonlyArray<Tip> = [
  {
    id: 'cache-low',
    title: 'Cache hit rate is low',
    body: "Reusable system prompts get cached on most providers. Pin shared scaffolding (skills, persona, tools) into a stable preamble so the next request hits cache instead of paying for fresh input.",
    tone: 'warn',
    cta: 'Open analytics',
    href: '/analytics',
    score: (o) => {
      const a = o?.analytics
      if (!a || a.source !== 'analytics') return 0
      const denom = a.cacheReadTokens + a.inputTokens
      if (denom === 0) return 0
      const rate = (a.cacheReadTokens / denom) * 100
      return rate < 30 ? 70 : 0
    },
  },
  {
    id: 'cache-high',
    title: 'Cache hit rate looks great',
    body: "Cache reads are doing the heavy lifting. Worth checking if any *cold* sessions are skipping your shared preamble — those usually represent untapped savings.",
    tone: 'positive',
    score: (o) => {
      const a = o?.analytics
      if (!a || a.source !== 'analytics') return 0
      const denom = a.cacheReadTokens + a.inputTokens
      if (denom === 0) return 0
      const rate = (a.cacheReadTokens / denom) * 100
      return rate >= 60 ? 50 : 0
    },
  },
  {
    id: 'stale-cron',
    title: 'You have stale cron jobs',
    body: "Cron jobs that haven't run in 7+ days are usually a sign of a paused integration or a misconfigured schedule. Worth a quick triage so you don't lose silent automation.",
    tone: 'warn',
    cta: 'Open jobs',
    href: '/jobs',
    score: (o) => {
      const cron = o?.cron
      if (!cron) return 0
      // We don't have the per-job staleness array exposed here, so use
      // the next-run-at field as a proxy: anything in the past plus
      // the strip's own messaging surfaces this.
      const next = cron.nextRunAt ? Date.parse(cron.nextRunAt) : NaN
      if (!Number.isFinite(next)) return 60
      const overdue = Date.now() - next > 7 * 86_400_000
      return overdue ? 80 : 0
    },
  },
  {
    id: 'config-drift',
    title: 'Gateway config has drift',
    body: "There are pending diffs between your local gateway config and the latest committed version. Apply or reject them so your live behavior matches what the repo says.",
    tone: 'warn',
    cta: 'Open settings',
    href: '/settings',
    score: (o) => {
      const s = o?.status
      if (!s) return 0
      if (
        s.configVersion !== null &&
        s.latestConfigVersion !== null &&
        s.latestConfigVersion > s.configVersion
      ) {
        return 65
      }
      return 0
    },
  },
  {
    id: 'restart-pending',
    title: 'Gateway restart pending',
    body: "Some config or plugin change wants a gateway restart to take effect. Best to do it during a quiet window — long-running sessions handle it gracefully.",
    tone: 'warn',
    cta: 'Open settings',
    href: '/settings',
    score: (o) => (o?.status?.restartRequested ? 75 : 0),
  },
  {
    id: 'achievements-momentum',
    title: 'Achievement momentum',
    body: "You unlocked something recently — keep going. The Hermes achievements track real workflows, so the next tier usually drops out of normal usage rather than grinding.",
    tone: 'positive',
    cta: 'View all',
    score: (o) => {
      const ach = o?.achievements
      if (!ach || ach.recentUnlocks.length === 0) return 0
      const last = ach.recentUnlocks[0]?.unlockedAt
      if (!last) return 0
      const ageH = (Date.now() / 1000 - last) / 3600
      return ageH < 12 ? 40 : 0
    },
  },
  {
    id: 'sessions-low',
    title: 'Things have been quiet',
    body: "Session count is below the prior period — could be intentional, could be silent breakage. Worth scanning recent logs and reviewing your cron / heartbeat schedule.",
    tone: 'info',
    cta: 'Open sessions',
    href: '/sessions',
    score: (o) => {
      const a = o?.analytics
      if (!a || a.source !== 'analytics') return 0
      const dailyS = a.daily.map((d) => d.sessions)
      if (dailyS.length < 4) return 0
      const mid = Math.floor(dailyS.length / 2)
      const recent = dailyS.slice(mid).reduce((x, y) => x + y, 0)
      const prior = dailyS.slice(0, mid).reduce((x, y) => x + y, 0)
      if (prior === 0) return 0
      const drop = (prior - recent) / prior
      return drop > 0.3 ? 55 : 0
    },
  },
  {
    id: 'top-model-share',
    title: 'One model is doing all the work',
    body: "Concentration risk: if your top model is handling >70% of calls, an outage or pricing change hits hard. Worth setting up a fallback even if you never use it.",
    tone: 'info',
    cta: 'Open models',
    href: '/models',
    score: (o) => {
      const a = o?.analytics
      if (!a || a.source !== 'analytics') return 0
      const total = a.topModels.reduce((x, m) => x + m.calls, 0)
      if (total === 0) return 0
      const top = a.topModels[0]
      if (!top) return 0
      return top.calls / total > 0.7 ? 45 : 0
    },
  },
  // Evergreen tips. Always score low so they only surface when
  // nothing context-specific is more relevant.
  {
    id: 'edit-mode',
    title: 'Customize this dashboard',
    body: "Use the pencil icon in the header to enter edit mode. You can hide widgets you don't care about and reveal extras (Provider Mix, Velocity, Cost Ledger, Live Logs) from the picker.",
    tone: 'info',
    score: () => 5,
  },
  {
    id: 'skills-shortcut',
    title: 'Skills are first-class',
    body: "Hermes loads skills into context on demand. Click any row in Skills Usage to jump to that skill's page and edit its SKILL.md — every change is hot-reloaded.",
    tone: 'info',
    cta: 'Open skills',
    href: '/skills',
    score: () => 4,
  },
  {
    id: 'new-chat',
    title: "Pick the right model up-front",
    body: "Hitting New Chat without a model in mind is fine, but Hermes routes faster when you set a default in Settings → Models for your common task types.",
    tone: 'info',
    cta: 'New chat',
    href: '/chat/new',
    score: () => 3,
  },
]

const TONE_COLORS: Record<NonNullable<Tip['tone']>, string> = {
  info: 'var(--theme-accent)',
  positive: 'var(--theme-success)',
  warn: 'var(--theme-warning)',
}

const STORAGE_KEY = 'dashboard.tipIndex.v1'

export function OperatorTipCard({
  overview,
}: {
  overview: DashboardOverview | null
}) {
  const navigate = useNavigate()

  // Sort once per overview update. Highest-scoring tips first; ties
  // broken by the catalog's own order (stable).
  const ranked = useMemo(() => {
    const scored = TIPS.map((t) => ({ tip: t, score: t.score(overview) }))
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.tip)
  }, [overview])

  const [index, setIndex] = useState(0)

  // Restore last-shown index on mount so a refresh doesn't always
  // snap back to the top tip. We bound by ranked.length so a
  // changing tip set never crashes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) setIndex(n % Math.max(1, ranked.length))
    // Only restore on first mount; tip rotation thereafter is manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, String(index))
  }, [index])

  if (ranked.length === 0) return null
  const tip = ranked[index % ranked.length]
  const tone = TONE_COLORS[tip.tone ?? 'info']

  const handleNext = () => setIndex((i) => (i + 1) % ranked.length)
  const handleCta = () => {
    if (!tip.href) return
    if (tip.href.startsWith('http')) {
      window.open(tip.href, '_blank', 'noopener,noreferrer')
      return
    }
    if (tip.href === '/chat/new') {
      navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })
      return
    }
    navigate({ to: tip.href as never })
  }

  return (
    <div
      className="relative flex items-stretch gap-3 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${tone}, color-mix(in srgb, ${tone} 40%, transparent), transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-15 blur-3xl"
        style={{ background: tone }}
      />

      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
        style={{
          background: `color-mix(in srgb, ${tone} 12%, transparent)`,
          borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`,
          color: tone,
        }}
      >
        <HugeiconsIcon icon={Idea01Icon} size={18} strokeWidth={1.7} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: tone }}
          >
            Tip · {index + 1}/{ranked.length}
          </span>
          <div className="flex items-center gap-1.5">
            {tip.href ? (
              <button
                type="button"
                onClick={handleCta}
                className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] transition-all hover:scale-[1.03] hover:bg-[var(--theme-card)]/70"
                style={{
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                }}
              >
                {tip.cta ?? 'Open'} →
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next tip"
              title="Next tip"
              className="inline-flex size-6 items-center justify-center rounded-full border transition-all hover:scale-[1.05] hover:bg-[var(--theme-card)]/70"
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-muted)',
              }}
            >
              <HugeiconsIcon
                icon={Refresh01Icon}
                size={11}
                strokeWidth={1.8}
              />
            </button>
          </div>
        </div>
        <h3
          className="text-[12px] font-semibold leading-tight"
          style={{ color: 'var(--theme-text)' }}
        >
          {tip.title}
        </h3>
        <p
          className="text-[11px] leading-snug"
          style={{ color: 'var(--theme-muted)' }}
        >
          {tip.body}
        </p>
      </div>
    </div>
  )
}
