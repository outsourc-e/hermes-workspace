import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHermesAuthStatus, type AuthStatus } from '@/lib/hermes-auth'

const POLL_INTERVAL = 3_000
const SETUP_DELAY = 3_000
const EXIT_DURATION = 250
const START_COMMAND =
  'cd ~/.openclaw/workspace/hermes-agent && .venv/bin/python -m uvicorn webapi.app:app --host 0.0.0.0 --port 8642'

type ConnectionStartupScreenProps = {
  onConnected: (status: AuthStatus) => void
}

export function ConnectionStartupScreen({
  onConnected,
}: ConnectionStartupScreenProps) {
  const [visible, setVisible] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  const [serverStarting, setServerStarting] = useState(false)
  const [serverLog, setServerLog] = useState<string[]>([])
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settledRef = useRef(false)
  const onConnectedRef = useRef(onConnected)

  useEffect(() => {
    onConnectedRef.current = onConnected
  }, [onConnected])

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      globalThis.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  const clearSetupTimeout = useCallback(() => {
    if (setupTimeoutRef.current !== null) {
      globalThis.clearTimeout(setupTimeoutRef.current)
      setupTimeoutRef.current = null
    }
  }, [])

  const clearExitTimeout = useCallback(() => {
    if (exitTimeoutRef.current !== null) {
      globalThis.clearTimeout(exitTimeoutRef.current)
      exitTimeoutRef.current = null
    }
  }, [])

  const scheduleSetupReveal = useCallback(() => {
    clearSetupTimeout()
    setupTimeoutRef.current = globalThis.setTimeout(() => {
      setShowSetup(true)
    }, SETUP_DELAY)
  }, [clearSetupTimeout])

  const handleConnected = useCallback(
    (status: AuthStatus) => {
      if (settledRef.current) return
      settledRef.current = true
      clearRetryTimeout()
      clearSetupTimeout()
      setShowSetup(false)
      setIsRetrying(false)

      if (!visible) {
        onConnectedRef.current(status)
        return
      }

      setIsExiting(true)
      clearExitTimeout()
      exitTimeoutRef.current = globalThis.setTimeout(() => {
        onConnectedRef.current(status)
      }, EXIT_DURATION)
    },
    [clearExitTimeout, clearRetryTimeout, clearSetupTimeout, visible],
  )

  const attemptConnection = useCallback(async () => {
    clearRetryTimeout()
    setIsRetrying(true)

    try {
      const status = await fetchHermesAuthStatus()
      handleConnected(status)
    } catch {
      if (settledRef.current) return

      setVisible(true)
      setIsRetrying(false)
      scheduleSetupReveal()
      retryTimeoutRef.current = globalThis.setTimeout(() => {
        void attemptConnection()
      }, POLL_INTERVAL)
    }
  }, [clearRetryTimeout, handleConnected, scheduleSetupReveal])

  useEffect(() => {
    // Start the setup reveal timer immediately — don't wait for the first
    // failed attempt. If the connection succeeds before the timer fires,
    // handleConnected() clears it.
    scheduleSetupReveal()
    void attemptConnection()

    return () => {
      settledRef.current = true
      clearRetryTimeout()
      clearSetupTimeout()
      clearExitTimeout()
    }
  }, [attemptConnection, clearExitTimeout, clearRetryTimeout, clearSetupTimeout, scheduleSetupReveal])

  useEffect(() => {
    if (copyState === 'idle') return

    const timer = globalThis.setTimeout(() => setCopyState('idle'), 2_000)
    return () => globalThis.clearTimeout(timer)
  }, [copyState])

  return (
    <div
      className={[
        'fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 text-white backdrop-blur-xl transition-opacity duration-250',
        isExiting ? 'pointer-events-none opacity-0' : 'opacity-100',
      ].join(' ')}
      aria-live="polite"
      aria-busy={!showSetup || isRetrying}
    >
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 sm:p-8">
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <div className="mb-5 flex size-18 items-center justify-center rounded-3xl border border-white/10 bg-white/10 shadow-lg shadow-black/20">
            <img
              src="/hermes-avatar.webp"
              alt="Hermes"
              className="size-12 rounded-2xl object-cover"
            />
          </div>

          <div className="flex items-center gap-3 text-base font-medium text-white sm:text-lg">
            <span className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-300" />
            </span>
            <span>Connecting to Hermes Agent...</span>
          </div>

          <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />

          {showSetup ? (
            <div className="mt-6 w-full text-left">
              <p className="text-sm text-white/90">
                Hermes Agent is not running. Start it with:
              </p>
              {serverStarting ? (
                <div className="mt-3 w-full rounded-2xl border border-white/10 bg-black/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-3 w-3 animate-spin rounded-full border border-emerald-400 border-t-transparent" />
                    <span className="text-xs font-medium text-emerald-400">Starting Hermes Agent...</span>
                  </div>
                  <pre className="max-h-32 overflow-y-auto text-xs leading-5 text-white/70 font-mono">
                    {serverLog.length > 0 ? serverLog.slice(-8).join('\n') : 'Launching server...'}
                  </pre>
                </div>
              ) : (
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-white/95 sm:text-sm">
                  <code className="font-mono">{START_COMMAND}</code>
                </pre>
              )}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  disabled={serverStarting}
                  onClick={async () => {
                    setServerStarting(true)
                    setServerLog([])
                    try {
                      const res = await fetch('/api/terminal-stream?' + new URLSearchParams({
                        command: START_COMMAND,
                        cwd: '/Users/aurora/.openclaw/workspace/hermes-agent',
                        cols: '120',
                        rows: '10',
                      }).toString())
                      if (!res.ok || !res.body) {
                        setServerLog(prev => [...prev, `Error: HTTP ${res.status}`])
                        setServerStarting(false)
                        return
                      }
                      const reader = res.body.getReader()
                      const decoder = new TextDecoder()
                      let buffer = ''
                      const read = async () => {
                        while (true) {
                          const { done, value } = await reader.read()
                          if (done) break
                          buffer += decoder.decode(value, { stream: true })
                          const lines = buffer.split('\n')
                          buffer = lines.pop() || ''
                          for (const line of lines) {
                            if (line.startsWith('data: ')) {
                              try {
                                const parsed = JSON.parse(line.slice(6))
                                if (typeof parsed === 'string') {
                                  // Strip ANSI codes for clean display
                                  const clean = parsed.replace(/\x1b\[[0-9;]*m/g, '').trim()
                                  if (clean) setServerLog(prev => [...prev, clean])
                                } else if (parsed && typeof parsed === 'object' && 'data' in parsed) {
                                  const clean = String(parsed.data).replace(/\x1b\[[0-9;]*m/g, '').trim()
                                  if (clean) setServerLog(prev => [...prev, clean])
                                }
                              } catch { /* skip */ }
                            }
                          }
                        }
                      }
                      void read()
                    } catch (err) {
                      setServerLog(prev => [...prev, `Failed: ${err instanceof Error ? err.message : String(err)}`])
                      setServerStarting(false)
                    }
                  }}
                  className={[
                    'rounded-xl px-5 py-2.5 text-sm font-semibold transition',
                    serverStarting
                      ? 'bg-emerald-800 text-emerald-200 cursor-not-allowed'
                      : 'bg-emerald-500 text-white hover:bg-emerald-400',
                  ].join(' ')}
                >
                  {serverStarting ? 'Starting...' : '▶ Start Server'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(START_COMMAND)
                      setCopyState('copied')
                    } catch {
                      setCopyState('failed')
                    }
                  }}
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  {copyState === 'copied'
                    ? 'Copied'
                    : copyState === 'failed'
                      ? 'Copy Failed'
                      : 'Copy Command'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSetup(false)
                    setServerStarting(false)
                    void attemptConnection()
                  }}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : null}

          <p className="mt-5 text-center text-xs text-white/65 sm:text-sm">
            This screen will dismiss automatically when Hermes Agent is
            detected
          </p>
        </div>
      </div>
    </div>
  )
}
