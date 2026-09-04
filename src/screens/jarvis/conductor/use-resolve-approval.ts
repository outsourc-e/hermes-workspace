/**
 * The ONLY place `resolveGatewayApproval` is referenced anywhere in
 * `src/screens/jarvis/`. Read this file before changing anything in it.
 *
 * WHAT THE WRITE ACTUALLY DOES. `resolveGatewayApproval(id, 'approve')` POSTs
 * `/api/gateway/approvals/:id/approve` and a real agent then performs the real
 * action it was blocked on — a write to a vault, a push, a publish. There is no
 * dry run and no undo (§3.2: UNDO PATH is NO SOURCE precisely because nothing
 * models one). Every other JARVIS wire so far — slices 6a and 6b — is a GET.
 * This one is not, and everything below exists to make that difference
 * impossible to cross by accident.
 *
 * TWO INDEPENDENT LOCKS, plus one that comes free. All must be open:
 *
 *   1. `enabled` — off by default, at this hook's signature and at every call
 *      site (`enableResolve = false`). Flipping it is a product decision, not a
 *      refactor.
 *   2. The confirm step — `request` only moves a state machine; the POST is
 *      issued on a SECOND explicit act, on a card that by then says which way
 *      it is about to go.
 *   3. A real `approvalId`. The fixture fallback has none, so a fixture gate
 *      cannot resolve anything even with the flag on.
 *
 * The confirm step works whether or not `enabled` is set, on purpose: with the
 * flag off the gate still demonstrates its real interaction, and confirming
 * lands in `blocked` — a terminal, honest state that says nothing was sent.
 * That is what a reviewer sees on the board today, and the network panel stays
 * empty while they see it.
 *
 * WHY A PURE REDUCER. `resolveMachine` decides, in one place and with no React
 * around it, whether a POST may happen; the hook below only carries out what it
 * returns. That makes the guard readable in isolation and — the reason it is
 * shaped this way — testable in isolation: this repo's vitest setup cannot
 * render a hook-using component at all (React ends up with a null dispatcher,
 * which breaks `renderHook` and any stateful component, not just this one), so
 * a machine that only existed inside a hook could not be tested here. The
 * effect is DATA, never a call: nothing in this file invokes `resolve` except
 * `dispatch`, and `dispatch` only does so when the machine hands it an effect.
 */
