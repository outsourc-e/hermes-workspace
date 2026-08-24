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
 * ONE SECTION IS LIVE (slice 6b). The WORKER RAIL — its rows and its
 * RUN/BLK/IDLE count line — reads real swarm sessions through `useWorkers`,
 * with BLOCKED joined from the gateway's pending approvals queue. Both calls
 * are GETs; this board issues no write of any kind, and no live row carries a
 * control that implies one.
 *
 * Everything else is still FIXTURES: the conversation, the gate, the work
 * trail, the threads list, the composer and the rail's ctx footer all come from
 * `src/components/jarvis/fixtures.ts`, so a later slice can still see in one
 * file exactly what needs a real source. The NO SOURCE rows from
 * `docs/design/jarvis-ui-mapping.md` §3.5 are drawn here to prove the layout
 * and are labelled as fixtures both in the banner above the frame and via
 * `data-jv-fixture="no-source"` in the DOM.
 *
 * Live worker rows carry only what the session list actually supplies — a state
 * and an age. The rail's detail column never invents a task, a file or a
 * command, and when the gateway holds no sessions the rail falls back to the
 * slice-3 fixture roster and the banner says so.
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
import { useWorkers } from '../conductor/use-workers'
import { CommandTopbar } from './command-topbar'
import { Composer } from './composer'
import { Conversation } from './conversation'
import { JV_BOARD, JV_MOBILE } from './geometry'
import { MobileCommandBoard } from './mobile-command'
import { WorkTrail } from './work-trail'
import { WorkerRail } from './worker-rail'
import type { WorkersData } from '../conductor/use-workers'
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

/** The slice-3 roster and its verbatim artboard count line, as one prop. */
const FIXTURE_RAIL = {
  workers: commandWorkerFixtures,
  counts: commandWorkerCounts,
}

/**
 * `commandFixtureNotice` says nothing on this board is live — true only while
 * the rail is on its fallback. This is what is actually on screen once the
 * gateway answers with sessions.
 */
const commandLiveWorkersNotice =
  'The WORKER RAIL is LIVE — real swarm sessions (GET /api/gateway/sessions), with BLOCKED joined from the pending approvals queue (GET /api/gateway/approvals) and the RUN/BLK/IDLE line tallied from the whole roster. Session status is the swarm store’s heuristic, not an authoritative gateway signal, and a live row carries only a state and an age: no task, no file, no command. Read-only — this board issues no write of any kind. Every other section — conversation, gate, work trail, threads, composer, ctx footer — is still invented fixtures.'

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

/**
 * The board frame on its own — 1440×900, exactly what the artboard shows.
 *
 * The rail arrives as a prop with the fixtures as its default, so the frame
 * still renders standalone with no query client and no store poll mounted; the
 * routed screen below passes the live workers in when the gateway has any.
 */
export function DesktopCommandBoard({
  rail = FIXTURE_RAIL,
}: {
  rail?: WorkersData['rail']
} = {}) {
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
          workers={rail.workers}
          counts={rail.counts}
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
 * nothing is paid for the hidden one beyond its markup (the worker read happens
 * once, here), and a CSS swap cannot mismatch on first paint the way a
 * `matchMedia` read can.
 *
 * The mobile frame is NOT wired: artboard 03 leads with the gate rather than a
 * worker roster, and wiring a gate means resolving one, which is slice 6c. Its
 * banner still says fixtures, because it still is.
 */
export function DesktopCommandScreen() {
  useJarvisThemeAttribute()
  const workers = useWorkers()

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
            {workers.isLive ? commandLiveWorkersNotice : commandFixtureNotice}
          </p>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-blocked-dim">
            {commandNoSourceNotice}
          </p>
        </header>

        <DesktopCommandBoard rail={workers.rail} />
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
