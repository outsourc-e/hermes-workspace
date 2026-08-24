/**
 * LOCK 1's switch — the per-session arm flag for the approval gate's resolve.
 *
 * This file owns ONE boolean and nothing else: whether the user has, in this
 * browser session, consciously said "I intend to act from this board". It is
 * fed into `useResolveApproval`'s `enabled` — it does not bypass it, weaken it,
 * or reach the gateway. Arming is a state change and issues NO network call:
 * the POST still needs the two-step confirm and a real approval id, and both
 * guards live in `use-resolve-approval.ts`, untouched by this slice.
 *
 * WHY PER-SESSION, AND WHY `sessionStorage`. A resolve that is on by default is
 * on by accident; a resolve that is on forever is on by forgetting. The middle
 * position — armed only for as long as this tab lives — is the one that matches
 * the act: you arm it when you sit down to decide something. `localStorage` is
 * never touched here, deliberately: an arm that survives a browser restart is
 * indistinguishable from a build-time default, which is exactly what the gate's
 * design refuses.
 *
 * DEFAULT FALSE, ON EVERY PATH. No storage, a storage that throws (Safari
 * private mode, embedded webviews, SSR where there is no `window` at all), a
 * missing key, `'false'`, or any other value all read as OFF. `true` is
 * returned for exactly one stored string, `'true'`. There is no path through
 * `readArmed` that turns an unknown into an arm.
 *
 * WHY PURE FUNCTIONS UNDER THE HOOK. Same constraint as the resolve machine:
 * this repo's vitest setup cannot render a hook-using component at all (React
 * ends up with a null dispatcher, which breaks `renderHook` repo-wide). The
 * storage logic therefore lives in `readArmed` / `writeArmed`, which take the
 * storage as an argument and are tested directly, and the hook below is a thin
 * `useState` around them with nothing to get wrong.
 */
import { useCallback, useEffect, useState } from 'react'

/** The session key. Namespaced so it cannot collide with app state. */
export const RESOLVE_ARM_STORAGE_KEY = 'jarvis:resolve-armed'

/** The ONLY stored string that means armed. Anything else is OFF. */
export const ARMED_VALUE = 'true'
export const DISARMED_VALUE = 'false'

/**
 * The slice of the Storage interface this file uses. Narrow on purpose: it
 * documents that nothing here enumerates, clears, or reads any other key, and
 * it lets a test pass a fake — including one that throws.
 */
export interface ArmStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/**
 * `window.sessionStorage`, or null when there is not one to have. The access
 * itself is inside the try: in some privacy modes merely touching the property
 * throws, before any get or set.
 */
export function sessionArmStorage(): ArmStorage | null {
  try {
    if (typeof window === 'undefined') return null
    // Typed non-optional by lib.dom, but an embedded webview can hand back
    // undefined rather than throwing — so it is read as possibly absent.
    const storage = window.sessionStorage as ArmStorage | undefined
    return storage ?? null
  } catch {
    return null
  }
}

/** The stored flag, defaulting to OFF for every value that is not `'true'`. */
export function readArmed(storage: ArmStorage | null): boolean {
  if (!storage) return false
  try {
    return storage.getItem(RESOLVE_ARM_STORAGE_KEY) === ARMED_VALUE
  } catch {
    return false
  }
}

/**
 * Records the flag. A storage that refuses the write is not an error worth
 * surfacing — the arm still holds in React state for this page view, and the
 * next page view falls back to OFF, which is the safe direction.
 */
export function writeArmed(storage: ArmStorage | null, next: boolean): void {
  if (!storage) return
  try {
    storage.setItem(
      RESOLVE_ARM_STORAGE_KEY,
      next ? ARMED_VALUE : DISARMED_VALUE,
    )
  } catch {
    // Storage full, blocked, or read-only. Nothing to do and nothing to say.
  }
}

export interface ResolveArmControl {
  /** Feeds `useResolveApproval`'s `enabled`. False until the user says so. */
  armed: boolean
  setArmed: (next: boolean) => void
}

/**
 * The hook. First render is ALWAYS false — on the server there is no storage,
 * and starting from the stored value would make the server and client markup
 * disagree. The effect below then adopts the stored value on the client. The
 * transient state is OFF, so the window between paint and effect fails closed.
 */
export function useResolveArm(): ResolveArmControl {
  const [armed, setArmedState] = useState(false)

  useEffect(() => {
    setArmedState(readArmed(sessionArmStorage()))
  }, [])

  const setArmed = useCallback((next: boolean) => {
    writeArmed(sessionArmStorage(), next)
    setArmedState(next)
  }, [])

  return { armed, setArmed }
}
