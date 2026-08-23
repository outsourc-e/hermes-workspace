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
