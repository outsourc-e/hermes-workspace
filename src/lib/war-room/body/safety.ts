import type { SafetyLock } from './domain'

export const DEFAULT_SAFETY_LOCKS: SafetyLock = {
  liveExternalMutation: false,
  autonomousLiveActionAllowed: false,
  paidGenerationEnabled: false,
  liveEtsyEnabled: false,
  supplierMessagingEnabled: false,
  purchasesEnabled: false,
}

export function assertNoLiveExternalMutation() {
  return {
    ok: true as const,
    safetyLocks: DEFAULT_SAFETY_LOCKS,
  }
}
