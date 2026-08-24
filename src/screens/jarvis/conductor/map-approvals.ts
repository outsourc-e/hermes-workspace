/**
 * `GatewayApprovalEntry[]` → the approval gate as the boards draw it.
 * Pure functions only: no React, no fetch, no styling, and — the point of this
 * slice — no write. `use-approvals.ts` owns the query; `use-resolve-approval.ts`
 * owns the (dormant) mutation; this file owns the honesty.
 *
 * `docs/design/jarvis-ui-mapping.md` §3.2 splits the gate cleanly, and the split
 * is unusually harsh: the card's two most load-bearing cells have no source.
 *
 *   • REAL and mapped — `agentName`, `action`, `tool`, `input`, `context` and
 *     `status`. Every string this file puts on a live card comes from one of
 *     them or from arithmetic on `requestedAt`.
 *   • DERIVED and marked as such below — the waiting duration (`formatWaiting`)
 *     and the "+N more waiting" tally, both from the entry list alone.
 *   • NO SOURCE and therefore NEVER produced here — BLAST RADIUS, UNDO PATH and
 *     the caveat. `ApprovalGateCardProps` makes the first two REQUIRED, so they
 *     cannot simply be omitted; they are filled with `NO_SOURCE_TEXT`, a
 *     constant that reads as inert on screen. It is not a plausible fake — a
 *     card that said "1 public page · RSS to 2,411 subscribers" over a real
 *     approval would be inventing the one number a person actually decides on.
 *     `caveat` IS optional, so the mapper's return type omits it entirely and no
 *     code path here can synthesise one.
 *
 * On the title. §3.2 allows folding `tool` into the title line; this mapper
 * does not, because `command` already leads with the tool and the artboard puts
 * the two lines directly on top of each other — "Write" above "Write
 * Vault/Published/note.md" is noise, not context. `action` alone is the human
 * line, and when the entry carries no action the tool becomes it.
 */
import type {
  GatewayApprovalEntry,
  GatewayApprovalsResponse,
} from '@/lib/gateway-api'
import type {
  GateCaveatFixture,
  MobileGateSummaryFixture,
} from '@/components/jarvis/fixtures'
import type {
  ApprovalGateCardProps,
  ApprovalGateState,
} from '@/components/jarvis/types'

/** The gate props a mapper is allowed to produce — `caveat` is NO SOURCE. */
export type MappedGateProps = Omit<ApprovalGateCardProps, 'caveat'>

/**
 * Everything a board needs to draw one gate, as a single prop: the card body,
 * whether it is real, the resolve line, and the queue behind it. One object
 * rather than six props because the pieces are only ever correct together — a
 * live gate with a fixture caveat under it would be a lie assembled out of two
 * honest halves.
 */
export interface GateDisplay {
  props: MappedGateProps
  /**
   * The fixture caveat, present ONLY on the fixture fallback. §3.2 makes the
   * caveat NO SOURCE, so a live gate carries none and no mapper can produce
   * one.
   */
  caveat?: GateCaveatFixture
  /** The confirm / disabled line from `use-resolve-approval`, or null. */
  note?: string | null
  /** "+2 more waiting", or empty when this gate is the whole queue. */
  othersWaiting?: string
  /** True only when `props` came from a real pending approval. */
  isLive: boolean
  /** The card's button handler. Absent means the chips are inert. */
  onAction?: (action: string) => void
}

/**
 * NO SOURCE (§3.2) — BLAST RADIUS and UNDO PATH. An em-dashed lowercase phrase
 * where the artboard shows a sentence: unmissably not an answer. Nothing about
 * the entry can change it, and `mapApprovalToGateProps` is tested on exactly
 * that.
 */
export const NO_SOURCE_TEXT = '— not modelled —'

/** The two labels that map onto a real endpoint. See `use-resolve-approval`. */
export const GATE_ACTIONS: Array<string> = ['APPROVE', 'REJECT']

/**
 * HOLD FOR QA is on the artboard and on the fixture, and it is dropped from a
 * live gate on purpose: there is no third resolution in
 * `/api/gateway/approvals/:id/:action` — only `approve` and `deny` — so the
 * chip could never do anything but sit there next to two that work.
 */
