import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CancelIcon,
  ConsoleIcon,
  AlertCircleIcon,
} from '@hugeicons/core-free-icons'

// Hugeicons free pack ships `ConsoleIcon` (terminal-prompt glyph) but
// no `TerminalIcon`. Aliasing keeps call sites readable.
const TerminalIcon = ConsoleIcon
import type { DashboardOverview } from '@/server/dashboard-aggregator'

const ERROR_RX = /\b(error|exception|traceback|failed|fatal)\b/i
const WARN_RX = /\b(warn|warning|deprecated)\b/i

function lineTone(line: string): string {
  if (ERROR_RX.test(line) || line.toLowerCase().includes('errno')) {
    return 'var(--theme-danger)'
  }
  if (WARN_RX.test(line)) return 'var(--theme-warning)'
  return 'var(--theme-text)'
}

/**
 * Compact rolling log tail card. Lives in the dashboard ops rail and
 * gives a fast pulse on whether anything is on fire. Click "Expand"
 * for the full tail modal, which paginates and filters server logs.
 *
 * Hides itself when the dashboard isn't returning logs (vanilla install
 * with auth disabled, or running without a dashboard).
 */
export function LogsTailCard({
  logs,
}: {
  logs: DashboardOverview['logs']
}) {
  const [showModal, setShowModal] = useState(false)
  if (!logs) return null

  const previewLines = logs.lines.slice(-6)

  return (
    <>
      <div
        className="relative flex flex-col gap-2 overflow-hidden rounded-xl border p-3"
        style={{
          background:
            'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={TerminalIcon}
              size={14}
              strokeWidth={1.5}
              style={{ color: 'var(--theme-muted)' }}
            />
            <h3
              className="text-[10px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              Logs · {logs.file}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {logs.errorCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono uppercase tracking-[0.1em]"
                style={{
                  background:
                    'color-mix(in srgb, var(--theme-danger) 15%, transparent)',
                  color: 'var(--theme-danger)',
                }}
              >
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  size={10}
                  strokeWidth={1.5}
                />
                {logs.errorCount}
              </span>
            ) : null}
            {logs.warnCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono uppercase tracking-[0.1em]"
                style={{
                  background:
                    'color-mix(in srgb, var(--theme-warning) 15%, transparent)',
                  color: 'var(--theme-warning)',
                }}
              >
                {logs.warnCount} warn
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded border px-2 py-0.5 font-mono uppercase tracking-[0.15em] transition-colors hover:bg-[var(--theme-card)]/80"
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-muted)',
              }}
            >
              Tail →
            </button>
          </div>
        </div>
        <div
          className="rounded border p-2 font-mono text-[10px] leading-snug"
          style={{
            borderColor: 'var(--theme-border)',
            background:
              'color-mix(in srgb, var(--theme-card) 88%, transparent)',
            maxHeight: 96,
            overflow: 'hidden',
          }}
        >
          {previewLines.length === 0 ? (
            <span style={{ color: 'var(--theme-muted)' }}>
              no recent log lines.
            </span>
          ) : (
            previewLines.map((line, i) => (
              <div
                key={i}
                className="truncate"
                style={{ color: lineTone(line) }}
                title={line}
              >
                {line.replace(/\n+$/, '')}
              </div>
            ))
          )}
        </div>
      </div>

      {showModal ? (
        <LogsModal initial={logs} onClose={() => setShowModal(false)} />
      ) : null}
    </>
  )
}

function LogsModal({
  initial,
  onClose,
}: {
  initial: NonNullable<DashboardOverview['logs']>
  onClose: () => void
}) {
  const [logs, setLogs] = useState<typeof initial>(initial)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'errors' | 'warns'>('all')

  // Refresh log tail every 3s while modal is open. Keeps it lightweight
  // (200 lines) and bails on errors silently.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/dashboard/overview?logs=200')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.logs) setLogs(data.logs)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    tick()
    const interval = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const filtered = logs.lines.filter((line) => {
    if (filter === 'errors') {
      return ERROR_RX.test(line) || line.toLowerCase().includes('errno')
    }
    if (filter === 'warns') return WARN_RX.test(line)
    return true
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-[var(--theme-card)]"
        style={{ borderColor: 'var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center gap-3">
            <HugeiconsIcon
              icon={TerminalIcon}
              size={16}
              strokeWidth={1.5}
              style={{ color: 'var(--theme-text)' }}
            />
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--theme-text)' }}
              >
                Live tail · {logs.file}
              </h2>
              <p
                className="font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{ color: 'var(--theme-muted)' }}
              >
                {logs.lines.length} lines · {logs.errorCount} errors ·{' '}
                {logs.warnCount} warns
                {loading ? ' · refreshing…' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'errors', 'warns'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors"
                style={{
                  borderColor: 'var(--theme-border)',
                  background:
                    filter === opt
                      ? 'color-mix(in srgb, var(--theme-accent) 18%, transparent)'
                      : 'transparent',
                  color:
                    filter === opt
                      ? 'var(--theme-accent)'
                      : 'var(--theme-muted)',
                }}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 hover:bg-[var(--theme-card)]/80"
            >
              <HugeiconsIcon
                icon={CancelIcon}
                size={16}
                strokeWidth={1.5}
                style={{ color: 'var(--theme-muted)' }}
              />
            </button>
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
          style={{
            background:
              'color-mix(in srgb, var(--theme-card) 88%, transparent)',
          }}
        >
          {filtered.length === 0 ? (
            <div
              className="py-6 text-center text-[11px]"
              style={{ color: 'var(--theme-muted)' }}
            >
              No matching log lines.
            </div>
          ) : (
            filtered.map((line, i) => (
              <div
                key={i}
                className="whitespace-pre-wrap"
                style={{ color: lineTone(line) }}
              >
                {line.replace(/\n+$/, '')}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
