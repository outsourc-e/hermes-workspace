// Stub â€” connection overlay (not used in Nova Mission Control)
export function useConnectionRestart() {
  return {
    triggerRestart: async (fn: () => Promise<void>) => {
      await fn()
    },
  }
}

export function ConnectionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
