'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  CpuIcon,
  FlashIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type WorkerHealth = {
  workerId: string
  profileFound: boolean
  wrapperFound: boolean
  model: string
  provider: string
  recentAuthErrors: number
  recentFallbacks: number
  lastErrorAt: string | null
  lastErrorMessage: string | null
  lastFallbackAt: string | null
  lastFallbackMessage: string | null
  modelAuthStatus: 'ready' | 'primary-auth-failed' | 'fallback-active' | 'not-configured' | 'unknown'
  primaryAuthOk: boolean | null
  fallbackActive: boolean
  fallbackProvider: string | null
  fallbackModel: string | null
}

type HealthResponse = {
  checkedAt: number
  workspaceModel: string | null
  agentApiUrl?: string | null
  claudeApiUrl?: string | null
  workers: WorkerHealth[]
  summary: {
    totalWorkers: number
    wrappersConfigured: number
    totalAuthErrors24h: number
    totalFallbacks24h: number
    workersUsingFallback: number
    workersPrimaryAuthFailed: number
    degraded: boolean
    warnings: string[]
    distinctModels: string[]
    distinctProviders: string[]
  }
}

async function fetchSwarmHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/swarm-health')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<HealthResponse>
}

type DispatchPingResult = {
  workerId: string
  ok: boolean
  durationMs: number
  output: string
  error: string | null
} | null

export function SwarmHealthStrip({ targetWorkerId }: { targetWorkerId?: string | null }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['swarm', 'health'],
    queryFn: fetchSwarmHealth,
    refetchInterval: 60_000,
  })
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<DispatchPingResult>(null)
  const [pingError, setPingError] = useState<string | null>(null)
  const [tickLabel, setTickLabel] = useState<string>('')

  useEffect(() => {
    function update() {
      if (!data) {
        setTickLabel('')
        return
      }
      const diff = Math.floor((Date.now() - data.checkedAt) / 1000)
      if (diff < 5) setTickLabel('just now')
      else if (diff < 60) setTickLabel(`${diff}s ago`)
      else setTickLabel(`${Math.floor(diff / 60)}m ago`)
    }
    update()
    const interval = setInterval(update, 5_000)
    return () => clearInterval(interval)
  }, [data])

  async function pingWorker(workerId: string) {
    setPinging(true)
    setPingError(null)
    setPingResult(null)
    try {
      const res = await fetch('/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerIds: [workerId],
          prompt: `Reply with exactly: ${workerId.toUpperCase()}_PING_OK`,
          timeoutSeconds: 60,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { results?: Array<DispatchPingResult> }
      const first = data.results && data.results[0] ? data.results[0] : null
      setPingResult(first)
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Ping failed')
    } finally {
      setPinging(false)
    }
  }

  const workspaceModel = data?.workspaceModel ?? '—'
  const apiUrl = data?.agentApiUrl ?? data?.claudeApiUrl ?? '—'
  const totalAuthErrors = data?.summary.totalAuthErrors24h ?? 0
  const totalFallbacks = data?.summary.totalFallbacks24h ?? 0
  const degraded = data?.summary.degraded ?? false
  const warnings = data?.summary.warnings ?? []
  const wrappersConfigured = data?.summary.wrappersConfigured ?? 0
  const totalWorkers = data?.summary.totalWorkers ?? 0
  const distinctModels = data?.summary.distinctModels ?? []
  const provider = data?.summary.distinctProviders[0] ?? 'unknown'
  const pingTarget = targetWorkerId ?? data?.workers[0]?.workerId ?? null

  return (
    <div className="rounded-2xl border border-emerald-400/15 bg-[#08110d] p-4 text-emerald-50/85">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={degraded ? AlertCircleIcon : CheckmarkCircle02Icon} size={14} className={degraded ? 'text-amber-300' : 'text-emerald-300'} />
          <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">Swarm health</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-emerald-100/55">
          <span>{tickLabel ? `Checked ${tickLabel}` : isLoading ? 'Checking…' : ''}</span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/70 hover:text-white"
          >
            <HugeiconsIcon icon={RefreshIcon} size={11} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {isError ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Failed to load health. Try refresh.
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <HealthTile icon={CpuIcon} label="Workspace model" value={workspaceModel} />
        <HealthTile icon={FlashIcon} label="Provider" value={provider} />
        <HealthTile icon={FlashIcon} label="Wrappers" value={`${wrappersConfigured}/${totalWorkers}`} />
        <HealthTile
          icon={totalFallbacks === 0 ? CheckmarkCircle02Icon : AlertCircleIcon}
          label="Fallbacks 24h"
          value={String(totalFallbacks)}
          tone={totalFallbacks === 0 ? 'good' : 'warn'}
        />
      </div>

      {degraded ? (
        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <div className="font-semibold">Primary model readiness degraded.</div>
          <div className="mt-1 text-amber-100/80">
            Auth errors: {totalAuthErrors}. Fallbacks: {totalFallbacks}. Reply smoke tests can pass on fallback; fix primary auth before production swarm work.
          </div>
          {warnings.length > 0 ? <div className="mt-1 text-amber-100/70">{warnings.join(' ')}</div> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-emerald-100/55">
        <span>Gateway: <span className="text-emerald-50">{apiUrl}</span></span>
        {distinctModels.length > 0 ? (
          <span>Worker models: <span className="text-emerald-50">{distinctModels.join(', ')}</span></span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-3 py-2">
        <div className="text-[11px] text-emerald-100/70">
          Reply smoke test: dispatch a tiny prompt to{' '}
          <span className="font-semibold text-emerald-100">{pingTarget ?? 'no worker'}</span>. This confirms a reply, not primary-model readiness.
        </div>
        <button
          type="button"
          onClick={() => pingTarget && pingWorker(pingTarget)}
          disabled={!pingTarget || pinging}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            pinging ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-400 text-black hover:bg-emerald-300 disabled:opacity-50',
          )}
        >
          <HugeiconsIcon icon={FlashIcon} size={12} />
          {pinging ? 'Pinging…' : `Ping ${pingTarget ?? '—'}`}
        </button>
      </div>

      {pingError ? (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Ping failed: {pingError}
        </div>
      ) : null}
      {pingResult ? (
        <div
          className={cn(
            'mt-2 rounded-lg border px-3 py-2 text-xs',
            pingResult.ok ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : 'border-red-500/40 bg-red-500/10 text-red-200',
          )}
        >
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
            <span>{pingResult.workerId} · {pingResult.ok ? 'reply received' : 'failure'}</span>
            <span>{(pingResult.durationMs / 1000).toFixed(1)}s</span>
          </div>
          {pingResult.error ? (
            <pre className="mt-2 whitespace-pre-wrap text-[11px]">{pingResult.error}</pre>
          ) : null}
          {pingResult.output ? (
            <pre className="mt-2 whitespace-pre-wrap text-[11px] text-emerald-100">{pingResult.output.slice(-1000)}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function HealthTile({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof CpuIcon
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2 backdrop-blur',
        tone === 'good' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' :
        tone === 'warn' ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' :
        'border-emerald-400/15 bg-black/35 text-emerald-50/80',
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100/60">
        <HugeiconsIcon icon={icon} size={11} />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-emerald-50">{value}</div>
    </div>
  )
}
