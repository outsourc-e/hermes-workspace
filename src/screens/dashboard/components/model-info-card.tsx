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
  const v = caps[key]
  return v === true
}

/**
 * Drop-in replacement for the legacy ModelCard that read
 * `/api/claude-config`. The overview aggregator already pulls
 * `/api/model/info`, which is the correct source for the *active*
 * model the gateway is using right now (not just config defaults).
 *
 * Surfaces the bits the spec calls out as "missing native parity":
 * provider, real context length, and capability chips. Stays compact
 * so it fits the new tighter row.
 */
export function ModelInfoCard({
  modelInfo,
  palette,
}: {
  modelInfo: DashboardOverview['modelInfo']
  palette: {
    accent: string
    success: string
    danger: string
    border: string
    card: string
    text: string
    muted: string
  }
}) {
  const connected = !!modelInfo
  const display = modelInfo
    ? formatModelName(modelInfo.model)
    : '—'
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

  return (
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
      <div className="flex items-center justify-between px-5 pt-4">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.15em]"
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
      <div className="flex flex-1 flex-col gap-2.5 px-5 pb-4 pt-3">
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
          >
            {provider}
            {modelInfo ? ` · ${modelInfo.model}` : ''}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <CapabilityChip
            label="ctx"
            value={formatContext(contextLength)}
            tone={palette.accent}
          />
          {family ? (
            <CapabilityChip label="family" value={family} tone={palette.muted} />
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
      </div>
    </div>
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
