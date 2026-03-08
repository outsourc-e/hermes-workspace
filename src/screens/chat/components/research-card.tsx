import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { ResearchStep } from '@/hooks/use-research-card'

type ResearchCardProps = {
  steps: ResearchStep[]
  isActive: boolean
  totalDurationMs: number
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function getStepIcon(step: ResearchStep): string {
  if (step.status === 'error') return '❌'
  if (step.status === 'done') return '✅'
  return '🔄'
}

function getStepMeta(step: ResearchStep): string {
  if (step.status === 'running') return 'Running'
  if (step.status === 'error') return 'Failed'
  return step.durationMs != null ? formatDuration(step.durationMs) : 'Done'
}

export function ResearchCard({
  steps,
  isActive,
  totalDurationMs,
}: ResearchCardProps) {
  if (steps.length === 0) return null

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="research-card-body"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="overflow-hidden border-t border-primary-200/80 dark:border-neutral-800"
      >
        <div className="space-y-3 px-4 py-3">
          {steps.map((step, index) => (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full bg-white text-sm shadow-sm dark:bg-neutral-800',
                    step.status === 'running' && 'animate-spin',
                  )}
                  aria-hidden="true"
                >
                  {getStepIcon(step)}
                </span>
                {index < steps.length - 1 ? (
                  <span className="mt-1 h-full w-px bg-primary-200 dark:bg-neutral-700" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-primary-900 dark:text-neutral-100">
                    {step.label}
                  </p>
                  <span className="shrink-0 text-[11px] text-primary-500 dark:text-neutral-400">
                    {getStepMeta(step)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-mono text-primary-400 dark:text-neutral-500">
                  {step.toolName}
                </p>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-primary-200/80 pt-3 text-xs dark:border-neutral-800">
            <span className="text-primary-500 dark:text-neutral-400">
              {steps.length} tools · {formatDuration(totalDurationMs)}
            </span>
            <span className="font-semibold text-primary-800 dark:text-neutral-200">
              {isActive ? 'In progress' : 'Done ✓'}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
