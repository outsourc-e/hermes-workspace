import { useEffect, useRef, useState } from 'react'
import { fetchHermesAuthStatus, type AuthStatus } from '@/lib/hermes-auth'

const POLL_INTERVAL_MS = 3_000
const SETUP_DELAY_MS = 3_000
const START_COMMAND =
  'cd ~/.openclaw/workspace/hermes-agent && .venv/bin/python -m uvicorn webapi.app:app --host 0.0.0.0 --port 8642'

type Props = { onConnected: (status: AuthStatus) => void }

export function ConnectionStartupScreen({ onConnected }: Props) {
  const [showSetup, setShowSetup] = useState(false)
  const [serverStarting, setServerStarting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverLog, setServerLog] = useState<string[]>([])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  // Use a ref for onConnected so the poll loop never captures a stale version
  const onConnectedRef = useRef(onConnected)
  useEffect(() => { onConnectedRef.current = onConnected }, [onConnected])

  // isDone prevents double-firing after component unmounts or re-renders
  const isDone = useRef(false)

  useEffect(() => {
    isDone.current = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let setupTimer: ReturnType<typeof setTimeout> | null = null

    const tryConnect = async () => {
      try {
        const status = await fetchHermesAuthStatus()
        if (isDone.current) return
        isDone.current = true
        if (setupTimer) clearTimeout(setupTimer)
        if (pollTimer) clearTimeout(pollTimer)
        onConnectedRef.current(status)
      } catch {
        if (isDone.current) return
        // Show the setup card after SETUP_DELAY_MS of failed attempts
        if (!setupTimer) {
          setupTimer = setTimeout(() => setShowSetup(true), SETUP_DELAY_MS)
        }
        pollTimer = setTimeout(tryConnect, POLL_INTERVAL_MS)
      }
    }

    void tryConnect()

    return () => {
      isDone.current = true
      if (pollTimer) clearTimeout(pollTimer)
      if (setupTimer) clearTimeout(setupTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only run once on mount

  useEffect(() => {
    if (copyState === 'idle') return
    const t = setTimeout(() => setCopyState('idle'), 2_000)
    return () => clearTimeout(t)
  }, [copyState])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 text-white backdrop-blur-xl">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 sm:p-8">
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <div className="mb-5 flex size-18 items-center justify-center rounded-3xl border border-white/10 bg-white/10 shadow-lg shadow-black/20">
            <img src="/hermes-avatar.webp" alt="Hermes" className="size-12 rounded-2xl object-cover" />
          </div>

          <div className="flex items-center gap-3 text-base font-medium text-white sm:text-lg">
            <span className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-300" />
            </span>
            <span>Connecting to Hermes Agent...</span>
          </div>

          <div className="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />

          {showSetup && (
            <div className="mt-6 w-full text-left">
              <p className="text-sm text-white/90">
                Hermes Agent is not running. Start it with:
              </p>

              {(serverStarting || serverLog.length > 0) ? (
                <div className={[
                  'mt-3 w-full rounded-2xl border p-4',
                  serverError ? 'border-red-500/30 bg-red-950/40' : 'border-white/10 bg-black/60',
                ].join(' ')}>
                  <div className="flex items-center gap-2 mb-2">
                    {serverStarting
                      ? <div className="h-3 w-3 animate-spin rounded-full border border-emerald-400 border-t-transparent" />
                      : serverError
                        ? <span className="text-red-400">✗</span>
                        : <span className="text-emerald-400">✓</span>
                    }
                    <span className={['text-xs font-medium', serverError ? 'text-red-400' : 'text-emerald-400'].join(' ')}>
                      {serverStarting ? 'Starting Hermes Agent...' : serverError ? 'Failed to start' : 'Launched — waiting for health check...'}
                    </span>
                  </div>
                  <pre className="max-h-32 overflow-y-auto text-xs leading-5 text-white/70 font-mono whitespace-pre-wrap">
                    {serverLog.slice(-8).join('\n')}
                  </pre>
                  {serverError && (
                    <p className="mt-2 text-xs text-red-300/80">Start it manually using the command below, then click Retry.</p>
                  )}
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
                    setServerError(null)
                    setServerLog(['Launching Hermes Agent...'])
                    try {
                      const res = await fetch('/api/start-hermes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      })
                      const contentType = res.headers.get('content-type') || ''
                      if (!contentType.includes('application/json')) {
                        const msg = `Unexpected response (${res.status}) — is pnpm dev on the right port?`
                        setServerLog([`Error: ${msg}`])
                        setServerError(msg)
                        setServerStarting(false)
                        return
                      }
                      const data = (await res.json()) as Record<string, unknown>
                      if (res.ok && data.ok) {
                        setServerLog([String(data.message || 'Process launched — waiting for health check...')])
                        setServerStarting(false)
                        // Poll loop is already running — it will auto-dismiss when healthy
                      } else {
                        const msg = String(data.error || 'Unknown error')
                        const hint = data.hint ? `\nHint: ${String(data.hint)}` : ''
                        setServerLog([`Error: ${msg}${hint}`])
                        setServerError(msg)
                        setServerStarting(false)
                      }
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
                  {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy Failed' : 'Copy Command'}
                </button>
              </div>
            </div>
          )}

          <p className="mt-5 text-center text-xs text-white/65 sm:text-sm">
            This screen will dismiss automatically when Hermes Agent is detected
          </p>
        </div>
      </div>
    </div>
  )
}
