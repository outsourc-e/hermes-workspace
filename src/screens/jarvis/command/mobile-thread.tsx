/**
 * Mobile Command — the condensed thread (artboard 03).
 *
 * The desktop board gives a turn a speaker gutter, a 640px measure, an
 * evidence pair and a delegation note. At 390pt none of that survives, so this
 * is a RECOMPOSITION rather than a narrower `conversation.tsx`: the speaker
 * moves above the prose, the thread keeps only the two turns that carry the
 * disagreement, and the evidence collapses to the single CLAIMED strip that
 * the gate above actually depends on.
 *
 * It still COMPOSES the same primitives and re-styles neither:
 *   • `EpistemicMark`     — the inline KN / RC / AS claims
 *   • `VerificationBadge` — the compact CLAIMED strip
 *
 * Honesty notes (`docs/design/jarvis-ui-mapping.md` §3.5): the epistemic marks
 * (item 1), verified/claimed on a chat turn (items 2–3) and the DISAGREES
 * stance (item 4) all have NO SOURCE today and carry `data-jv-fixture=
 * "no-source"`.
 *
 * Token discipline: no raw colour, size, spacing or radius.
 */
import type {
  MobileThreadFixture,
  MobileThreadTurnFixture,
  RichSpan,
} from '@/components/jarvis/fixtures'
import { EpistemicMark } from '@/components/jarvis/epistemic-mark'
import { VerificationBadge } from '@/components/jarvis/verification-badge'

const SECTION_LABEL_CLASS =
  'font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-widest text-jv-label'

/**
 * Same span vocabulary as the desktop conversation, minus the streaming caret:
 * the mobile artboard's thread is history, and nothing in it is in flight.
 */
function RichText({ spans }: { spans: Array<RichSpan> }) {
  return (
    <>
      {spans.map((span, index) => {
        // Fixture spans are a static, ordered list — index is a stable key.
        const key = `${span.kind}-${index}`
        switch (span.kind) {
          case 'code':
            return (
              <span
                key={key}
                className="font-jv-mono text-jv-xl text-jv-text-muted"
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
          case 'text':
            return <span key={key}>{span.text}</span>
          // The thread is history; nothing in it is still streaming.
          case 'caret':
            return null
        }
      })}
    </>
  )
}

function Turn({ turn }: { turn: MobileThreadTurnFixture }) {
  const body = (
    <div className="mt-jv-6 font-jv-sans text-jv-3xl leading-jv-loose-3 text-jv-text-body">
      <RichText spans={turn.body} />
    </div>
  )

  return (
    <article>
      <div className="flex items-baseline gap-jv-7 font-jv-mono text-jv-2xs leading-jv-none">
        <span className="font-semibold tracking-jv-wider text-jv-live">
          {turn.speaker}
        </span>
        <span className="text-jv-label-ghost">{turn.time}</span>
        {turn.stance ? (
          <span
            data-jv-fixture="no-source"
            className="font-semibold tracking-jv-wider-2 text-jv-assumed-sup"
          >
            {`· ${turn.stance}`}
          </span>
        ) : null}
      </div>

      {turn.stance ? (
        <div className="border-l border-jv-border-btn pl-jv-11">{body}</div>
      ) : (
        body
      )}
    </article>
  )
}

export function MobileThread({ thread }: { thread: MobileThreadFixture }) {
  return (
    <section aria-label="Thread" className="flex flex-col gap-jv-11">
      <div className={SECTION_LABEL_CLASS}>{thread.label}</div>

      {thread.turns.map((turn) => (
        <Turn key={turn.id} turn={turn} />
      ))}

      <div
        data-jv-fixture="no-source"
        className="font-jv-mono text-jv-base leading-jv-none text-jv-live"
      >
        {thread.delegation}
      </div>

      <div data-jv-fixture="no-source">
        <VerificationBadge {...thread.evidence} />
      </div>
    </section>
  )
}
