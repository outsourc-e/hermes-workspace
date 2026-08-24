/**
 * `SwarmSession[]` + `GatewayApprovalEntry[]` → the Conductor WORKER BOARD
 * cards, the Command WORKER RAIL rows, and the Mobile Conductor stat strip.
 * Pure functions only: no React, no fetch, no styling. `use-workers.ts` owns
 * the subscriptions; this file owns the honesty.
 *
 * This board is the hardest one to wire truthfully, because most of what the
 * artboard draws on a worker card is NARRATIVE and the swarm store carries no
 * narrative at all. `docs/design/jarvis-ui-mapping.md` §3.3/§3.5 splits it:
 *
 *   • REAL and mapped — `swarmStatus` (running / thinking / complete / failed /
 *     error / idle) and `staleness`, both already derived by
 *     `agent-swarm-store.ts` from the gateway session list. The mapping doc is
 *     explicit that `swarmStatus` is a HEURISTIC, not an authoritative gateway
 *     signal, so nothing here treats it as more than the store's best guess.
 *   • DERIVED and marked as such below — `blocked`, which is a pending approval
 *     joined onto a worker (see `findPendingApproval`); STALE, which is a
 *     session claiming to run while silent (see `STALE_THRESHOLD_MS`); the
 *     RUN/BLK/IDLE counts; and every age string, all of which come from
 *     `staleness` / `startedAt` / `requestedAt`.
 *   • NO SOURCE and therefore NEVER produced here — the per-worker sub-line
 *     narrative ("3 gates today · 1 open", "wt/vault-frontmatter · 3 files",
 *     "last verdict 08:12 · pass", "31 mail → 4 actionable"), the launchd
 *     diagnostic (§3.5 item 12), and the delegation chain as a real parent→child
 *     edge graph (§3.5 item 14). A live card carries NO `connector`, so the
 *     board draws no chain edge between real workers at all: rendering one would
 *     assert an edge nothing captures.
 *
 * `action` is always absent. HOLD ⌥ TO INTERVENE and OPEN GATE both mean "do
 * something to this worker", and this slice is read-only — an inert chip on a
 * real card would be a lie about what the board can do. The chips survive only
 * on the fixture fallback, where the banner already says nothing is wired.
 */
import type {
  GatewayApprovalEntry,
  GatewaySession,
} from '@/lib/gateway-api'
import type { SwarmSession } from '@/stores/agent-swarm-store'
import type {
  ConductorBadgeTone,
  ConductorCardTone,
  ConductorSectionHeadingFixture,
  ConductorSubTone,
  ConductorWorkerCardFixture,
  MobileStatFixture,
} from '@/components/jarvis/fixtures'
import type { WorkerStatus, WorkerStatusLineProps } from '@/components/jarvis/types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * DERIVE — STALE. A session the gateway still calls running (or thinking) that
 * has not produced an update in this long is contradicting itself, and that
 * contradiction is the whole reason the badge exists.
 *
 * `use-conductor-gateway.ts` calls a worker stale after 120s. This board uses a
 * far stricter ten minutes on purpose: STALE here renders as an alarm badge on
 * a survey screen, and a worker that is merely between long tool calls must not
 * trip it. Ten minutes is longer than any single turn these agents take, so the
 * badge is never a false alarm — at the cost of taking ten minutes to notice a
 * genuinely wedged worker. Under-reporting is the right way to be wrong here,
 * the same call `map-scheduled-jobs.ts` makes for SILENT.
 *
 * Worth knowing for the next slice: this branch is NARROWER than it looks,
 * because `deriveSwarmStatus` has no explicit `running` case. A session the
 * gateway reports as `status: 'running'` but has not touched for an hour is
 * re-derived by the store as `complete` (it has tokens) or `idle` (it does
 * not), so it never reaches here as running. What DOES reach here is an
 * explicit `thinking` / `reasoning` session gone quiet — which is precisely the
 * contradiction worth badging. Widening this would mean overruling the store's
 * own derivation, which is a change to `agent-swarm-store.ts`, not to a mapper.
 */
