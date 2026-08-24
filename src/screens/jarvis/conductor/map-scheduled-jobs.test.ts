import { describe, expect, it } from 'vitest'
import {
  buildScheduledJobsHeading,
  mapClaudeJobToConductorFixture,
  mapClaudeJobsToConductorFixtures,
  mapConductorFixturesToMobileJobs,
} from './map-scheduled-jobs'
import type { ClaudeJob } from '@/lib/jobs-api'

const DAY_MS = 86_400_000
/** A fixed clock, so the SILENT derivation is arithmetic and not a race. */
const NOW = new Date('2026-08-24T12:00:00Z').getTime()

const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString()

function job(overrides: Partial<ClaudeJob> = {}): ClaudeJob {
  return {
    id: 'job-1',
    name: 'vault-index-rebuild',
    prompt: 'rebuild the index',
    schedule: { kind: 'interval' },
    schedule_display: 'every 6h',
    enabled: true,
    state: 'completed',
    last_run_at: daysAgo(0),
    last_run_success: true,
    run_count: 41,
    ...overrides,
  }
}

describe('mapClaudeJobToConductorFixture', () => {
  it('maps a healthy job to ok/OK', () => {
    const card = mapClaudeJobToConductorFixture(job(), NOW)

    expect(card.tone).toBe('ok')
    expect(card.badge).toBe('OK')
    expect(card.name).toBe('vault-index-rebuild')
    expect(card.detail[0].text).toMatch(/^last .+ · 41 runs$/)
  })

  it('maps a failed state to failed/FAILED with the real error text', () => {
    const card = mapClaudeJobToConductorFixture(
      job({
        name: 'ops-watch:certs',
        state: 'failed',
        last_run_success: false,
        last_run_error: 'certbot renew → exit 1: DNS-01 challenge timeout',
      }),
      NOW,
    )

    expect(card.tone).toBe('failed')
    expect(card.badge).toBe('FAILED')
    expect(card.detail).toContainEqual({
      text: 'certbot renew → exit 1: DNS-01 challenge timeout',
      tone: 'failed',
    })
  })

  it('treats last_run_success === false as FAILED even in a success state', () => {
    const card = mapClaudeJobToConductorFixture(
      job({ state: 'completed', last_run_success: false }),
      NOW,
    )

    expect(card.tone).toBe('failed')
    expect(card.badge).toBe('FAILED')
    // No error text served: the card says so rather than inventing a cause.
    expect(card.detail.at(-1)).toEqual({
      text: 'no error text reported',
      tone: 'failed',
    })
  })

  it('derives SILENT <N>d for an enabled job long past its last run', () => {
    const card = mapClaudeJobToConductorFixture(
      job({ name: 'maintainer:dep-audit', last_run_at: daysAgo(23) }),
      NOW,
    )

    expect(card.tone).toBe('silent')
    expect(card.badge).toBe('SILENT 23d')
  })

  it('holds the SILENT derivation below the conservative threshold', () => {
    const card = mapClaudeJobToConductorFixture(
      job({ last_run_at: daysAgo(13) }),
      NOW,
    )

    expect(card.tone).toBe('ok')
    expect(card.badge).toBe('OK')
  })

  it('does not call a disabled job silent — it says it is disabled', () => {
    const card = mapClaudeJobToConductorFixture(
      job({ enabled: false, last_run_at: daysAgo(60) }),
      NOW,
    )

    expect(card.tone).toBe('ok')
    expect(card.detail).toContainEqual({
      text: 'disabled · not scheduled',
      tone: 'dim',
    })
  })

  it('does not invent an age for a job that has never run', () => {
    const card = mapClaudeJobToConductorFixture(
      job({ last_run_at: null, run_count: 0 }),
      NOW,
    )

    expect(card.tone).toBe('ok')
    expect(card.badge).toBe('OK')
    expect(card.detail[0]).toEqual({ text: 'no last run recorded' })
  })

  it('takes the owning worker from the name prefix, or omits it', () => {
    expect(
      mapClaudeJobToConductorFixture(
        job({ name: 'ops-watch:certs', schedule_display: 'daily 05:00' }),
        NOW,
      ).cadence,
    ).toBe('daily 05:00 · ops-watch')

    expect(
      mapClaudeJobToConductorFixture(
        job({ name: 'weekly-review-digest', schedule_display: 'Sun 18:00' }),
        NOW,
      ).cadence,
    ).toBe('Sun 18:00')
  })

  it('falls back to the raw schedule rather than a tidy guess', () => {
    expect(
      mapClaudeJobToConductorFixture(
        job({ schedule_display: undefined, schedule: { cron: '0 5 * * *' } }),
        NOW,
      ).cadence,
    ).toBe('0 5 * * *')

    expect(
      mapClaudeJobToConductorFixture(
        job({ schedule_display: undefined, schedule: {} }),
        NOW,
      ).cadence,
    ).toBe('schedule unavailable')
  })

  /**
   * These two cases come straight off a real gateway: `profiles=all` returns
   * the same job registered under `default`, `orchestrator` and `researcher`,
   * and the broken ones report `last_run_success: null` beside a populated
   * `last_run_error`.
   */
  it('qualifies the card with the owning profile, as the board idiom does', () => {
    const card = mapClaudeJobToConductorFixture(
      job({
        id: 'orchestrator:06ec90ba4703',
        profile: 'orchestrator',
        profile_name: 'orchestrator',
        name: 'The Nutrient — Weekly Newsletter',
        schedule_display: '0 9 * * 1',
      }),
      NOW,
    )

    expect(card.name).toBe('orchestrator:The Nutrient — Weekly Newsletter')
    expect(card.cadence).toBe('0 9 * * 1 · orchestrator')
  })

  it('reads the profile off the id when the field is absent', () => {
    expect(
      mapClaudeJobToConductorFixture(job({ id: 'researcher:13b7bc8d94be' }), NOW)
        .name,
    ).toBe('researcher:vault-index-rebuild')
  })

  it('fails a run that recorded an error and never reported success', () => {
    const card = mapClaudeJobToConductorFixture(
      job({
        state: 'scheduled',
        last_run_success: null,
        last_run_error: '[blocked_config] provider credential missing',
      }),
      NOW,
    )

    expect(card.tone).toBe('failed')
    expect(card.badge).toBe('FAILED')
    expect(card.detail).toContainEqual({
      text: '[blocked_config] provider credential missing',
      tone: 'failed',
    })
  })

  it('lets a reported success outrank an error left beside it', () => {
    const card = mapClaudeJobToConductorFixture(
      job({ state: 'scheduled', last_run_success: true, error: 'stale' }),
      NOW,
    )

    expect(card.tone).toBe('ok')
    expect(card.badge).toBe('OK')
  })

  it('clamps an unbounded error so a live card cannot clip the board', () => {
    const long =
      '[blocked_config] provider credential missing: No inference provider configured. ' +
      "Run 'hermes model' to choose a provider and model, or set an API key " +
      '(OPENROUTER_API_KEY, OPENAI_API_KEY, etc.) in ~/.hermes/.env.'
    const card = mapClaudeJobToConductorFixture(
      job({ last_run_success: false, last_run_error: long }),
      NOW,
    )
    const line = card.detail.at(-1)!

    expect(line.tone).toBe('failed')
    expect(line.text.length).toBeLessThanOrEqual(121)
    expect(line.text.endsWith('…')).toBe(true)
    // The clamp is a cut, never a rewrite: what is shown is verbatim.
    expect(long.startsWith(line.text.slice(0, -1))).toBe(true)
  })

  it('leaves a short error verbatim', () => {
    expect(
      mapClaudeJobToConductorFixture(
        job({ last_run_success: false, last_run_error: 'certbot exit 1' }),
        NOW,
      ).detail.at(-1),
    ).toEqual({ text: 'certbot exit 1', tone: 'failed' })
  })

  it('renders no action chips — this slice cannot run, reload or triage', () => {
    expect(
      mapClaudeJobToConductorFixture(job({ state: 'failed' }), NOW).actions,
    ).toEqual([])
  })
})

