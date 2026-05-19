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
  'handoff',
])

/**
 * On mount, checks whether the server has an active run for this session.
 * If so, marks the session as waiting in the persistent Zustand store.
 * If the server says the run is done, clears the stale waiting state.
 *
 * This closes the gap where a user navigates away during streaming,
 * the component unmounts (losing local state), and on remount the UI
 * doesn't know a run was in progress.
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

    async function check() {
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(sessionKey)}/active-run`,
          { signal: controller.signal },
        )
        if (!response.ok) return

        const data = (await response.json()) as ActiveRunResponse
        if (!data.ok) return

        const store = useChatStore.getState()
        if (data.run && ACTIVE_STATUSES.has(data.run.status)) {
          store.setSessionWaiting(sessionKey, data.run.runId)
        } else if (store.isSessionWaiting(sessionKey)) {
          // Server says run is done but we still have stale waiting state
          store.clearSessionWaiting(sessionKey)
        }
      } catch {
        // Network error or abort — ignore
      } finally {
        onCompleteRef.current?.()
      }
    }

    void check()

    return () => {
      controller.abort()
    }
  }, [sessionKey, enabled])

  // Reset check flag when session changes
  useEffect(() => {
    hasCheckedRef.current = false
  }, [sessionKey])
}
