/**
 * The fourth wire, and the only one that touches the product's thesis:
 * CODE CHECKPOINT verification, read-only.
 *
 * `docs/design/jarvis-ui-mapping.md` §3.5 items 2–3 say verified-vs-claimed on
 * a CHAT MESSAGE is NO SOURCE, and §3.6 says there is exactly one real
 * verification source in the codebase — the `tsc | tests | lint | e2e` checks a
 * workspace checkpoint records. That source is OUT OF BAND from chat. So this
 * hook exists to feed ONE surface, its own, and the conversation stays inert:
 * pointing this data at a message would claim a human-language assertion had
 * been verified by a typechecker, which is precisely the dishonesty the
 * primitive was built to prevent.
 *
 * TWO GETs, no writes. `listWorkspaceCheckpoints` and
 * `getWorkspaceCheckpointDetail` are both reads. The same module also exports
 * a checkpoint-review client and two typecheck-runner clients, all of them
 * writes; the import list below names every function this file uses, and none
 * of those three is on it, so no code path from this hook can approve a
 * checkpoint or fire a verification run. The mapper emits no action chips, so
 * nothing on a live badge can imply otherwise either.
 *
 * The list has to be fetched to reach the detail: `WorkspaceCheckpoint` carries
 * only `verification_raw` (free text), while the per-check map lives on
 * `WorkspaceCheckpointDetail`. So: newest checkpoint from the list, then its
 * detail. Two requests, both cheap, both cached under the `['workspace', …]`
 * key family the rest of the app already uses.
 *
 * FALLBACK, not failure state. The workspace API is served by the workspace
 * daemon and simply 404s when it is not running — the normal case for a dev
 * design review. Then, and on loading, on error, and when there are no
 * checkpoints at all, the surface renders `verificationBadgeFixtures` with
 * `isLive: false` and says so. `retry: false` keeps a missing daemon from
 * becoming four failed requests.
 *
 * One case deliberately stays LIVE with nothing to show: a real checkpoint
 * whose checks are all `missing`/`not_configured` produces zero badges, and
 * that is NOT the fallback — "no check has run on this checkpoint" is real
 * information, and replacing it with three fixture badges would bury it. The
 * surface prints the inert lines instead.
 */
import { useQuery } from '@tanstack/react-query'
import {
  buildCheckpointSourceLine,
  mapCheckpointToBadges,
  mapCheckpointToInertChecks,
} from './map-checkpoints'
import type { CheckpointInertCheck } from './map-checkpoints'
import type { VerificationBadgeProps } from '@/components/jarvis/types'
import { verificationBadgeFixtures } from '@/components/jarvis/fixtures'
import {
  getWorkspaceCheckpointDetail,
  listWorkspaceCheckpoints,
  sortCheckpointsNewestFirst,
} from '@/lib/workspace-checkpoints'

const CHECKPOINTS_QUERY_KEY = ['workspace', 'checkpoints'] as const
const CHECKPOINTS_REFETCH_INTERVAL_MS = 30_000

export interface CheckpointVerificationData {
  /** One badge per check that actually ran (`passed`/`failed`). */
  badges: Array<VerificationBadgeProps>
  /** The checks that produced no verdict — rendered as text, never as a badge. */
  inertChecks: Array<CheckpointInertCheck>
  /** Which checkpoint this is, from real fields. NULL on the fixture fallback. */
  source: string | null
  /** True only when the workspace API answered with a real checkpoint detail. */
  isLive: boolean
}

const FALLBACK: CheckpointVerificationData = {
  badges: verificationBadgeFixtures.map((fixture) => fixture.props),
  inertChecks: [],
  source: null,
  isLive: false,
}

export function useCheckpointVerification(): CheckpointVerificationData {
  const checkpointsQuery = useQuery({
    queryKey: CHECKPOINTS_QUERY_KEY,
    queryFn: () => listWorkspaceCheckpoints(),
    refetchInterval: CHECKPOINTS_REFETCH_INTERVAL_MS,
    // No workspace daemon is the expected dev case, not an outage worth
    // retrying three times.
    retry: false,
  })

  const newest = sortCheckpointsNewestFirst(checkpointsQuery.data ?? [])
  const newestId = newest.length > 0 ? newest[0].id : null

  const detailQuery = useQuery({
    queryKey: [...CHECKPOINTS_QUERY_KEY, newestId ?? 'none'],
    queryFn: () => getWorkspaceCheckpointDetail(newestId ?? ''),
    enabled: newestId !== null,
    refetchInterval: CHECKPOINTS_REFETCH_INTERVAL_MS,
    retry: false,
  })

  const detail = detailQuery.data
  // Loading, a daemon that is not running, and a workspace with no checkpoints
  // all land here. None of them is "nothing has been verified" — that is a
  // claim this hook cannot make from a request that may not have completed.
  if (!detail) return FALLBACK

  return {
    badges: mapCheckpointToBadges(detail),
    inertChecks: mapCheckpointToInertChecks(detail),
    source: buildCheckpointSourceLine(detail),
    isLive: true,
  }
}
