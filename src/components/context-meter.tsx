'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const POLL_MS = 15_000

function readPercent(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 75) return 'bg-orange-400'
  if (pct >= 50) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

type ContextMeterProps = {
  /** 'mobile' renders a 3px bar at the top of the chat; 'desktop' renders inline in header */
  variant?: 'mobile' | 'desktop'
  className?: string
}

export function ContextMeter({ variant = 'mobile', className }: ContextMeterProps) {
  const [pct, setPct] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const prevPctRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/context-usage')
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { ok?: boolean; contextPercent?: unknown }
        if (!data?.ok || cancelled) return
        const next = readPercent(data.contextPercent)
        prevPctRef.current = next
        setPct(next)

        if (next >= 90) {
          setWarning('Context nearly full — conversation may be compacted soon')
        } else if (next >= 75) {
          setWarning('Context filling up — approaching limit')
        } else {
          setWarning(null)
        }
      } catch {
        /* ignore */
      }
    }

    void poll()
    const id = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (pct <= 0) return null

  if (variant === 'mobile') {
    return (
      <div className={cn('w-full flex flex-col', className)}>
        {/* Thin progress bar */}
        <div className="w-full h-[3px] bg-primary-100 dark:bg-white/10">
          <div
            className={cn('h-full transition-all duration-700', getBarColor(pct))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        {/* Warning banner at 90%+ */}
        {warning && pct >= 90 && (
          <div className="w-full bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] px-3 py-0.5 text-center">
            {warning}
          </div>
        )}
      </div>
    )
  }

  // Desktop: compact inline badge + bar
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {pct >= 75 && (
        <span className="text-[10px] font-medium text-orange-500 dark:text-orange-400 shrink-0">
          {pct >= 90 ? '⚠ Context full' : '⚠ Context high'}
        </span>
      )}
      <div className="w-20 h-1.5 rounded-full bg-primary-100 dark:bg-white/10 overflow-hidden shrink-0">
        <div
          className={cn('h-full rounded-full transition-all duration-700', getBarColor(pct))}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-primary-500 dark:text-primary-400 shrink-0 tabular-nums">
        {Math.round(pct)}%
      </span>
    </div>
  )
}
