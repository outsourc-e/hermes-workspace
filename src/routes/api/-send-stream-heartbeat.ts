export type SseHeartbeatLifecycle = {
  noteClientEvent: () => void
  start: () => void
  stop: () => void
}

type SseHeartbeatOptions = {
  intervalMs: number
  getActivity: () => string | null
  sendActivityHeartbeat: (payload: {
    timestamp: number
    activity: string | null
  }) => void
  sendProxyKeepalive: () => void
  now?: () => number
}

export function createSseHeartbeatLifecycle({
  intervalMs,
  getActivity,
  sendActivityHeartbeat,
  sendProxyKeepalive,
  now = Date.now,
}: SseHeartbeatOptions): SseHeartbeatLifecycle {
  let lastClientEventAt = now()
  let timer: ReturnType<typeof setInterval> | null = null

  const noteClientEvent = () => {
    lastClientEventAt = now()
  }

  const start = () => {
    if (timer) return
    timer = setInterval(() => {
      const timestamp = now()
      const needsProxyKeepalive = timestamp - lastClientEventAt >= intervalMs
      if (needsProxyKeepalive) sendProxyKeepalive()
      sendActivityHeartbeat({ timestamp, activity: getActivity() })
    }, intervalMs)
  }

  const stop = () => {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  return { noteClientEvent, start, stop }
}
