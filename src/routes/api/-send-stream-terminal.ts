export type RunTerminalStatus = 'handoff' | 'complete' | 'error'

type RunTerminalTransitionCoordinatorOptions = {
  sealTranscript: () => Promise<void>
  persist: (status: RunTerminalStatus, errorMessage?: string) => Promise<void>
}

export type RunTerminalTransitionCoordinator = {
  isSealed: () => boolean
  transition: (
    status: RunTerminalStatus,
    errorMessage?: string,
  ) => Promise<void>
}

/**
 * Terminal precedence is first-observed: cancellation, completion, or error
 * claims the run synchronously before persistence begins. Every later terminal
 * request joins that same transition and cannot overwrite the winner.
 */
export function createRunTerminalTransitionCoordinator(
  options: RunTerminalTransitionCoordinatorOptions,
): RunTerminalTransitionCoordinator {
  let winner: { status: RunTerminalStatus; errorMessage?: string } | null = null
  let terminalPersistence: Promise<void> | null = null

  const transition = (
    status: RunTerminalStatus,
    errorMessage?: string,
  ): Promise<void> => {
    if (terminalPersistence) return terminalPersistence

    const selected = { status, errorMessage }
    winner = selected
    terminalPersistence = (async () => {
      // Never persist a terminal status if transcript sealing was exhausted:
      // retained text must not be hidden behind an apparently terminal run.
      await options.sealTranscript()
      try {
        await options.persist(selected.status, selected.errorMessage)
      } catch {
        // Persistence must not break the response stream.
      }
    })()
    return terminalPersistence
  }

  return {
    isSealed: () => winner !== null,
    transition,
  }
}