describe('NO SOURCE items are never produced from real data', () => {
  const jobs: Array<ClaudeJob> = [
    job(),
    job({ id: 'j2', name: 'ops-watch:certs', state: 'failed' }),
    job({ id: 'j3', name: 'maintainer:dep-audit', last_run_at: daysAgo(23) }),
    job({ id: 'j4', enabled: false }),
    job({ id: 'j5', last_run_at: null }),
    // The PARTIAL case as it really arrives: free text inside last_run_error.
    job({
      id: 'j6',
      name: 'researcher:feed-scan',
      last_run_success: false,
      last_run_error: '2 of 14 feeds 403',
    }),
  ]
  const cards = mapClaudeJobsToConductorFixtures(jobs, NOW)

  it('never emits a partial tone or a PARTIAL badge (§3.5 item 11)', () => {
    for (const card of cards) {
      expect(card.tone).not.toBe('partial')
      expect(card.badge).not.toContain('PARTIAL')
      expect(card.badgeNoSource).toBeUndefined()
    }
    // The "2 of 14 feeds 403" job is a FAILED job whose error happens to be
    // partial-sounding prose — the badge reports the state, not the prose.
    expect(cards[5].tone).toBe('failed')
    expect(cards[5].badge).toBe('FAILED')
  })

  it('never emits the launchd diagnostic or any unsourced line (§3.5 item 12)', () => {
    for (const card of cards) {
      for (const line of card.detail) {
        expect(line.noSource).toBeUndefined()
        expect(line.text.toLowerCase()).not.toContain('launchd')
      }
    }
  })

  it('never invents a run tally, a duration or a payload count', () => {
    const text = cards.flatMap((card) => card.detail.map((l) => l.text)).join(' ')

    expect(text).not.toMatch(/runs failed/)
    expect(text).not.toMatch(/expected \d+ runs/)
    expect(text).not.toMatch(/\d+ notes/)
    expect(text).not.toMatch(/\b\d+(\.\d+)?s\b/) // no fake durations like "41s"
  })
})

