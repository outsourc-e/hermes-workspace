import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CancelIcon } from '@hugeicons/core-free-icons'
import { formatModelName } from '@/screens/dashboard/lib/formatters'
import type { DashboardOverview } from '@/server/dashboard-aggregator'

function formatContext(n: number): string {
  if (!n || n <= 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function readBoolCap(
  caps: Record<string, unknown> | null,
  key: string,
): boolean {
  if (!caps) return false
  return caps[key] === true
}

type Palette = {
  accent: string
  success: string
  danger: string
  border: string
  card: string
  text: string
  muted: string
}

/**
 * Active model card. Reads `/api/model/info` via the overview
 * aggregator (so it matches whatever the gateway is actually using
 * right now, not config defaults). The "operational line" surfaces a
 * one-glance routing summary — share of API calls in the analytics
 * window — instead of leaving the card half-empty. Click "Inventory"
 * to open a modal listing every model the gateway exposes via
 * `/api/models`.
 */
export function ModelInfoCard({
  modelInfo,
  analytics,
  palette,
}: {
  modelInfo: DashboardOverview['modelInfo']
  analytics: DashboardOverview['analytics']
  palette: Palette
}) {
  const [showInventory, setShowInventory] = useState(false)
  const connected = !!modelInfo
  const display = modelInfo ? formatModelName(modelInfo.model) : '—'
  const provider = modelInfo?.provider ?? '—'
  const contextLength = modelInfo?.effectiveContextLength ?? 0
  const caps = modelInfo?.capabilities ?? null
  const supportsTools = readBoolCap(caps, 'supports_tools')
  const supportsVision = readBoolCap(caps, 'supports_vision')
  const supportsReasoning = readBoolCap(caps, 'supports_reasoning')
  const family =
    caps && typeof caps['model_family'] === 'string'
      ? (caps['model_family'] as string)
      : null

  // Operational line: share of API calls served by this model in the
  // active analytics window. If no analytics, fall back to capability
  // summary so the card never looks half-empty.
  const opsLine = useMemo(() => {
    if (modelInfo && analytics && analytics.totalApiCalls > 0) {
      const match = analytics.topModels.find(
        (m) => m.id === modelInfo.model,
      )
      if (match) {
        const pct = Math.round((match.calls / analytics.totalApiCalls) * 100)
        return `${pct}% of calls · ${match.sessions.toLocaleString()} sessions · ${analytics.windowDays}d`
      }
    }
    const flags: Array<string> = []
    if (supportsTools) flags.push('tools')
    if (supportsReasoning) flags.push('reasoning')
    if (supportsVision) flags.push('vision')
    return flags.length > 0
      ? `default routing · ${flags.join(' + ')}`
      : 'default routing target'
  }, [analytics, modelInfo, supportsReasoning, supportsTools, supportsVision])

  return (
    <>
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-xl border"
        style={{
          background: 'var(--theme-card)',
          borderColor: 'var(--theme-border)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: connected
              ? `linear-gradient(90deg, ${palette.success}, ${palette.success}50, transparent)`
              : `linear-gradient(90deg, ${palette.danger}, ${palette.danger}50, transparent)`,
          }}
        />
        <div className="flex items-center justify-between px-4 pt-3">
          <h3
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: palette.muted }}
          >
            Active Model
          </h3>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: connected
                ? 'color-mix(in srgb, var(--theme-success) 12%, transparent)'
                : 'color-mix(in srgb, var(--theme-danger) 12%, transparent)',
              color: connected ? palette.success : palette.danger,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{
                background: connected ? palette.success : palette.danger,
              }}
            />
            {connected ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-2">
          <div>
            <div
              className="font-mono text-[15px] font-bold"
              style={{ color: palette.text }}
            >
              {display}
            </div>
            <div
              className="mt-0.5 truncate font-mono text-[10px]"
              style={{ color: palette.muted }}
              title={modelInfo?.model}
            >
              {provider}
              {modelInfo ? ` · ${modelInfo.model}` : ''}
            </div>
          </div>

          <div
            className="font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: palette.muted }}
          >
            {opsLine}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <CapabilityChip
              label="ctx"
              value={formatContext(contextLength)}
              tone={palette.accent}
            />
            {family ? (
              <CapabilityChip
                label="family"
                value={family}
                tone={palette.muted}
              />
            ) : null}
            {supportsTools ? (
              <CapabilityChip label="tools" value="✓" tone={palette.success} />
            ) : null}
            {supportsVision ? (
              <CapabilityChip
                label="vision"
                value="✓"
                tone={palette.success}
              />
            ) : null}
            {supportsReasoning ? (
              <CapabilityChip
                label="reason"
                value="✓"
                tone={palette.success}
              />
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowInventory(true)}
            className="mt-1 self-start rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors hover:bg-[var(--theme-card)]/80"
            style={{
              borderColor: 'var(--theme-border)',
              color: palette.muted,
            }}
          >
            Inventory →
          </button>
        </div>
      </div>

      {showInventory ? (
        <ModelInventoryModal
          activeModel={modelInfo?.model ?? null}
          onClose={() => setShowInventory(false)}
        />
      ) : null}
    </>
  )
}

function CapabilityChip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
      style={{
        borderColor: 'var(--theme-border)',
        color: 'var(--theme-muted)',
      }}
    >
      <span>{label}</span>
      <span style={{ color: tone }}>{value}</span>
    </span>
  )
}

