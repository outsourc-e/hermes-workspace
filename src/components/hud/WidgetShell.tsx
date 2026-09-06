import type { ReactNode } from 'react'
import type { WidgetState } from '../../server/hud/types'

interface WidgetShellProps {
  state: WidgetState
  title: string
  fetchedAt?: number
  error?: { message: string; code?: string }
  children: ReactNode
  className?: string
}

export function WidgetShell({
  state,
  title,
  fetchedAt,
  error,
  children,
  className = '',
}: WidgetShellProps) {
  if (state === 'disabled') return null

  if (state === 'loading') {
    return (
      <div className={`relative ${className}`} aria-label={`${title} loading`}>
        <div
          data-testid="skeleton"
          className="animate-pulse bg-[#161b22] rounded h-full min-h-[36px]"
        />
      </div>
    )
  }

  const ageMin = fetchedAt ? Math.round((Date.now() - fetchedAt) / 60000) : null

  return (
    <div className={`relative ${className}`}>
      {children}
      {state === 'stale' && ageMin !== null && (
        <span className="absolute top-1 right-1 text-[7px] text-[#d29922] uppercase tracking-wider">
          ↻ {ageMin}m stale
        </span>
      )}
      {state === 'errored' && (
        <button
          type="button"
          className="absolute top-1 right-1 text-[7px] text-[#f85149] uppercase tracking-wider"
          title={error?.message ?? 'unknown error'}
          aria-label={`${title} error`}
        >
          ⚠ error
        </button>
      )}
    </div>
  )
}
