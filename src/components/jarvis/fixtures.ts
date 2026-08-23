/**
 * Fixture data for the dev-only JARVIS gallery (`/jarvis-gallery`).
 *
 * INVENTED, NOT REAL. Nothing here is read from a store, an API, or the
 * gateway — several of the states these fixtures exercise have NO SOURCE in
 * today's backend (`docs/design/jarvis-ui-mapping.md` §3.5). The gallery exists
 * so every primitive state can be reviewed side by side; wiring to real state
 * is a later slice, and the NO SOURCE rows stay inert until a source exists.
 *
 * This file is `.ts`, so the gate caveat is described structurally (lead /
 * mark / claim / trail) and assembled into JSX by the gallery screen.
 */
import type {
  ApprovalGateCardProps,
  EpistemicMarkKind,
  VerificationBadgeProps,
  WorkerStatusLineProps,
} from './types'

/** A claim rendered inline: `{lead}<Mark>{claim}</Mark>{trail}`. */
export interface EpistemicMarkFixture {
  mark: EpistemicMarkKind
  lead: string
  claim: string
  trail: string
}

export const epistemicMarkFixtures: Array<EpistemicMarkFixture> = [
  {
    mark: 'known',
    lead: 'Reproduced it. ',
    claim:
      '41 daily notes lost frontmatter between Aug 14 and today; I diffed them against the git history of the vault',
    trail: '. I read every one of those diffs this session.',
  },
  {
    mark: 'recalled',
    lead: 'For context: ',
    claim:
      'you hit something similar in May and we traced it to the YAML round-trip in vault/writer.ts',
    trail: '. That is memory, not a fresh check.',
  },
  {
    mark: 'assumed',
    lead: 'My read: ',
    claim:
      'the dump probably drops keys it cannot serialise rather than raising',
    trail: '. I have not opened that function this session.',
  },
]

export interface VerificationBadgeFixture {
  /** Gallery caption — what this variant is here to prove. */
  label: string
  props: VerificationBadgeProps
}

export const verificationBadgeFixtures: Array<VerificationBadgeFixture> = [
  {
    label: 'verified · evidence + exit code',
    props: {
      state: 'verified',
      time: '09:38',
      title: 'Reproduction case written and failing as expected',
      evidence: [
        'pnpm vitest vault/writer',
        'exit 1 · 1 failed / 84 passed · 6.2s',
      ],
    },
  },
  {
    label: 'claimed · no artifact, action chips',
    props: {
      state: 'claimed',
      title: 'km-agent reports the 41 notes are restorable from vault git',
      evidence: ['no artifact checked · no exit code'],
      actions: ['VERIFY NOW', 'SHOW PLAN'],
    },
  },
  {
    label: 'verified · no evidence lines (edge)',
    props: {
      state: 'verified',
      title: 'Checkpoint approved by a human reviewer',
    },
  },
]

export const workerStatusFixtures: Array<WorkerStatusLineProps> = [
  { name: 'orchestrator', status: 'running', detail: 'routing' },
  { name: 'km-agent', status: 'blocked' },
  { name: 'researcher', status: 'idle', detail: 'idle 2h' },
  { name: 'maintainer', status: 'stale', detail: 'stale 23d' },
  { name: 'ops-watch', status: 'failed', detail: 'exit 1 · certs' },
  { name: 'reviewer', status: 'queued', detail: 'queued' },
  { name: 'inbox-triage', status: 'complete', detail: 'ran 14m' },
]

/** Shown in place of the rail when there is nothing to list. */
export const emptyRailNote = 'No workers reporting. Nothing is running.'

/** Caveat line for a gate, assembled into JSX around an <EpistemicMark>. */
export interface GateCaveatFixture {
  lead: string
  mark: EpistemicMarkKind
  claim: string
  trail: string
}

export interface ApprovalGateFixture {
  /** Gallery caption — what this variant is here to prove. */
  label: string
  props: Omit<ApprovalGateCardProps, 'caveat'>
  caveat?: GateCaveatFixture
}

const gateBody = {
  title: 'Publish changelog 0.9.3 to the public site',
  command:
    'gh workflow run publish.yml -f tag=v0.9.3 · builds site/, purges CDN',
  blastRadius:
    '1 public page · RSS to 2,411 subscribers · Discord webhook fires once',
  undoPath:
    'Revert commit + CDN purge ≈90s. RSS and Discord cannot be recalled.',
  actions: ['APPROVE', 'REJECT', 'HOLD FOR QA'],
}