export const STALE_THRESHOLD_MS = 10 * MINUTE_MS

/**
 * The artboard's worker grid is five columns inside a fixed 1440×900 frame with
 * `overflow-hidden`, and a real gateway can list far more subagent sessions than
 * that — the fixture roster is ten, exactly two full rows. Past that the grid
 * grows and pushes SCHEDULED JOBS and the RUN LOG off the bottom of the board.
 *
 * So the card list is capped at two rows. The cap is NOT silent: the section
 * heading reports the true total alongside how many are drawn, and the rail's
 * count line tallies the whole roster regardless of how many rows it shows.
 */
export const WORKER_BOARD_MAX = 10

/** One card's worth of text, past which the fixed frame starts to reflow. */
const SUB_TEXT_MAX = 44

/* ── Identity ────────────────────────────────────────────────────────── */

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * `agent:builder:subagent:06ec90ba` → `builder`.
 *
 * The gateway encodes the owning agent in segment 1 of the session key — the
 * same shape `src/lib/format-session-name.ts` parses — and the swarm store only
 * ever admits keys containing `subagent:`. When the key does not carry a usable
 * agent segment this returns null rather than guessing at one.
 */
export function deriveAgentFromKey(key: string): string | null {
  const parts = key.split(':')
  const marker = parts.indexOf('subagent')
  if (marker <= 0) return null

  // The segment immediately before `subagent` is the owning agent, except for
  // the generic `agent:` prefix, which names nothing.
  const owner = (parts[marker - 1] ?? '').trim()
  if (owner && owner !== 'agent') return owner

  const named = (parts[1] ?? '').trim()
  return named && named !== 'subagent' ? named : null
}

/**
 * The card's title. Every candidate below is a REAL field the gateway serves;
 * none is invented, and a session with nothing usable falls back to the tail of
 * its own id rather than to a role name it may not have.
 */
