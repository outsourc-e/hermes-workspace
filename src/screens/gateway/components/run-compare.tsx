type RunSnapshot = {
  id: string
  title: string
  status: string
  duration: string
  tokenCount: number
  costEstimate: number
  agents: string[]
  startedAt: number
}

export type RunCompareProps = {
  runA: RunSnapshot
  runB: RunSnapshot
  onClose: () => void
}

type DeltaTone = 'better' | 'worse' | 'same' | 'neutral'

type DeltaResult = {
  tone: DeltaTone
  arrow: '↑' | '↓' | '='
  label: string
}

function parseDurationToSeconds(duration: string): number | null {
  const text = duration.trim().toLowerCase()
  if (!text) return null

  let total = 0
  const h = text.match(/(\d+(?:\.\d+)?)\s*h/)
  const m = text.match(/(\d+(?:\.\d+)?)\s*m/)
  const s = text.match(/(\d+(?:\.\d+)?)\s*s/)

  if (h) total += Number(h[1]) * 3600
  if (m) total += Number(m[1]) * 60
  if (s) total += Number(s[1])

  if (total > 0) return total

  const raw = Number(text)
  return Number.isFinite(raw) ? raw : null
}

function percentChange(base: number, next: number): number {
  if (base <= 0) return next === base ? 0 : 100
  return Math.abs((next - base) / base) * 100
}

function compareLowerIsBetter(base: number, next: number): DeltaResult {
  if (next === base) return { tone: 'same', arrow: '=', label: 'Same' }
  const pct = percentChange(base, next)
  if (next < base) return { tone: 'better', arrow: '↑', label: `${pct.toFixed(1)}%` }
  return { tone: 'worse', arrow: '↓', label: `${pct.toFixed(1)}%` }
}

function compareCount(base: number, next: number): DeltaResult {
  if (next === base) return { tone: 'same', arrow: '=', label: 'Same' }
  const pct = percentChange(base, next)
  if (next > base) return { tone: 'neutral', arrow: '↑', label: `${pct.toFixed(1)}%` }
  return { tone: 'neutral', arrow: '↓', label: `${pct.toFixed(1)}%` }
}

function statusScore(status: string): number {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'complete' || normalized === 'completed' || normalized === 'success') return 3
  if (normalized === 'running' || normalized === 'needs_input') return 2
  if (normalized === 'queued' || normalized === 'pending') return 1
  if (normalized === 'failed' || normalized === 'error' || normalized === 'cancelled') return 0
  return 1
}

function compareStatus(base: string, next: string): DeltaResult {
  if (base === next) return { tone: 'same', arrow: '=', label: 'Same' }
  const baseScore = statusScore(base)
  const nextScore = statusScore(next)
  if (nextScore > baseScore) return { tone: 'better', arrow: '↑', label: 'Improved' }
  if (nextScore < baseScore) return { tone: 'worse', arrow: '↓', label: 'Regressed' }
  return { tone: 'neutral', arrow: '↑', label: 'Changed' }
}

function deltaClassName(tone: DeltaTone): string {
  if (tone === 'better') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (tone === 'worse') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (tone === 'same') return 'border-primary-700 bg-primary-800/60 text-primary-300'
  return 'border-accent-500/30 bg-accent-500/10 text-accent-300'
}

function fmtCost(value: number): string {
  return `$${value.toFixed(2)}`
}

export function RunCompare({ runA, runB, onClose }: RunCompareProps) {
  const durationA = parseDurationToSeconds(runA.duration)
  const durationB = parseDurationToSeconds(runB.duration)

  const durationDelta: DeltaResult = durationA !== null && durationB !== null
    ? compareLowerIsBetter(durationA, durationB)
    : { tone: 'neutral', arrow: '=', label: 'N/A' }

  const tokenDelta = compareLowerIsBetter(runA.tokenCount, runB.tokenCount)
  const costDelta = compareLowerIsBetter(runA.costEstimate, runB.costEstimate)
  const agentDelta = compareCount(runA.agents.length, runB.agents.length)
  const statusDelta = compareStatus(runA.status, runB.status)

  return (
    <section className="w-full rounded-xl border border-primary-800 bg-primary-900 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-primary-100">Compare Runs</h3>
          <p className="text-xs text-primary-400">Run metrics side by side</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-primary-700 bg-primary-800 px-2 py-1 text-xs font-medium text-primary-200 transition-colors hover:border-accent-500 hover:text-accent-300"
          aria-label="Close compare view"
        >
          Close
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
            <div className="rounded-xl border border-primary-800 bg-primary-950 p-3">
              <p className="text-[11px] uppercase tracking-wide text-primary-400">Run A</p>
              <p className="truncate text-xs font-semibold text-primary-100">{runA.title}</p>
              <p className="truncate text-xs text-primary-300">{runA.id}</p>
            </div>
            <div />
            <div className="rounded-xl border border-primary-800 bg-primary-950 p-3">
              <p className="text-[11px] uppercase tracking-wide text-primary-400">Run B</p>
              <p className="truncate text-xs font-semibold text-primary-100">{runB.title}</p>
              <p className="truncate text-xs text-primary-300">{runB.id}</p>
            </div>
          </div>

          <MetricRow
            label="Duration"
            leftValue={runA.duration}
            rightValue={runB.duration}
            delta={durationDelta}
          />
          <MetricRow
            label="Token Count"
            leftValue={runA.tokenCount.toLocaleString()}
            rightValue={runB.tokenCount.toLocaleString()}
            delta={tokenDelta}
          />
          <MetricRow
            label="Cost"
            leftValue={fmtCost(runA.costEstimate)}
            rightValue={fmtCost(runB.costEstimate)}
            delta={costDelta}
          />
          <MetricRow
            label="Agent Count"
            leftValue={String(runA.agents.length)}
            rightValue={String(runB.agents.length)}
            delta={agentDelta}
          />
          <MetricRow
            label="Status"
            leftValue={runA.status}
            rightValue={runB.status}
            delta={statusDelta}
          />
        </div>
      </div>
    </section>
  )
}

function MetricRow({
  label,
  leftValue,
  rightValue,
  delta,
}: {
  label: string
  leftValue: string
  rightValue: string
  delta: DeltaResult
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="rounded-xl border border-primary-800 bg-primary-950 p-3">
        <p className="text-[11px] text-primary-400">{label}</p>
        <p className="text-xs font-medium text-primary-100">{leftValue}</p>
      </div>

      <div className={`min-w-[88px] rounded-lg border px-2 py-1 text-center text-xs font-semibold ${deltaClassName(delta.tone)}`}>
        <p>{delta.arrow}</p>
        <p>{delta.label}</p>
      </div>

      <div className="rounded-xl border border-primary-800 bg-primary-950 p-3">
        <p className="text-[11px] text-primary-400">{label}</p>
        <p className="text-xs font-medium text-primary-100">{rightValue}</p>
      </div>
    </div>
  )
}
