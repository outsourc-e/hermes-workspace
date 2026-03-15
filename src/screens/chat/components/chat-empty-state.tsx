import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  CodeIcon,
  PuzzleIcon,
} from '@hugeicons/core-free-icons'
import { motion } from 'motion/react'


type SuggestionChip = {
  label: string
  prompt: string
  icon: unknown
}

const SUGGESTIONS: SuggestionChip[] = [
  {
    label: 'Analyze workspace',
    prompt: 'Analyze this workspace structure and give me 3 engineering risks. Use tools and keep it concise.',
    icon: CodeIcon,
  },
  {
    label: 'Save a preference',
    prompt: 'Save this to memory exactly: "For demos, respond in 3 bullets max and put risk first." Then confirm saved.',
    icon: BrainIcon,
  },
  {
    label: 'Create a file',
    prompt: 'Create demo-checklist.md with 5 launch checks for this app.',
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
        {/* Avatar with accent glow */}
        <div className="relative mb-5">
          <div
            className="absolute inset-0 rounded-2xl blur-2xl opacity-35"
            style={{ background: 'var(--theme-accent)', transform: 'scale(1.6)' }}
          />
          <img
            src="/hermes-avatar.webp"
            alt="Hermes"
            className="relative size-20 rounded-2xl"
            style={{ boxShadow: '0 8px 32px color-mix(in srgb, var(--theme-accent) 30%, transparent)' }}
          />
        </div>

        {/* Title + value prop */}
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: 'var(--theme-text)' }}
        >
          Hermes Workspace
        </h2>

        {!compact && (
          <>
            <p className="mt-2 text-sm" style={{ color: 'var(--theme-muted)' }}>
              Agent chat · live tools · memory · full observability
            </p>


          </>
        )}

        {/* Prompt chips */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all hover:scale-[1.02]"
              style={{
                background: 'var(--theme-card)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--theme-card2)'
                e.currentTarget.style.borderColor = 'var(--theme-accent-border)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--theme-card)'
                e.currentTarget.style.borderColor = 'var(--theme-border)'
              }}
            >
              <HugeiconsIcon
                icon={suggestion.icon as any}
                size={14}
                strokeWidth={1.5}
                style={{ color: 'var(--theme-accent)' }}
              />
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