export function deriveWorkerName(session: SwarmSession): string {
  const row = session as Record<string, unknown>
  const explicit =
    readText(row.agentName) ||
    readText(session.label) ||
    readText(session.derivedTitle) ||
    readText(session.title)
  if (explicit) return explicit

  const fromKey = deriveAgentFromKey(readText(session.key))
  if (fromKey) return fromKey

  const id = readText(session.friendlyId) || readText(session.key)
  return id ? `worker ${id.slice(-6)}` : 'worker'
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Every name this worker could be known by on an approval record. The join
 * below is exact-on-normalized rather than fuzzy: a substring match would let
 * one pending approval for `builder` block `builder-qa` too.
 */
function workerIdentities(session: SwarmSession): Set<string> {
  const row = session as Record<string, unknown>
  const identities = new Set<string>()

  for (const candidate of [
    readText(row.agentName),
    readText(session.label),
    readText(session.derivedTitle),
    readText(session.title),
    deriveAgentFromKey(readText(session.key)) ?? '',
  ]) {
    if (candidate) identities.add(normalize(candidate))
  }

  return identities
}

/* ── The blocked join ────────────────────────────────────────────────── */

/**
 * Pending, and only pending. `fetchGatewayApprovals` returns both an
 * `approvals` list and a `pending` list; `use-workers.ts` stamps the latter as
 * pending before calling in, so an entry that reaches here with no status is an
 * `approvals` row the gateway declined to classify — and badging a worker
 * BLOCKED on the strength of a record that never said "pending" would invent
 * exactly the state this join exists to make real.
 */
export function isPendingApproval(entry: GatewayApprovalEntry): boolean {
  return entry.status === 'pending'
}

/**
 * DERIVE (§3.3) — the one join that matters.
 *
 * A worker is blocked when a PENDING approval belongs to it. Two ways to
 * belong, both authoritative:
 *   1. `sessionKey` equals this session's key — the strongest link there is,
 *      because it names the exact session the gateway is holding.
 *   2. `agentName` matches one of the worker's real identities, exactly, after
 *      normalising case and whitespace.
 *
 * The mapping doc's other candidate — `AgentSessionStatusEntry.status ===
 * 'waiting_for_input'` — is deliberately NOT consulted. That value is inferred
 * client-side from the shape of the agent's output text (ends with "?", short,
 * or carries a marker), which is a guess; rendering a guess as the hard BLOCKED
 * state is the failure mode this board exists to avoid. No matching approval
 * means not blocked, whatever the text looks like.
 */
export function findPendingApproval(
  session: SwarmSession,
  approvals: Array<GatewayApprovalEntry>,
): GatewayApprovalEntry | null {
  const key = readText(session.key)
  const identities = workerIdentities(session)

  for (const entry of approvals) {
    if (!isPendingApproval(entry)) continue
    if (key && readText(entry.sessionKey) === key) return entry
    const agentName = readText(entry.agentName)
    if (agentName && identities.has(normalize(agentName))) return entry
  }

  return null
}

/* ── State ───────────────────────────────────────────────────────────── */

/**
 * `swarmStatus` (+ the blocked join) → the rail's `WorkerStatus`. Blocked wins
 * over everything: a worker holding a gate is waiting on a human no matter what
 * the session list last said about it.
 *
 * `thinking` collapses into `running` because the rail has no third live state;
 * the card's detail line still says which of the two it is.
 */
export function swarmStatusToTone(
  status: SwarmSession['swarmStatus'],
  blocked: boolean,
): WorkerStatus {
  if (blocked) return 'blocked'
  switch (status) {
    case 'running':
    case 'thinking':
      return 'running'
    case 'complete':
      return 'complete'
    case 'failed':
    case 'error':
      return 'failed'
    case 'idle':
      return 'idle'
  }
}

/**
 * The tone above, plus the STALE override.
 *
 * Stale is only ever applied to a worker that claims to be LIVE. A finished or
 * failed session is silent because it is over, and an idle one reports its
 * silence as an age already ("idle 2h 11m") — neither is a contradiction, and
 * badging them STALE would turn a normal end-of-life into an alarm.
 */
export function deriveWorkerState(
  session: SwarmSession,
  blocked: boolean,
): WorkerStatus {
  const tone = swarmStatusToTone(session.swarmStatus, blocked)
  if (tone !== 'running') return tone
  return session.staleness > STALE_THRESHOLD_MS ? 'stale' : tone
}

const CARD_TONES: Record<WorkerStatus, ConductorCardTone> = {
  blocked: 'blocked',
  running: 'running',
  // The board's card tones are running / active / queued / blocked / idle —
  // there is no failed frame, which is why the fixture's own failed worker
  // (`ops-watch`) is an idle card wearing an ERR badge. Real ones match it.
  stale: 'idle',
  idle: 'idle',
  complete: 'idle',
  failed: 'idle',
  queued: 'queued',
}

const CARD_BADGES: Partial<
  Record<WorkerStatus, { label: string; tone: ConductorBadgeTone }>
> = {
  blocked: { label: 'BLK', tone: 'blocked' },
  running: { label: 'RUN', tone: 'live' },
  stale: { label: 'STALE', tone: 'blocked' },
  complete: { label: 'DONE', tone: 'muted' },
  failed: { label: 'ERR', tone: 'failed' },
}

/* ── Real text, and only real text ───────────────────────────────────── */

/**
 * `2h 11m`, `14m`, `9s`, `3d`. Every age on a card runs through this so the
 * board never mixes precisions, and so no age is rendered to a resolution the
 * source cannot support.
 */
export function formatAge(ms: number): string {
  const safe = Math.max(0, ms)
  if (safe < MINUTE_MS) return `${Math.floor(safe / 1000)}s`
  if (safe < HOUR_MS) return `${Math.floor(safe / MINUTE_MS)}m`
  if (safe < DAY_MS) {
    const hours = Math.floor(safe / HOUR_MS)
    const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${Math.floor(safe / DAY_MS)}d`
}

/** Uptime, from whichever real start field the gateway sent. */
function sessionUptime(session: GatewaySession, now: number): string | null {
  const started = readNumber(session.startedAt) ?? readNumber(session.createdAt)
  if (started === null || started > now) return null
  return formatAge(now - started)
}

/** REAL — the gateway's own failure text, under whichever key it used. */
function sessionErrorText(session: SwarmSession): string | null {
  const row = session as Record<string, unknown>
  for (const key of ['errorMessage', 'error', 'failureReason', 'lastError']) {
    const text = readText(row[key])
    if (text) return text
  }
  return null
}

/**
 * A real `last_run_error` runs to hundreds of characters and a card is two
 * lines wide; the same clamp `map-scheduled-jobs.ts` applies, cut at a word
 * boundary and ellipsed so the truncation declares itself.
 */
export function clampSubText(text: string): string {
  if (text.length <= SUB_TEXT_MAX) return text
  const cut = text.slice(0, SUB_TEXT_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > SUB_TEXT_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** What a pending approval actually asks for — REAL (§3.2: action / tool). */
function approvalSummary(entry: GatewayApprovalEntry): string {
  return readText(entry.action) || readText(entry.tool) || ''
}

/** How long the gate has been open — DERIVE from `requestedAt` (§3.2). */
function approvalWait(
  entry: GatewayApprovalEntry,
  now: number,
): string | null {
  const requested = readNumber(entry.requestedAt)
  if (requested === null || requested > now) return null
  return formatAge(now - requested)
}

/**
 * The card's first line: a real status word plus, where one exists, a real age.
 * Nothing else. The fixture's "running 04:18 · vitest --watch" names a command
 * the session list does not carry, so a live card says "running 4m" and stops.
 */
function buildDetail(
  session: SwarmSession,
  state: WorkerStatus,
  approval: GatewayApprovalEntry | null,
  now: number,
): string {
  switch (state) {
    case 'blocked': {
      const wait = approval ? approvalWait(approval, now) : null
      return wait
        ? `blocked ${wait} · needs approval`
        : 'blocked · needs approval'
    }
    case 'running': {
      const verb = session.swarmStatus === 'thinking' ? 'thinking' : 'running'
      const uptime = sessionUptime(session, now)
      return uptime ? `${verb} ${uptime}` : verb
    }
    case 'stale':
      return `no update in ${formatAge(session.staleness)}`
    case 'idle':
      return `idle ${formatAge(session.staleness)}`
    case 'complete':
      return `complete · ${formatAge(session.staleness)} ago`
    case 'failed':
      return 'failed'
    case 'queued':
      return 'queued'
  }
}

/**
 * The card's SECOND line, which on the artboard is pure narrative and here is
 * pure fact or nothing at all:
 *   • blocked → what the pending approval asks for (REAL: action / tool)
 *   • failed  → the gateway's own error text (REAL)
 *   • else    → the session's model (REAL), and when the gateway sent none, the
 *               empty string — an omitted line, not an invented one.
 *
 * There is deliberately no branch that produces a `noSource` sub. A real card
 * draws nothing it cannot source, so it never needs the inert treatment; the
 * fixture fallback keeps its own marked lines untouched.
 */
function buildSub(
  session: SwarmSession,
  state: WorkerStatus,
  approval: GatewayApprovalEntry | null,
): { sub: string; subTone?: ConductorSubTone } {
  if (state === 'blocked' && approval) {
    const summary = approvalSummary(approval)
    return summary ? { sub: clampSubText(summary) } : { sub: '' }
  }

  if (state === 'failed') {
    const error = sessionErrorText(session)
    return error
      ? { sub: clampSubText(error), subTone: 'failed' }
      : { sub: '' }
  }

  return { sub: clampSubText(readText(session.model)) }
}

/* ── Ordering ────────────────────────────────────────────────────────── */

/**
 * The store already sorts its sessions (thinking, running, idle, complete,
 * failed, error, then by staleness) and that order is preserved — it is a real
 * ordering over real data and re-deriving one here would only add a second
 * opinion.
 *
 * The single change: blocked workers are hoisted to the front, because a worker
 * waiting on a human is the one thing on this board with a deadline. This is a
 * READING ORDER, not a chain: no card carries a `connector`, so nothing about
 * the sequence claims that the first worker delegated to the second (§3.5 item
 * 14).
 */
function orderWorkers<T extends { state: WorkerStatus }>(rows: Array<T>): Array<T> {
  return [
    ...rows.filter((row) => row.state === 'blocked'),
    ...rows.filter((row) => row.state !== 'blocked'),
  ]
}

interface WorkerRow {
  name: string
  state: WorkerStatus
  session: SwarmSession
  approval: GatewayApprovalEntry | null
}

/**
 * One row per session, names guaranteed unique.
 *
 * Both boards key their lists by name and two subagents of the same agent share
 * a derived name routinely, so a collision would make React reconcile the wrong
 * card — and one of the two could be the blocked one. The discriminator is the
 * tail of the session's own id, which is real data rather than an index.
 */
function buildRows(
  sessions: Array<SwarmSession>,
  approvals: Array<GatewayApprovalEntry>,
): Array<WorkerRow> {
  const seen = new Set<string>()

  const rows = sessions.map((session) => {
    const approval = findPendingApproval(session, approvals)
    const state = deriveWorkerState(session, approval !== null)

    let name = deriveWorkerName(session)
    if (seen.has(name)) {
      const id = readText(session.friendlyId) || readText(session.key)
      name = id ? `${name} ${id.slice(-4)}` : `${name} ${seen.size}`
    }
    // A doubled discriminator is still possible in principle; the suffix loop
    // keeps the key unique without ever inventing a second worker.
    while (seen.has(name)) name = `${name}'`
    seen.add(name)

    return { name, state, session, approval }
  })

  return orderWorkers(rows)
}

