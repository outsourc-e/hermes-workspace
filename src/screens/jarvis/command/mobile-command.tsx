/**
 * JARVIS Mobile Command board — artboard 03, 390 × 844.
 *
 * A DIFFERENT COMPOSITION, not the desktop board reflowed. Board 01 is a
 * three-zone workspace that answers "show me everything about this mission";
 * board 03 is approval-led and answers one question — "what is blocked on me,
 * and can I unblock it from here" — so the gate is the FIRST thing on the
 * screen rather than the fourth thing in a conversation, and the two rails
 * (workers, work trail) are gone entirely rather than stacked underneath. What
 * survives from board 01 survives because the gate needs it: the thread that
 * produced the disagreement, the claim the gate turns on, and the legend that
 * makes the marks readable.
 *
 * COMPOSES the Slice 2 primitives and re-styles none of them. The hero gate is
 * the real `ApprovalGateCard` — the primitive is already fluid (it declares no
 * width of its own), so the mobile board hands it a 390pt column and it lays
 * out correctly without a variant. Composing a second gate card here would
 * have meant two components owning the honest BLAST RADIUS / UNDO PATH panel,
 * which is the one thing on this board that must not be able to drift.
 *
 * THE HERO GATE CAN BE LIVE (slice 6c). It arrives as a single `GateDisplay`
 * from the routed screen — a real pending approval when the gateway has one,
 * `mobileCommandGateFixture` otherwise, which is also what a standalone render
 * and the tests get. This file itself still opens no request, imports no
 * gateway client and holds no store subscription; it is a frame, not a fetcher,
 * and it resolves nothing.
 *
 * Live or not, the gate's BLAST RADIUS, UNDO PATH and caveat have NO SOURCE
 * (`docs/design/jarvis-ui-mapping.md` §3.2): live, the two cells read as an
 * inert sentinel and the fixture caveat is DROPPED rather than carried over —
 * "qa has not verified the fix" is a claim about a specific fixture, not
 * something the approvals endpoint knows. Everything else on this board is
 * fixtures. The NO SOURCE rows from §3.5 are drawn to prove the layout and are
 * labelled both in the banner above the frame and via `data-jv-fixture=
 * "no-source"` in the DOM.
 *
 * Fluid, not a 390px box: the frame is `w-full` with 390 as a MAX and 844 as a
 * MIN, so on a real phone it fills the viewport and on a wider narrow window it
 * stops at the artboard measure instead of stretching the prose.
 *
 * Token discipline: no raw colour, size, spacing or radius. Structural
 * dimensions come from `JV_MOBILE` (multiples of `--jv-space-4`).
 */
import { JV_MOBILE } from './geometry'
import { MobileComposer } from './mobile-composer'
import { MobileStatusBar } from './mobile-status-bar'
import { MobileThread } from './mobile-thread'
import type {
  GateCaveatFixture,
  MobileAlertStripFixture,
  MobileLegendFixture,
} from '@/components/jarvis/fixtures'
import type { GateDisplay } from '../conductor/map-approvals'
import {
  mobileCommandAlertStrip,
  mobileCommandComposerFixture,
  mobileCommandGateCaveatFixture,
  mobileCommandGateFixture,
  mobileCommandLegendFixtures,
  mobileCommandThreadFixture,
  mobileStatusBarFixture,
} from '@/components/jarvis/fixtures'
import { ApprovalGateCard } from '@/components/jarvis/approval-gate-card'
import { EpistemicMark } from '@/components/jarvis/epistemic-mark'

/**
 * Artboard 03 shortens the gate's two headings to fit a 390pt column. Only the
 * words change — the same primitive draws the same panel, so the honest cells
 * still cannot drift from the desktop's.
 */
const MOBILE_GATE_CELL_LABELS = { blastRadius: 'RADIUS', undoPath: 'UNDO' }

/** `1 GATE WAITING · 2 running · 1 blocked` — the strip under the status bar. */
function AlertStrip({ data }: { data: MobileAlertStripFixture }) {
  return (
    <div className="flex flex-none items-center gap-jv-8 border-b border-jv-blocked-line bg-jv-blocked-bg px-jv-14 py-jv-8">
      <span
        aria-hidden="true"
        className="h-jv-5 w-jv-5 flex-none rounded-jv-full bg-jv-blocked"
      />
      <span className="font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wider text-jv-blocked">
        {data.gateLabel}
      </span>
      <div className="flex-1" />
      <span className="font-jv-mono text-jv-sm leading-jv-none whitespace-nowrap text-jv-label">
        {data.counts}
      </span>
    </div>
  )
}

