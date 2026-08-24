/**
 * Desktop Conductor — WORKER BOARD (artboard 02).
 *
 * A 5-column grid. Row 1 is the active chain — orchestrator → builder →
 * reviewer → qa, plus the blocked km-agent — with the horizontal connector
 * drawn across the grid gutter; the rest of the fleet fills the rows below.
 *
 * Why a card and not `WorkerStatusLine`: the rail primitive is one row of
 * dot + name + detail. A board card carries a step badge, TWO detail lines
 * whose hues move independently, and a per-state action chip. Reusing the rail
 * would mean either widening the primitive (out of scope for this slice) or
 * padding the card out to a shape it isn't. The card is composed here instead
 * and, like the primitive, keeps the blocked dot SQUARE so "waiting on a human"
 * reads without relying on hue alone.
 *
 * Honesty notes (`docs/design/jarvis-ui-mapping.md`):
 *   • §3.3 — worker running/idle/failed/stale DO have real sources today, and
 *     `blocked` is derivable from a pending approval. This slice reads none of
 *     them: every card below comes from `fixtures.ts`.
 *   • §3.5 item 14 — the CHAIN is a layout convention. No parent→child edge
 *     graph is captured anywhere, so the connectors and the chain caption are
 *     marked `data-jv-fixture="no-source"`.
 *   • §3.5 item 12 — maintainer's "launchd job not loaded" line has no source.
 *
 * Token discipline: no raw colour, size, spacing or radius. Structural
 * dimensions come from `JV_CONDUCTOR` (multiples of `--jv-space-4`).
 */
import { clsx } from 'clsx'
import { ConductorChip, ConductorSectionHeading } from './conductor-chrome'
import { JV_CONDUCTOR } from './geometry'
import type {
  ConductorBadgeTone,
  ConductorCardTone,
  ConductorSectionHeadingFixture,
  ConductorSubTone,
  ConductorWorkerCardFixture,
} from '@/components/jarvis/fixtures'

const CHAIN_NOTE_TITLE =
  'Layout convention — no parent→child delegation graph is captured today'

interface CardTokens {
  frame: string
  /** Dot fill + shape. Blocked and the active node are square. */
  dot: string
  name: string
  detail: string
  sub: string
}

const CARD_TONES: Record<ConductorCardTone, CardTokens> = {
  running: {
    frame: 'border-jv-border-muted bg-jv-surface-4',
    dot: 'rounded-jv-full bg-jv-live animate-jv-pulse',
    name: 'font-semibold text-jv-text',
    detail: 'text-jv-text-faint',
    sub: 'text-jv-label-faint',
  },
  active: {
    // The node the chain is currently ON — the only card wearing `jv-ring`.
    frame: 'border-jv-live-line bg-jv-live-bg-2',
    dot: 'bg-jv-live animate-jv-ring',
    name: 'font-semibold text-jv-text',
    detail: 'text-jv-text-muted',
    sub: 'text-jv-label-faint',
  },
  queued: {
    // In the chain but not reached: a step brighter than the fleet frame.
    frame: 'border-jv-border-muted bg-jv-surface-2',
    dot: 'rounded-jv-full bg-jv-dot-idle',
    name: 'font-medium text-jv-text-dim',
    detail: 'text-jv-label-dim',
    sub: 'text-jv-label-ghost',
  },
  blocked: {
    frame: 'border-jv-blocked-line bg-jv-blocked-bg-row',
    dot: 'bg-jv-blocked',
    name: 'font-semibold text-jv-text',
    detail: 'text-jv-blocked-soft',
    sub: 'text-jv-blocked-dim',
  },
  idle: {
    frame: 'border-jv-line bg-jv-surface-2',
    dot: 'rounded-jv-full bg-jv-dot-idle',
    name: 'font-medium text-jv-text-dim',
    detail: 'text-jv-label-dim',
    sub: 'text-jv-label-ghost',
  },
}

