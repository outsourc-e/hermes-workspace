/**
 * JARVIS Command — the routed screen, plus the Desktop Command board itself
 * (artboard 01, fixed 1440×900).
 *
 * Slice 5 makes the ROUTE responsive without touching the board. At `lg` and
 * above the screen renders `DesktopCommandBoard` exactly as slice 3 drew it;
 * below `lg` it renders `MobileCommandBoard` — artboard 03, a different
 * composition that leads with the gate — rather than reflowing a 1440 board
 * into 390. The swap is CSS (`hidden` / `flex`), not a media-query hook, so
 * there is no viewport read to get wrong on first paint.
 *
 * `DesktopCommandScreen` keeps its slice-3 name because `src/routes/
 * jarvis-command.tsx` imports it and routes are out of scope for this slice.
 * It is the Command screen at every width, not the desktop one.
 *
 * Top bar over a three-zone body: workers/threads rail (220) · conversation
 * (flex) · work trail (320). Composed entirely from the Slice 2 primitives and
 * the `--jv-*` token layer; this slice re-styles none of them.
 *
 * FIXTURES ONLY. This directory imports no store, no gateway client and no
 * HTTP endpoint, and opens no request or event stream of any kind —
 * every value comes from `src/components/jarvis/fixtures.ts` so slice 6 can see
 * in one file exactly what still needs a real source. The NO SOURCE rows from
 * `docs/design/jarvis-ui-mapping.md` §3.5 are drawn here to prove the layout
 * and are labelled as fixtures both in the banner above the frame and via
 * `data-jv-fixture="no-source"` in the DOM. Nothing on this board is live.
 *
 * Theme handling: the `--jv-*` tokens only resolve under `[data-theme='jarvis']`,
 * so the board sets that attribute on <html> for as long as it is mounted and
 * restores the previous value on unmount — never writing localStorage, so the
 * user's stored theme comes back untouched. This mirrors the gallery screen's
 * hook rather than importing it: sharing it would mean editing an existing
 * screen, which is out of scope for this slice.
 *
 * One class needs explaining: the roots below carry `tracking-normal`. The app
 * sets `letter-spacing: -0.15px` on `html, body` in `styles.css`, which every
 * descendant inherits; the artboard's text is untracked. Without this the whole
 * board renders a hair tight and the drift compounds across a long mono line.
 * The Conductor board has had this reset since slice 4 — this board inherited
 * the bleed until now, so the two were a hair apart. Resetting at the root is
 * local and additive: the explicit `tracking-jv-*` on labels still wins.
 *
 * Token discipline: no raw colour, size, spacing or radius in this directory.
 * Structural dimensions come from `JV_BOARD` / `JV_MOBILE` (multiples of
 * `--jv-space-4`).
 */
import { useEffect } from 'react'
import { CommandTopbar } from './command-topbar'
import { Composer } from './composer'
import { Conversation } from './conversation'
import { JV_BOARD, JV_MOBILE } from './geometry'
import { MobileCommandBoard } from './mobile-command'
import { WorkTrail } from './work-trail'
import { WorkerRail } from './worker-rail'
import {
  commandChainFixtures,
  commandComposerFixture,
  commandConversationFixtures,
  commandFilesTouchedFixtures,
  commandFixtureNotice,
  commandGateCaveatFixture,
  commandGateFixture,
  commandNoSourceNotice,
  commandRailFooterLines,
  commandThreadFixtures,
  commandToolCallFixtures,
  commandTopbarFixture,
  commandTrailingTurnFixture,
  commandWorkTrailChrome,
  commandWorkerCounts,
  commandWorkerFixtures,
  disagreeLabel,
  mobileFixtureNotice,
} from '@/components/jarvis/fixtures'

const THEME_ATTRIBUTE = 'data-theme'
const JARVIS_THEME = 'jarvis'

/** Applies `data-theme='jarvis'` for the lifetime of the board only. */
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

/** The board frame on its own — 1440×900, exactly what the artboard shows. */
export function DesktopCommandBoard() {
  return (
    <div
      data-jv-board="desktop-command"
      className="flex flex-none flex-col overflow-hidden border border-jv-border bg-jv-surface-1 font-jv-sans tracking-normal text-jv-text"
      style={{
        width: JV_BOARD.frameWidth,
        height: JV_BOARD.frameHeight,
      }}
    >
      <CommandTopbar data={commandTopbarFixture} />

      <div className="flex min-h-0 flex-1">
        <WorkerRail
          workers={commandWorkerFixtures}
          counts={commandWorkerCounts}
          threads={commandThreadFixtures}
          footerLines={commandRailFooterLines}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-jv-surface-1">
          <Conversation
            turns={commandConversationFixtures}
            trailingTurn={commandTrailingTurnFixture}
            gate={commandGateFixture}
            gateCaveat={commandGateCaveatFixture}
            disagreeLabel={disagreeLabel}
          />
          <Composer data={commandComposerFixture} />
        </main>

        <WorkTrail
          chain={commandChainFixtures}
          files={commandFilesTouchedFixtures}
          toolCalls={commandToolCallFixtures}
          chrome={commandWorkTrailChrome}
        />
      </div>
    </div>
  )
}

/**
 * The dev route's page. One route, two compositions: the desktop board at `lg`
 * and above, the mobile board below it. Both are mounted and CSS picks one —
 * they are inert fixture boards, so nothing is paid for the hidden one beyond
 * its markup, and a CSS swap cannot mismatch on first paint the way a
 * `matchMedia` read can.
 */
export function DesktopCommandScreen() {
  useJarvisThemeAttribute()

  return (
    <div className="min-h-screen bg-jv-bg font-jv-sans tracking-normal text-jv-text">
      <div className="hidden flex-col items-center gap-jv-16 p-jv-24 lg:flex">
        <header
          className="flex w-full flex-col gap-jv-6"
          style={{ maxWidth: JV_BOARD.frameWidth }}
        >
          <div className="flex items-baseline gap-jv-12">
            <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider-2 text-jv-live">
              01 · DESKTOP COMMAND
            </span>
            <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
              1440 × 900
            </span>
          </div>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-text-caption">
            {commandFixtureNotice}
          </p>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-blocked-dim">
            {commandNoSourceNotice}
          </p>
        </header>

        <DesktopCommandBoard />
      </div>

      <div className="flex flex-col items-center gap-jv-12 p-jv-14 lg:hidden">
        <header
          className="flex w-full flex-col gap-jv-6"
          style={{ maxWidth: JV_MOBILE.frameWidth }}
        >
          <div className="flex items-baseline gap-jv-9">
            <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider-2 text-jv-live">
              03 · MOBILE COMMAND
            </span>
            <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
              390 × 844
            </span>
          </div>
          <p className="font-jv-sans text-jv-md leading-jv-loose text-jv-text-caption">
            {mobileFixtureNotice}
          </p>
          <p className="font-jv-sans text-jv-md leading-jv-loose text-jv-blocked-dim">
            {commandNoSourceNotice}
          </p>
        </header>

        <MobileCommandBoard />
      </div>
    </div>
  )
}
