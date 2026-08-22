'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const AUTO_DISMISS_MS = 8_000

// 'critical' errors require the user to act (auth/config/rate-limit/context
// desync) — they must NOT auto-dismiss, or the actionable detail vanishes
// before it can be read. 'transient' errors (network/model blips) keep the
// 8s auto-dismiss since they're informational and self-healing.
type Severity = 'critical' | 'transient'

type ErrorEntry = {
  id: string
  message: string
  severity: Severity
  raw?: string
}

function classifyError(raw: string): { message: string; severity: Severity } {
  const lower = raw.toLowerCase()
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many')
  ) {
    return {
      message: 'Rate limited — wait a moment before retrying',
      severity: 'critical',
    }
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('api key')
  ) {
    return {
      message: 'Authentication error — check your API key in Settings',
      severity: 'critical',
    }
  }
  if (lower.includes('tool_use') && lower.includes('tool_result')) {
    return {
      message:
        'Tool call context error — conversation history got out of sync. Start a new session to continue.',
      severity: 'critical',
    }
  }
  if (
    lower.includes('500') ||
    lower.includes('server error') ||
    lower.includes('model error')
  ) {
    return {
      message: 'Model error — the provider is having issues',
      severity: 'transient',
    }
  }
  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch') ||
    lower.includes('connection')
  ) {
    return { message: 'Connection lost — retrying…', severity: 'transient' }
  }
  // Unmatched: surface the raw text and keep it until dismissed (don't let an
  // unrecognized — possibly important — error slip away after 8s).
  return { message: raw, severity: 'critical' }
}

let externalPush: ((msg: string, severity: Severity) => void) | null = null

/** Call this from anywhere to show an error toast */
export function showErrorToast(message: string): void {
  const { message: msg, severity } = classifyError(message)
  externalPush?.(msg, severity)
}

type ToastItemProps = {
  entry: ErrorEntry
  onDismiss: (id: string) => void
}

function ToastItem({ entry, onDismiss }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Critical errors stay until the user dismisses them; only transient ones
    // auto-expire.
    if (entry.severity !== 'transient') return
    timerRef.current = setTimeout(() => onDismiss(entry.id), AUTO_DISMISS_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [entry.id, entry.severity, onDismiss])

  return (
    <div
      className={cn(
        'flex items-start gap-3 max-w-sm w-full',
        'rounded-xl border border-red-200',
        'shadow-lg px-4 py-3 bg-surface',
        'animate-in slide-in-from-top-2 fade-in duration-200',
      )}
      role="alert"
    >
      <span className="text-red-500 text-base shrink-0 mt-0.5">⚠</span>
      <span className="flex-1 text-[13px] text-ink leading-snug">
        {entry.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(entry.id)}
        className="shrink-0 text-primary-400 hover:text-primary-600 transition-colors text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export function ErrorToastContainer() {
  const [toasts, setToasts] = useState<Array<ErrorEntry>>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message: string, severity: Severity) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev.slice(-4), { id, message, severity }])
  }, [])

  useEffect(() => {
    externalPush = push
    return () => {
      externalPush = null
    }
  }, [push])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-safe-or-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      aria-live="assertive"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem entry={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