type InventoryModel = {
  id: string
  name: string
  provider: string
}

function ModelInventoryModal({
  activeModel,
  onClose,
}: {
  activeModel: string | null
  onClose: () => void
}) {
  const [models, setModels] = useState<Array<InventoryModel>>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const list = (data?.data ?? data?.models ?? []) as Array<
          Record<string, unknown>
        >
        if (cancelled) return
        setModels(
          list
            .map((m) => ({
              id: String(m.id ?? ''),
              name: String(m.name ?? m.id ?? ''),
              provider: String(m.provider ?? ''),
            }))
            .filter((m) => m.id),
        )
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed to load')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Array<InventoryModel>>()
    for (const m of models) {
      if (
        filter &&
        !m.id.toLowerCase().includes(filter.toLowerCase()) &&
        !m.name.toLowerCase().includes(filter.toLowerCase()) &&
        !m.provider.toLowerCase().includes(filter.toLowerCase())
      ) {
        continue
      }
      const list = map.get(m.provider) ?? []
      list.push(m)
      map.set(m.provider, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filter, models])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-[var(--theme-card)]"
        style={{ borderColor: 'var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div>
            <h2
              className="text-sm font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--theme-text)' }}
            >
              Model inventory
            </h2>
            <p
              className="font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              {models.length} models from {grouped.length || '—'} providers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter…"
              className="rounded border bg-transparent px-2 py-1 font-mono text-[11px]"
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text)',
              }}
            />
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

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div
              className="py-8 text-center text-[11px]"
              style={{ color: 'var(--theme-muted)' }}
            >
              Loading models…
            </div>
          ) : error ? (
            <div
              className="py-8 text-center text-[11px]"
              style={{ color: 'var(--theme-danger)' }}
            >
              {error}
            </div>
          ) : grouped.length === 0 ? (
            <div
              className="py-8 text-center text-[11px]"
              style={{ color: 'var(--theme-muted)' }}
            >
              No matching models.
            </div>
          ) : (
            grouped.map(([provider, list]) => (
              <div key={provider} className="mb-4">
                <h3
                  className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  {provider} · {list.length}
                </h3>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {list.map((m) => {
                    const active = m.id === activeModel
                    return (
                      <li
                        key={m.id}
                        className="rounded border px-2 py-1.5"
                        style={{
                          borderColor: active
                            ? 'color-mix(in srgb, var(--theme-success) 50%, transparent)'
                            : 'var(--theme-border)',
                          background: active
                            ? 'color-mix(in srgb, var(--theme-success) 8%, transparent)'
                            : 'transparent',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate font-mono text-[11px] font-semibold"
                            style={{ color: 'var(--theme-text)' }}
                            title={m.id}
                          >
                            {m.name}
                          </span>
                          {active ? (
                            <span
                              className="rounded px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.15em]"
                              style={{
                                background:
                                  'color-mix(in srgb, var(--theme-success) 18%, transparent)',
                                color: 'var(--theme-success)',
                              }}
                            >
                              active
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="mt-0.5 truncate font-mono text-[9px]"
                          style={{ color: 'var(--theme-muted)' }}
                          title={m.id}
                        >
                          {m.id}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
