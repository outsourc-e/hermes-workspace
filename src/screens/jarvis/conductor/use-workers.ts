/**
 * The second wire into the JARVIS boards: WORKER STATUS, read-only.
 *
 * Two real sources, joined (`docs/design/jarvis-ui-mapping.md` §3.3):
 *   • `useSwarmStore` — the gateway's subagent session list, already filtered
 *     and status-derived by `src/stores/agent-swarm-store.ts`. This is the
 *     worker roster, and it is the store the rest of the app uses; nothing here
 *     re-derives a status the store already owns.
 *   • `fetchGatewayApprovals()` — a GET on `/api/gateway/approvals`, whose
 *     PENDING entries are the only authoritative source of `blocked`.
 *
 * On polling. The swarm store ships its own poller (`startPolling` /
 * `stopPolling`, 5s) but nothing in the app currently starts it — the one other
 * consumer, `use-sounds.ts`, subscribes passively and would read an empty list
 * forever. So this hook drives the store's OWN loop rather than opening a second
 * one, refcounted across mounts so the Command and Conductor boards share a
 * single interval and the last one to unmount is the one that stops it. No new
 * request shape, no new endpoint, no store change.
 *
 * READ-ONLY. Both calls are GETs. The approve/deny endpoint under
 * `/api/gateway/approvals/:id/` is a POST and belongs to slice 6c; its client
 * is not imported here, and the mapper emits no action chips, so no control on
 * a live card can imply approving, denying, or intervening.
 *
 * FALLBACK, not failure state. With no gateway — the normal case for a dev
 * design review — the store holds no sessions, the approvals GET resolves to an
 * empty list, and both boards render the slice-3/4 fixtures with
 * `isLive: false`. Neither board ever shows a spinner or an empty roster: an
 * empty worker grid reads as "no workers are running" when what actually
 * happened is "nothing answered".
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  buildWorkerBoardHeading,
  mapSwarmToMobileRunning,
  mapSwarmToMobileStats,
  mapSwarmToRailRows,
  mapSwarmToWorkerCards,
} from './map-workers'
import type { GatewayApprovalEntry } from '@/lib/gateway-api'
import type {
  ConductorSectionHeadingFixture,
  ConductorWorkerCardFixture,
  MobileStatFixture,
} from '@/components/jarvis/fixtures'
import type { WorkerStatusLineProps } from '@/components/jarvis/types'
import {
  commandWorkerCounts,
  commandWorkerFixtures,
  conductorWorkerBoardHeading,
  conductorWorkerCardFixtures,
  mobileConductorRunningFixtures,
  mobileConductorStatFixtures,
} from '@/components/jarvis/fixtures'
import { fetchGatewayApprovals } from '@/lib/gateway-api'
import { useSwarmStore } from '@/stores/agent-swarm-store'

const APPROVALS_QUERY_KEY = ['gateway', 'approvals'] as const
const APPROVALS_REFETCH_INTERVAL_MS = 15_000

/** The store's own default. Kept explicit so the cadence is visible here. */
const SWARM_POLL_INTERVAL_MS = 5_000

export interface WorkersData {
  /** Conductor WORKER BOARD cards. */
  cards: Array<ConductorWorkerCardFixture>
  /** WORKER BOARD section caption — the roster count is live when the cards are. */
  heading: ConductorSectionHeadingFixture
  /** Command WORKER RAIL rows plus its RUN/BLK/IDLE count line. */
  rail: { workers: Array<WorkerStatusLineProps>; counts: string }
  /** Mobile Conductor four-number strip. */
  mobileStats: Array<MobileStatFixture>
  /** Mobile Conductor RUNNING NOW rows. */
  mobileRunning: Array<WorkerStatusLineProps>
  /** True only when the store actually holds gateway sessions. */
  isLive: boolean
}

const FALLBACK: WorkersData = {
  cards: conductorWorkerCardFixtures,
  heading: conductorWorkerBoardHeading,
  rail: { workers: commandWorkerFixtures, counts: commandWorkerCounts },
  mobileStats: mobileConductorStatFixtures,
  mobileRunning: mobileConductorRunningFixtures,
  isLive: false,
}

/**
 * How many mounted boards want the swarm poll. Module scope because the store's
 * `stopPolling` is global: an unmounting Conductor must not kill the interval a
 * still-mounted Command board is reading from.
 */
let swarmSubscribers = 0

function useSwarmPolling() {
  useEffect(() => {
    swarmSubscribers += 1
    if (swarmSubscribers === 1) {
      useSwarmStore.getState().startPolling(SWARM_POLL_INTERVAL_MS)
    }
    return () => {
      swarmSubscribers -= 1
      if (swarmSubscribers === 0) useSwarmStore.getState().stopPolling()
    }
  }, [])
}

/**
 * The endpoint answers in two shapes — an `approvals` list and a `pending` one.
 * Entries from `pending` are pending by construction, so they are stamped as
 * such; entries from `approvals` keep whatever status the gateway gave them and
 * are filtered on it downstream. Deduped by id, because a gateway that sends
 * both lists sends the same record twice.
 */
function normalizeApprovals(response: {
  approvals?: Array<GatewayApprovalEntry>
  pending?: Array<GatewayApprovalEntry>
}): Array<GatewayApprovalEntry> {
  const byId = new Map<string, GatewayApprovalEntry>()

  for (const entry of response.pending ?? []) {
    byId.set(entry.id, { ...entry, status: 'pending' })
  }
  for (const entry of response.approvals ?? []) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  }

  return [...byId.values()]
}

export function useWorkers(): WorkersData {
  useSwarmPolling()

  const sessions = useSwarmStore((state) => state.sessions)

  const approvalsQuery = useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: fetchGatewayApprovals,
    refetchInterval: APPROVALS_REFETCH_INTERVAL_MS,
  })

  // No sessions means no roster, whether that is "the gateway is down" or "the
  // gateway is up and idle". Both render the fixtures: an empty five-column
  // grid under a live banner would claim the swarm is empty on the strength of
  // a request that may never have completed.
  if (sessions.length === 0) return FALLBACK

  const approvals = approvalsQuery.data
    ? normalizeApprovals(approvalsQuery.data)
    : []

  const now = Date.now()
  const cards = mapSwarmToWorkerCards(sessions, approvals, now)

  return {
    cards,
    heading: buildWorkerBoardHeading(sessions.length, cards.length),
    rail: mapSwarmToRailRows(sessions, approvals, now),
    mobileStats: mapSwarmToMobileStats(sessions, approvals),
    mobileRunning: mapSwarmToMobileRunning(sessions, approvals, now),
    isLive: true,
  }
}
