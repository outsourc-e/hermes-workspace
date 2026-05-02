import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CancelIcon, Award01Icon } from '@hugeicons/core-free-icons'
import type {
  DashboardAchievementUnlock,
  DashboardOverview,
} from '@/server/dashboard-aggregator'

const TIER_COLORS: Record<string, string> = {
  Copper: '#b45309',
  Silver: '#9ca3af',
  Gold: '#facc15',
  Diamond: '#22d3ee',
  Olympian: '#f472b6',
}

function tierColor(tier: string | null): string {
  if (!tier) return 'var(--theme-muted)'
  return TIER_COLORS[tier] ?? 'var(--theme-muted)'
}

function relativeTime(unlockedAtSeconds: number | null): string {
  if (!unlockedAtSeconds) return ''
  const diff = Date.now() / 1000 - unlockedAtSeconds
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

function AchievementRow({
  unlock,
  compact = false,
}: {
  unlock: DashboardAchievementUnlock
  compact?: boolean
}) {
  return (
    <div
      className="flex items-center gap-2 rounded border px-2 py-1.5"
      style={{ borderColor: 'var(--theme-border)' }}
    >
      <span
        aria-hidden
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-base"
        style={{
          background:
            'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
          color: tierColor(unlock.tier),
        }}
      >
        🏆
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[11px] font-semibold"
          style={{ color: 'var(--theme-text)' }}
        >
          {unlock.name}
        </div>
        {!compact ? (
          <div
            className="truncate text-[10px]"
            style={{ color: 'var(--theme-muted)' }}
          >
            {unlock.description || unlock.category}
          </div>
        ) : null}
      </div>
      <div className="text-right">
        {unlock.tier ? (
          <span
            className="block text-[9px] font-mono uppercase tracking-[0.1em]"
            style={{ color: tierColor(unlock.tier) }}
          >
            {unlock.tier}
          </span>
        ) : null}
        <span
          className="block text-[9px] font-mono"
          style={{ color: 'var(--theme-muted)' }}
        >
          {relativeTime(unlock.unlockedAt)}
        </span>
      </div>
    </div>
  )
}

/**
 * Compact achievements panel: shows the 3 most recent unlocks plus a
 * "View all" button that opens a modal with the full ribbon. Hides
 * itself when the achievements plugin isn't installed (section comes
 * back null from the aggregator).
 */
export function AchievementsCard({
  achievements,
}: {
  achievements: DashboardOverview['achievements']
}) {
  const [showAll, setShowAll] = useState(false)
  const [allUnlocks, setAllUnlocks] = useState<
    Array<DashboardAchievementUnlock> | null
  >(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)

  if (!achievements) return null

  const openModal = async () => {
    setShowAll(true)
    if (allUnlocks !== null) return
    setLoadingAll(true)
    setAllError(null)
    try {
      const res = await fetch('/api/dashboard/overview?achievements=12')
      if (!res.ok) throw new Error(`overview ${res.status}`)
      const data = (await res.json()) as DashboardOverview
      setAllUnlocks(data.achievements?.recentUnlocks ?? [])
    } catch (err) {
      setAllError(err instanceof Error ? err.message : 'failed to load')
    } finally {
      setLoadingAll(false)
    }
  }

  return (
    <>
      <div
        className="relative overflow-hidden rounded-xl border p-3"
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
              'linear-gradient(90deg, #facc15, color-mix(in srgb, #facc15 40%, transparent), transparent)',
          }}
        />
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Award01Icon}
              size={14}
              strokeWidth={1.5}
              style={{ color: 'var(--theme-muted)' }}
            />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--theme-text)' }}
            >
              Achievements
            </h3>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="font-mono text-[9px] uppercase tracking-[0.15em] transition-colors hover:text-[var(--theme-accent)]"
            style={{ color: 'var(--theme-muted)' }}
          >
            {achievements.totalUnlocked} unlocked · view all →
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {achievements.recentUnlocks.length === 0 ? (
            <div
              className="py-3 text-center text-[11px]"
              style={{ color: 'var(--theme-muted)' }}
            >
              No unlocks yet — keep working.
            </div>
          ) : (
            // Render every unlock the aggregator returns so the card
            // grows to consume vertical space (Eric's iter-007 ask).
            // Default count is now 5 so the rail has more presence.
            achievements.recentUnlocks.map((unlock) => (
              <AchievementRow key={unlock.id} unlock={unlock} />
            ))
          )}
        </div>
      </div>

      {showAll ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAll(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-[var(--theme-card)]"
            style={{ borderColor: 'var(--theme-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <h2
                className="text-sm font-semibold uppercase tracking-[0.15em]"
                style={{ color: 'var(--theme-text)' }}
              >
                Achievement Ribbon
              </h2>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                aria-label="Close"
                className="rounded p-1 hover:bg-[var(--theme-card)]/80"
              >
                <HugeiconsIcon
                  icon={CancelIcon}
                  size={16}
                  strokeWidth={1.5}
                  style={{ color: 'var(--theme-muted)' }}
                />
              </button>
            </div>
            <div className="max-h-[64vh] overflow-y-auto p-4">
              {loadingAll ? (
                <div
                  className="py-8 text-center text-[11px]"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  Loading…
                </div>
              ) : allError ? (
                <div
                  className="py-8 text-center text-[11px]"
                  style={{ color: 'var(--theme-danger)' }}
                >
                  {allError}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(allUnlocks ?? achievements.recentUnlocks).map((unlock) => (
                    <AchievementRow key={unlock.id} unlock={unlock} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
