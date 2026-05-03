'use client'

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type SystemMetrics = {
  checkedAt: number
  cpu: {
    loadPercent: number
    loadAverage1m: number
    cores: number
  }
  memory: {
    usedBytes: number
    totalBytes: number
    usedPercent: number
  }
  disk: {
    path: string
    usedBytes: number
    totalBytes: number
    usedPercent: number
  }
  hermes: {
    status: 'connected' | 'enhanced' | 'partial' | 'disconnected'
    health: boolean
    dashboard: boolean
  }
}

async function fetchSystemMetrics(): Promise<SystemMetrics> {
  const response = await fetch('/api/system-metrics', { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<SystemMetrics>
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function metricTone(percent: number): 'normal' | 'warn' | 'critical' {
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'warn'
  return 'normal'
}

function formatCheckedAt(checkedAt: number): string {
  const ageSeconds = Math.max(0, Math.round((Date.now() - checkedAt) / 1000))
  if (ageSeconds < 5) return 'now'
  if (ageSeconds < 60) return `${ageSeconds}s ago`

  const ageMinutes = Math.round(ageSeconds / 60)
  return `${ageMinutes}m ago`
}

function MetricItem({
  label,
  value,
  tone = 'normal',
}: {
  label: string
  value: string
  tone?: 'normal' | 'warn' | 'critical' | 'muted' | 'accent'
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap',
        tone === 'normal' && 'text-[var(--theme-text)]/80',
        tone === 'warn' && 'text-amber-300/90',
        tone === 'critical' && 'text-red-300/95',
        tone === 'muted' && 'text-[var(--theme-muted)]',
        tone === 'accent' && 'text-[var(--theme-accent)]',
      )}
    >
      <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--theme-muted)]">
        {label}
      </span>
      <span className="truncate font-medium tabular-nums">{value}</span>
    </span>
  )
}

function Separator() {
  return <span className="h-3 w-px shrink-0 bg-[var(--theme-border)]" aria-hidden />
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'critical' | 'muted' }) {
  return (
    <span
      className={cn(
        'inline-block size-1.5 rounded-full',
        tone === 'ok' && 'bg-[var(--theme-accent)]',
        tone === 'warn' && 'bg-amber-300/90',
        tone === 'critical' && 'bg-red-300/95',
        tone === 'muted' && 'bg-[var(--theme-muted)]',
      )}
      aria-hidden
    />
  )
}

export function SystemMetricsFooter({ leftOffsetPx = 0 }: { leftOffsetPx?: number }) {
  const { data, isError } = useQuery({
    queryKey: ['system-metrics-footer'],
    queryFn: fetchSystemMetrics,
    refetchInterval: 15_000,
    staleTime: 14_000,
  })

  const hermesHealthy = data?.hermes.status === 'connected' || data?.hermes.status === 'enhanced'
  const hermesTone = hermesHealthy ? 'accent' : data?.hermes.status === 'disconnected' ? 'critical' : 'warn'
  const hermesDotTone = hermesHealthy ? 'ok' : data?.hermes.status === 'disconnected' ? 'critical' : 'warn'

  return (
    <footer
      className="fixed bottom-0 right-0 z-40 hidden h-7 items-center border-t border-[var(--theme-border)] bg-[var(--theme-card)] px-4 text-[11px] leading-none text-[var(--theme-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] md:flex"
      data-testid="system-metrics-footer"
      aria-label="System metrics footer"
      style={{ left: leftOffsetPx }}
    >
      <div className="flex max-w-full items-center justify-center gap-3 overflow-hidden opacity-85">
        {data ? (
          <>
            <MetricItem
              label="CPU"
              value={`${data.cpu.loadPercent}%`}
              tone={metricTone(data.cpu.loadPercent)}
            />
            <Separator />
            <MetricItem
              label="RAM"
              value={`${formatBytes(data.memory.usedBytes)} / ${formatBytes(data.memory.totalBytes)}`}
              tone={metricTone(data.memory.usedPercent)}
            />
            <Separator />
            <MetricItem
              label="Disk"
              value={`${data.disk.usedPercent}%`}
              tone={metricTone(data.disk.usedPercent)}
            />
            <Separator />
            <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
              <StatusDot tone={hermesDotTone} />
              <MetricItem label="Hermes" value={data.hermes.status} tone={hermesTone} />
            </span>
            <Separator />
            <MetricItem
              label="Updated"
              value={formatCheckedAt(data.checkedAt)}
              tone="muted"
            />
          </>
        ) : (
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-[var(--theme-muted)]">
            <StatusDot tone={isError ? 'warn' : 'muted'} />
            <MetricItem
              label="Metrics"
              value={isError ? 'unavailable' : 'loading'}
              tone={isError ? 'warn' : 'muted'}
            />
          </span>
        )}
      </div>
    </footer>
  )
}
