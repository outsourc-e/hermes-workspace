import { describe, expect, it } from 'vitest'
import { getRootSurfaceState } from './-root-layout-state'

describe('root layout surface state', () => {
  it('shows fullscreen onboarding until onboarding is complete', () => {
    expect(getRootSurfaceState(false)).toEqual({
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })

    expect(getRootSurfaceState(null)).toEqual({
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })
  })

  it('shows workspace shell and post-onboarding overlays after completion', () => {
    expect(getRootSurfaceState(true)).toEqual({
      showOnboarding: false,
      showWorkspaceShell: true,
      showPostOnboardingOverlays: true,
    })
  })
})
