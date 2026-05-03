'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const POLL_INTERVAL_MS = 30_000
const PREFERRED_PROVIDER_KEY = 'clawsuite-preferred-provider'

type UsageLine = {
  type: 'progress' | 'text' | 'badge'
  label: string
  used?: number
  limit?: number
  format?: 'percent' | 'dollars' | 'tokens'
  value?: string
  color?: string
  resetsAt?: string
}

type ProviderUsageEntry = {
  provider: string
  displayName: string
  status: 'ok' | 'missing_credentials' | 'auth_expired' | 'error'
  message?: string
  plan?: string
  lines: Array<UsageLine>
  updatedAt: number
}

type SessionStatusResponse = {
  ok?: boolean
  payload?: unknown
  error?: string
}

// ── localStorage helpers ─────────────────────────────────────────────────────

function getStoredPreferredProvider(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(PREFERRED_PROVIDER_KEY)
  } catch {
    return null
  }
}

function setStoredPreferredProvider(value: string): void {
  try {
    window.localStorage.setItem(PREFERRED_PROVIDER_KEY, value)
  } catch {
    // noop
  }
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readPercent(value: unknown): number {
  const num = readNumber(value)
  if (num <= 1 && num > 0) return num * 100
  return num
}

function parseContextPercent(payload: unknown): number {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const usage =
    (root.today as Record<string, unknown> | undefined) ??
    (root.usage as Record<string, unknown> | undefined) ??
    (root.summary as Record<string, unknown> | undefined) ??
    (root.totals as Record<string, unknown> | undefined) ??
    root
  return readPercent(
    (usage as Record<string, unknown>)?.contextPercent ??
      (usage as Record<string, unknown>)?.context_percent ??
      (usage as Record<string, unknown>)?.context ??
      root?.contextPercent ??
      root?.context_percent,
  )
}

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500'
  if (pct >= 60) return 'bg-amber-400'
  return 'bg-emerald-500'
}

function textColor(pct: number): string {
  if (pct >= 80) return 'text-red-500'
  if (pct >= 60) return 'text-amber-500'
  return 'text-emerald-600'
}

/** Format a resetsAt ISO string into a compact hint like "~4h" or "~3d" */
function formatResetHint(resetsAt?: string): string | null {
  if (!resetsAt) return null
  const now = Date.now()
  const diff = new Date(resetsAt).getTime() - now
  if (diff <= 0) return null
  const hours = diff / 3_600_000
  if (hours >= 24) {
    const days = Math.ceil(hours / 24)
    return `~${days}d`
  }
  const h = Math.ceil(hours)
  return `~${h}h`
}