const BADGE_TONES: Record<ConductorBadgeTone, string> = {
  live: 'text-jv-live',
  muted: 'text-jv-label-faint',
  blocked: 'text-jv-blocked',
  failed: 'text-jv-failed',
}

/**
 * The second detail line reports the LAST RUN, which need not agree with the
 * card's current state — an idle worker can carry a failed last run.
 */
const SUB_TONES: Record<Exclude<ConductorSubTone, 'default'>, string> = {
  blocked: 'text-jv-blocked-soft',
  failed: 'text-jv-failed-muted',
}

/**
 * The chain edge hanging off a card's right side: a static rule across the
 * gutter, and for an in-flight hand-off a `jv-flow` dot travelling along it.
 */
function ChainConnector({ card }: { card: ConductorWorkerCardFixture }) {
  const live = card.connector === 'flow'

  return (
    <>
      <span
        aria-hidden="true"
        data-jv-fixture="no-source"
        className={clsx(
          'absolute top-1/2 h-jv-1',
          live ? 'bg-jv-live-line' : 'bg-jv-border-input',
        )}
        style={{
          right: JV_CONDUCTOR.connectorOffset,
          width: JV_CONDUCTOR.connectorWidth,
        }}
      />
      {live ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-jv-1 overflow-hidden"
          style={{
            right: JV_CONDUCTOR.connectorOffset,
            width: JV_CONDUCTOR.connectorWidth,
          }}
        >
          <span className="absolute top-jv-0 h-jv-1 w-jv-4 bg-jv-live animate-jv-flow" />
        </span>
      ) : null}
    </>
  )
}

function WorkerCard({ card }: { card: ConductorWorkerCardFixture }) {
  const tokens = CARD_TONES[card.tone]
  const subTone =
    card.subTone && card.subTone !== 'default'
      ? SUB_TONES[card.subTone]
      : tokens.sub

  return (
    <div
      data-jv-worker-tone={card.tone}
      className={clsx(
        'relative border px-jv-11 pt-jv-10 pb-jv-11',
        tokens.frame,
      )}
    >
      <div className="flex items-center gap-jv-7">
        <span
          aria-hidden="true"
          className={clsx('h-jv-5 w-jv-5 flex-none', tokens.dot)}
        />
        <span
          className={clsx(
            'flex-1 font-jv-mono text-jv-lg leading-jv-none',
            tokens.name,
          )}
        >
          {card.name}
        </span>
        {card.badge ? (
          <span
            className={clsx(
              'font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide-2',
              BADGE_TONES[card.badge.tone],
            )}
          >
            {card.badge.label}
          </span>
        ) : null}
      </div>

      <div
        className={clsx(
          'mt-jv-8 font-jv-mono text-jv-base leading-jv-relaxed-2',
          tokens.detail,
        )}
      >
        {card.detail}
        <br />
        <span
          data-jv-fixture={card.noSource ? 'no-source' : undefined}
          className={subTone}
        >
          {card.sub}
        </span>
      </div>

      {card.action ? (
        <div className="mt-jv-9 flex items-center gap-jv-6">
          <ConductorChip chip={card.action} />
        </div>
      ) : null}

      {card.connector ? <ChainConnector card={card} /> : null}
    </div>
  )
}

export function WorkerBoard({
  heading,
  cards,
}: {
  heading: ConductorSectionHeadingFixture
  cards: Array<ConductorWorkerCardFixture>
}) {
  return (
    <section
      aria-label="Worker board"
      className="flex-none border-b border-jv-line px-jv-20 pt-jv-16 pb-jv-20"
    >
      <ConductorSectionHeading
        heading={heading}
        noSource
        title={CHAIN_NOTE_TITLE}
        className="mb-jv-12"
      />

      <div className="grid grid-cols-5 gap-jv-16">
        {cards.map((card) => (
          <WorkerCard key={card.name} card={card} />
        ))}
      </div>
    </section>
  )
}
