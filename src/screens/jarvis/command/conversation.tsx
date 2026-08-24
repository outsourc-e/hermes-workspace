/**
 * Desktop Command — centre column (artboard 01): the conversation.
 *
 * COMPOSES three Slice 2 primitives and re-styles none of them:
 *   • `EpistemicMark`      — inline KN / RC / AS claims inside a turn's prose
 *   • `VerificationBadge`  — the verified / claimed pair under a turn
 *   • `ApprovalGateCard`   — the inline gate after the disagreement turn
 *
 * ONE THING HERE CAN BE LIVE (slice 6c): the gate. It arrives as a single
 * `GateDisplay` from the routed screen — a real pending approval when the
 * gateway has one, the slice-3 fixture otherwise — and this file neither
 * fetches it nor resolves it. What it does own is the caveat slot, which is
 * where the resolve confirm step surfaces.
 *
 * Everything else is fixture data. The epistemic marks, the verified/claimed
 * state on a chat turn, the I DISAGREE stance and — on EVERY gate, live or not
 * — BLAST RADIUS, UNDO PATH and the caveat are NO SOURCE
 * (`docs/design/jarvis-ui-mapping.md` §3.2 and §3.5 items 1–7): they are drawn
 * to prove the layout only, and each carries `data-jv-fixture="no-source"`.
 *
 * Token discipline: no raw colour, size, spacing or radius.
 */
import { clsx } from 'clsx'
import { JV_BOARD } from './geometry'
import type {
  ConversationTurnFixture,
  DelegationNoteFixture,
  GateCaveatFixture,
  RichSpan,
} from '@/components/jarvis/fixtures'
import type { GateDisplay } from '../conductor/map-approvals'
import { ApprovalGateCard } from '@/components/jarvis/approval-gate-card'
import { EpistemicMark } from '@/components/jarvis/epistemic-mark'
import { VerificationBadge } from '@/components/jarvis/verification-badge'

/** Renders a fixture body: prose, inline mono, epistemic marks, the caret. */
function RichText({ spans }: { spans: Array<RichSpan> }) {
  return (
    <>
      {spans.map((span, index) => {
        // Fixture spans are a static, ordered list — index is a stable key.
        const key = `${span.kind}-${index}`
        switch (span.kind) {
          case 'text':
            return <span key={key}>{span.text}</span>
          case 'code':
            return (
              <span
                key={key}
                className="font-jv-mono text-jv-2xl text-jv-text-muted"
              >
                {span.text}
              </span>
            )
          case 'mark':
            return (
              <EpistemicMark key={key} mark={span.mark}>
                <RichText spans={span.spans} />
              </EpistemicMark>
            )
          case 'caret':
            return (
              <span
                key={key}
                aria-hidden="true"
                className="ml-jv-4 inline-block h-jv-14 w-jv-7 bg-jv-live animate-jv-caret"
                style={{ verticalAlign: JV_BOARD.caretBaselineOffset }}
              />
            )
        }
      })}
    </>
  )
}

function SpeakerGutter({
  speaker,
  time,
}: {
  speaker: 'YOU' | 'JVS'
  time?: string
}) {
  return (
    <div
      className={clsx(
        'flex-none pt-jv-2 font-jv-mono text-jv-2xs leading-jv-loose-3 font-semibold tracking-jv-wider',
        speaker === 'JVS' ? 'text-jv-live' : 'text-jv-label-dim',
      )}
      style={{ width: JV_BOARD.speakerGutterWidth }}
    >
      {speaker}
      {time ? (
        <>
          <br />
          <span className="font-normal tracking-normal text-jv-label-ghost">
            {time}
          </span>
        </>
      ) : null}
    </div>
  )
}

