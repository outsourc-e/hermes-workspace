import { useEffect, useState } from 'react'
import { fetchClaudeAuthStatus } from '@/lib/claude-auth'

const POLL_INTERVAL = 30_000

type ClaudeHealthBannerProps = {
  enabled?: boolean
}

export function ClaudeHealthBanner({
  enabled = false,
}: ClaudeHealthBannerProps) {
  const [status, setStatus] = useState<'ok' | 'error' | 'checking'>('checking')
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('checking')
      setLastError(null)
      return
    }

    let cancelled = false

    async function check() {
      try {
        await fetchClaudeAuthStatus()
        if (!cancelled) {
          setStatus('ok')
          setLastError(null)
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
  }, [enabled])

  if (!enabled || status === 'ok' || status === 'checking') return null

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
      style={{
        background: 'var(--theme-danger)',
        color: '#fff',
      }}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-pulse" />
      <span>Claude Agent unreachable{lastError ? ` — ${lastError}` : ''}</span>
      <button
        type="button"
        onClick={() => {
          setStatus('checking')
          fetchClaudeAuthStatus()
            .then(() => {
              setStatus('ok')
              setLastError(null)
            })
            .catch((err) => {
              setStatus('error')
              setLastError(
                err instanceof Error ? err.message : 'Connection failed',
              )
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
