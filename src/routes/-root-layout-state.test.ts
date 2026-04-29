import { describe, expect, it } from 'vitest'
import { getRootSurfaceState } from './-root-layout-state'

describe('root layout surface state', () => {
  it('shows fullscreen onboarding until onboarding is complete', () => {
    expect(getRootSurfaceState(false)).toEqual({
      showLogin: false,
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })

    expect(getRootSurfaceState(null)).toEqual({
      showLogin: false,
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })
  })

  it('shows workspace shell and post-onboarding overlays after completion', () => {
    expect(getRootSurfaceState(true)).toEqual({
      showLogin: false,
      showOnboarding: false,
      showWorkspaceShell: true,
      showPostOnboardingOverlays: true,
    })
  })

  it('shows login when auth is required and not authenticated, regardless of onboarding state', () => {
    const unauthed = { authRequired: true, authenticated: false }
    const expected = {
      showLogin: true,
      showOnboarding: false,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    }

    expect(getRootSurfaceState(false, unauthed)).toEqual(expected)
    expect(getRootSurfaceState(null, unauthed)).toEqual(expected)
    expect(getRootSurfaceState(true, unauthed)).toEqual(expected)
  })

  it('does not gate on auth when auth is not required', () => {
    expect(
      getRootSurfaceState(true, { authRequired: false, authenticated: false }),
    ).toEqual({
      showLogin: false,
      showOnboarding: false,
      showWorkspaceShell: true,
      showPostOnboardingOverlays: true,
    })
  })

  it('does not gate on auth when authenticated', () => {
    expect(
      getRootSurfaceState(false, { authRequired: true, authenticated: true }),
    ).toEqual({
      showLogin: false,
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    })
  })
})
