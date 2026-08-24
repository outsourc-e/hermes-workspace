/**
 * The one wire into the Conductor board: SCHEDULED JOBS, read-only.
 *
 * Slices 2–5 drew this board from fixtures with a stated promise that slice 6
 * would get "one file to replace". This is that file for §3.4 — it reads the
 * SAME query the real jobs screen reads (`src/screens/jobs/jobs-screen.tsx`):
 * key `['claude','jobs']`, `fetchJobs`, 30s poll. Sharing the key rather than
 * opening a second request means the design surface and the product screen show
 * the same jobs at the same moment, and the board costs nothing extra when both
 * are mounted.
 *
 * READ-ONLY. `fetchJobs` is a GET; nothing here mutates, and the mapper emits
 * no action chips, so no control on a live card can imply a run or a reload.
 *
 * FALLBACK, not failure state. With no gateway — which is the normal case for a
 * dev design review — the query errors and the board renders the slice-4
 * fixtures exactly as before, `isLive: false`. The board never renders a
 * spinner or an empty grid: those would make the design unreviewable offline.
 */
import { useQuery } from '@tanstack/react-query'
import {
  buildScheduledJobsHeading,
  mapClaudeJobsToConductorFixtures,
  mapConductorFixturesToMobileJobs,
} from './map-scheduled-jobs'
import type {
  ConductorJobFixture,
  ConductorSectionHeadingFixture,
  MobileJobFixture,
  MobileScheduleHealthFixture,
} from '@/components/jarvis/fixtures'
import {
  conductorJobFixtures,
  conductorJobsHeading,
  mobileConductorJobFixtures,
  mobileConductorScheduleHealth,
} from '@/components/jarvis/fixtures'
import { fetchJobs } from '@/lib/jobs-api'

/** Same key as the jobs screen — one cache, one poll, one truth. */
const JOBS_QUERY_KEY = ['claude', 'jobs'] as const
const JOBS_REFETCH_INTERVAL_MS = 30_000

export interface ScheduledJobsData {
  /** Desktop cards. */
  jobs: Array<ConductorJobFixture>
  /** Section heading — the registered count is live when the jobs are. */
  heading: ConductorSectionHeadingFixture
  /** Mobile SCHEDULE HEALTH rows (the unhealthy jobs only). */
  mobileJobs: Array<MobileJobFixture>
  /** Mobile SCHEDULE HEALTH footer. */
  mobileScheduleHealth: MobileScheduleHealthFixture
  /** True only when the gateway answered with at least one job. */
  isLive: boolean
}

const FALLBACK: ScheduledJobsData = {
  jobs: conductorJobFixtures,
  heading: conductorJobsHeading,
  mobileJobs: mobileConductorJobFixtures,
  mobileScheduleHealth: mobileConductorScheduleHealth,
  isLive: false,
}

export function useScheduledJobs(): ScheduledJobsData {
  const jobsQuery = useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: fetchJobs,
    refetchInterval: JOBS_REFETCH_INTERVAL_MS,
  })

  const jobs = jobsQuery.data
  // Loading, error, or a gateway with no jobs at all: the fixture board is the
  // honest thing to show, because an empty grid reads as "nothing scheduled"
  // when what actually happened is "nothing answered".
  if (!jobs || jobs.length === 0) return FALLBACK

  const mapped = mapClaudeJobsToConductorFixtures(jobs)
  const mobile = mapConductorFixturesToMobileJobs(mapped)

  return {
    jobs: mapped,
    heading: buildScheduledJobsHeading(mapped.length),
    mobileJobs: mobile.jobs,
    mobileScheduleHealth: {
      ...mobileConductorScheduleHealth,
      healthy: mobile.healthy,
      // NO SOURCE (§3.5 item 11) — a live footer carries no PARTIAL tally.
      // `mobile-conductor.tsx` drops the half-line when this is empty.
      partial: '',
    },
    isLive: true,
  }
}
