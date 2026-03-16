// Stub — gateway restart overlay is not used in Hermes Workspace
export function useGatewayRestart() {
  return {
    triggerRestart: async (fn: () => Promise<void>) => { await fn() },
  }
}

export function GatewayRestartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
