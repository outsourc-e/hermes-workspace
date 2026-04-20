import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'

export type RunLearningsProps = {
  runId: string
  runTitle: string
  learnings: Array<{
    id: string
    category: 'success' | 'failure' | 'optimization'
    text: string
    createdAt: number
  }>
  onAddLearning: (learning: {
    category: 'success' | 'failure' | 'optimization'
    text: string
  }) => void
  onClose: () => void
}

type LearningCategory = RunLearningsProps['learnings'][number]['category']
type CategoryFilter = 'all' | LearningCategory

const FILTER_OPTIONS: Array<{ key: CategoryFilter; label: string; className?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'success', label: 'Success', className: 'border-emerald-700/60 bg-emerald-900/30 text-emerald-300' },
  { key: 'failure', label: 'Failure', className: 'border-red-700/60 bg-red-900/30 text-red-300' },
  { key: 'optimization', label: 'Optimization', className: 'border-sky-700/60 bg-sky-900/30 text-sky-300' },
]

function relativeTime(ts: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function categoryBadgeClass(category: LearningCategory): string {
  if (category === 'success') return 'border-emerald-700/60 bg-emerald-900/30 text-emerald-300'
  if (category === 'failure') return 'border-red-700/60 bg-red-900/30 text-red-300'
  return 'border-sky-700/60 bg-sky-900/30 text-sky-300'
}

function categoryLabel(category: LearningCategory): string {
  if (category === 'success') return 'Success'
  if (category === 'failure') return 'Failure'
  return 'Optimization'
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

export function RunLearnings({ runId, runTitle, learnings, onAddLearning, onClose }: RunLearningsProps) {
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all')
  const [draftCategory, setDraftCategory] = useState<LearningCategory>('success')
  const [draftText, setDraftText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const filteredLearnings = useMemo(() => {
    const sorted = [...learnings].sort((a, b) => b.createdAt - a.createdAt)
    if (activeFilter === 'all') return sorted
    return sorted.filter((learning) => learning.category === activeFilter)
  }, [activeFilter, learnings])

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const text = draftText.trim()
      if (!text) return
      onAddLearning({ category: draftCategory, text })
      setDraftText('')
    },
    [draftCategory, draftText, onAddLearning],
  )

  const handleCopy = useCallback(async (id: string, text: string) => {
    await copyText(text)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
  }, [])

  return (
    <section
      data-run-id={runId}
      className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-primary-800 bg-primary-950"
    >
      <header className="flex items-center justify-between border-b border-primary-800 px-4 py-3">
        <h2 className="truncate pr-3 text-sm font-semibold text-primary-100">
          📝 Learnings from: {runTitle}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-primary-700 px-2.5 py-1 text-xs font-medium text-primary-300 transition-colors hover:bg-primary-900 hover:text-primary-100"
        >
          Close
        </button>
      </header>

      <div className="border-b border-primary-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setActiveFilter(option.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                activeFilter === option.key
                  ? option.className ?? 'border-accent-500 bg-accent-500/15 text-accent-300'
                  : 'border-primary-700 bg-primary-900 text-primary-300 hover:border-primary-700 hover:bg-primary-800 hover:text-primary-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {filteredLearnings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary-800 bg-primary-900/60 px-4 py-8 text-center text-sm text-primary-300">
            No learnings yet for this filter.
          </div>
        ) : (
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {filteredLearnings.map((learning) => (
                <motion.li
                  key={learning.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-xl border border-primary-800 bg-primary-900/50 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            categoryBadgeClass(learning.category),
                          )}
                        >
                          {categoryLabel(learning.category)}
                        </span>
                        <span className="text-[11px] text-primary-400">
                          {relativeTime(learning.createdAt, now)}
                        </span>
                      </div>
                      <p className="text-sm text-primary-100">{learning.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy(learning.id, learning.text)}
                      className="shrink-0 rounded-lg border border-primary-700 px-2 py-1 text-[11px] font-medium text-primary-300 transition-colors hover:bg-primary-800 hover:text-primary-100"
                    >
                      {copiedId === learning.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-primary-800 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="learning-category">
            Category
          </label>
          <select
            id="learning-category"
            value={draftCategory}
            onChange={(event) => setDraftCategory(event.target.value as LearningCategory)}
            className="h-10 rounded-lg border border-primary-700 bg-primary-900 px-3 text-sm text-primary-100 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="optimization">Optimization</option>
          </select>

          <label className="sr-only" htmlFor="learning-text">
            Learning text
          </label>
          <input
            id="learning-text"
            type="text"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder="Add a reusable learning..."
            className="h-10 min-w-0 flex-1 rounded-lg border border-primary-700 bg-primary-900 px-3 text-sm text-primary-100 placeholder:text-primary-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />

          <button
            type="submit"
            disabled={!draftText.trim()}
            className="h-10 rounded-lg bg-accent-500 px-4 text-sm font-semibold text-primary-950 transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Learning
          </button>
        </div>
      </form>
    </section>
  )
}
