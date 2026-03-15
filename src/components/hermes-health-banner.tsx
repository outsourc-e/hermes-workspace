import { useEffect, useState } from 'react'

const HERMES_API = 'http://localhost:8642'
const POLL_INTERVAL = 15_000

export function HermesHealthBanner() {
  const [status, setStatus] = useState<'ok' | 'error' | 'checking'>('checking')
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(`${HERMES_API}/health`, { signal: AbortSignal.timeout(5000) })
        if (!cancelled) {
          if (res.ok) {
            setStatus('ok')
            setLastError(null)
          } else {
            setStatus('error')
            setLastError(`HTTP ${res.status}`)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setLastError(err instanceof Error ? err.message : 'Connection failed')
        }
      }
    }

    check()
    const interval = setInterval(check, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (status === 'ok' || status === 'checking') return null

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
      style={{
        background: 'var(--theme-danger)',
        color: '#fff',
      }}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse" />
      <span>
        Hermes Agent unreachable{lastError ? ` — ${lastError}` : ''}
      </span>
      <button
        type="button"
        onClick={() => {
          setStatus('checking')
          fetch(`${HERMES_API}/health`, { signal: AbortSignal.timeout(5000) })
            .then((res) => {
              setStatus(res.ok ? 'ok' : 'error')
              if (!res.ok) setLastError(`HTTP ${res.status}`)
            })
            .catch((err) => {
              setStatus('error')
              setLastError(err instanceof Error ? err.message : 'Connection failed')
            })
        }}
        className="ml-2 rounded px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'rgba(255,255,255,0.2)' }}
      >
        Retry
      </button>
    </div>
  )
}