describe('mapClaudeJobsToConductorFixtures', () => {
  it('keeps card names unique so the grid cannot key two cards alike', () => {
    const cards = mapClaudeJobsToConductorFixtures(
      [
        job({ id: 'default:aaa', name: 'Morning Daily Briefing' }),
        job({ id: 'orchestrator:aaa', name: 'Morning Daily Briefing' }),
        // Same profile AND same name: only the id can separate these.
        job({ id: 'default:bbb', name: 'Morning Daily Briefing' }),
      ],
      NOW,
    )

    expect(cards.map((c) => c.name)).toEqual([
      'default:Morning Daily Briefing',
      'orchestrator:Morning Daily Briefing',
      'default:Morning Daily Briefing (default:bbb)',
    ])
    expect(new Set(cards.map((c) => c.name)).size).toBe(3)
  })
})

describe('buildScheduledJobsHeading', () => {
  it('counts what is actually registered', () => {
    expect(buildScheduledJobsHeading(9)).toEqual({
      label: 'SCHEDULED JOBS',
      note: '9 registered · health is last-run, not next-run',
    })
  })
})

describe('mapConductorFixturesToMobileJobs', () => {
  const cards = mapClaudeJobsToConductorFixtures(
    [
      job({ id: 'a' }),
      job({ id: 'b', name: 'x-two' }),
      job({
        id: 'c',
        name: 'ops-watch:certs',
        state: 'failed',
        last_run_error: 'certbot exit 1',
      }),
      job({ id: 'd', name: 'maintainer:dep-audit', last_run_at: daysAgo(23) }),
    ],
    NOW,
  )

  it('keeps only the unhealthy jobs and tallies the rest', () => {
    const mobile = mapConductorFixturesToMobileJobs(cards)

    expect(mobile.jobs.map((j) => [j.name, j.tone, j.badge])).toEqual([
      ['ops-watch:certs', 'failed', 'FAIL'],
      ['maintainer:dep-audit', 'silent', 'SILENT 23d'],
    ])
    expect(mobile.jobs[0].detail).toBe('certbot exit 1')
    expect(mobile.healthy).toBe('2 other jobs healthy')
  })

  it('marks no live mobile row as unsourced', () => {
    for (const row of mapConductorFixturesToMobileJobs(cards).jobs) {
      expect(row.noSource).toBeUndefined()
      expect(row.detail.toLowerCase()).not.toContain('launchd')
    }
  })

  it('singularises the healthy tally', () => {
    const mobile = mapConductorFixturesToMobileJobs(cards.slice(1))
    expect(mobile.healthy).toBe('1 other job healthy')
  })
})
