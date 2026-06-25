import { useEffect, useState } from 'react'

type ReadonlyWorkerStatus = {
  ok: boolean
  status: string
  generatedAt: string | null
  workerDecision: string | null
  reportComplete: boolean | null
  mountReadOnly: boolean | null
  targetInspected: boolean | null
  contentsRead: boolean | null
  filesWritten: number | null
  queueMetadataUpdated: boolean | null
  externalMessagesSent: boolean | null
  dispatcherStarted: boolean | null
  swarmStarted: boolean | null
  lockClean: boolean | null
  redactionApplied: boolean | null
  stalenessSeconds: number | null
  isStale: boolean
  message: string
}

type LoadState = {
  loading: boolean
  error: string | null
  data: ReadonlyWorkerStatus | null
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return 'unknown age'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatDate(value: string | null): string {
  if (!value) return 'not reported'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'invalid timestamp'
  return date.toLocaleString()
}

function yesNo(value: boolean | null): string {
  if (value === null) return 'unknown'
  return value ? 'yes' : 'no'
}

function countValue(value: number | null): string {
  return value === null ? 'unknown' : String(value)
}

function statusTone(data: ReadonlyWorkerStatus | null, error: string | null) {
  if (error || !data?.ok) {
    return {
      label: data?.status ?? 'unavailable',
      color: 'var(--theme-danger)',
      background: 'color-mix(in srgb, var(--theme-danger) 14%, transparent)',
    }
  }
  if (data.status === 'unsafe') {
    return {
      label: 'unsafe',
      color: 'var(--theme-danger)',
      background: 'color-mix(in srgb, var(--theme-danger) 14%, transparent)',
    }
  }
  if (data.isStale || data.status === 'stale') {
    return {
      label: 'stale',
      color: 'var(--theme-warning)',
      background: 'color-mix(in srgb, var(--theme-warning) 16%, transparent)',
    }
  }
  return {
    label: data.status || 'ok',
    color: 'var(--theme-success)',
    background: 'color-mix(in srgb, var(--theme-success) 16%, transparent)',
  }
}

function SafetyRow({
  label,
  value,
  safeWhen,
}: {
  label: string
  value: string
  safeWhen: boolean | null
}) {
  const color =
    safeWhen === null
      ? 'var(--theme-muted)'
      : safeWhen
        ? 'var(--theme-success)'
        : 'var(--theme-danger)'

  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span style={{ color: 'var(--theme-muted)' }}>{label}</span>
      <span className="font-mono tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

export function ReadonlyWorkerStatusCard() {
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    data: null,
  })

  useEffect(() => {
    let mounted = true
    let activeController: AbortController | null = null

    const load = async () => {
      activeController?.abort()
      const controller = new AbortController()
      activeController = controller
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const response = await fetch('/api/readonly-worker-status', {
          signal: controller.signal,
        })
        const data = (await response.json()) as ReadonlyWorkerStatus
        if (!mounted || controller.signal.aborted) return
        setState({
          loading: false,
          error: response.ok ? null : data.message || `HTTP ${response.status}`,
          data,
        })
      } catch (error) {
        if (!mounted || controller.signal.aborted) return
        setState({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load status',
          data: null,
        })
      }
    }

    void load()
    const interval = window.setInterval(() => void load(), 30_000)

    return () => {
      mounted = false
      window.clearInterval(interval)
      activeController?.abort()
    }
  }, [])

  const { data, error, loading } = state
  const tone = statusTone(data, error)
  const message = error ?? data?.message ?? (loading ? 'Loading readonly worker status.' : '')

  return (
    <section
      className="relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-2.5"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
      aria-label="Readonly Worker status"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-success), color-mix(in srgb, var(--theme-success) 40%, transparent), transparent)',
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Readonly Worker
        </h3>
        <span
          className="rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tone.color, background: tone.background }}
        >
          {loading ? 'loading' : tone.label}
        </span>
      </div>

      <div className="flex flex-col gap-1 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--theme-muted)' }}>Lane</span>
          <span className="font-mono" style={{ color: 'var(--theme-text)' }}>
            Obsidian metadata
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--theme-muted)' }}>Generated</span>
          <span
            className="truncate text-right font-mono"
            style={{ color: 'var(--theme-text)' }}
            title={formatDate(data?.generatedAt ?? null)}
          >
            {formatAge(data?.stalenessSeconds ?? null)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--theme-muted)' }}>Decision</span>
          <span
            className="truncate text-right font-mono"
            style={{ color: 'var(--theme-text)' }}
          >
            {data?.workerDecision ?? 'not reported'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--theme-muted)' }}>Mount read-only</span>
          <span
            className="font-mono"
            style={{
              color:
                data?.mountReadOnly === true
                  ? 'var(--theme-success)'
                  : data?.mountReadOnly === false
                    ? 'var(--theme-danger)'
                    : 'var(--theme-muted)',
            }}
          >
            {yesNo(data?.mountReadOnly ?? null)}
          </span>
        </div>
      </div>

      <div
        className="mt-1 rounded-lg border px-2 py-1.5"
        style={{
          borderColor: 'var(--theme-border)',
          background: 'color-mix(in srgb, var(--theme-card2) 70%, transparent)',
        }}
      >
        <div
          className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--theme-muted)' }}
        >
          Safety summary
        </div>
        <div className="flex flex-col gap-0.5">
          <SafetyRow
            label="Contents read"
            value={yesNo(data?.contentsRead ?? null)}
            safeWhen={data?.contentsRead === null ? null : data.contentsRead === false}
          />
          <SafetyRow
            label="Files written"
            value={countValue(data?.filesWritten ?? null)}
            safeWhen={data?.filesWritten === null ? null : data.filesWritten === 0}
          />
          <SafetyRow
            label="Queue mutation"
            value={yesNo(data?.queueMetadataUpdated ?? null)}
            safeWhen={
              data?.queueMetadataUpdated === null
                ? null
                : data.queueMetadataUpdated === false
            }
          />
          <SafetyRow
            label="External messages"
            value={yesNo(data?.externalMessagesSent ?? null)}
            safeWhen={
              data?.externalMessagesSent === null
                ? null
                : data.externalMessagesSent === false
            }
          />
          <SafetyRow
            label="Dispatcher"
            value={yesNo(data?.dispatcherStarted ?? null)}
            safeWhen={
              data?.dispatcherStarted === null ? null : data.dispatcherStarted === false
            }
          />
          <SafetyRow
            label="Swarm"
            value={yesNo(data?.swarmStarted ?? null)}
            safeWhen={data?.swarmStarted === null ? null : data.swarmStarted === false}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span style={{ color: 'var(--theme-muted)' }}>Lock clean</span>
          <div className="font-mono" style={{ color: 'var(--theme-text)' }}>
            {yesNo(data?.lockClean ?? null)}
          </div>
        </div>
        <div>
          <span style={{ color: 'var(--theme-muted)' }}>Redaction</span>
          <div className="font-mono" style={{ color: 'var(--theme-text)' }}>
            {yesNo(data?.redactionApplied ?? null)}
          </div>
        </div>
      </div>

      {message ? (
        <p className="text-[10px] leading-snug" style={{ color: 'var(--theme-muted)' }}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