/**
 * `solid known · dotted recalled · dashed assumed`.
 *
 * The kind word wears its own underline via `EpistemicMark`, so the legend is
 * drawn by the very component it documents — it cannot describe a rule the
 * marks above it do not actually use.
 */
function MarkLegend({ marks }: { marks: Array<MobileLegendFixture> }) {
  return (
    <div className="flex flex-none flex-wrap items-baseline gap-jv-9 border-t border-jv-line-soft bg-jv-surface-0 px-jv-14 py-jv-9 font-jv-sans text-jv-md leading-jv-loose text-jv-label">
      {marks.map((entry, index) => (
        <span key={entry.mark}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-jv-label-ghost">
              {'· '}
            </span>
          ) : null}
          {`${entry.style} `}
          <EpistemicMark mark={entry.mark}>{entry.label}</EpistemicMark>
        </span>
      ))}
    </div>
  )
}

/**
 * The caveat slot. Same three-way rule as the desktop board: the resolve line
 * when a confirm is pending, the FIXTURE caveat on the fallback only, and
 * nothing at all on a live gate (§3.2 — the caveat has no source).
 */
function GateCaveat({
  note,
  caveat,
}: {
  note?: string | null
  caveat?: GateCaveatFixture
}) {
  if (note) {
    return <span data-jv-resolve="note">{note}</span>
  }
  if (!caveat) return null
  return (
    <>
      {caveat.lead}
      <EpistemicMark mark={caveat.mark}>{caveat.claim}</EpistemicMark>
      {caveat.trail}
    </>
  )
}

/** The slice-3 gate and its caveat, as one prop. Nothing here is live. */
const FIXTURE_GATE: GateDisplay = {
  props: mobileCommandGateFixture,
  caveat: mobileCommandGateCaveatFixture,
  isLive: false,
}

/**
 * The mobile frame on its own — what artboard 03 shows, fluid to the viewport.
 *
 * The gate arrives as a prop with the fixture as its default, so the frame
 * still renders standalone with no query client mounted and the slice-5 board
 * is unchanged when nothing is passed.
 */
export function MobileCommandBoard({
  gate = FIXTURE_GATE,
}: {
  gate?: GateDisplay
} = {}) {
  // Undefined, not an element that renders nothing: the card tests the prop for
  // truthiness, so an "empty" caveat would still open the gap above it.
  const caveat =
    gate.note || gate.caveat ? (
      <GateCaveat note={gate.note} caveat={gate.caveat} />
    ) : undefined

  return (
    <div
      data-jv-board="mobile-command"
      className="flex w-full flex-col overflow-hidden border border-jv-border bg-jv-surface-1 font-jv-sans tracking-normal text-jv-text"
      style={{
        maxWidth: JV_MOBILE.frameWidth,
        minHeight: JV_MOBILE.frameHeight,
      }}
    >
      <MobileStatusBar data={mobileStatusBarFixture} />
      <AlertStrip data={mobileCommandAlertStrip} />

      <main className="flex min-h-0 flex-1 flex-col gap-jv-16 overflow-y-auto px-jv-14 pt-jv-14 pb-jv-16">
        {/*
          The hero: the gate leads the screen, it is not buried in the thread.
          The no-source mark stays on a LIVE gate too — the panel cells and the
          caveat have no source either way (§3.2). Only the reason changes.
        */}
        <div
          data-jv-fixture="no-source"
          data-jv-gate-source={gate.isLive ? 'live' : 'fixture'}
          title={
            gate.isLive
              ? 'Live approval — blast radius, undo path and the caveat have no source (§3.2)'
              : 'Fixture — no pending approval was readable, so the slice-3 gate is drawn'
          }
        >
          <ApprovalGateCard
            {...gate.props}
            cellLabels={MOBILE_GATE_CELL_LABELS}
            caveat={caveat}
            onAction={gate.onAction}
          />
        </div>

        {gate.othersWaiting ? (
          <div className="font-jv-mono text-jv-sm leading-jv-none text-jv-blocked-dim">
            {gate.othersWaiting}
          </div>
        ) : null}

        <MobileThread thread={mobileCommandThreadFixture} />
      </main>

      <MarkLegend marks={mobileCommandLegendFixtures} />
      <MobileComposer data={mobileCommandComposerFixture} />
    </div>
  )
}
