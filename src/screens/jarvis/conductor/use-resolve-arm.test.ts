/**
 * The safety test for the arm flag.
 *
 * The property under test is one-directional: OFF is the answer to every
 * question this file cannot answer with certainty. So the cases are mostly
 * about the ways a read can go wrong — no storage, a hostile storage, a stored
 * value that is not the one string that means armed — and all of them must land
 * on false. Only a literal `'true'` arms it.
 *
 * NOTHING HERE TOUCHES THE NETWORK — this file imports no gateway client, and
 * `fetch` is a tripwire that fails the case if anything calls it. Arming is a
 * state change, and this asserts it stays one.
 *
 * The pure functions are exercised directly rather than through `useResolveArm`
 * because this repo's vitest setup cannot render a hook-using component at all
 * (React ends up with a null dispatcher — `renderHook`, and any `useState`
 * component, crashes repo-wide). Every decision lives in `readArmed` /
 * `writeArmed`; the hook is a `useState` around them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARMED_VALUE,
  DISARMED_VALUE,
  RESOLVE_ARM_STORAGE_KEY,
  readArmed,
  sessionArmStorage,
  writeArmed,
} from './use-resolve-arm'
import type { ArmStorage } from './use-resolve-arm'

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(() => {
    throw new Error('arming must never hit the network')
  })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A real-enough sessionStorage: one map, the two methods this file uses. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
    } satisfies ArmStorage,
  }
}

/** Safari private mode, an embedded webview, a blocked third-party context. */
const THROWING_STORAGE: ArmStorage = {
  getItem: () => {
    throw new Error('storage is not available')
  },
  setItem: () => {
    throw new Error('storage is not available')
  },
}

describe('readArmed — OFF unless the session says otherwise', () => {
  it('is false when the key was never written', () => {
    const { storage } = fakeStorage()

    expect(storage.getItem(RESOLVE_ARM_STORAGE_KEY)).toBeNull()
    expect(readArmed(storage)).toBe(false)
  })

  it('is false when there is no storage at all', () => {
    expect(readArmed(null)).toBe(false)
  })

  it("is false for a stored 'false'", () => {
    const { storage } = fakeStorage({
      [RESOLVE_ARM_STORAGE_KEY]: DISARMED_VALUE,
    })

    expect(readArmed(storage)).toBe(false)
  })

  it.each(['TRUE', 'True', '1', 'yes', 'armed', '', ' true '])(
    'is false for the garbage value %o',
    (value) => {
      const { storage } = fakeStorage({ [RESOLVE_ARM_STORAGE_KEY]: value })

      expect(readArmed(storage)).toBe(false)
    },
  )

  it('is false — and does not throw — when the storage throws on read', () => {
    expect(() => readArmed(THROWING_STORAGE)).not.toThrow()
    expect(readArmed(THROWING_STORAGE)).toBe(false)
  })

  it("is true for exactly one value: 'true'", () => {
    const { storage } = fakeStorage({ [RESOLVE_ARM_STORAGE_KEY]: ARMED_VALUE })

    expect(readArmed(storage)).toBe(true)
  })

  it('ignores every key but its own', () => {
    const { storage } = fakeStorage({ 'jarvis:resolve': ARMED_VALUE })

    expect(readArmed(storage)).toBe(false)
  })
})

describe('writeArmed — the arm survives the page view it was made in', () => {
  it('persists an arm, and reads back as armed', () => {
    const { map, storage } = fakeStorage()

    writeArmed(storage, true)

    expect(map.get(RESOLVE_ARM_STORAGE_KEY)).toBe(ARMED_VALUE)
    expect(readArmed(storage)).toBe(true)
  })

  it('disarming writes a value that reads back as OFF', () => {
    const { map, storage } = fakeStorage({
      [RESOLVE_ARM_STORAGE_KEY]: ARMED_VALUE,
    })

    writeArmed(storage, false)

    expect(map.get(RESOLVE_ARM_STORAGE_KEY)).toBe(DISARMED_VALUE)
    expect(readArmed(storage)).toBe(false)
  })

  it('does not throw when there is no storage, or when it refuses the write', () => {
    expect(() => writeArmed(null, true)).not.toThrow()
    expect(() => writeArmed(THROWING_STORAGE, true)).not.toThrow()
    // The refusal did not arm anything a later read could pick up.
    expect(readArmed(THROWING_STORAGE)).toBe(false)
  })

  it('writes one key and only one key', () => {
    const { map, storage } = fakeStorage()

    writeArmed(storage, true)

    expect([...map.keys()]).toEqual([RESOLVE_ARM_STORAGE_KEY])
  })
})

describe('sessionArmStorage — session only, and never fatal', () => {
  it('is null when there is no window (SSR)', () => {
    vi.stubGlobal('window', undefined)

    expect(sessionArmStorage()).toBeNull()
  })

  it('is null — not a throw — when touching sessionStorage throws', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): ArmStorage {
        throw new Error('access denied')
      },
    })

    expect(() => sessionArmStorage()).not.toThrow()
    expect(sessionArmStorage()).toBeNull()
  })

  it('hands back the session storage, and a fresh session reads OFF', () => {
    const { storage } = fakeStorage()
    vi.stubGlobal('window', { sessionStorage: storage })

    expect(sessionArmStorage()).toBe(storage)
    expect(readArmed(sessionArmStorage())).toBe(false)
  })

  it('never reaches localStorage — an armed localStorage still reads OFF', () => {
    const { storage: session } = fakeStorage()
    const { storage: local } = fakeStorage({
      [RESOLVE_ARM_STORAGE_KEY]: ARMED_VALUE,
    })
    vi.stubGlobal('window', { sessionStorage: session, localStorage: local })

    expect(readArmed(sessionArmStorage())).toBe(false)
  })
})

describe('arming is not an action', () => {
  it('reading and writing the flag never calls fetch', () => {
    const { storage } = fakeStorage()

    writeArmed(storage, true)
    readArmed(storage)
    writeArmed(storage, false)

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