export const approvalGateFixtures: Array<ApprovalGateFixture> = [
  {
    label: 'pending · full blast radius, undo path and caveat',
    props: {
      ...gateBody,
      subtitle: 'irreversible · orchestrator halted the chain',
      waiting: '4m 12s',
      state: 'pending',
    },
    caveat: {
      lead: 'Note: ',
      mark: 'known',
      claim: 'qa has not run against the fix yet',
      trail:
        ' — approving now publishes notes for a fix that is claimed, not verified.',
    },
  },
  {
    label: 'approved · resolved',
    props: {
      ...gateBody,
      subtitle: 'resolved by you · chain resumed',
      state: 'approved',
    },
  },
  {
    label: 'rejected · resolved',
    props: {
      ...gateBody,
      subtitle: 'resolved by you · chain halted',
      state: 'rejected',
    },
  },
]

/* ══════════════════════════════════════════════════════════════════════
   SLICE 3 — Desktop Command board (artboard 01) fixtures.

   Appended below the Slice 2 gallery fixtures; nothing above is changed.

   EVERY VALUE BELOW IS INVENTED. The board is composed from these fixtures
   alone — no store, no gateway, no `/api/`, no fetch. That is deliberate for
   slices 3–5; real wiring is slice 6.

   Items flagged `NO SOURCE` in `docs/design/jarvis-ui-mapping.md` §3.5 appear
   here as fixture values purely to prove the layout. The board marks each one
   with `data-jv-fixture="no-source"` and states the list in a banner above the
   frame, so nothing here can read as live. Slice 6 can grep this block to see
   exactly what still needs a real source.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Top bar ─────────────────────────────────────────────────────────── */

export interface CommandTopbarFixture {
  session: string
  /** DERIVE in slice 6 — from `GatewaySession.startedAt`. */
  uptime: string
  vault: string
  /** REAL in slice 6 — count of pending `/api/gateway/approvals` entries. */
  gateLabel: string
  greenlight: string
}

export const commandTopbarFixture: CommandTopbarFixture = {
  session: 's-4471',
  uptime: '18d 04:22',
  vault: '~/Vault',
  gateLabel: '1 GATE WAITING',
  greenlight: 'enforced',
}

/* ── Left rail ───────────────────────────────────────────────────────── */

/**
 * The worker roster. Every `WorkerStatus` the primitive supports appears
 * exactly once so the rail exercises the full set — see the note on
 * `commandWorkerCounts` for where this diverges from the artboard.
 */
export const commandWorkerFixtures: Array<WorkerStatusLineProps> = [
  { name: 'orchestrator', status: 'running', detail: 'routing' },
  { name: 'builder', status: 'running', detail: '04:18' },
  { name: 'reviewer', status: 'queued', detail: 'queued' },
  { name: 'qa', status: 'queued', detail: 'queued' },
  { name: 'km-agent', status: 'blocked' },
  { name: 'researcher', status: 'idle', detail: 'idle 2h' },
  { name: 'ops-watch', status: 'failed', detail: 'exit 1 · certs' },
  { name: 'maintainer', status: 'stale', detail: 'stale 23d' },
  { name: 'strategist', status: 'idle', detail: 'idle 6d' },
  { name: 'inbox-triage', status: 'complete', detail: 'ran 14m' },
]

/**
 * The artboard's literal count line. It is kept verbatim and does NOT tally
 * `commandWorkerFixtures` — the artboard's own roster does not tally it either
 * (it buckets everything that is not running or blocked as "IDLE"). Slice 6
 * derives this from the real session list instead of restating a fixture.
 */
export const commandWorkerCounts = '2 RUN · 1 BLK · 7 IDLE'

export type ThreadTone = 'active' | 'idle' | 'attention'

export interface ThreadFixture {
  title: string
  meta: string
  tone: ThreadTone
}

export const commandThreadFixtures: Array<ThreadFixture> = [
  {
    title: 'vault frontmatter loss',
    meta: 'active · 6 msg · gate open',
    tone: 'active',
  },
  { title: 'Q3 roadmap trim', meta: 'idle 2d · 31 msg', tone: 'idle' },
  {
    title: 'certbot renewal',
    meta: 'needs attention · 4 msg',
    tone: 'attention',
  },
]

