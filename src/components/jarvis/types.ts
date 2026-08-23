/**
 * Shared prop types for the JARVIS primitives (Slice 2).
 *
 * These four components are presentational only — they render state that is
 * handed to them, and none of them reads a store, calls an API, or derives a
 * verdict of its own. See `docs/design/jarvis-ui-mapping.md` §2.1 and §3.5:
 * several of the states below have NO SOURCE in today's backend and must never
 * be faked by the components themselves.
 */
import type { ReactNode } from 'react'

/** Known / Recalled / Assumed — the artboard's epistemic legend. */
export type EpistemicMarkKind = 'known' | 'recalled' | 'assumed'

/** Evidence attached vs the agent's word only. */
export type VerificationState = 'verified' | 'claimed'

/** Worker rail row states. */
export type WorkerStatus =
  | 'running'
  | 'blocked'
  | 'idle'
  | 'stale'
  | 'failed'
  | 'queued'
  | 'complete'

/** Approval gate lifecycle. */
export type ApprovalGateState = 'pending' | 'approved' | 'rejected'

export interface EpistemicMarkProps {
  mark: EpistemicMarkKind
  children: ReactNode
}

export interface VerificationBadgeProps {
  state: VerificationState
  title: string
  /** Evidence lines (command, exit code, counts). Rendered mono + muted. */
  evidence?: Array<string>
  /** Timestamp shown next to the VERIFIED label. */
  time?: string
  /** Presentational chips (first one reads as primary). */
  actions?: Array<string>
}

export interface WorkerStatusLineProps {
  name: string
  status: WorkerStatus
  /** Right-hand detail ("04:18", "idle 2h", "stale 23d"). */
  detail?: string
}

export interface ApprovalGateCardProps {
  title: string
  command: string
  /** Header sublabel, e.g. "irreversible · orchestrator halted the chain". */
  subtitle?: string
  /** Elapsed wait, shown only while pending. */
  waiting?: string
  blastRadius: string
  undoPath: string
  /** May contain an <EpistemicMark>, so it is a node rather than a string. */
  caveat?: ReactNode
  actions: Array<string>
  state?: ApprovalGateState
  /** Presentational — buttons are inert unless a handler is supplied. */
  onAction?: (action: string) => void
}
