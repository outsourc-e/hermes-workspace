/**
 * JARVIS Desktop Conductor board — artboard 02, fixed 1440×900.
 *
 * Top bar (COMMAND/CONDUCTOR tabs) over three stacked sections: WORKER BOARD,
 * SCHEDULED JOBS, RUN LOG · UNATTENDED. Where the Command board answers "what
 * is JARVIS doing with me", this one answers "what is it doing without me" —
 * so FAILED and STALE are the point of the screen, not edge cases: the failed
 * job wears a hazard-striped red frame and the silent one an amber frame, both
 * carrying the diagnostic and the chip you would actually reach for.
 *
 * FIXTURES ONLY. This directory imports no store, no gateway client and no HTTP
 * endpoint, and opens no request or event stream of any kind — every value comes
 * from `src/components/jarvis/fixtures.ts`.
 *
 * That is worth stating precisely for this board, because unlike the Command
 * board much of what it shows DOES have a real source today
 * (`docs/design/jarvis-ui-mapping.md` §3.3–§3.4): worker running/idle/failed/
 * stale, and job cadence/last-run success/error/next-run. This slice still does
 * not read them — slice 6 does, and it gets one file to replace. The rows with
 * NO source at all (§3.5 items 11–14: the PARTIAL badge as a structured state,
 * the launchd diagnostic, run-log history beyond the latest run, and the chain
 * as a real edge graph) are drawn to prove the layout and are labelled as
 * fixtures both in the banner above the frame and via `data-jv-fixture=
 * "no-source"` in the DOM. Nothing on this board is live.
 *
 * Theme handling: the `--jv-*` tokens only resolve under `[data-theme='jarvis']`,
 * so the board sets that attribute on <html> for as long as it is mounted and
 * restores the previous value on unmount — never writing localStorage, so the
 * user's stored theme comes back untouched. Same hook as the Command board,
 * copied rather than shared: lifting it would mean editing that screen, which
 * is out of scope for this slice.
 *
 * One class needs explaining: the board root carries `tracking-normal`. The app
 * sets `letter-spacing: -0.15px` on `html, body` in `styles.css`, which every
 * descendant inherits; the artboard's text is untracked. Without this the whole
 * board renders a hair tight, and the drift compounds across a long mono line
 * like a run-log result. Resetting it at the board root is local and additive —
 * the explicit `tracking-jv-*` on labels and badges still wins over it.
 *
 * Token discipline: no raw colour, size, spacing or radius in this directory.
 * Structural dimensions come from `JV_BOARD` / `JV_CONDUCTOR` (multiples of
 * `--jv-space-4`).
 */
import { useEffect } from 'react'
import { JV_BOARD } from '../command/geometry'
import { ConductorTopbar } from './conductor-topbar'
import { RunLog } from './run-log'
import { ScheduledJobs } from './scheduled-jobs'
import { WorkerBoard } from './worker-board'
import {
  conductorFixtureNotice,
  conductorJobFixtures,
  conductorJobsHeading,
  conductorNoSourceNotice,
  conductorRunLogChrome,
  conductorRunLogFixtures,
  conductorTopbarFixture,
  conductorWorkerBoardHeading,
  conductorWorkerCardFixtures,
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
export function DesktopConductorBoard() {
  return (
    <div
      data-jv-board="desktop-conductor"
      className="flex flex-none flex-col overflow-hidden border border-jv-border bg-jv-surface-1 font-jv-sans tracking-normal text-jv-text"
      style={{
        width: JV_BOARD.frameWidth,
        height: JV_BOARD.frameHeight,
      }}
    >
      <ConductorTopbar data={conductorTopbarFixture} />

      <WorkerBoard
        heading={conductorWorkerBoardHeading}
        cards={conductorWorkerCardFixtures}
      />

      <ScheduledJobs
        heading={conductorJobsHeading}
        jobs={conductorJobFixtures}
      />

      <RunLog chrome={conductorRunLogChrome} runs={conductorRunLogFixtures} />
    </div>
  )
}

/** The dev route's page: the honesty banner, then the frame. */
export function DesktopConductorScreen() {
  useJarvisThemeAttribute()

  return (
    <div className="min-h-screen bg-jv-bg font-jv-sans tracking-normal text-jv-text">
      <div className="flex flex-col items-center gap-jv-16 p-jv-24">
        <header
          className="flex w-full flex-col gap-jv-6"
          style={{ maxWidth: JV_BOARD.frameWidth }}
        >
          <div className="flex items-baseline gap-jv-12">
            <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider-2 text-jv-live">
              02 · DESKTOP CONDUCTOR
            </span>
            <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
              1440 × 900
            </span>
            <span className="font-jv-sans text-jv-md leading-jv-none text-jv-label">
              everything running, everything scheduled
            </span>
          </div>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-text-caption">
            {conductorFixtureNotice}
          </p>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-blocked-dim">
            {conductorNoSourceNotice}
          </p>
        </header>

        <DesktopConductorBoard />
      </div>
    </div>
  )
}
