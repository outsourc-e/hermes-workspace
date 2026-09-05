/**
 * JARVIS primitive gallery — DEV ONLY (`/jarvis-gallery`).
 *
 * Every state of the four primitives, side by side, against fixtures. No store,
 * no gateway, interactions are no-ops. This is the surface the slice is
 * reviewed on.
 *
 * ONE SECTION IS LIVE. `CODE CHECKPOINTS` reads the real `tsc | tests | lint |
 * e2e` results recorded on a workspace checkpoint — per
 * `docs/design/jarvis-ui-mapping.md` §3.6 the only genuine verified-vs-claimed
 * source in the codebase. It lives HERE, on a dev surface of its own, and
 * nowhere near the conversation: verification on a chat message is NO SOURCE
 * (§3.5 items 2–3), so wiring code checks into a turn would claim a typechecker
 * had confirmed something a person said. The Command board's conversation is
 * untouched by this and stays inert. When the workspace daemon is not running
 * the section falls back to the same fixtures as the section above and says so.
 *
 * Theme handling: the `--jv-*` tokens only resolve under `[data-theme='jarvis']`,
 * so this screen sets that attribute directly on <html> for as long as it is
 * mounted and restores the previous value on unmount. It deliberately does NOT
 * go through the app's setTheme — the user's stored theme in localStorage must
 * come back untouched when they navigate away.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { GateCaveatFixture } from '@/components/jarvis/fixtures'
import { ApprovalGateCard } from '@/components/jarvis/approval-gate-card'
import { EpistemicMark } from '@/components/jarvis/epistemic-mark'
import { VerificationBadge } from '@/components/jarvis/verification-badge'
import { WorkerStatusLine } from '@/components/jarvis/worker-status-line'
import {
  approvalGateFixtures,
  emptyRailNote,
  epistemicMarkFixtures,
  verificationBadgeFixtures,
  workerStatusFixtures,
} from '@/components/jarvis/fixtures'
import { useCheckpointVerification } from '@/screens/jarvis/conductor/use-checkpoint-verification'

const THEME_ATTRIBUTE = 'data-theme'
const JARVIS_THEME = 'jarvis'

/** Applies `data-theme='jarvis'` for the lifetime of the gallery only. */
function useJarvisThemeAttribute() {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute(THEME_ATTRIBUTE)
    root.setAttribute(THEME_ATTRIBUTE, JARVIS_THEME)
    return () => {
      if (previous === null) {
        root.removeAttribute(THEME_ATTRIBUTE)
      } else {
        root.setAttribute(THEME_ATTRIBUTE, previous)
      }
    }
  }, [])
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-jv-12">
      <div className="flex flex-col gap-jv-4 border-b border-jv-line pb-jv-8">
        <h2 className="font-jv-mono text-jv-md leading-jv-none font-semibold tracking-jv-widest text-jv-text-muted">
          {title}
        </h2>
        <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-text-caption">
          {note}
        </p>
      </div>
      {children}
    </section>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="font-jv-mono text-jv-2xs leading-jv-none tracking-jv-label-2 text-jv-label">
      {children}
    </div>
  )
}

const LIVE_CHECKPOINT_NOTICE =
  'CODE CHECKPOINT verification is LIVE (tsc/tests/lint/e2e) from the workspace API — this is code-check state, NOT conversation verification. A passed check is VERIFIED with its real output as evidence; a failed one is drawn as CLAIMED · UNVERIFIED, because the affirmative state would read as “this passed”, and its title says FAILED outright. Checks that never ran draw no badge at all. Read-only: no re-run, no review, no action chips.'

const FIXTURE_CHECKPOINT_NOTICE =
  'No checkpoint came back from the workspace API — without the workspace daemon, GET /api/workspace/checkpoints either 404s or falls through to the SPA shell, and both read as an empty list. That is the normal case for a design review, so the badges below are the SAME invented fixtures as the section above. Nothing here is a real code check.'

/**
 * The live section: real checkpoint verification, or the fixtures with the
 * fallback said out loud. Both readings render badges, so the notice above them
 * is the only thing that tells a reviewer which one they are looking at — it is
 * printed first, and unconditionally.
 */