import { useCallback, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { resolveGatewayApproval } from '@/lib/gateway-api'

/** The two resolutions the endpoint actually has. */
export type ResolveIntent = 'approve' | 'deny'

export type ResolvePhase =
  /** Nothing clicked. The only state in which the gate shows APPROVE/REJECT. */
  | 'idle'
  /** One click in. Nothing has been sent; CANCEL returns to `idle`. */
  | 'confirming'
  /** Confirmed with a lock shut — terminal, and nothing was sent. */
  | 'blocked'
  /** Confirmed with every lock open — the POST is in flight. */
  | 'resolving'
  | 'resolved'
  | 'failed'

export const APPROVE_LABEL = 'APPROVE'
export const REJECT_LABEL = 'REJECT'
export const CONFIRM_APPROVE_LABEL = 'CONFIRM APPROVE'
export const CONFIRM_REJECT_LABEL = 'CONFIRM REJECT'
export const CANCEL_LABEL = 'CANCEL'

export const DEFAULT_GATE_ACTIONS: Array<string> = [APPROVE_LABEL, REJECT_LABEL]

/** The prose under the panel while a confirm is pending. Deliberately blunt. */
export const CONFIRM_NOTE: Record<ResolveIntent, string> = {
  approve:
    'Confirm approve — this authorises the real action. There is no undo path.',
  deny: 'Confirm reject — this denies the agent’s request and unblocks it as refused.',
}

export const DISABLED_NOTE =
  'LIVE RESOLVE is off for this session — nothing was sent to the gateway. Arm it to decide from here.'

export const RESOLVING_NOTE = 'Sending…'
export const RESOLVED_NOTE = 'Sent — the gateway has the decision.'
export const FAILED_NOTE =
  'The gateway did not accept the decision. Nothing changed.'

/* ── The machine ─────────────────────────────────────────────────────── */

export interface ResolveState {
  phase: ResolvePhase
  /** Which way a pending confirm goes. Null outside `confirming`. */
  intent: ResolveIntent | null
}

export const IDLE_STATE: ResolveState = { phase: 'idle', intent: null }

export type ResolveEvent =
  /** Step 1 — a button was pressed. Never sends. */
  | { type: 'request'; intent: ResolveIntent }
  /** Step 2 — the confirm was pressed. The only event that can emit an effect. */
  | { type: 'confirm' }
  | { type: 'cancel' }
  /** The POST came back. */
  | { type: 'settled'; ok: boolean }

/** The locks, read at the moment of the confirm rather than at mount. */
export interface ResolveLocks {
  enabled: boolean
  approvalId: string | null
}

/**
 * The one shape that means "a POST is authorised". It is returned, not
 * performed: whoever holds the machine decides to carry it out, and only
 * `dispatch` below ever does.
 */
export interface ResolveEffect {
  approvalId: string
  action: ResolveIntent
}

export interface ResolveStep {
  state: ResolveState
  effect: ResolveEffect | null
}

/**
 * Pure. Given where the gate is, what was pressed, and whether the locks are
 * open, returns where the gate goes and — only ever from a `confirm` that
 * passed every guard — the write to perform.
 */
export function resolveMachine(
  state: ResolveState,
  event: ResolveEvent,
  locks: ResolveLocks,
): ResolveStep {
  switch (event.type) {
    case 'request':
      // Refuse to restart from a terminal or in-flight state without a cancel
      // first: a second decision on a resolved gate is not a decision.
      if (state.phase !== 'idle') return { state, effect: null }
      return { state: { phase: 'confirming', intent: event.intent }, effect: null }

    case 'cancel':
      return { state: IDLE_STATE, effect: null }

    case 'confirm': {
      // LOCK 2 — the confirm must follow a request. Nothing may skip step 1.
      if (state.phase !== 'confirming' || state.intent === null) {
        return { state, effect: null }
      }
      // LOCK 1 and LOCK 3 — the flag, and a real approval to act on.
      if (!locks.enabled || !locks.approvalId) {
        return { state: { phase: 'blocked', intent: state.intent }, effect: null }
      }
      return {
        state: { phase: 'resolving', intent: state.intent },
        effect: { approvalId: locks.approvalId, action: state.intent },
      }
    }

    case 'settled':
      if (state.phase !== 'resolving') return { state, effect: null }
      return {
        state: { phase: event.ok ? 'resolved' : 'failed', intent: state.intent },
        effect: null,
      }
  }
}

/** Which event a chip label means, given where the gate currently is. */
export function eventForLabel(
  label: string,
  state: ResolveState,
): ResolveEvent | null {
  if (label === CANCEL_LABEL) return { type: 'cancel' }

  if (state.phase === 'confirming' && state.intent !== null) {
    // The confirm chip must match the pending intent — a CONFIRM REJECT press
    // must never resolve an approve.
    const expected =
      state.intent === 'approve' ? CONFIRM_APPROVE_LABEL : CONFIRM_REJECT_LABEL
    return label === expected ? { type: 'confirm' } : null
  }

  if (label === APPROVE_LABEL) return { type: 'request', intent: 'approve' }
  if (label === REJECT_LABEL) return { type: 'request', intent: 'deny' }

  // Anything else — an inert chip, a fixture label — means nothing at all.
  return null
}

/** The chips the card should show. Confirming replaces them, never adds to them. */
export function actionsFor(
  state: ResolveState,
  baseActions: Array<string>,
): Array<string> {
  if (state.phase === 'confirming' && state.intent !== null) {
    return [
      state.intent === 'approve' ? CONFIRM_APPROVE_LABEL : CONFIRM_REJECT_LABEL,
      CANCEL_LABEL,
    ]
  }
  if (state.phase === 'blocked' || state.phase === 'failed') {
    return [CANCEL_LABEL]
  }
  return baseActions
}

/** The line under the panel, or null when there is nothing to say. */
export function noteFor(state: ResolveState, enabled: boolean): string | null {
  switch (state.phase) {
    case 'confirming':
      return state.intent
        ? `${CONFIRM_NOTE[state.intent]}${enabled ? '' : ` ${DISABLED_NOTE}`}`
        : null
    case 'blocked':
      return DISABLED_NOTE
    case 'resolving':
      return RESOLVING_NOTE
    case 'resolved':
      return RESOLVED_NOTE
    case 'failed':
      return FAILED_NOTE
    case 'idle':
      return null
  }
}

/* ── The hook ────────────────────────────────────────────────────────── */

export interface UseResolveApprovalOptions {
  /**
   * LOCK 1. False by default and false at every call site in this repo. While
   * false, no `confirm` can produce an effect — see `resolveMachine`.
   */
  enabled?: boolean
  /** LOCK 3. The live approval's id; null on the fixture fallback. */
  approvalId?: string | null
  /** The chips the gate offers at rest. */
  baseActions?: Array<string>
  /** Injected for tests ONLY. Production always uses the real client. */
  resolve?: (
    approvalId: string,
    action: ResolveIntent,
  ) => Promise<{ ok: boolean }>
}

export interface ResolveControl {
  /** Mirrors LOCK 1 so a board can label itself honestly. */
  enabled: boolean
  state: ResolveState
  /** What the card should show right now. */
  actions: Array<string>
  /** The line under the panel, or null. */
  note: string | null
  /** The card's `onAction`. Routes a label through the machine. */
  onAction: (label: string) => void
}

export function useResolveApproval({
  enabled = false,
  approvalId = null,
  baseActions = DEFAULT_GATE_ACTIONS,
  resolve = resolveGatewayApproval,
}: UseResolveApprovalOptions = {}): ResolveControl {
  const [state, setState] = useState<ResolveState>(IDLE_STATE)

  const mutation = useMutation({
    mutationFn: ({ approvalId: id, action }: ResolveEffect) =>
      resolve(id, action),
    onSuccess: (result) =>
      setState((current) =>
        resolveMachine(current, { type: 'settled', ok: result.ok }, {
          enabled,
          approvalId,
        }).state,
      ),
    onError: () =>
      setState(
        (current) =>
          resolveMachine(current, { type: 'settled', ok: false }, {
            enabled,
            approvalId,
          }).state,
      ),
  })
  const { mutate } = mutation

  /**
   * The single call site of the mutation in this repo. It runs only when the
   * machine returns an effect, which only a guarded `confirm` can produce.
   */
  const dispatch = useCallback(
    (event: ResolveEvent) => {
      const step = resolveMachine(state, event, { enabled, approvalId })
      setState(step.state)
      if (step.effect) mutate(step.effect)
    },
    [approvalId, enabled, mutate, state],
  )

  const onAction = useCallback(
    (label: string) => {
      const event = eventForLabel(label, state)
      if (event) dispatch(event)
    },
    [dispatch, state],
  )

  const actions = useMemo(
    () => actionsFor(state, baseActions),
    [baseActions, state],
  )
  const note = useMemo(() => noteFor(state, enabled), [enabled, state])

  return { enabled, state, actions, note, onAction }
}