export const OMITTED_ACTION = 'HOLD FOR QA'

/** A `tool`/`input` line past this reflows the card's fixed measure. */
const COMMAND_MAX = 120

/** Title text past this pushes the panel below the fold on mobile. */
const TITLE_MAX = 96

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/* ── Reading the entry ───────────────────────────────────────────────── */

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Word-boundary clamp with an ellipsis — same shape `map-scheduled-jobs` uses. */
export function clampText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  const cut = trimmed.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * `input` is `unknown` on the wire and genuinely is: a Bash tool sends a string,
 * an Edit tool sends an object of file paths and patches, an MCP tool sends
 * whatever it likes. Only two shapes are legible on one mono line — a short
 * string and a short argv — and everything else returns null so the caller
 * falls back to the tool name. Serialising an object here would put a JSON blob
 * with a diff inside it on the hero card.
 */
export function readableInput(input: unknown): string | null {
  if (typeof input === 'string') {
    const text = input.trim()
    return text ? clampText(text, COMMAND_MAX) : null
  }

  if (Array.isArray(input) && input.length > 0) {
    // argv only — a list with anything non-primitive in it is a payload, not a
    // command line.
    if (!input.every((part) => typeof part === 'string')) return null
    const joined = input.join(' ').trim()
    return joined ? clampText(joined, COMMAND_MAX) : null
  }

  return null
}

/**
 * The mono line under the title. Tool first, then the input when it is legible;
 * with neither, the entry's own `context` (REAL, §3.2) rather than an invented
 * command. An entry with none of the three gets its id, which at least names
 * the record a person is being asked to decide on.
 */
export function deriveCommand(entry: GatewayApprovalEntry): string {
  const tool = readText(entry.tool)
  const input = readableInput(entry.input)

  if (tool && input) return clampText(`${tool} ${input}`, COMMAND_MAX)
  if (tool) return tool
  if (input) return input

  const context = readText(entry.context)
  if (context) return clampText(context, COMMAND_MAX)

  return `approval ${readText(entry.id) || 'unknown'}`
}

/**
 * The headline. `action` is the human sentence when the gateway supplies one;
 * `tool` is the honest second best; the neutral constant is what is left. This
 * function never composes a specific action out of parts — "Publish changelog
 * 0.9.3 to the public site" is a fixture and must stay one.
 */
export function deriveTitle(entry: GatewayApprovalEntry): string {
  const action = readText(entry.action)
  if (action) return clampText(action, TITLE_MAX)

  const tool = readText(entry.tool)
  if (tool) return clampText(tool, TITLE_MAX)

  return 'Approval requested'
}

/**
 * DERIVE (§3.2) — how long this has been sitting there, from `requestedAt`.
 *
 * Returns undefined rather than "0s" when there is no usable timestamp: the
 * card hides the field when it is absent, and a zero would read as "just now",
 * which is a claim about the queue that nothing supports. A `requestedAt` in
 * the future is clock skew, not a negative wait, so it clamps to zero.
 */
export function formatWaiting(
  requestedAt: number | undefined,
  now: number,
): string | undefined {
  if (typeof requestedAt !== 'number' || !Number.isFinite(requestedAt)) {
    return undefined
  }

  const elapsed = Math.max(0, now - requestedAt)

  if (elapsed < MINUTE_MS) return `${Math.floor(elapsed / SECOND_MS)}s`
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS)
    const seconds = Math.floor((elapsed % MINUTE_MS) / SECOND_MS)
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS)
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS)
    return `${hours}h ${minutes}m`
  }
  return `${Math.floor(elapsed / DAY_MS)}d`
}

/** `.status` → the card's three states. `denied` is drawn as `rejected`. */
export function statusToGateState(
  status: GatewayApprovalEntry['status'],
): ApprovalGateState {
  if (status === 'approved') return 'approved'
  if (status === 'denied') return 'rejected'
  // An entry with no status came off the `pending` list, where pending is what
  // membership means.
  return 'pending'
}

/* ── The mapping ─────────────────────────────────────────────────────── */

/**
 * One entry → one gate card. The two NO SOURCE cells are assigned from the
 * constant unconditionally and are not reachable from `entry` at all.
 */
