'use client'

import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type ServiceStatus = {
  ok: boolean
  latencyMs: number
  label: string
  error?: string
}

type HealthData = {
  ok: boolean
  status: 'healthy' | 'degraded'
  services: Record<string, ServiceStatus>
  timestamp: string
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2.5 h-2.5 rounded-full shrink-0',
        ok ? 'bg-green-500' : 'bg-red-500',
      )}
    />
  )
}

function ServiceCard({ service }: { service: ServiceStatus }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border p-4"
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center gap-3">
        <StatusDot ok={service.ok} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>
            {service.label}
          </p>
          {service.error && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-muted)' }}>
              {service.error}
            </p>
          )}
        </div>
      </div>
      <span
        className="text-xs font-mono tabular-nums"
        style={{ color: service.ok ? 'var(--theme-muted)' : '#ef4444' }}
      >
        {service.latencyMs}ms
      </span>
    </div>
  )
}

export function HealthScreen() {
  const healthQuery = useQuery<HealthData>({
    queryKey: ['hermes', 'health'],
    queryFn: async () => {
      const res = await fetch('/api/hermes-health')
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
      return res.json()
    },
    refetchInterval: 30_000,
  })

  const data = healthQuery.data
  const services = data?.services ? Object.values(data.services) : []
  const healthyCount = services.filter((s) => s.ok).length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Activity01Icon} size={18} style={{ color: 'var(--theme-accent)' }} />
          <h1 className="text-base font-semibold" style={{ color: 'var(--theme-text)' }}>
            Health
          </h1>
        </div>
        <button
          onClick={() => void healthQuery.refetch()}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--theme-muted)' }}
          title="Refresh"
        >
          <HugeiconsIcon icon={RefreshIcon} size={16} className={healthQuery.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Overall Status */}
        <div
          className="rounded-xl border p-5 text-center"
          style={{
            background: 'var(--theme-card)',
            borderColor: 'var(--theme-border)',
          }}
        >
          {healthQuery.isLoading ? (
            <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
              Checking health...
            </p>
          ) : healthQuery.isError ? (
            <div>
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
                Unable to reach Hermes
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--theme-muted)' }}>
                {healthQuery.error instanceof Error ? healthQuery.error.message : 'Unknown error'}
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2">
                {data?.status === 'healthy' ? '✅' : '⚠️'}
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>
                {data?.status === 'healthy' ? 'All Systems Operational' : 'Some Services Degraded'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--theme-muted)' }}>
                {healthyCount}/{services.length} services healthy
              </p>
            </div>
          )}
        </div>

        {/* Service List */}
        {services.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider px-1" style={{ color: 'var(--theme-muted)' }}>
              Services
            </h2>
            {services.map((service) => (
              <ServiceCard key={service.label} service={service} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        {data?.timestamp && (
          <p className="text-[10px] text-center" style={{ color: 'var(--theme-muted)' }}>
            Last checked: {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  )
}