/* ── Public mappers ──────────────────────────────────────────────────── */

/**
 * The WORKER BOARD, capped at two rows. `now` is injected so every age on the
 * board is measured against one clock and so the derivations are testable.
 */
export function mapSwarmToWorkerCards(
  sessions: Array<SwarmSession>,
  approvals: Array<GatewayApprovalEntry>,
  now: number = Date.now(),
): Array<ConductorWorkerCardFixture> {
  return buildRows(sessions, approvals)
    .slice(0, WORKER_BOARD_MAX)
    .map(({ name, state, session, approval }) => {
      const { sub, subTone } = buildSub(session, state, approval)

      return {
        name,
        tone: CARD_TONES[state],
        badge: CARD_BADGES[state],
        detail: buildDetail(session, state, approval, now),
        sub,
        subTone,
        // No `action`: every chip on this card implies a write (slice 6c).
        // No `connector`: the delegation graph is NO SOURCE (§3.5 item 14).
      }
    })
}

/** RUN / BLK / IDLE over the WHOLE roster, however many rows are drawn. */
export function countWorkers(states: Array<WorkerStatus>): {
  running: number
  blocked: number
  idle: number
} {
  const running = states.filter((state) => state === 'running').length
  const blocked = states.filter((state) => state === 'blocked').length
  return { running, blocked, idle: states.length - running - blocked }
}

