import { useEffect, useMemo, useState } from 'react'
import type { HomeModeContext } from '@/lib/home-mode'
import { classifyHomeMode } from '@/lib/home-mode'

const LANE_LABELS: Record<HomeModeContext['lane'], string> = {
  morning_ramp_up: 'Morning ramp-up',
  work_block: 'Work block',
  transition_home: 'Transition home',
  family_evening: 'Family / evening',
  light_creative_planning: 'Light creative',
  late_night_danger_zone: 'Late-night guardrail',
  weekend_reset: 'Weekend / reset',
  override_build_mode: 'Build mode',
}

const LANE_TONES: Record<HomeModeContext['lane'], string> = {
  morning_ramp_up: 'var(--theme-blue-secondary)',
  work_block: 'var(--theme-accent)',
  transition_home: 'var(--theme-warning)',
  family_evening: 'var(--theme-success)',
  light_creative_planning: 'var(--theme-blue-primary)',
  late_night_danger_zone: 'var(--theme-danger)',
  weekend_reset: 'var(--theme-success)',
  override_build_mode: 'var(--theme-accent-secondary)',
}

function formatClock(value: string): string {
  const match = value.match(/T(\d{2}):(\d{2})/)
  if (!match) return value
  const hour = Number(match[1])
  const minute = match[2]
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${suffix}`
}

export function HomeModeCard() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const context = useMemo(
    () =>
      classifyHomeMode({
        now,
        timezone: 'America/Chicago',
        location: 'West Texas',
        preferences: {
          timezone: 'America/Chicago',
          location: 'West Texas',
          defaultAfterWorkHomeProtection: true,
        },
      }),
    [now],
  )

  const tone = LANE_TONES[context.lane]

  return (
    <section
      className="relative overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(135deg, rgba(7,20,38,0.82), rgba(4,10,20,0.86))',
        borderColor: 'var(--theme-blue-border)',
        boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${tone}, color-mix(in srgb, ${tone} 45%, transparent), transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl"
        style={{ background: tone }}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="nova-label">Home Mode</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2
              className="font-mono text-xl font-bold uppercase leading-tight"
              style={{ color: 'var(--theme-text)' }}
            >
              {LANE_LABELS[context.lane]}
            </h2>
            <span
              className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{
                borderColor: `color-mix(in srgb, ${tone} 42%, transparent)`,
                background: `color-mix(in srgb, ${tone} 12%, transparent)`,
                color: tone,
              }}
            >
              {Math.round(context.confidence * 100)}%
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--theme-text)]/78">
            {context.suggested_boundary}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:min-w-[260px]">
          <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.42)] px-3 py-2">
            <div className="nova-label">Live clock</div>
            <div className="mt-1 font-mono text-sm text-[var(--theme-text)]">
              {formatClock(context.now_local)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.42)] px-3 py-2">
            <div className="nova-label">Intensity</div>
            <div className="mt-1 font-mono text-sm uppercase text-[var(--theme-text)]">
              {context.recommended_intensity}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(99,199,255,0.045)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--theme-muted)]">
        {context.reason} Persistence is rules + memory + wakeups/app state, not
        Nova constantly watching.
      </div>
    </section>
  )
}
