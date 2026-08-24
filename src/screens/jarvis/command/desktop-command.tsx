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
 * TWO SECTIONS CAN BE LIVE. The WORKER RAIL — its rows and its RUN/BLK/IDLE
 * count line — reads real swarm sessions through `useWorkers` (slice 6b), with
 * BLOCKED joined from the gateway's pending approvals queue. The GATE reads
 * that same approvals queue through `useApprovals` (slice 6c) and shows the
 * OLDEST pending one, with the rest as a real "+N more waiting" count.
 *
 * BOTH READS ARE GETs. The one WRITE this app has for approvals —
 * `resolveGatewayApproval` — is reached only through `useResolveApproval`, and
 * whether its LOCK 1 is open is now a decision the user makes at runtime, in
 * this session, on the LIVE RESOLVE switch above the board (slice 6d). It is
 * OFF on every fresh session and OFF in committed code: while it is off the
 * gate's APPROVE / REJECT chips walk through their confirm step and then stop,
 * and nothing is POSTed. Arming it opens that one lock and NOTHING else — the
 * two-step confirm and the need for a real approval id are untouched, and the
 * switch itself makes no request. See `../conductor/use-resolve-approval.ts`
 * for the locks and `../conductor/use-resolve-arm.ts` for the flag.
 *
 * The gate is LIVE only in the sense of DISPLAY. Its BLAST RADIUS, UNDO PATH
 * and caveat have NO SOURCE (§3.2) — live, the two cells carry an inert
 * sentinel and the caveat is dropped rather than invented.
 *
 * Everything else is still FIXTURES: the conversation, the work trail, the
 * threads list, the composer and the rail's ctx footer all come from
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
import { ResolveArmToggle } from '../conductor/resolve-arm-toggle'
import { useApprovals } from '../conductor/use-approvals'
import { useResolveApproval } from '../conductor/use-resolve-approval'
import { useResolveArm } from '../conductor/use-resolve-arm'
import { useWorkers } from '../conductor/use-workers'
import { CommandTopbar } from './command-topbar'
import { Composer } from './composer'
import { Conversation } from './conversation'
import { JV_BOARD, JV_MOBILE } from './geometry'
import { MobileCommandBoard } from './mobile-command'
import { WorkTrail } from './work-trail'
import { WorkerRail } from './worker-rail'
import type { GateDisplay } from '../conductor/map-approvals'
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
  mobileCommandGateCaveatFixture,
  mobileFixtureNotice,
} from '@/components/jarvis/fixtures'

const THEME_ATTRIBUTE = 'data-theme'
const JARVIS_THEME = 'jarvis'

/** The slice-3 roster and its verbatim artboard count line, as one prop. */
const FIXTURE_RAIL = {
  workers: commandWorkerFixtures,
  counts: commandWorkerCounts,
}

/** The slice-3 gate and its caveat, as one prop. Nothing here is live. */
const FIXTURE_GATE: GateDisplay = {
  props: commandGateFixture,
  caveat: commandGateCaveatFixture,
  isLive: false,
}

/**
 * `commandFixtureNotice` says nothing on this board is live — true only while
 * the rail is on its fallback. This is what is actually on screen once the
 * gateway answers with sessions.
 */
const LIVE_RAIL_CLAUSE =
  'The WORKER RAIL is LIVE — real swarm sessions (GET /api/gateway/sessions), with BLOCKED joined from the pending approvals queue (GET /api/gateway/approvals) and the RUN/BLK/IDLE line tallied from the whole roster. Session status is the swarm store’s heuristic, not an authoritative gateway signal, and a live row carries only a state and an age: no task, no file, no command.'

const LIVE_GATE_CLAUSE =
  'The GATE is LIVE as DISPLAY — the oldest pending approval from the same GET /api/gateway/approvals queue: real agent, real action, real tool and input, wait derived from requestedAt. Its BLAST RADIUS and UNDO PATH have NO SOURCE and read as an inert sentinel rather than a plausible number, and the caveat is dropped entirely.'

const RESOLVE_CLAUSE_OFF =
  'Resolve is BUILT and DISARMED: LIVE RESOLVE is OFF for this session, so APPROVE / REJECT enter a two-step confirm and stop there — nothing is POSTed to the gateway and no approval is decided from this board. Arm it on the switch above the board if you mean to decide from here.'

const RESOLVE_CLAUSE_ARMED =
  'Resolve is ARMED for this session: LIVE RESOLVE is ON, so a two-step-CONFIRMED approve or reject POSTs the real decision to the gateway and there is no undo. Arming sent nothing by itself, the confirm step still stands between a click and the POST, and a fixture gate has no approval id to act on. The arm is per-session and is not in the committed default.'

