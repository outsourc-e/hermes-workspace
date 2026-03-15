'use client'

import { useEffect, useState } from 'react'

interface SystemMetrics {
  cpu: number
  ramUsed: number
  ramTotal: number
  diskPercent: number
  uptime: number
  gatewayConnected: boolean
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function bytesToGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1)
}

function cpuColor(pct: number): string {
  if (pct >= 80) return 'text-red-400'
  if (pct >= 50) return 'text-amber-400'
  return 'text-emerald-400'
}

function ramColor(used: number, total: number): string {
  if (total === 0) return 'text-neutral-400'
  const pct = (used / total) * 100
  if (pct >= 80) return 'text-red-400'
  if (pct >= 50) return 'text-amber-400'
  return 'text-emerald-400'
}

function diskColor(pct: number): string {
  if (pct >= 80) return 'text-red-400'
  if (pct >= 50) return 'text-amber-400'
  return 'text-emerald-400'
}

async function fetchMetrics(): Promise<SystemMetrics> {
  const res = await fetch('/api/system-metrics', { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<SystemMetrics>
}

export function SystemMetricsFooter() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const data = await fetchMetrics()
        if (!cancelled) setMetrics(data)
      } catch {
        // silently ignore — stale data stays
      }
    }

    void poll()
    const id = setInterval(() => void poll(), 5_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!metrics) return null

  const { cpu, ramUsed, ramTotal, diskPercent, uptime, gatewayConnected } = metrics

  return (
    <div
      className={[
        'fixed bottom-0 left-0 right-0 z-40',
        'h-7 hidden md:flex items-center',
        'bg-neutral-900/95 backdrop-blur-sm',
        'text-neutral-400 text-[10px] font-mono',
        'px-3 gap-4 select-none',
      ].join(' ')}
      aria-label="System metrics"
    >
      {/* CPU */}
      <span className="flex items-center gap-1">
        <span className="text-neutral-500">CPU</span>
        <span className={cpuColor(cpu)}>{cpu.toFixed(1)}%</span>
      </span>

      <span className="text-neutral-700">·</span>

      {/* RAM */}
      <span className="flex items-center gap-1">
        <span className="text-neutral-500">RAM</span>
        <span className={ramColor(ramUsed, ramTotal)}>
          {bytesToGB(ramUsed)}/{bytesToGB(ramTotal)}GB
        </span>
      </span>

      <span className="text-neutral-700">·</span>

      {/* Disk */}
      <span className="flex items-center gap-1">
        <span className="text-neutral-500">Disk</span>
        <span className={diskColor(diskPercent)}>{diskPercent}%</span>
      </span>

      <span className="text-neutral-700">·</span>

      {/* Gateway */}
      <span className="flex items-center gap-1.5">
        <span
          className={[
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            gatewayConnected ? 'bg-emerald-400' : 'bg-red-400',
          ].join(' ')}
          title={gatewayConnected ? 'Hermes connected' : 'Hermes disconnected'}
        />
        <span className={gatewayConnected ? 'text-emerald-400' : 'text-red-400'}>
          {gatewayConnected ? 'GW' : 'GW✗'}
        </span>
      </span>

      <span className="text-neutral-700">·</span>

      {/* Uptime */}
      <span className="flex items-center gap-1">
        <span className="text-neutral-500">up</span>
        <span className="text-neutral-300">{formatUptime(uptime)}</span>
      </span>
    </div>
  )
}