type UsageRow = {
  label: string
  pct: number
  resetHint: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UsageMeterCompact() {
  const [contextPct, setContextPct] = useState<number | null>(null)
  const [progressRows, setProgressRows] = useState<UsageRow[]>([])
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const [preferredProvider, setPreferredProvider] = useState<string | null>(getStoredPreferredProvider)
  const [allProviders, setAllProviders] = useState<ProviderUsageEntry[]>([])
  const [expanded, setExpanded] = useState(true)
  // Flash state: animate provider name on change
  const [providerFlash, setProviderFlash] = useState(false)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Derived primary provider ─────────────────────────────────────────────

  const getPrimary = useCallback(
    (providers: ProviderUsageEntry[], preferred: string | null) => {
      if (preferred) {
        const match = providers.find(
          (p) => p.provider === preferred && p.status === 'ok' && p.lines.length > 0,
        )
        if (match) return match
      }
      return providers.find((p) => p.status === 'ok' && p.lines.length > 0) ?? null
    },
    [],
  )

  // ── Cycle to next provider ───────────────────────────────────────────────

  const cycleProvider = useCallback(() => {
    const okProviders = allProviders.filter((p) => p.status === 'ok' && p.lines.length > 0)
    if (okProviders.length < 2) return
    const currentIdx = okProviders.findIndex((p) => p.provider === preferredProvider)
    const nextIdx = (currentIdx + 1) % okProviders.length
    const next = okProviders[nextIdx]
    if (!next) return
    setPreferredProvider(next.provider)
    setStoredPreferredProvider(next.provider)

    // Flash effect
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setProviderFlash(true)
    flashTimerRef.current = setTimeout(() => setProviderFlash(false), 300)
  }, [allProviders, preferredProvider])

  // ── Update display rows when provider changes ────────────────────────────

  const updateDisplayFromProviders = useCallback(
    (providers: ProviderUsageEntry[], preferred: string | null) => {
      const primary = getPrimary(providers, preferred)
      if (!primary) return

      const rows: UsageRow[] = primary.lines
        .filter((l) => l.type === 'progress' && l.used !== undefined)
        .slice(0, 2)
        .map((l) => ({
          label: l.label,
          pct: Math.min(100, Math.round(l.used as number)),
          resetHint: formatResetHint(l.resetsAt),
        }))
      setProgressRows(rows)

      const name = primary.displayName.split(' ')[0]
      const label = primary.plan ? `${name} ${primary.plan}` : name
      setProviderLabel(label.length > 14 ? name : label)
    },
    [getPrimary],
  )

  // Re-derive display rows whenever preferred changes
  useEffect(() => {
    if (allProviders.length > 0) {
      updateDisplayFromProviders(allProviders, preferredProvider)
    }
  }, [preferredProvider, allProviders, updateDisplayFromProviders])

  // ── Fetch session status ─────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session-status')
      if (!res.ok) return
      const data = (await res.json()) as SessionStatusResponse
      const payload = data.payload ?? data
      const pct = parseContextPercent(payload)
      setContextPct(Math.min(100, Math.round(pct)))
    } catch {
      // silent — compact meter shows nothing on error
    }
  }, [])

  // ── Fetch provider usage ─────────────────────────────────────────────────

  const fetchProvider = useCallback(
    async (preferred: string | null) => {
      try {
        const res = await fetch('/api/provider-usage')
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          providers?: Array<ProviderUsageEntry>
        } | null
        if (!data?.providers) return

        setAllProviders(data.providers)
        updateDisplayFromProviders(data.providers, preferred)
      } catch {
        // silent
      }
    },
    [updateDisplayFromProviders],
  )

  // ── Polling effects ──────────────────────────────────────────────────────

  useEffect(() => {
    void fetchSession()
    const id = window.setInterval(fetchSession, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchSession])

  useEffect(() => {
    void fetchProvider(preferredProvider)
    const id = window.setInterval(() => fetchProvider(preferredProvider), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProvider])

  // Cleanup flash timer on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────

  if (contextPct === null) return null

  // Build the rows to display: session context row + all provider progress rows
  const ctxRow: UsageRow = { label: 'Ctx', pct: contextPct, resetHint: null }
  const allRows: UsageRow[] =
    progressRows.length > 0
      ? progressRows
      : [ctxRow]

  const headerLabel = providerLabel ? `Usage · ${providerLabel}` : 'Usage'
  const canCycle = allProviders.filter((p) => p.status === 'ok' && p.lines.length > 0).length > 1

  return (
    <div className="space-y-0 px-1">
      {/* Header: provider label (click to cycle) | chevron (click to collapse) */}
      <div className="mb-1 flex w-full items-center justify-between">
        {/* Provider name — click to cycle */}
        <button
          type="button"
          onClick={canCycle ? cycleProvider : undefined}
          className={cn(
            'flex items-center gap-1 rounded px-1 text-[9px] font-semibold uppercase tracking-widest transition-colors',
            canCycle
              ? 'cursor-pointer text-neutral-400 hover:text-neutral-600'
              : 'cursor-default text-neutral-400',
            providerFlash && 'text-emerald-500 ring-1 ring-accent-400',
          )}
          title={canCycle ? 'Click to switch provider' : undefined}
          aria-label={canCycle ? 'Cycle provider' : undefined}
        >
          <span>{headerLabel}</span>
          {canCycle && (
            <span className="text-[8px] opacity-60">↻</span>
          )}
        </button>

        {/* Collapse chevron */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[9px] text-neutral-300 hover:text-neutral-500 transition-colors cursor-pointer"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse usage' : 'Expand usage'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Bars */}
      {expanded && (
        <div className="space-y-1">
          {allRows.map((row) => (
            <div key={row.label} className="flex items-center gap-1.5">
              <div className="w-12 shrink-0">
                <span className="block text-[9px] leading-none text-neutral-500">
                  {row.label}
                </span>
                {row.resetHint && (
                  <span className="block text-[8px] leading-none text-neutral-400 mt-0.5">
                    {row.resetHint}
                  </span>
                )}
              </div>
              <div className="h-1 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
                <div
                  className={cn('h-full rounded-full transition-all', barColor(row.pct))}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
              <span
                className={cn(
                  'w-6 text-right text-[9px] tabular-nums',
                  textColor(row.pct),
                )}
              >
                {row.pct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
