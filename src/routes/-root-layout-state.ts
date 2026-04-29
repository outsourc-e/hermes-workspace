export type RootSurfaceState = {
  showLogin: boolean
  showOnboarding: boolean
  showWorkspaceShell: boolean
  showPostOnboardingOverlays: boolean
}

export type RootAuthStatus = {
  authRequired: boolean
  authenticated: boolean
}

export function getRootSurfaceState(
  onboardingComplete: boolean | null,
  authStatus: RootAuthStatus | null = null,
): RootSurfaceState {
  if (authStatus?.authRequired && !authStatus.authenticated) {
    return {
      showLogin: true,
      showOnboarding: false,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    }
  }

  if (onboardingComplete !== true) {
    return {
      showLogin: false,
      showOnboarding: true,
      showWorkspaceShell: false,
      showPostOnboardingOverlays: false,
    }
  }

  return {
    showLogin: false,
    showOnboarding: false,
    showWorkspaceShell: true,
    showPostOnboardingOverlays: true,
  }
}
