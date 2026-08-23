/**
 * Desktop Command — centre column (artboard 01): the conversation.
 *
 * COMPOSES three Slice 2 primitives and re-styles none of them:
 *   • `EpistemicMark`      — inline KN / RC / AS claims inside a turn's prose
 *   • `VerificationBadge`  — the verified / claimed pair under a turn
 *   • `ApprovalGateCard`   — the inline gate after the disagreement turn
 *
 * Everything is fixture data. The epistemic marks, the verified/claimed state
 * on a chat turn, the I DISAGREE stance and the whole gate body are NO SOURCE
 * (`docs/design/jarvis-ui-mapping.md` §3.5 items 1–7) — they are drawn here to
 * prove the layout only, and each carries `data-jv-fixture="no-source"`.
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
import type { ApprovalGateCardProps } from '@/components/jarvis/types'
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

export function Conversation({
  turns,
  trailingTurn,
  gate,
  gateCaveat,
  disagreeLabel,
}: {
  turns: Array<ConversationTurnFixture>
  trailingTurn: ConversationTurnFixture
  gate: Omit<ApprovalGateCardProps, 'caveat'>
  gateCaveat: GateCaveatFixture
  disagreeLabel: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-jv-11 overflow-y-auto px-jv-32 pt-jv-14">
      {turns.map((turn) => (
        <Turn key={turn.id} turn={turn} disagreeLabel={disagreeLabel} />
      ))}

      <div data-jv-fixture="no-source">
        <ApprovalGateCard
          {...gate}
          caveat={
            <>
              {gateCaveat.lead}
              <EpistemicMark mark={gateCaveat.mark}>
                {gateCaveat.claim}
              </EpistemicMark>
              {gateCaveat.trail}
            </>
          }
        />
      </div>

      <Turn turn={trailingTurn} disagreeLabel={disagreeLabel} />
    </div>
  )
}
