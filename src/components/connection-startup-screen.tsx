import { useEffect, useRef, useState } from 'react'
import { fetchHermesAuthStatus, type AuthStatus } from '@/lib/hermes-auth'

const POLL_INTERVAL_MS = 2_000
const FAILURE_REVEAL_MS = 5_000
const START_COMMAND =
  'cd ~/.openclaw/workspace/hermes-agent && .venv/bin/python -m uvicorn webapi.app:app --host 0.0.0.0 --port 8642'

type Props = { onConnected: (status: AuthStatus) => void }

declare global {
  interface Window {
    __dismissSplash?: () => void
  }
}

export function ConnectionStartupScreen({ onConnected }: Props) {
  const [showFailureState, setShowFailureState] = useState(false)
  const [serverStarting, setServerStarting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverLog, setServerLog] = useState<string[]>([])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const onConnectedRef = useRef(onConnected)
  useEffect(() => {
    onConnectedRef.current = onConnected
  }, [onConnected])

  const isDone = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismiss = window.__dismissSplash
    if (!dismiss) return
    const timer = setTimeout(() => dismiss(), 60)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    isDone.current = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    const failureTimer = setTimeout(() => {
      if (!isDone.current) {
        setShowFailureState(true)
      }
    }, FAILURE_REVEAL_MS)

    const tryConnect = async () => {
      try {
        const status = await fetchHermesAuthStatus()
        if (isDone.current) return
        isDone.current = true
        clearTimeout(failureTimer)
        if (pollTimer) clearTimeout(pollTimer)
        onConnectedRef.current(status)
      } catch {
        if (isDone.current) return
        pollTimer = setTimeout(tryConnect, POLL_INTERVAL_MS)
      }
    }

    void tryConnect()

    return () => {
      isDone.current = true
      if (pollTimer) clearTimeout(pollTimer)
      clearTimeout(failureTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = setTimeout(() => setCopyState('idle'), 2_000)
    return () => clearTimeout(timer)
  }, [copyState])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6 text-white"
      style={{ backgroundColor: '#0A0E1A', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <img
          src="/hermes-avatar.webp"
          alt="Hermes"
          className="mb-5 h-20 w-20 rounded-2xl object-cover shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        />

        <h1 className="text-[2rem] font-semibold tracking-tight text-white">
          Hermes Workspace
        </h1>

        <div
          className={[
            'mt-4 flex items-center gap-3 text-sm text-white/72 transition-opacity duration-300',
            showFailureState ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
          aria-hidden={showFailureState}
        >
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <span>Connecting to Hermes Agent...</span>
        </div>

        <div
          className={[
            'w-full overflow-hidden transition-all duration-500 ease-out',
            showFailureState
              ? 'mt-6 max-h-[28rem] translate-y-0 opacity-100'
              : 'max-h-0 translate-y-2 opacity-0',
          ].join(' ')}
        >
          <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <p className="text-base font-medium text-white">
              Hermes Agent is not running
            </p>
            <p className="mt-2 text-sm leading-6 text-white/70">
              This screen will dismiss automatically when Hermes Agent is detected.
            </p>

            {(serverStarting || serverLog.length > 0) ? (
              <div
                className={[
                  'mt-4 w-full rounded-2xl border p-4',
                  serverError ? 'border-red-500/30 bg-red-950/40' : 'border-white/10 bg-black/30',
                ].join(' ')}
              >
                <div className="mb-2 flex items-center gap-2">
                  {serverStarting ? (
                    <div className="h-3 w-3 animate-spin rounded-full border border-emerald-400 border-t-transparent" />
                  ) : serverError ? (
                    <span className="text-red-300">x</span>
                  ) : (
                    <span className="text-emerald-300">+</span>
                  )}
                  <span
                    className={[
                      'text-xs font-medium',
                      serverError ? 'text-red-300' : 'text-emerald-300',
                    ].join(' ')}
                  >
                    {serverStarting
                      ? 'Starting Hermes Agent...'
                      : serverError
                        ? 'Failed to start Hermes Agent'
                        : 'Launch requested. Waiting for health check...'}
                  </span>
                </div>

                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-5 text-white/72">
                  {serverLog.slice(-8).join('\n')}
                </pre>
              </div>
            ) : null}

            <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-white/92 sm:text-sm">
              <code>{START_COMMAND}</code>
            </pre>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={serverStarting}
                onClick={async () => {
                  setServerStarting(true)
                  setServerError(null)
                  setServerLog(['Launching Hermes Agent...'])
                  try {
                    const res = await fetch('/api/start-hermes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    })
                    const contentType = res.headers.get('content-type') || ''
                    if (!contentType.includes('application/json')) {
                      const msg = `Unexpected response (${res.status}) - is pnpm dev on the right port?`
                      setServerLog([`Error: ${msg}`])
                      setServerError(msg)
                      setServerStarting(false)
                      return
                    }

                    const data = (await res.json()) as Record<string, unknown>
                    if (res.ok && data.ok) {
                      setServerLog([
                        String(data.message || 'Process launched - waiting for health check...'),
                      ])
                      setServerStarting(false)
                      return
                    }

                    const msg = String(data.error || 'Unknown error')
                    const hint = data.hint ? `\nHint: ${String(data.hint)}` : ''
                    setServerLog([`Error: ${msg}${hint}`])
                    setServerError(msg)
                    setServerStarting(false)
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    setServerLog([`Failed: ${msg}`])
                    setServerError(msg)
                    setServerStarting(false)
                  }
                }}
                className={[
                  'rounded-xl px-5 py-2.5 text-sm font-semibold transition',
                  serverStarting
                    ? 'cursor-not-allowed bg-emerald-900/70 text-emerald-200'
                    : 'bg-emerald-500 text-white hover:bg-emerald-400',
                ].join(' ')}
              >
                {serverStarting ? 'Starting...' : 'Start Server'}
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
            </div>
          </div>
        </div>

        {!showFailureState ? (
          <p className="mt-6 text-xs text-white/45">
            This screen will dismiss automatically when Hermes Agent is detected
          </p>
        ) : null}
      </div>
    </div>
  )
}
