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
  enabled,
  onCheckComplete,
}: {
  sessionKey: string
  enabled: boolean
  onCheckComplete?: () => void
}): void {
  const hasCheckedRef = useRef(false)
  const sessionKeyRef = useRef(sessionKey)
  sessionKeyRef.current = sessionKey
  const onCompleteRef = useRef(onCheckComplete)
  onCompleteRef.current = onCheckComplete

  useEffect(() => {
    if (!enabled || !sessionKey || sessionKey === 'new') return
    if (hasCheckedRef.current) return
    hasCheckedRef.current = true

    const controller = new AbortController()
    let settled = false

    const settle = () => {
      if (settled) return
      settled = true
      onCompleteRef.current?.()
    }

    // Timeout: if the API check doesn't complete in time, assume the run is dead
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settle()
      try { controller.abort() } catch { /* ignore */ }
      // Clear stale waiting state — the run is almost certainly dead
      const store = useChatStore.getState()
      if (store.isSessionWaiting(sessionKeyRef.current)) {
        store.clearSessionWaiting(sessionKeyRef.current)
      }
    }, ACTIVE_RUN_CHECK_TIMEOUT_MS)

    async function check() {
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(sessionKey)}/active-run`,
          { signal: controller.signal },
        )
        if (!response.ok) return finishCheck()

        const data = (await response.json()) as ActiveRunResponse
        if (!data.ok) return finishCheck()

        const store = useChatStore.getState()
        if (data.run && ACTIVE_STATUSES.has(data.run.status)) {
          store.setSessionWaiting(sessionKey, data.run.runId)
        } else if (store.isSessionWaiting(sessionKey)) {
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
  }, [sessionKey, enabled])

  // Reset check flag when session changes
  useEffect(() => {
    hasCheckedRef.current = false
  }, [sessionKey])
}