/**
 * The Command rail. The count line tallies every session the store holds —
 * the artboard buckets everything that is not running or blocked as IDLE, and
 * so does this — while the row list is capped to the same two-rows-worth the
 * board draws, so a large swarm cannot push THREADS off the rail.
 */
export function mapSwarmToRailRows(
  sessions: Array<SwarmSession>,
  approvals: Array<GatewayApprovalEntry>,
  now: number = Date.now(),
): { workers: Array<WorkerStatusLineProps>; counts: string } {
  const rows = buildRows(sessions, approvals)
  const { running, blocked, idle } = countWorkers(rows.map((row) => row.state))

  const workers = rows
    .slice(0, WORKER_BOARD_MAX)
    .map(({ name, state, session, approval }) => ({
      name,
      status: state,
      detail: buildRailDetail(session, state, approval, now),
    }))

  return {
    workers,
    counts: `${running} RUN · ${blocked} BLK · ${idle} IDLE`,
  }
}

/**
 * The rail's right-hand column is a few characters wide, so it carries the age
 * alone rather than the card's fuller sentence. Blocked returns undefined on
 * purpose: the primitive then prints its own BLOCKED label, which is the
 * accurate thing to say when the gateway sent no `requestedAt` to age.
 */
function buildRailDetail(
  session: SwarmSession,
  state: WorkerStatus,
  approval: GatewayApprovalEntry | null,
  now: number,
): string | undefined {
  switch (state) {
    case 'blocked': {
      const wait = approval ? approvalWait(approval, now) : null
      return wait ? `BLOCKED ${wait}` : undefined
    }
    case 'running': {
      const uptime = sessionUptime(session, now)
      const verb = session.swarmStatus === 'thinking' ? 'thinking' : 'running'
      return uptime ?? verb
    }
    case 'stale':
      return `stale ${formatAge(session.staleness)}`
    case 'idle':
      return `idle ${formatAge(session.staleness)}`
    case 'complete':
      return `ran ${formatAge(session.staleness)} ago`
    case 'failed':
      return 'failed'
    case 'queued':
      return 'queued'
  }
}

