import { useSyncExternalStore } from 'react'
import type { AuthSessionState } from '@/lib/auth-session-store'
import { getAuthSessionState, subscribeAuthSession } from '@/lib/auth-session-store'

const SSR_STATE: AuthSessionState = {
  status: null,
  phase: 'unknown',
  lastCheckedAt: null,
  lastError: null,
  consecutiveFailures: 0,
}

/** État d'auth partagé et rafraîchi périodiquement. */
export function useAuthSession(): AuthSessionState {
  return useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionState,
    () => SSR_STATE,
  )
}