/** NO SOURCE — §3.5 item 10 (ctx %). Fixture only. */
export const commandRailFooterLines: Array<string> = [
  'ctx 41% · 3 worktrees',
  'claude-code · 2 sessions',
]

/* ── Conversation ────────────────────────────────────────────────────── */

/**
 * One piece of a turn's body. The board assembles these into JSX because this
 * file is `.ts` — same approach the gallery takes for `GateCaveatFixture`.
 *
 * `mark` is NO SOURCE (§3.5 item 1): nothing in `ChatMessage` or the SSE stream
 * carries known/recalled/assumed today.
 */
export type RichSpan =
  | { kind: 'text'; text: string }
  /** Inline mono — a path or identifier inside prose. */
  | { kind: 'code'; text: string }
  | { kind: 'mark'; mark: EpistemicMarkKind; spans: Array<RichSpan> }
  /** The streaming caret that trails an in-flight turn. */
  | { kind: 'caret' }

const text = (value: string): RichSpan => ({ kind: 'text', text: value })
const code = (value: string): RichSpan => ({ kind: 'code', text: value })
const mark = (
  kind: EpistemicMarkKind,
  ...spans: Array<RichSpan>
): RichSpan => ({ kind: 'mark', mark: kind, spans })

/** `→ delegated builder · worktree ../wt/… · branch …` */
export interface DelegationNoteFixture {
  label: string
  value: string
}

export interface ConversationTurnFixture {
  id: string
  speaker: 'YOU' | 'JVS'
  time?: string
  /** `disagree` gets the left rule + the I DISAGREE label. NO SOURCE (§3.5 item 4). */
  variant?: 'default' | 'disagree'
  /** The artboard dims the trailing in-flight turn. */
  dim?: boolean
  body: Array<RichSpan>
  /** NO SOURCE on chat messages (§3.5 items 2–3). */
  evidence?: Array<VerificationBadgeProps>
  delegation?: Array<DelegationNoteFixture>
}

export const commandConversationFixtures: Array<ConversationTurnFixture> = [
  {
    id: 'you-0941',
    speaker: 'YOU',
    time: '09:41',
    body: [
      text(
        'km-agent is eating YAML frontmatter when it rewrites daily notes. Find it, fix it, then publish the changelog entry for the 0.9.3 release.',
      ),
    ],
  },
  {
    id: 'jvs-0941',
    speaker: 'JVS',
    time: '09:41',
    body: [
      text('Reproduced it. '),
      mark(
        'known',
        text(
          '41 daily notes lost frontmatter between Aug 14 and today; I diffed them against the git history of the vault',
        ),
      ),
      text('. '),
      mark(
        'recalled',
        text(
          'You hit something similar in May and we traced it to the YAML round-trip in ',
        ),
        code('vault/writer.ts'),
      ),
      text('. '),
      mark(
        'assumed',
        text(
          'The dump probably drops keys it cannot serialise rather than raising',
        ),
      ),
      text('. I have not read that function this session.'),
    ],
    evidence: [
      {
        state: 'verified',
        time: '09:38',
        title: 'Reproduction case written and failing as expected',
        evidence: [
          'pnpm vitest vault/writer',
          'exit 1 · 1 failed / 84 passed · 6.2s',
        ],
      },
      {
        state: 'claimed',
        title: 'km-agent reports the 41 notes are restorable from vault git',
        evidence: ['no artifact checked · no exit code'],
        actions: ['VERIFY NOW', 'SHOW PLAN'],
      },
    ],
    delegation: [
      { label: 'delegated', value: 'builder' },
      { label: 'worktree', value: '../wt/vault-frontmatter' },
      { label: 'branch', value: 'fix/yaml-roundtrip' },
    ],
  },
  {
    id: 'you-0944',
    speaker: 'YOU',
    time: '09:44',
    body: [
      text(
        "Don't overthink it — wrap the dump in a try/catch, log the failure, ship it. I want the changelog out this morning.",
      ),
    ],
  },
  {
    id: 'jvs-0944',
    speaker: 'JVS',
    time: '09:44',
    variant: 'disagree',
    body: [
      text('A try/catch hides it again. '),
      mark(
        'known',
        text(
          'The dump already swallows the error — that is why you got silent data loss instead of a crash',
        ),
      ),
      text(
        '. Catching it moves the loss into a log line nobody reads. I want to fail the write and leave the note untouched, which is eleven lines and one test. ',
      ),
      mark('assumed', text('Roughly twenty minutes to reviewer')),
      text(
        '. Say the word and I will do it your way, but I am logging the objection either way.',
      ),
    ],
  },
]