export function mapApprovalToGateProps(
  entry: GatewayApprovalEntry,
  now: number,
): MappedGateProps {
  const agent = readText(entry.agentName)

  return {
    title: deriveTitle(entry),
    command: deriveCommand(entry),
    // REAL — who is asking. Absent rather than guessed when unnamed.
    subtitle: agent || undefined,
    waiting: formatWaiting(entry.requestedAt, now),
    // NO SOURCE — §3.2. Constant, never entry-derived.
    blastRadius: NO_SOURCE_TEXT,
    undoPath: NO_SOURCE_TEXT,
    actions: GATE_ACTIONS,
    state: statusToGateState(entry.status),
  }
}

/**
 * The mobile hero. Same gate, minus the header sublabel: at 390pt the label /
 * sublabel / waiting row cannot hold all three, and `waiting` is the one that
 * carries decision-relevant information. Same reasoning
 * `mobileCommandGateFixture` already encodes for the fixture board.
 */
export function mapApprovalToMobileGateProps(
  entry: GatewayApprovalEntry,
  now: number,
): MappedGateProps {
  const { subtitle: _subtitle, ...rest } = mapApprovalToGateProps(entry, now)
  return rest
}

/**
 * Conductor NEEDS YOU — a POINTER to the gate, not the gate.
 *
 * The live pointer carries REVIEW and nothing else. The fixture offers APPROVE
 * here, but this board deliberately draws no BLAST RADIUS / UNDO PATH panel
 * (see `mobile-conductor.tsx`), and approving from a surface that shows neither
 * is the exact move the panel exists to prevent. The chip is also a plain
 * `<span>` on that board — it resolves nothing today and must not look like it
 * could.
 */
export function mapApprovalToGateSummary(
  entry: GatewayApprovalEntry,
  othersWaiting: number,
  heading: string,
): MobileGateSummaryFixture {
  const agent = readText(entry.agentName)
  const more = othersWaiting > 0 ? ` · +${othersWaiting} more waiting` : ''

  return {
    heading,
    label: `GATE${agent ? ` · ${agent}` : ''}${more}`,
    title: deriveTitle(entry),
    actions: ['REVIEW'],
  }
}

/** DERIVE — the queue behind the hero. Empty string when the hero is the queue. */
export function buildOthersWaitingLine(othersWaiting: number): string {
  if (othersWaiting <= 0) return ''
  return `+${othersWaiting} more waiting`
}

/* ── The queue ───────────────────────────────────────────────────────── */

/**
 * The endpoint answers in two shapes — an `approvals` list and a `pending` one.
 * Entries from `pending` are pending by construction, so they are stamped as
 * such; entries from `approvals` keep whatever status the gateway gave them.
 * Deduped by id, because a gateway that sends both lists sends the same record
 * twice.
 *
 * This repeats the private helper in `use-workers.ts` rather than importing it:
 * that file is a slice-6b deliverable and out of scope to edit, and the two
 * copies are pinned to the same behaviour by this file's tests.
 */
export function normalizeApprovals(
  response: GatewayApprovalsResponse | undefined,
): Array<GatewayApprovalEntry> {
  if (!response) return []

  const byId = new Map<string, GatewayApprovalEntry>()

  for (const entry of response.pending ?? []) {
    byId.set(entry.id, { ...entry, status: 'pending' })
  }
  for (const entry of response.approvals ?? []) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  }

  return [...byId.values()]
}

/**
 * The pending queue, oldest first — the hero is whatever has been waiting
 * longest, which is the one ordering a person would defend. Entries with no
 * `requestedAt` sort last rather than first: an unknown wait is not evidence of
 * a long one.
 */
export function selectPendingApprovals(
  entries: Array<GatewayApprovalEntry>,
): Array<GatewayApprovalEntry> {
  return entries
    .filter((entry) => statusToGateState(entry.status) === 'pending')
    .slice()
    .sort((left, right) => {
      const a = typeof left.requestedAt === 'number' ? left.requestedAt : Infinity
      const b =
        typeof right.requestedAt === 'number' ? right.requestedAt : Infinity
      return a - b
    })
}
