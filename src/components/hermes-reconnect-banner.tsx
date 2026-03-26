import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 10_000
const FLASH_DURATION_MS = 1_800

type HermesReconnectBannerProps = {
  enabled?: boolean
}

type BannerState = 'hidden' | 'disconnected' | 'connected'

async function probeHermesHealth(): Promise<boolean> {
  const response = await fetch('/api/hermes-proxy/health', {
    cache: 'no-store',
  })
  return response.ok
}

export function HermesReconnectBanner({
  enabled = true,
}: HermesReconnectBannerProps) {
  const [bannerState, setBannerState] = useState<BannerState>('hidden')
  const [isChecking, setIsChecking] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const inFlightProbeRef = useRef<Promise<boolean> | null>(null)
  const probeNowRef = useRef<((showSpinner: boolean) => Promise<boolean>) | null>(null)
  const wasDisconnectedRef = useRef(false)
  const flashTimerRef = useRef<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setBannerState('hidden')
      setIsChecking(false)
      setIsStarting(false)
      setMessage(null)
      wasDisconnectedRef.current = false
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
      return
    }

    let cancelled = false

    const runProbe = async (showSpinner: boolean): Promise<boolean> => {
      if (inFlightProbeRef.current) {
        return inFlightProbeRef.current
      }

      if (showSpinner && mountedRef.current) {
        setIsChecking(true)
      }

      const pendingProbe = probeHermesHealth()
        .then((connected) => {
          if (cancelled || !mountedRef.current) return connected

          if (flashTimerRef.current !== null) {
            window.clearTimeout(flashTimerRef.current)
            flashTimerRef.current = null
          }

          if (connected) {
            setMessage(null)
            if (wasDisconnectedRef.current) {
              setBannerState('connected')
              wasDisconnectedRef.current = false
              flashTimerRef.current = window.setTimeout(() => {
                if (!mountedRef.current) return
                setBannerState('hidden')
                flashTimerRef.current = null
              }, FLASH_DURATION_MS)
            } else {
              setBannerState('hidden')
            }
          } else {
            wasDisconnectedRef.current = true
            setBannerState('disconnected')
          }

          return connected
        })
        .catch((error) => {
          if (!cancelled && mountedRef.current) {
            wasDisconnectedRef.current = true
            setBannerState('disconnected')
            setMessage(error instanceof Error ? error.message : 'Connection failed')
          }
          return false
        })
        .finally(() => {
          inFlightProbeRef.current = null
          if (!cancelled && mountedRef.current) {
            setIsChecking(false)
          }
        })

      inFlightProbeRef.current = pendingProbe
      return pendingProbe
    }

    probeNowRef.current = runProbe
    void runProbe(false)
    const interval = window.setInterval(() => {
      void runProbe(false)
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      probeNowRef.current = null
      window.clearInterval(interval)
    }
  }, [enabled])

  async function handleRetry(): Promise<void> {
    if (!enabled) return
    setMessage(null)
    await probeNowRef.current?.(true)
  }

  async function handleStartAgent(): Promise<void> {
    if (!enabled) return
    setIsStarting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/start-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        message?: string
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to start Hermes agent')
      }

      setMessage(
        payload.message === 'already running'
          ? 'Hermes agent is already running'
          : 'Starting Hermes agent…',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start Hermes agent')
    } finally {
      setIsStarting(false)
      await probeNowRef.current?.(true)
    }
  }

  if (!enabled || bannerState === 'hidden') {
    return null
  }

  const isDisconnected = bannerState === 'disconnected'

  return (
    <div
      className="fixed inset-x-0 z-50 px-4 pt-3"
      style={{ top: 'var(--titlebar-h, 0px)' }}
    >
      <div
        className="mx-auto flex min-h-12 w-full max-w-5xl items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg"
        style={{
          background: 'var(--theme-card)',
          borderColor: isDisconnected
            ? 'var(--theme-danger)'
            : 'var(--theme-border)',
          color: isDisconnected ? 'var(--theme-danger)' : 'inherit',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              background: isDisconnected
                ? 'var(--theme-danger)'
                : 'var(--theme-border)',
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {isDisconnected ? 'Hermes agent not connected' : 'Connected'}
            </p>
            {message ? (
              <p className="truncate text-xs opacity-80">{message}</p>
            ) : null}
          </div>
        </div>

        {isDisconnected ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={isChecking || isStarting}
              className="rounded-md border px-3 py-1.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: 'var(--theme-border)',
                background: 'var(--theme-card)',
                color: 'inherit',
              }}
            >
              {isChecking ? 'Retrying…' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => void handleStartAgent()}
              disabled={isStarting}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: 'var(--theme-danger)',
              }}
            >
              {isStarting ? 'Starting…' : 'Start Agent'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