function resolveClause(armed: boolean): string {
  return armed ? RESOLVE_CLAUSE_ARMED : RESOLVE_CLAUSE_OFF
}

/**
 * `commandFixtureNotice` says nothing on this board is live — true only while
 * both wires are on their fallback, so the banner is assembled per section.
 */
function buildCommandNotice(
  railLive: boolean,
  gateLive: boolean,
  armed: boolean,
): string {
  const clauses: Array<string> = []
  const stillFixture: Array<string> = []

  if (railLive) clauses.push(LIVE_RAIL_CLAUSE)
  else stillFixture.push('the worker rail')
  if (gateLive) clauses.push(LIVE_GATE_CLAUSE)
  else stillFixture.push('the gate')
  stillFixture.push(
    'the conversation',
    'the work trail',
    'threads',
    'the composer',
    'the ctx footer',
  )

  if (clauses.length === 0)
    return `${commandFixtureNotice} ${resolveClause(armed)}`
  return `${clauses.join(' ')} ${resolveClause(armed)} Still invented fixtures: ${stillFixture.join(' · ')}.`
}

const MOBILE_LIVE_GATE_CLAUSE =
  'The HERO GATE is LIVE as DISPLAY — the same real pending approval as the desktop board, from GET /api/gateway/approvals. Blast radius, undo path and the caveat have NO SOURCE: the two cells read as an inert sentinel and the caveat is dropped.'

function buildMobileCommandNotice(gateLive: boolean, armed: boolean): string {
  if (!gateLive) return `${mobileFixtureNotice} ${resolveClause(armed)}`
  return `${MOBILE_LIVE_GATE_CLAUSE} ${resolveClause(armed)} Still invented fixtures: the alert strip · the thread · the legend · the composer.`
}

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
  gate = FIXTURE_GATE,
}: {
  rail?: WorkersData['rail']
  gate?: GateDisplay
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
            gate={gate}
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
 * The mobile frame now shows the SAME gate as the desktop one — one read, one
 * hero, two frames — because artboard 03 leads with it. Its resolve control is
 * the same one, and so is its arm: one `useResolveArm` for the screen, so the
 * two frames can never disagree about whether this session is armed. Both
 * frames carry the switch, because both frames carry the gate.
 */
export function DesktopCommandScreen() {
  useJarvisThemeAttribute()
  const workers = useWorkers()
  const approvals = useApprovals()

  /**
   * LOCK 1, and who holds it. It is no longer a constant in this file: it is
   * the session's arm flag, false on every fresh session and false in the
   * committed default, flipped only by the user on the switch below. Passing it
   * through is the whole of this slice's wiring — `useResolveApproval`'s other
   * two locks (the two-step confirm, a real approval id) are not touched, so an
   * armed session still cannot POST from a single click or from a fixture gate.
   * While it is false the chips walk their confirm step and land in `blocked`,
   * exactly as before.
   */
  const arm = useResolveArm()
  const resolve = useResolveApproval({
    enabled: arm.armed,
    approvalId: approvals.approvalId,
    baseActions: approvals.gate.actions,
  })

  const gateChrome = {
    note: resolve.note,
    othersWaiting: approvals.othersWaiting,
    isLive: approvals.isLive,
    onAction: resolve.onAction,
    // NO SOURCE (§3.2) — a live gate carries no caveat at all.
    caveat: approvals.isLive ? undefined : commandGateCaveatFixture,
  }

  const gate: GateDisplay = {
    ...gateChrome,
    props: { ...approvals.gate, actions: resolve.actions },
  }

  const mobileGate: GateDisplay = {
    ...gateChrome,
    props: { ...approvals.mobileGate, actions: resolve.actions },
    caveat: approvals.isLive ? undefined : mobileCommandGateCaveatFixture,
  }

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
            {buildCommandNotice(workers.isLive, approvals.isLive, arm.armed)}
          </p>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-blocked-dim">
            {commandNoSourceNotice}
          </p>
          <ResolveArmToggle armed={arm.armed} onChange={arm.setArmed} />
        </header>

        <DesktopCommandBoard rail={workers.rail} gate={gate} />
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
            {buildMobileCommandNotice(approvals.isLive, arm.armed)}
          </p>
          <p className="font-jv-sans text-jv-md leading-jv-loose text-jv-blocked-dim">
            {commandNoSourceNotice}
          </p>
          <ResolveArmToggle armed={arm.armed} onChange={arm.setArmed} />
        </header>

        <MobileCommandBoard gate={mobileGate} />
      </div>
    </div>
  )
}