function CodeCheckpointSection() {
  const { badges, inertChecks, source, isLive } = useCheckpointVerification()

  return (
    <Section
      title="CODE CHECKPOINTS"
      note="The one real verified-vs-claimed source in the codebase (§3.6) — the tsc/tests/lint/e2e checks recorded on a workspace code checkpoint. Out-of-band from chat: a conversation claim still has no verification field and stays inert."
    >
      <div className="flex flex-col gap-jv-16">
        <p
          data-jv-fixture={isLive ? undefined : 'no-source'}
          className="font-jv-sans text-jv-lg leading-jv-loose text-jv-text-caption"
        >
          {isLive ? LIVE_CHECKPOINT_NOTICE : FIXTURE_CHECKPOINT_NOTICE}
        </p>

        {source ? <Caption>{source}</Caption> : null}

        {badges.length > 0 ? (
          <div className="flex flex-col gap-jv-10">
            {badges.map((props) => (
              <VerificationBadge key={props.title} {...props} />
            ))}
          </div>
        ) : (
          // LIVE with nothing to show. A real checkpoint on which no check ran
          // is not an empty state to paper over — it is the answer.
          <div className="border border-dashed border-jv-line px-jv-10 py-jv-7 font-jv-mono text-jv-base leading-jv-loose text-jv-label-faint">
            No check on this checkpoint produced a verdict — nothing here is
            verified, and nothing is claimed.
          </div>
        )}

        {inertChecks.length > 0 ? (
          <div className="flex flex-col gap-jv-6">
            <Caption>ran nothing · no verdict, not a verdict</Caption>
            <div className="border-y border-jv-line-soft bg-jv-surface-0 px-jv-14 py-jv-12 font-jv-mono text-jv-xs leading-jv-loose text-jv-label-faint">
              {inertChecks.map((check) => (
                <div key={check.key}>
                  {check.scope} — {check.note}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  )
}

function GateCaveat({ caveat }: { caveat: GateCaveatFixture }) {
  return (
    <>
      {caveat.lead}
      <EpistemicMark mark={caveat.mark}>{caveat.claim}</EpistemicMark>
      {caveat.trail}
    </>
  )
}

export function JarvisGalleryScreen() {
  useJarvisThemeAttribute()

  return (
    <div className="min-h-screen bg-jv-bg font-jv-sans text-jv-text">
      <div className="mx-auto flex max-w-5xl flex-col gap-jv-40 p-jv-32">
        <header className="flex flex-col gap-jv-6">
          <h1 className="font-jv-mono text-jv-3xl leading-jv-none font-semibold tracking-jv-ultra text-jv-live">
            JARVIS PRIMITIVES
          </h1>
          <p className="font-jv-sans text-jv-xl leading-jv-loose text-jv-text-caption">
            Dev-only gallery. Every state below is fixture data — nothing is
            wired to a store, the gateway, or a real session, and no component
            decides anything for itself. The one exception is CODE CHECKPOINTS,
            which reads real tsc/tests/lint/e2e results from the workspace API
            and labels itself live or fallback on every render.
          </p>
        </header>

        <Section
          title="EPISTEMIC MARK"
          note="How a claim is known: Known (solid), Recalled (dotted), Assumed (dashed). The underline style is part of the meaning, not decoration."
        >
          <div className="flex flex-col gap-jv-16">
            {epistemicMarkFixtures.map((fixture) => (
              <div key={fixture.mark} className="flex flex-col gap-jv-6">
                <Caption>{fixture.mark}</Caption>
                <p className="font-jv-sans text-jv-5xl leading-jv-loose-3 text-jv-text-body">
                  {fixture.lead}
                  <EpistemicMark mark={fixture.mark}>
                    {fixture.claim}
                  </EpistemicMark>
                  {fixture.trail}
                </p>
              </div>
            ))}
            <p className="font-jv-sans text-jv-5xl leading-jv-loose-3 text-jv-text-body">
              All three in one sentence:{' '}
              <EpistemicMark mark="known">the build is green</EpistemicMark>,{' '}
              <EpistemicMark mark="recalled">
                this broke the same way last quarter
              </EpistemicMark>
              , and{' '}
              <EpistemicMark mark="assumed">
                the cause is the same one
              </EpistemicMark>
              .
            </p>
          </div>
        </Section>

        <Section
          title="VERIFICATION BADGE"
          note="Evidence attached, or the agent's word only. The card never verifies anything itself."
        >
          <div className="flex flex-col gap-jv-16">
            {verificationBadgeFixtures.map((fixture) => (
              <div key={fixture.label} className="flex flex-col gap-jv-6">
                <Caption>{fixture.label}</Caption>
                <VerificationBadge {...fixture.props} />
              </div>
            ))}
            <div className="flex flex-col gap-jv-6">
              <Caption>side by side, as they appear under a turn</Caption>
              <div className="flex gap-jv-10">
                {verificationBadgeFixtures.slice(0, 2).map((fixture) => (
                  <div key={fixture.label} className="flex-1">
                    <VerificationBadge {...fixture.props} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <CodeCheckpointSection />

        <Section
          title="WORKER STATUS LINE"
          note="One rail row per worker. Blocked is the only square dot — shape as well as hue, so 'waiting on a human' survives a colourblind reading."
        >
          <div className="flex flex-col gap-jv-16">
            <div className="flex flex-col gap-jv-6">
              <Caption>every status</Caption>
              <div className="border-b border-jv-line-soft bg-jv-surface-0">
                {workerStatusFixtures.map((fixture) => (
                  <WorkerStatusLine key={fixture.name} {...fixture} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-jv-6">
              <Caption>empty rail</Caption>
              <div className="border-y border-jv-line-soft bg-jv-surface-0 px-jv-14 py-jv-12 font-jv-mono text-jv-xs leading-jv-loose text-jv-label-faint">
                {emptyRailNote}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="APPROVAL GATE CARD"
          note="Blast radius and undo path stated before the buttons. Both are props — neither has a source in today's backend, so the card cannot invent them."
        >
          <div className="flex flex-col gap-jv-16">
            {approvalGateFixtures.map((fixture) => (
              <div key={fixture.label} className="flex flex-col gap-jv-6">
                <Caption>{fixture.label}</Caption>
                <ApprovalGateCard
                  {...fixture.props}
                  caveat={
                    fixture.caveat ? (
                      <GateCaveat caveat={fixture.caveat} />
                    ) : undefined
                  }
                />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