/** Rendered after the gate, still streaming. */
export const commandTrailingTurnFixture: ConversationTurnFixture = {
  id: 'jvs-live',
  speaker: 'JVS',
  dim: true,
  body: [
    text('Holding the publish. builder is still on the writer fix — '),
    mark('known', text('two files changed, tests running')),
    { kind: 'caret' },
  ],
}

/** The label on a `disagree` turn. */
export const disagreeLabel = 'I DISAGREE'

/* ── Inline approval gate ────────────────────────────────────────────── */

/**
 * The gate as it sits inline in the conversation. `blastRadius`, `undoPath`
 * and the caveat are all NO SOURCE (§3.2) — nothing in today's backend models
 * them, so they exist here and nowhere else.
 */
export const commandGateFixture: Omit<ApprovalGateCardProps, 'caveat'> = {
  title: 'Publish changelog 0.9.3 to the public site',
  command:
    'gh workflow run publish.yml -f tag=v0.9.3 · builds site/, purges CDN',
  subtitle: 'irreversible · orchestrator halted the chain',
  waiting: '4m 12s',
  state: 'pending',
  blastRadius:
    '1 public page · RSS to 2,411 subscribers · Discord webhook fires once',
  undoPath:
    'Revert commit + CDN purge ≈90s. RSS and Discord cannot be recalled.',
  actions: ['APPROVE', 'REJECT', 'HOLD FOR QA'],
}

export const commandGateCaveatFixture: GateCaveatFixture = {
  lead: 'Note: ',
  mark: 'known',
  claim: 'qa has not run against the fix yet',
  trail:
    ' — approving now publishes notes for a fix that is claimed, not verified.',
}

/* ── Composer ────────────────────────────────────────────────────────── */

export interface ComposerFixture {
  target: string
  chips: Array<string>
  slashHint: string
  placeholder: string
  newlineHint: string
  sendLabel: string
}

export const commandComposerFixture: ComposerFixture = {
  target: '→ ORCHESTRATOR',
  chips: ['greenlight: on', 'vault: write', 'worktree: isolated'],
  slashHint: '/delegate /verify /gate /recall /schedule',
  placeholder: 'Instruct, or type / for a command',
  newlineHint: '⇧⏎ newline',
  sendLabel: 'SEND',
}

/* ── Right rail — work trail ─────────────────────────────────────────── */

export type ChainNodeState = 'done' | 'active' | 'queued'

export interface ChainNodeFixture {
  name: string
  state: ChainNodeState
  /** One or two mono detail lines under the name. */
  detail: Array<string>
  /** Elapsed, shown only on the active node. */
  time?: string
}

/**
 * NO SOURCE as a graph (§3.5 item 14): a fixed orchestrator→builder→reviewer→qa
 * chain is a LAYOUT CONVENTION, not a captured parent→child edge set. The board
 * labels it as such rather than implying the edges are real.
 */
export const commandChainFixtures: Array<ChainNodeFixture> = [
  { name: 'orchestrator', state: 'done', detail: ['routed · 0.4s'] },
  {
    name: 'builder',
    state: 'active',
    time: '04:18',
    detail: [
      'writing test · vitest --watch',
      'claude-code · wt/vault-frontmatter',
    ],
  },
  { name: 'reviewer', state: 'queued', detail: ['queued · gates diff'] },
  { name: 'qa', state: 'queued', detail: ['queued · verifies behaviour'] },
]

export type FileChange = 'M' | 'A' | 'D'

export interface FileTouchedFixture {
  change: FileChange
  path: string
  /** `+11 −4`. NO SOURCE (§3.5 item 8) — no per-mission diff stream exists. */
  diff: string
}

export const commandFilesTouchedFixtures: Array<FileTouchedFixture> = [
  { change: 'M', path: 'src/vault/writer.ts', diff: '+11 −4' },
  { change: 'A', path: 'src/vault/writer.test.ts', diff: '+38' },
  { change: 'M', path: 'src/vault/frontmatter.ts', diff: '+2 −2' },
]

