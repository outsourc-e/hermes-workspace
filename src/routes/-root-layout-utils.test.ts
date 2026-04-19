import { describe, expect, it } from 'vitest'
import { getRootLayoutMode } from './__root'

describe('getRootLayoutMode', () => {
  it('shows fullscreen onboarding until onboarding is complete', () => {
    expect(getRootLayoutMode(null)).toBe('onboarding')
    expect(getRootLayoutMode('')).toBe('onboarding')
  })

  it('shows the workspace shell after onboarding is complete', () => {
    expect(getRootLayoutMode('true')).toBe('workspace')
  })
})
