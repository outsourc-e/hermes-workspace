import { describe, expect, it } from 'vitest'

import { isGenericTitle } from './use-auto-session-title'

describe('isGenericTitle', () => {
  it('treats empty and placeholder titles as generic', () => {
    expect(isGenericTitle('')).toBe(true)
    expect(isGenericTitle('New Session')).toBe(true)
    expect(isGenericTitle('Untitled')).toBe(true)
    expect(isGenericTitle('Conversation')).toBe(true)
  })

  it('treats the default "Local Chat" fallback as generic (#635)', () => {
    expect(isGenericTitle('Local Chat')).toBe(true)
    expect(isGenericTitle('local chat')).toBe(true)
    expect(isGenericTitle('  Local Chat  ')).toBe(true)
  })

  it('keeps real user-derived titles non-generic', () => {
    expect(isGenericTitle('Refactor auth middleware')).toBe(false)
    expect(isGenericTitle('Local development setup notes')).toBe(false)
  })
})