export type ToolCallState = 'ok' | 'failed' | 'live'

export interface ToolCallFixture {
  time: string
  label: string
  /** Duration is NO SOURCE (§3.5 item 9); `exit 1` / `live` are the other two. */
  result: string
  state: ToolCallState
}

export const commandToolCallFixtures: Array<ToolCallFixture> = [
  {
    time: '09:43',
    label: 'read writer.ts:88-140',
    result: '0.2s',
    state: 'ok',
  },
  {
    time: '09:43',
    label: 'git worktree add ../wt/…',
    result: '1.1s',
    state: 'ok',
  },
  {
    time: '09:45',
    label: 'pnpm vitest vault/writer',
    result: 'exit 1',
    state: 'failed',
  },
  {
    time: '09:46',
    label: 'edit writer.ts dumpFrontmatter',
    result: '0.9s',
    state: 'ok',
  },
  {
    time: '09:47',
    label: 'pnpm vitest --watch',
    result: 'live',
    state: 'live',
  },
]

export interface WorkTrailChromeFixture {
  elapsed: string
  footerLines: Array<string>
  holdLabel: string
}

export const commandWorkTrailChrome: WorkTrailChromeFixture = {
  elapsed: '06:12 elapsed',
  footerLines: [
    'tokens 41.2k · $0.38 this run',
    'no network calls outside allowlist',
  ],
  holdLabel: 'HOLD ⌥',
}

/* ── Honesty banner ──────────────────────────────────────────────────── */

/**
 * Stated above the frame. The board must never read as live, and the NO SOURCE
 * rows must never read as captured data.
 */
export const commandFixtureNotice =
  'Fixture board — nothing here is wired to a store, the gateway, or an API. Every value is invented.'

export const commandNoSourceNotice =
  'Rendered from fixtures because they have NO SOURCE today (mapping §3.5): epistemic marks · verified/claimed on chat · the disagreement stance · blast radius · undo path · gate caveat · files touched · per-tool-call duration · ctx % · the delegation chain as a graph.'

/* ══════════════════════════════════════════════════════════════════════
   SLICE 4 — Desktop Conductor board (artboard 02) fixtures.

   Appended below the Slice 3 Command fixtures; nothing above is changed.

   EVERY VALUE BELOW IS INVENTED. The Conductor board is composed from these
   fixtures alone — no store, no gateway, no `/api/`, no fetch. Real wiring is
   slice 6.

   Honesty note specific to this board. Per `docs/design/jarvis-ui-mapping.md`
   §3.3–§3.4 several Conductor states DO have real sources today — worker
   running/idle/failed/stale (`SwarmSession.swarmStatus`, `ConductorWorker`),
   and job name/cadence/last-run success/error/next-run (`ClaudeJob` via
   `/api/claude-jobs`). This slice still does NOT read them: it renders
   fixtures so slice 6 has one file to replace. The values that have NO source
   at all — §3.5 items 11 (cron PARTIAL as a structured badge), 12 (the launchd
   "not loaded" diagnostic), 13 (run-log history beyond the latest run) and 14
   (the delegation chain as a real edge graph) — carry `noSource` here and are
   marked `data-jv-fixture="no-source"` in the DOM as well as being named in
   the banner above the frame.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Top bar ─────────────────────────────────────────────────────────── */

/**
 * The status line is written as three parts because two of its counts are
 * hue-coded in the artboard: `1 job failed` in `--jv-failed`, `1 job stale 23d`
 * in `--jv-blocked`. Splitting it here keeps the colour decision out of the
 * component and the copy out of the markup.
 */
export interface ConductorTopbarFixture {
  /** COMMAND / CONDUCTOR. `href` is optional and purely navigational. */
  tabs: Array<{ label: string; active: boolean; href?: string }>
  /** DERIVE in slice 6 — counts over the live session list. */
  statusLead: string
  /** REAL in slice 6 — `ClaudeJob.last_run_success === false`. */
  statusFailed: string
  /** DERIVE in slice 6 — `last_run_at` age ≫ cadence. */
  statusStale: string
  date: string
}

export const conductorTopbarFixture: ConductorTopbarFixture = {
  tabs: [
    { label: 'COMMAND', active: false, href: '/jarvis-command' },
    { label: 'CONDUCTOR', active: true },
  ],
  statusLead: '2 running · 1 blocked · ',
  statusFailed: '1 job failed',
  statusStale: '1 job stale 23d',
  date: 'Sat 23 Aug · 09:47',
}

