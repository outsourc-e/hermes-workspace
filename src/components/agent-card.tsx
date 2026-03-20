import { Cancel01Icon, CheckmarkCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type AgentCardStatus = 'running' | 'completed' | 'failed'

type AgentCardProps = {
  sessionLabel: string
  model: string
  status: AgentCardStatus
  runtimeSeconds?: number
  runtimeLabel?: string
  tokenCount?: number | null
  footer?: ReactNode
  className?: string
}

type ProviderAvatar = {
  letter: 'C' | 'G' | 'Q' | 'M' | 'O'
  backgroundColor: string
}

function detectProviderAvatar(model: string): ProviderAvatar {
  const value = model.trim().toLowerCase()

  if (
    value.includes('claude') ||
    value.includes('anthropic') ||
    value.includes('sonnet') ||
    value.includes('opus')
  ) {
    return { letter: 'C', backgroundColor: '#7c3aed' }
  }
  if (
    value.includes('gpt') ||
    value.includes('codex') ||
    value.includes('openai')
  ) {
    return { letter: 'G', backgroundColor: '#10b981' }
  }
  if (value.includes('qwen')) {
    return { letter: 'Q', backgroundColor: '#3b82f6' }
  }
  if (value.includes('minimax')) {
    return { letter: 'M', backgroundColor: '#f97316' }
  }
  return { letter: 'O', backgroundColor: '#6b7280' }
}

function formatRuntimeCompact(runtimeSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(runtimeSeconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatTokenBadge(tokenCount: number): string {
  if (tokenCount >= 1000) {
    const compact = Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(tokenCount)
    return `${compact} tok`
  }
  return `${tokenCount} tok`
}

function StatusIndicator({ status }: { status: AgentCardStatus }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-300">
        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={1.8} />
        <span className="text-[11px] font-medium text-emerald-300">Done</span>
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-red-300">
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
        <span className="text-[11px] font-medium text-red-300">Failed</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-[11px] font-medium text-emerald-300">Running</span>
    </span>
  )
}

export function AgentCard({
  sessionLabel,
  model,
  status,
  runtimeSeconds,
  runtimeLabel,
  tokenCount,
  footer,
  className,
}: AgentCardProps) {
  const avatar = detectProviderAvatar(model)
  const resolvedRuntime =
    runtimeLabel ?? (typeof runtimeSeconds === 'number' ? formatRuntimeCompact(runtimeSeconds) : '')
  const hasTokens = typeof tokenCount === 'number' && Number.isFinite(tokenCount) && tokenCount > 0

  return (
    <div
      className={cn(
        'rounded-xl border border-primary-300/70 bg-primary-100/95 p-3 shadow-sm',
        'dark:border-primary-800 dark:bg-primary-950/80',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: avatar.backgroundColor }}
          aria-hidden="true"
        >
          {avatar.letter}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary-950 dark:text-primary-100">
            {sessionLabel}
          </p>
          <p className="truncate text-xs text-primary-600 dark:text-primary-400">
            {model}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusIndicator status={status} />
            {hasTokens ? (
              <span className="rounded-full border border-primary-300/70 bg-primary-200/70 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-900 dark:text-primary-300">
                {formatTokenBadge(tokenCount)}
              </span>
            ) : null}
          </div>
        </div>

        {resolvedRuntime ? (
          <span className="shrink-0 text-xs text-primary-500 dark:text-primary-400 tabular-nums">
            {resolvedRuntime}
          </span>
        ) : null}
      </div>

      {footer ? (
        <div className="mt-2 border-t border-primary-300/60 pt-2 dark:border-primary-800">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
