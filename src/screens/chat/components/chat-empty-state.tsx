import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  CodeIcon,
  Edit02Icon,
  PuzzleIcon,
} from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'

type SuggestionChip = {
  label: string
  prompt: string
  icon: unknown
}

const SUGGESTIONS: SuggestionChip[] = [
  {
    label: 'Inspect this repo',
    prompt: 'Inspect this repo and tell me how it is structured.',
    icon: CodeIcon,
  },
  {
    label: 'Draft a plan',
    prompt: 'Draft a plan for the work I need to do next.',
    icon: Edit02Icon,
  },
  {
    label: 'Search memory',
    prompt: 'Search memory for relevant prior context about this workspace.',
    icon: BrainIcon,
  },
  {
    label: 'Browse skills',
    prompt: 'Browse the available skills and suggest the best one for this task.',
    icon: PuzzleIcon,
  },
]

type ChatEmptyStateProps = {
  onSuggestionClick?: (prompt: string) => void
  compact?: boolean
}

export function ChatEmptyState({
  onSuggestionClick,
  compact = false,
}: ChatEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex h-full flex-col items-center justify-center px-4 py-8"
    >
      <div className="flex max-w-xl flex-col items-center text-center">
        <OpenClawStudioIcon className="mb-4 size-12 overflow-hidden rounded-xl opacity-80" />
        <h2 className="text-lg font-semibold text-[var(--theme-text)]">
          Hermes Workspace
        </h2>
        {!compact ? (
          <>
            <p className="mt-2 text-sm text-[var(--theme-muted)]">
              Research, build, and operate in one thread.
            </p>
            <p className="mt-2 text-xs text-[var(--theme-muted)] opacity-60">
              Sessions, tools, memory, skills, and files are all live.
            </p>
          </>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]"
            >
              <HugeiconsIcon
                icon={suggestion.icon as any}
                size={14}
                strokeWidth={1.5}
                className="text-[var(--theme-muted)]"
              />
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