/* ── Worker board ────────────────────────────────────────────────────── */

/**
 * Card frame + dot + name treatment. Deliberately NOT `WorkerStatus` from
 * `./types`: the artboard's grid cards separate the frame from the badge (an
 * idle-looking `ops-watch` card still carries an `ERR` badge for its LAST RUN),
 * so one enum cannot drive both without lying about one of them.
 *
 * `queued` and `idle` differ only in frame weight — the chain row is drawn a
 * step brighter than the fleet below it, exactly as the artboard has it.
 */
export type ConductorCardTone =
  | 'running'
  | 'active'
  | 'queued'
  | 'blocked'
  | 'idle'

/** Step number (01–04) or a state word (BLK / ERR / STALE). */
export type ConductorBadgeTone = 'live' | 'muted' | 'blocked' | 'failed'

/** Second detail line — independent of the card tone, see `ConductorCardTone`. */
export type ConductorSubTone = 'default' | 'blocked' | 'failed'

/**
 * `hold` and `outline` are both outlined chips but are NOT the same chip: the
 * artboard draws the worker-board HOLD affordance a step quieter (dimmer text,
 * softer border, tighter padding) than a job's FULL LOG. Kept distinct rather
 * than averaged, since the whole point of HOLD is that it recedes until wanted.
 */
export type ConductorChipTone = 'hold' | 'outline' | 'blocked' | 'failed'

export interface ConductorChipFixture {
  label: string
  tone: ConductorChipTone
}

/**
 * `connector` draws the chain edge to the card on its right:
 *   `flow` — static rule + the `jv-flow` travelling dot (an in-flight hand-off)
 *   `line` — static rule only (the next node has not been reached yet)
 * NO SOURCE either way (§3.5 item 14): the edge is a layout convention.
 */
export type ConductorConnector = 'flow' | 'line'

export interface ConductorWorkerCardFixture {
  name: string
  tone: ConductorCardTone
  badge?: { label: string; tone: ConductorBadgeTone }
  detail: string
  sub: string
  subTone?: ConductorSubTone
  action?: ConductorChipFixture
  connector?: ConductorConnector
  /** Marks the card's sub-line as having no source at all. */
  noSource?: boolean
}

/**
 * Row 1 (the first five) is the active chain; the rest is the fleet.
 * Same roster as `commandWorkerFixtures`, re-expressed as cards — the rail
 * carries one detail string per worker, a card carries two lines, a badge and
 * an action, so the shapes cannot be shared without padding one of them out.
 */
export const conductorWorkerCardFixtures: Array<ConductorWorkerCardFixture> = [
  {
    name: 'orchestrator',
    tone: 'running',
    badge: { label: '01', tone: 'live' },
    detail: 'routing · enforcing greenlight',
    sub: '3 gates today · 1 open',
    connector: 'flow',
  },
  {
    name: 'builder',
    tone: 'active',
    badge: { label: '02', tone: 'live' },
    detail: 'running 04:18 · vitest --watch',
    sub: 'wt/vault-frontmatter · 3 files',
    action: { label: 'HOLD ⌥ TO INTERVENE', tone: 'hold' },
    connector: 'flow',
  },
  {
    name: 'reviewer',
    tone: 'queued',
    badge: { label: '03', tone: 'muted' },
    detail: 'queued · gates the diff',
    sub: 'last verdict 08:12 · pass',
    connector: 'line',
  },
  {
    name: 'qa',
    tone: 'queued',
    badge: { label: '04', tone: 'muted' },
    detail: 'queued · behaviour check',
    sub: 'turns claimed → verified',
  },
  {
    name: 'km-agent',
    tone: 'blocked',
    badge: { label: 'BLK', tone: 'blocked' },
    detail: 'blocked 00:42 · needs approval',
    sub: 'write to Vault/Published/',
    action: { label: 'OPEN GATE', tone: 'blocked' },
  },
  {
    name: 'researcher',
    tone: 'idle',
    detail: 'idle 2h 11m',
    sub: 'last: pricing scan → vault',
  },
  {
    name: 'ops-watch',
    tone: 'idle',
    badge: { label: 'ERR', tone: 'failed' },
    detail: 'idle · next 05:00',
    sub: 'last run failed · certbot',
    subTone: 'failed',
  },
  {
    name: 'maintainer',
    tone: 'idle',
    badge: { label: 'STALE', tone: 'blocked' },
    detail: 'no run in 23d',
    // NO SOURCE — §3.5 item 12: the client cannot introspect launchd.
    sub: 'launchd job not loaded',
    subTone: 'blocked',
    noSource: true,
  },
  {
    name: 'strategist',
    tone: 'idle',
    detail: 'idle 6d',
    sub: 'next: monthly scan Sep 1',
  },
  {
    name: 'inbox-triage',
    tone: 'idle',
    detail: 'ran 14m ago · 0.9s',
    sub: '31 mail → 4 actionable',
  },
]

