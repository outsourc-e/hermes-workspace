/**
 * JARVIS Desktop Command board — artboard 01, fixed 1440×900.
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
 * Token discipline: no raw colour, size, spacing or radius in this directory.
 * Structural dimensions come from `JV_BOARD` (multiples of `--jv-space-4`).
 */
import { useEffect } from 'react'
import { CommandTopbar } from './command-topbar'
import { Composer } from './composer'
import { Conversation } from './conversation'
import { JV_BOARD } from './geometry'
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
      className="flex flex-none flex-col overflow-hidden border border-jv-border bg-jv-surface-1 font-jv-sans text-jv-text"
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

/** The dev route's page: the honesty banner, then the frame. */
export function DesktopCommandScreen() {
  useJarvisThemeAttribute()

  return (
    <div className="min-h-screen bg-jv-bg font-jv-sans text-jv-text">
      <div className="flex flex-col items-center gap-jv-16 p-jv-24">
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
    </div>
  )
}