/**
 * The section caption. It reports what is actually on screen — the live total,
 * and how many of it the two-row grid could fit — and says where the two states
 * come from. It does NOT restate the fixture's "chain: orchestrator → builder →
 * reviewer → qa", because no such chain is captured (§3.5 item 14).
 *
 * The caption still renders inside a `data-jv-fixture="no-source"` span, since
 * `worker-board.tsx` marks it unconditionally and that file's rendering is out
 * of scope for this slice. Over-marking a real caption under-claims rather than
 * over-claims, which is the safe direction to be wrong.
 */
export function buildWorkerBoardHeading(
  total: number,
  shown: number,
): ConductorSectionHeadingFixture {
  const roster = `${total} live worker${total === 1 ? '' : 's'}`
  const truncation = shown < total ? ` · ${shown} shown` : ''
  return {
    label: 'WORKER BOARD',
    note: `${roster}${truncation} · status is heuristic · blocked = pending approval`,
  }
}

/* ── Mobile ──────────────────────────────────────────────────────────── */

/**
 * The four-number glance strip. FAILED gets its own column, and STALE folds
 * into IDLE — matching the artboard's own roster, where the stale `maintainer`
 * is counted among the seven idle rather than called out separately.
 */
export function mapSwarmToMobileStats(
  sessions: Array<SwarmSession>,
  approvals: Array<GatewayApprovalEntry>,
): Array<MobileStatFixture> {
  const states = buildRows(sessions, approvals).map((row) => row.state)
  const tally = (match: WorkerStatus) =>
    states.filter((state) => state === match).length

  const running = tally('running')
  const blocked = tally('blocked')
  const failed = tally('failed')

  return [
    { label: 'RUNNING', value: String(running), tone: 'live' },
    { label: 'BLOCKED', value: String(blocked), tone: 'blocked' },
    { label: 'FAILED', value: String(failed), tone: 'failed' },
    {
      label: 'IDLE',
      value: String(states.length - running - blocked - failed),
      tone: 'idle',
    },
  ]
}

/**
 * RUNNING NOW — the live workers only, as rail rows.
 *
 * When nothing is running this is empty, and the section renders empty. That is
 * the true answer, and the strip above it already says RUNNING 0; padding the
 * section out with idle workers to keep it looking full would be the same lie
 * in a different place.
 */
export function mapSwarmToMobileRunning(
  sessions: Array<SwarmSession>,
  approvals: Array<GatewayApprovalEntry>,
  now: number = Date.now(),
): Array<WorkerStatusLineProps> {
  return buildRows(sessions, approvals)
    .filter((row) => row.state === 'running')
    .slice(0, WORKER_BOARD_MAX)
    .map(({ name, state, session, approval }) => ({
      name,
      status: state,
      detail: buildRailDetail(session, state, approval, now),
    }))
}
