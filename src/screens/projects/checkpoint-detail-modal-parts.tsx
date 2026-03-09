import {
  ArrowDown01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

export function formatDuration(startedAt: string | null, completedAt: string | null, createdAt: string) {
  const start = startedAt ? new Date(startedAt) : new Date(createdAt)
  const end = completedAt ? new Date(completedAt) : new Date(createdAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Unavailable'
  const ms = Math.max(0, end.getTime() - start.getTime())
  if (ms < 1_000) return '<1s'
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`
}

export function formatTokens(input: number | null, output: number | null) {
  const total = (input ?? 0) + (output ?? 0)
  return total > 0 ? new Intl.NumberFormat().format(total) : 'Unavailable'
}

export function formatCost(costCents: number | null) {
  if (costCents === null || !Number.isFinite(costCents)) return 'Unavailable'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
    costCents / 100,
  )
}

export function getStatusTone(status: string) {
  if (status === 'approved') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'revised') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (status === 'rejected') return 'border-red-500/30 bg-red-500/10 text-red-300'
  return 'border-primary-700 bg-primary-800/80 text-primary-300'
}

export function getDiffLineClass(line: string) {
  if (line.startsWith('+')) return 'text-emerald-300'
  if (line.startsWith('-')) return 'text-red-300'
  if (line.startsWith('@@')) return 'text-accent-300'
  return 'text-primary-300'
}

export function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-primary-200 bg-white px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-primary-500">{label}</p>
      <p className="mt-1 text-sm text-primary-900">{value}</p>
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-primary-900">{title}</h3>
        <p className="text-xs text-primary-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function FileDiffCard({
  path,
  additions,
  deletions,
  patch,
  expanded,
  onToggle,
}: {
  path: string
  additions: number | null
  deletions: number | null
  patch: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-primary-900">{path}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-primary-500">
            {additions !== null || deletions !== null ? (
              <>
                <span className="text-emerald-300">+{additions ?? 0}</span>
                <span className="text-red-300">-{deletions ?? 0}</span>
              </>
            ) : null}
            <span>{patch ? 'Diff available' : 'Diff unavailable'}</span>
          </div>
        </div>
        <HugeiconsIcon
          icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
          size={16}
          strokeWidth={1.8}
          className="shrink-0 text-primary-500"
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary-200 px-4 py-4">
              {patch ? (
                <pre className="overflow-x-auto rounded-xl border border-primary-200 bg-white p-3 font-mono text-xs leading-5">
                  {patch.split('\n').map((line, index) => (
                    <div key={`${path}:${index}`} className={getDiffLineClass(line)}>
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              ) : (
                <p className="text-sm text-primary-500">
                  No diff content was available for this file.
                </p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