export interface ConductorSectionHeadingFixture {
  label: string
  /** The dim caption beside the label. */
  note: string
  /** Highlighted tail of the caption, if the artboard brightens one. */
  noteAccent?: string
}

export const conductorWorkerBoardHeading: ConductorSectionHeadingFixture = {
  label: 'WORKER BOARD',
  note: 'chain: orchestrator → builder → reviewer → qa · thread ',
  noteAccent: 'vault frontmatter loss',
}

/* ── Scheduled jobs ──────────────────────────────────────────────────── */

/**
 * `failed` and `silent` are the loud cards: a red frame with a hazard-stripe
 * edge, and an amber frame. `partial` shares the `ok` frame and differs only in
 * badge hue — the artboard treats it as a note on an otherwise healthy job.
 */
export type ConductorJobTone = 'ok' | 'failed' | 'silent' | 'partial'

/** Per-line override; `default` follows the card tone. */
export type ConductorJobLineTone = 'default' | 'failed' | 'dim'

export interface ConductorJobLineFixture {
  text: string
  tone?: ConductorJobLineTone
  /** Nothing in `ClaudeJob` produces this line. */
  noSource?: boolean
}

export interface ConductorJobFixture {
  name: string
  tone: ConductorJobTone
  badge: string
  /** `every 6h · km-agent` — cadence and owning worker. */
  cadence: string
  detail: Array<ConductorJobLineFixture>
  actions?: Array<ConductorChipFixture>
  /** Marks the BADGE itself as unsourced (the PARTIAL case, §3.5 item 11). */
  badgeNoSource?: boolean
}

export const conductorJobFixtures: Array<ConductorJobFixture> = [
  {
    name: 'vault-index-rebuild',
    tone: 'ok',
    badge: 'OK',
    cadence: 'every 6h · km-agent',
    detail: [{ text: 'last 06:00 · 41s · 3,209 notes' }],
  },
  {
    name: 'inbox-triage:sweep',
    tone: 'ok',
    badge: 'OK',
    cadence: 'hourly · inbox-triage',
    detail: [{ text: 'last 09:33 · 0.9s · 4 actionable' }],
  },
  {
    name: 'ops-watch:certs',
    tone: 'failed',
    badge: 'FAILED',
    cadence: 'daily 05:00 · ops-watch · 3 runs failed',
    detail: [
      {
        text: 'certbot renew → exit 1: DNS-01 challenge timeout (_acme-challenge.hexley.dev)',
        tone: 'failed',
      },
    ],
    actions: [
      { label: 'TRIAGE', tone: 'failed' },
      { label: 'FULL LOG', tone: 'outline' },
    ],
  },
  {
    name: 'maintainer:dep-audit',
    tone: 'silent',
    badge: 'SILENT 23d',
    cadence: 'weekly Mon 03:00 · maintainer',
    detail: [
      { text: 'expected 4 runs · got 0 · never errored' },
      // NO SOURCE — §3.5 item 12.
      {
        text: 'launchd: com.jarvis.maintainer not loaded',
        tone: 'dim',
        noSource: true,
      },
    ],
    actions: [{ label: 'RELOAD & RUN', tone: 'blocked' }],
  },
  {
    name: 'weekly-review-digest',
    tone: 'ok',
    badge: 'OK',
    cadence: 'Sun 18:00 · strategist',
    detail: [{ text: 'last Aug 17 · 2m 04s · gate cleared' }],
  },
  {
    name: 'researcher:feed-scan',
    tone: 'partial',
    badge: 'PARTIAL',
    // NO SOURCE — §3.5 item 11: PARTIAL is free text inside `last_run_error`,
    // never a structured job status.
    badgeNoSource: true,
    cadence: 'daily 07:00 · researcher',
    detail: [{ text: 'last 07:00 · 58s · 2 of 14 feeds 403' }],
  },
]

