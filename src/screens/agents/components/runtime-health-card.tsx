import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

type RuntimeHealthSummary = {
  total: number
  active: number
  idleResumable: number
  attention: number
  unlinkedKanban: number
  recoverable: number
  unknownOwnership: number
  stale: number
}

type RuntimeHealthResponse = {
  ok?: boolean
  summary?: RuntimeHealthSummary
  generatedAt?: number
  error?: string
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function RuntimeHealthCard() {
  const [summary, setSummary] = useState<RuntimeHealthSummary | null>(null)
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/runtime-runs?size=1', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json() as RuntimeHealthResponse
        if (!response.ok || body.ok !== true || !body.summary) throw new Error('unavailable')
        setSummary(body.summary)
        setGeneratedAt(typeof body.generatedAt === 'number' ? body.generatedAt : null)
        setUnavailable(false)
      } catch (error) {
        if (controller.signal.aborted) return
        setUnavailable(true)
        setSummary(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  return (
    <section
      aria-labelledby="runtime-health-title"
      className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent)]">Execution readiness</p>
          <h2 id="runtime-health-title" className="mt-1 text-lg font-semibold text-[var(--theme-text)]">Runtime health</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            Provider-backed execution summary. Inventory discovery runs only when explicitly requested from Runs.
          </p>
        </div>
        <Button render={<Link to="/runs" />}>Open Runs</Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--theme-muted)]">Loading runtime health…</p>
      ) : unavailable || !summary ? (
        <div className="mt-4 rounded-2xl border border-[var(--theme-danger)]/30 bg-[var(--theme-danger-soft)] p-4">
          <p className="font-medium text-[var(--theme-danger)]">Runtime health unavailable</p>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">Open Runs for inventory diagnostics. No provider refresh was attempted.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" aria-label="Runtime health counts">
            {[
              { value: summary.active, label: countLabel(summary.active, 'active') },
              { value: summary.idleResumable, label: countLabel(summary.idleResumable, 'resumable') },
              { value: summary.attention, label: `${summary.attention} need attention` },
              { value: summary.unlinkedKanban, label: countLabel(summary.unlinkedKanban, 'unlinked') },
              { value: summary.recoverable, label: countLabel(summary.recoverable, 'recoverable') },
              { value: summary.unknownOwnership, label: `${summary.unknownOwnership} ownership unknown` },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-3">
                <p className="text-lg font-semibold text-[var(--theme-text)]">{item.value}</p>
                <p className="text-xs text-[var(--theme-muted)]">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--theme-muted)]">
            <span>{summary.total} total · {summary.stale} stale</span>
            <span>{generatedAt ? `Inventory read ${new Date(generatedAt).toLocaleString()}` : 'Inventory timestamp unavailable'}</span>
          </div>
        </>
      )}
    </section>
  )
}