function DelegationNote({ notes }: { notes: Array<DelegationNoteFixture> }) {
  return (
    <div className="flex items-center gap-jv-9 pt-jv-2 font-jv-mono text-jv-base leading-jv-none text-jv-label-dim">
      <span aria-hidden="true" className="text-jv-live">
        →
      </span>
      <span>
        {notes.map((note, index) => (
          <span key={note.label}>
            {index > 0 ? ' · ' : null}
            {note.label} <span className="text-jv-text-dim">{note.value}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

function Turn({
  turn,
  disagreeLabel,
}: {
  turn: ConversationTurnFixture
  disagreeLabel: string
}) {
  const disagrees = turn.variant === 'disagree'
  const rich = <RichText spans={turn.body} />
  const bodyClass = clsx(
    'font-jv-sans text-jv-5xl',
    turn.evidence || disagrees ? 'leading-jv-loose-3' : 'leading-jv-loose-2',
    turn.dim ? 'text-jv-text-dim-2' : 'text-jv-text-body',
  )

  // A plain turn is prose against the measure; anything richer needs a column.
  const simple = !turn.evidence && !turn.delegation && !disagrees

  return (
    <article className="flex gap-jv-14">
      <SpeakerGutter speaker={turn.speaker} time={turn.time} />

      {simple ? (
        <div className={bodyClass} style={{ maxWidth: JV_BOARD.turnMeasure }}>
          {rich}
        </div>
      ) : disagrees ? (
        <div
          data-jv-fixture="no-source"
          className="border-l border-jv-border-btn pl-jv-14"
          style={{ maxWidth: JV_BOARD.turnMeasureWide }}
        >
          <div className="mb-jv-7 font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-wider-2 text-jv-assumed-sup">
            {disagreeLabel}
          </div>
          <div className={bodyClass}>{rich}</div>
        </div>
      ) : (
        <div
          className="flex flex-col gap-jv-10"
          style={{ maxWidth: JV_BOARD.turnMeasureWide }}
        >
          <div className={bodyClass}>{rich}</div>

          {turn.evidence ? (
            <div data-jv-fixture="no-source" className="flex gap-jv-10">
              {turn.evidence.map((badge) => (
                <div key={badge.title} className="flex-1">
                  <VerificationBadge {...badge} />
                </div>
              ))}
            </div>
          ) : null}

          {turn.delegation ? <DelegationNote notes={turn.delegation} /> : null}
        </div>
      )}
    </article>
  )
}

/**
 * The caveat slot under the BLAST RADIUS / UNDO PATH panel, which holds one of
 * three things and never two:
 *
 *   • the resolve line, when a confirm is pending or was blocked. It is UI
 *     state, not entity data — it says what the button is about to do, which is
 *     the one thing on a live gate that is knowable.
 *   • the FIXTURE caveat, on the fixture fallback only, marked no-source as it
 *     has been since slice 3.
 *   • nothing. A live gate has no caveat: §3.2 makes it NO SOURCE, and
 *     "qa has not verified…" over a real approval would be an invented reason
 *     to hesitate.
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

export function Conversation({
  turns,
  trailingTurn,
  gate,
  disagreeLabel,
}: {
  turns: Array<ConversationTurnFixture>
  trailingTurn: ConversationTurnFixture
  gate: GateDisplay
  disagreeLabel: string
}) {
  // Undefined, not an element that renders nothing: the card tests the prop for
  // truthiness, so an "empty" caveat would still open the gap above it.
  const caveat =
    gate.note || gate.caveat ? (
      <GateCaveat note={gate.note} caveat={gate.caveat} />
    ) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-jv-11 overflow-y-auto px-jv-32 pt-jv-14">
      {turns.map((turn) => (
        <Turn key={turn.id} turn={turn} disagreeLabel={disagreeLabel} />
      ))}

      {/*
        The mark stays on a LIVE gate too, and it is not a leftover: the two
        panel cells and the caveat have no source either way (§3.2). What
        changes is the reason, so the tooltip does.
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
        <ApprovalGateCard {...gate.props} caveat={caveat} onAction={gate.onAction} />
      </div>

      {gate.othersWaiting ? (
        <div className="font-jv-mono text-jv-sm leading-jv-none text-jv-blocked-dim">
          {gate.othersWaiting}
        </div>
      ) : null}

      <Turn turn={trailingTurn} disagreeLabel={disagreeLabel} />
    </div>
  )
}