export const conductorJobsHeading: ConductorSectionHeadingFixture = {
  label: 'SCHEDULED JOBS',
  note: '6 registered · health is last-run, not next-run',
}

/* ── Run log ─────────────────────────────────────────────────────────── */

export type ConductorRunOutcome = 'success' | 'partial' | 'failed'

export interface ConductorRunFixture {
  time: string
  job: string
  worker: string
  /** Free-text result summary — what the run actually did. */
  result: string
  outcome: ConductorRunOutcome
  duration: string
}

/**
 * NO SOURCE as a list (§3.5 item 13): `ClaudeJob` exposes only the LATEST run,
 * so a multi-row history cannot be assembled from today's API at all. The whole
 * table is therefore fixture data and says so.
 */
export const conductorRunLogFixtures: Array<ConductorRunFixture> = [
  {
    time: '09:33',
    job: 'inbox-triage:sweep',
    worker: 'inbox-triage',
    result: '31 mail · 4 actionable · 2 vault notes written',
    outcome: 'success',
    duration: '0.9s',
  },
  {
    time: '08:33',
    job: 'inbox-triage:sweep',
    worker: 'inbox-triage',
    result: '18 mail · 1 actionable',
    outcome: 'success',
    duration: '0.7s',
  },
  {
    time: '07:00',
    job: 'researcher:feed-scan',
    worker: 'researcher',
    result: '12/14 feeds · 2 × HTTP 403 (substack)',
    outcome: 'partial',
    duration: '58s',
  },
  {
    time: '06:00',
    job: 'vault-index-rebuild',
    worker: 'km-agent',
    result: '3,209 notes · 118 links repaired',
    outcome: 'success',
    duration: '41s',
  },
  {
    time: '05:00',
    job: 'ops-watch:certs',
    worker: 'ops-watch',
    result: 'certbot renew → exit 1 · DNS-01 timeout after 120s',
    outcome: 'failed',
    duration: '2m 01s',
  },
  {
    time: '05:00',
    job: 'ops-watch:disk',
    worker: 'ops-watch',
    result: 'SSD 71% · 3 worktrees pruned',
    outcome: 'success',
    duration: '4.4s',
  },
  {
    time: '02:14',
    job: 'builder:nightly-typecheck',
    worker: 'builder',
    result: 'tsc --noEmit clean · 0 errors',
    outcome: 'success',
    duration: '1m 12s',
  },
  {
    time: '00:00',
    job: 'km-agent:daily-note',
    worker: 'km-agent',
    result: 'note created · frontmatter dropped (see 09:41 thread)',
    outcome: 'partial',
    duration: '0.3s',
  },
]

export interface ConductorRunLogChromeFixture {
  label: string
  note: string
  /**
   * The artboard's literal tally. It counts the full 12h window (14 runs),
   * which is deliberately MORE than the eight rows the table has room for —
   * kept verbatim rather than tallied from `conductorRunLogFixtures`, which
   * would silently restate a fixture as if it were derived.
   */
  summary: string
  columns: {
    time: string
    job: string
    worker: string
    result: string
    outcome: string
    duration: string
  }
}

export const conductorRunLogChrome: ConductorRunLogChromeFixture = {
  label: 'RUN LOG · UNATTENDED',
  note: 'last 12h · one entry per run',
  summary: '14 runs · 11 success · 2 partial · 1 failed',
  columns: {
    time: 'TIME',
    job: 'JOB',
    worker: 'WORKER',
    result: 'RESULT',
    outcome: 'OUTCOME',
    duration: 'DURATION',
  },
}

/* ── Honesty banner ──────────────────────────────────────────────────── */

export const conductorFixtureNotice =
  'Fixture board — nothing here is wired to a store, the gateway, or an API. Every value is invented. Worker status and job last-run health DO have real sources (mapping §3.3–§3.4); this slice deliberately does not read them, so slice 6 has one file to replace.'

export const conductorNoSourceNotice =
  'Rendered from fixtures because they have NO SOURCE today (mapping §3.5): the cron PARTIAL badge as a structured state · the launchd "not loaded" diagnostic · run-log history beyond the latest run · the delegation chain as a real parent→child edge graph.'
