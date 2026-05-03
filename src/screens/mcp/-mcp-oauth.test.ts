import { describe, expect, it } from 'vitest'
import { useMcpOauth } from './hooks/use-mcp-oauth'

// Smoke test only: verify the hook is exported and is a function. We don't
// render it because the workspace test runner doesn't ship a DOM, and
// real polling is too time-sensitive to assert against here.
describe('useMcpOauth', () => {
  it('is exported as a function', () => {
    expect(typeof useMcpOauth).toBe('function')
  })

  it('declares the documented call signature (zero args)', () => {
    expect(useMcpOauth.length).toBe(0)
  })
})
