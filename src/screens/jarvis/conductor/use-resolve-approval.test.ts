/**
 * The safety test for the one WRITE in the JARVIS boards.
 *
 * NOTHING HERE TOUCHES THE NETWORK, and that is asserted rather than assumed:
 * `fetch` is replaced by a tripwire that throws if anything calls it, and every
 * case checks it was never called. The resolve function is a spy in every case
 * — the real `resolveGatewayApproval` is never imported here, so a POST cannot
 * escape this file even if a guard regressed.
 *
 * The machine is exercised directly rather than through the hook because this
 * repo's vitest setup cannot render a hook-using component at all (React ends
 * up with a null dispatcher — `renderHook`, and any `useState` component,
 * crashes repo-wide). `resolveMachine` is where every guard lives, so testing
 * it is testing the lock; `drive` below is a five-line stand-in for the hook,
 * carrying out effects exactly the way `dispatch` does, so "confirm calls the
 * mocked fn" is a real assertion and not a paraphrase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPROVE_LABEL,
  CANCEL_LABEL,
  CONFIRM_APPROVE_LABEL,
  CONFIRM_REJECT_LABEL,
  DEFAULT_GATE_ACTIONS,
  DISABLED_NOTE,
  IDLE_STATE,
  REJECT_LABEL,
  actionsFor,
  eventForLabel,
  noteFor,
  resolveMachine,
} from './use-resolve-approval'
import type {
  ResolveEffect,
  ResolveLocks,
  ResolveState,
} from './use-resolve-approval'

const OPEN: ResolveLocks = { enabled: true, approvalId: 'appr-1' }
const FLAG_OFF: ResolveLocks = { enabled: false, approvalId: 'appr-1' }
const NO_ID: ResolveLocks = { enabled: true, approvalId: null }

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Not a stub of a real call — a tripwire. If anything below reaches the
  // network at all, this records it and the case fails.
  fetchSpy = vi.fn(() => {
    throw new Error('the resolve tests must never hit the network')
  })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * What `useResolveApproval`'s `dispatch` does, minus React: run the machine,
 * keep the new state, and perform the effect if — and only if — it returned
 * one. `resolve` is a spy, so "the write happened" is observable.
 */
function drive(locks: ResolveLocks) {
  const resolve = vi.fn((): Promise<{ ok: boolean }> =>
    Promise.resolve({ ok: true }),
  )
  let state: ResolveState = IDLE_STATE

  return {
    resolve,
    state: () => state,
    actions: () => actionsFor(state, DEFAULT_GATE_ACTIONS),
    note: (enabled = locks.enabled) => noteFor(state, enabled),
    /** A button press, exactly as the card delivers one. */
    click(label: string) {
      const event = eventForLabel(label, state)
      if (!event) return
      const step = resolveMachine(state, event, locks)
      state = step.state
      if (step.effect) resolve(step.effect.approvalId, step.effect.action)
    },
  }
}

/** Every case ends by proving no request left the process. */
function expectNoNetwork() {
  expect(fetchSpy).not.toHaveBeenCalled()
}

describe('the confirm gate — two presses, never one', () => {
  it('first press only enters the confirm state; nothing is sent', () => {
    const gate = drive(OPEN)

    gate.click(APPROVE_LABEL)

    expect(gate.state()).toEqual({ phase: 'confirming', intent: 'approve' })
    expect(gate.actions()).toEqual([CONFIRM_APPROVE_LABEL, CANCEL_LABEL])
    expect(gate.actions()).not.toContain(APPROVE_LABEL)
    expect(gate.note()).toContain('this authorises the real action')
    expect(gate.resolve).not.toHaveBeenCalled()
    expectNoNetwork()
  })

  it('the second, explicit confirm is what calls resolve — once', () => {
    const gate = drive(OPEN)

    gate.click(APPROVE_LABEL)
    gate.click(CONFIRM_APPROVE_LABEL)

    expect(gate.resolve).toHaveBeenCalledTimes(1)
    expect(gate.resolve).toHaveBeenCalledWith('appr-1', 'approve')
    expect(gate.state().phase).toBe('resolving')
    expectNoNetwork()
  })

  it('rejects through the same two presses, as deny', () => {
    const gate = drive(OPEN)

    gate.click(REJECT_LABEL)
    expect(gate.actions()).toEqual([CONFIRM_REJECT_LABEL, CANCEL_LABEL])
    expect(gate.resolve).not.toHaveBeenCalled()

    gate.click(CONFIRM_REJECT_LABEL)

    expect(gate.resolve).toHaveBeenCalledWith('appr-1', 'deny')
    expectNoNetwork()
  })

  it('cancel returns to idle and never calls resolve', () => {
    const gate = drive(OPEN)

    gate.click(APPROVE_LABEL)
    gate.click(CANCEL_LABEL)

    expect(gate.state()).toEqual(IDLE_STATE)
    expect(gate.actions()).toEqual(DEFAULT_GATE_ACTIONS)
    expect(gate.note()).toBeNull()
    expect(gate.resolve).not.toHaveBeenCalled()
    expectNoNetwork()
  })

  it('will not confirm the other way — the chip must match the pending intent', () => {
    const gate = drive(OPEN)

    gate.click(APPROVE_LABEL)
    gate.click(CONFIRM_REJECT_LABEL)

    expect(gate.state()).toEqual({ phase: 'confirming', intent: 'approve' })
    expect(gate.resolve).not.toHaveBeenCalled()
    expectNoNetwork()
  })

  it('ignores a chip that maps onto no endpoint', () => {
    const gate = drive(OPEN)

    gate.click('HOLD FOR QA')

    expect(gate.state()).toEqual(IDLE_STATE)
    expect(gate.resolve).not.toHaveBeenCalled()
    expectNoNetwork()
  })
})

