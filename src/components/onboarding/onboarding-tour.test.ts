import { describe, expect, it } from 'vitest'
import { shouldCompleteOnboardingTour } from './onboarding-tour'

describe('onboarding tour completion logic', () => {
  it('completes the tour when the user closes it', () => {
    expect(shouldCompleteOnboardingTour('close', 'running')).toBe(true)
  })

  it('completes the tour when it is finished or skipped', () => {
    expect(shouldCompleteOnboardingTour('next', 'finished')).toBe(true)
    expect(shouldCompleteOnboardingTour('next', 'skipped')).toBe(true)
  })

  it('does not complete the tour for normal step progression', () => {
    expect(shouldCompleteOnboardingTour('next', 'running')).toBe(false)
  })
})
