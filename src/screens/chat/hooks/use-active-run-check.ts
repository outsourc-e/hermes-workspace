import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '../../../stores/chat-store'

type ActiveRunStatus =
  | 'accepted'
  | 'active'
  | 'handoff'
  | 'stalled'
  | 'complete'
  | 'error'

type ActiveRunResponse = {
  ok: boolean
  run: {
    runId: string
    status: ActiveRunStatus
    sessionKey: string
    startedAt: number
  } | null
}

const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'accepted',
  'active',
  // NOTE: 'handoff' is deliberately excluded. A handoff run means the
  // SSE client disconnected — the browser has no active stream. Keeping
  // the waiting state alive for handoff runs causes ghost "Thinking"
  // indicators on session reopen for runs that completed hours ago.
])

const ACTIVE_RUN_CHECK_TIMEOUT_MS = 2000

export function activeRunCheckUrl(sessionKey: string, cardId?: string): string {
  const path = `/api/sessions/${encodeURIComponent(sessionKey)}/active-run`
  const normalizedCardId = cardId?.trim()
  return normalizedCardId
    ? `${path}?cardId=${encodeURIComponent(normalizedCardId)}`
    : path
}

/**
 * On mount, checks whether the server has an active run for this session.
 * If so, marks the session as waiting in the persistent Zustand store.
 * If the server says the run is done, clears the stale waiting state.
 *
 * This closes the gap where a user navigates away during streaming,
 * the component unmounts (losing local state), and on remount the UI
 * doesn't know a run was in progress.
 *
 * A timeout (ACTIVE_RUN_CHECK_TIMEOUT_MS) ensures the check never blocks
 * the UI indefinitely — if the API is slow or unreachable, we assume the
 * run is dead and clear stale waiting state.
 */
export function useActiveRunCheck({
  sessionKey,
  cardId,
  enabled,
  shouldApplyResult,
  onCheckComplete,
}: {
  sessionKey: string
  cardId?: string
  enabled: boolean
  /**
   * Lets a caller reject a recovery result that became stale while its request
   * was in flight (for example, when this session gains a local SSE reader).
   */
  shouldApplyResult?: (sessionKey: string) => boolean
  onCheckComplete?: (sessionKey: string) => void
}): void {
  const hasCheckedRef = useRef(false)
  const shouldApplyResultRef = useRef(shouldApplyResult)
  shouldApplyResultRef.current = shouldApplyResult
  const onCompleteRef = useRef(onCheckComplete)
  onCompleteRef.current = onCheckComplete

  // Reset before the check effect runs when a Card advances to a new canonical
  // segment. The Card identity stays stable, but its recovery target changes.
  useEffect(() => {
    hasCheckedRef.current = false
  }, [sessionKey, cardId])

  useEffect(() => {
    if (!enabled || !sessionKey || sessionKey === 'new') return
    if (hasCheckedRef.current) return
    hasCheckedRef.current = true

    const controller = new AbortController()
    let settled = false

    const settle = () => {
      if (settled) return
      settled = true
      onCompleteRef.current?.(sessionKey)
    }

    // Timeout: if the API check doesn't complete in time, assume the run is dead
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settle()
      try {
        controller.abort()
      } catch {
        /* ignore */
      }
      // Clear stale waiting state — the run is almost certainly dead.
      // Do not publish a recovery result over an open local stream that began
      // after this check was dispatched.
      if (shouldApplyResultRef.current?.(sessionKey) === false) return
      const store = useChatStore.getState()
      if (cardId) {
        if (store.isCardWaiting(cardId)) store.clearCardWaiting(cardId)
      } else if (store.isSessionWaiting(sessionKey)) {
        store.clearSessionWaiting(sessionKey)
      }
    }, ACTIVE_RUN_CHECK_TIMEOUT_MS)

    async function check() {
      try {
        const response = await fetch(activeRunCheckUrl(sessionKey, cardId), {
          signal: controller.signal,
        })
        if (!response.ok) return finishCheck()

        const data = (await response.json()) as ActiveRunResponse
        if (!data.ok) return finishCheck()
        if (shouldApplyResultRef.current?.(sessionKey) === false) return

        const store = useChatStore.getState()
        if (data.run && ACTIVE_STATUSES.has(data.run.status)) {
          if (cardId) store.setCardWaiting(cardId, data.run.runId)
          else store.setSessionWaiting(sessionKey, data.run.runId)
        } else if (cardId && store.isCardWaiting(cardId)) {
          store.clearCardWaiting(cardId)
        } else if (!cardId && store.isSessionWaiting(sessionKey)) {
          // Server says run is done but we still have stale waiting state
          store.clearSessionWaiting(sessionKey)
        }
      } catch {
        // Network error or abort — ignore, already handled by timeout
      } finally {
        finishCheck()
      }
    }

    function finishCheck() {
      window.clearTimeout(timeoutId)
      settle()
    }

    void check()

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [sessionKey, cardId, enabled])
}
