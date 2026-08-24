/**
 * The third wire into the JARVIS boards: the APPROVAL GATE, read-only.
 *
 * Reads the SAME query slice 6b already opened for the worker board — key
 * `['gateway','approvals']`, `fetchGatewayApprovals`, 15s — rather than a second
 * one. Sharing the key means the BLOCKED badge on a worker card and the gate on
 * the Command hero are computed from the same response at the same moment, and
 * two boards mounted together cost one request.
 *
 * READ-ONLY. `fetchGatewayApprovals` is a GET, and this file imports nothing
 * else from the gateway client — the POST lives in `use-resolve-approval.ts`,
 * behind a flag that is off, and is not reachable from here. What this hook
 * produces is DISPLAY: what is waiting, who asked, for how long.
 *
 * FALLBACK, not failure state. No gateway, no pending approvals, or a response
 * that never arrives: the boards render `commandGateFixture` and friends with
 * `isLive: false`, exactly as slices 3–5 drew them. An empty gate slot would be
 * worse than a fixture on both counts — it would make the design unreviewable
 * offline, and "nothing is waiting on you" is a claim this hook cannot make
 * from a request that may not have completed.
 *
 * ONE gate, not a list. The artboard shows a single hero gate, and that is the
 * right shape: a queue of decisions rendered as a stack invites triage by
 * scrolling. The hero is the OLDEST pending entry; the rest are a real derived
 * count ("+2 more waiting") and nothing more.
 */
import { useQuery } from '@tanstack/react-query'
import {
  buildOthersWaitingLine,
  mapApprovalToGateProps,
  mapApprovalToGateSummary,
  mapApprovalToMobileGateProps,
  normalizeApprovals,
  selectPendingApprovals,
} from './map-approvals'
import type { MappedGateProps } from './map-approvals'
import type { MobileGateSummaryFixture } from '@/components/jarvis/fixtures'
import {
  commandGateFixture,
  mobileCommandGateFixture,
  mobileConductorNeedsYouFixture,
} from '@/components/jarvis/fixtures'
import { fetchGatewayApprovals } from '@/lib/gateway-api'

/** Same key as `use-workers.ts` — one cache, one poll, one queue. */
const APPROVALS_QUERY_KEY = ['gateway', 'approvals'] as const
const APPROVALS_REFETCH_INTERVAL_MS = 15_000

export interface ApprovalsData {
  /** Desktop Command hero gate. */
  gate: MappedGateProps
  /** Mobile Command hero gate — same gate, no header sublabel. */
  mobileGate: MappedGateProps
  /** Conductor NEEDS YOU — a pointer to the gate, not the gate. */
  needsYou: MobileGateSummaryFixture
  /** "+2 more waiting", or empty when the hero is the whole queue. */
  othersWaiting: string
  /**
   * The id the resolve path would act on. NULL on the fallback, which is a lock
   * in its own right: a fixture gate has nothing to resolve, so
   * `use-resolve-approval` cannot POST even with its flag flipped.
   */
  approvalId: string | null
  /** True only when the gateway answered with at least one PENDING approval. */
  isLive: boolean
}

const FALLBACK: ApprovalsData = {
  gate: commandGateFixture,
  mobileGate: mobileCommandGateFixture,
  needsYou: mobileConductorNeedsYouFixture,
  othersWaiting: '',
  approvalId: null,
  isLive: false,
}

export function useApprovals(): ApprovalsData {
  const approvalsQuery = useQuery({
    queryKey: APPROVALS_QUERY_KEY,
    queryFn: fetchGatewayApprovals,
    refetchInterval: APPROVALS_REFETCH_INTERVAL_MS,
  })

  const pending = selectPendingApprovals(normalizeApprovals(approvalsQuery.data))

  // Loading, error, a gateway that is down, or a gateway that is up with an
  // empty queue all land here. Only the last of those means "nothing is waiting
  // on you", and this hook cannot tell it from the other three.
  if (pending.length === 0) return FALLBACK

  const [hero] = pending
  const now = Date.now()
  const others = pending.length - 1

  return {
    gate: mapApprovalToGateProps(hero, now),
    mobileGate: mapApprovalToMobileGateProps(hero, now),
    needsYou: mapApprovalToGateSummary(
      hero,
      others,
      mobileConductorNeedsYouFixture.heading,
    ),
    othersWaiting: buildOthersWaitingLine(others),
    approvalId: hero.id,
    isLive: true,
  }
}