describe('LOCK 1 — the enabled flag, off by default', () => {
  it('shows the confirm step but sends nothing while disabled', () => {
    const gate = drive(FLAG_OFF)

    gate.click(APPROVE_LABEL)
    expect(gate.state().phase).toBe('confirming')
    expect(gate.note()).toContain(DISABLED_NOTE)

    gate.click(CONFIRM_APPROVE_LABEL)

    expect(gate.state().phase).toBe('blocked')
    expect(gate.note()).toBe(DISABLED_NOTE)
    expect(gate.resolve).not.toHaveBeenCalled()
    expectNoNetwork()
  })

  it('emits no effect on any confirm while the flag is off', () => {
    // Straight at the machine: whatever state it is handed, a shut flag means
    // no write. `blocked` is terminal, so the only way on is a cancel.
    for (const state of [
      { phase: 'confirming', intent: 'approve' },
      { phase: 'confirming', intent: 'deny' },
    ] satisfies Array<ResolveState>) {
      const step = resolveMachine(state, { type: 'confirm' }, FLAG_OFF)
      expect(step.effect).toBeNull()
      expect(step.state.phase).toBe('blocked')
    }
    expectNoNetwork()
  })
})

describe('LOCK 2 — the confirm step cannot be skipped', () => {
  it('a bare confirm from idle does nothing, flag on or off', () => {
    for (const locks of [OPEN, FLAG_OFF, NO_ID]) {
      const step = resolveMachine(IDLE_STATE, { type: 'confirm' }, locks)
      expect(step.effect).toBeNull()
      expect(step.state).toEqual(IDLE_STATE)
    }
    expectNoNetwork()
  })

  it('a second request cannot restart a settled gate without a cancel', () => {
    const settled: ResolveState = { phase: 'resolved', intent: 'approve' }
    const step = resolveMachine(
      settled,
      { type: 'request', intent: 'approve' },
      OPEN,
    )
    expect(step.state).toEqual(settled)
    expect(step.effect).toBeNull()
    expectNoNetwork()
  })
})

describe('LOCK 3 — a fixture gate has nothing to resolve', () => {
  it('blocks the confirm when there is no real approval id', () => {
    const gate = drive(NO_ID)

    gate.click(APPROVE_LABEL)
    gate.click(CONFIRM_APPROVE_LABEL)

    expect(gate.state().phase).toBe('blocked')
    expect(gate.resolve).not.toHaveBeenCalled()
    expectNoNetwork()
  })
})

describe('the only path that authorises a write', () => {
  it('is a guarded confirm — and nothing else in the machine emits an effect', () => {
    const states: Array<ResolveState> = [
      IDLE_STATE,
      { phase: 'confirming', intent: 'approve' },
      { phase: 'confirming', intent: 'deny' },
      { phase: 'blocked', intent: 'approve' },
      { phase: 'resolving', intent: 'approve' },
      { phase: 'resolved', intent: 'approve' },
      { phase: 'failed', intent: 'deny' },
    ]
    const events = [
      { type: 'request', intent: 'approve' },
      { type: 'request', intent: 'deny' },
      { type: 'confirm' },
      { type: 'cancel' },
      { type: 'settled', ok: true },
      { type: 'settled', ok: false },
    ] as const

    const effects: Array<{ state: ResolveState; effect: ResolveEffect }> = []
    for (const locks of [OPEN, FLAG_OFF, NO_ID]) {
      for (const state of states) {
        for (const event of events) {
          const step = resolveMachine(state, event, locks)
          if (step.effect) effects.push({ state, effect: step.effect })
        }
      }
    }

    // Exactly two: confirm-from-confirming, each intent, locks fully open.
    expect(effects).toHaveLength(2)
    expect(effects.every(({ state }) => state.phase === 'confirming')).toBe(true)
    expect(effects.map(({ effect }) => effect.action).sort()).toEqual([
      'approve',
      'deny',
    ])
    expect(
      effects.every(({ effect }) => effect.approvalId === OPEN.approvalId),
    ).toBe(true)
    expectNoNetwork()
  })
})

describe('what the gate says after the POST', () => {
  it('reports the refusal instead of claiming the decision landed', () => {
    const resolving: ResolveState = { phase: 'resolving', intent: 'approve' }

    expect(
      resolveMachine(resolving, { type: 'settled', ok: true }, OPEN).state.phase,
    ).toBe('resolved')

    const failed = resolveMachine(
      resolving,
      { type: 'settled', ok: false },
      OPEN,
    ).state
    expect(failed.phase).toBe('failed')
    expect(noteFor(failed, true)).toContain('Nothing changed')
    expectNoNetwork()
  })

  it('ignores a late settle that does not belong to an in-flight write', () => {
    const step = resolveMachine(IDLE_STATE, { type: 'settled', ok: true }, OPEN)
    expect(step.state).toEqual(IDLE_STATE)
  })
})

describe('eventForLabel', () => {
  it('reads the resting chips as requests, never as confirms', () => {
    expect(eventForLabel(APPROVE_LABEL, IDLE_STATE)).toEqual({
      type: 'request',
      intent: 'approve',
    })
    expect(eventForLabel(REJECT_LABEL, IDLE_STATE)).toEqual({
      type: 'request',
      intent: 'deny',
    })
    expect(eventForLabel(CONFIRM_APPROVE_LABEL, IDLE_STATE)).toBeNull()
  })

  it('accepts cancel from anywhere', () => {
    expect(eventForLabel(CANCEL_LABEL, { phase: 'blocked', intent: 'approve' }))
      .toEqual({ type: 'cancel' })
  })
})
