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

type FinalizeRunTerminalStreamOptions = {
  terminalPersistence: Promise<void>
  closeStream: () => void
  onPersisted?: () => void
  closeBeforePersistence?: boolean
}

/**
 * Complete the route-owned stream lifecycle after a terminal transition.
 * Sealing failures intentionally suppress the client terminal event and terminal
 * status, but they must never escape into an outer stream catch or bypass cleanup.
 */
export async function finalizeRunTerminalStream({
  terminalPersistence,
  closeStream,
  onPersisted,
  closeBeforePersistence = false,
}: FinalizeRunTerminalStreamOptions): Promise<void> {
  let streamCloseRequested = false
  const closeStreamOnce = () => {
    if (streamCloseRequested) return
    streamCloseRequested = true
    closeStream()
  }

  try {
    // Abort and consumer cancellation must stop upstream work immediately;
    // completion/error paths keep the stream open long enough for their event.
    if (closeBeforePersistence) closeStreamOnce()
    await terminalPersistence
    onPersisted?.()
  } catch {
    // A rejected seal is observable through skipped terminal persistence. The
    // transport still closes below, without re-entering another terminal path.
  } finally {
    closeStreamOnce()
  }
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
