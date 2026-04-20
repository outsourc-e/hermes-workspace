import { useMemo, useState } from 'react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  Link01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/prompt-kit/markdown'
import { toast } from '@/components/ui/toast'
import { runCronJob } from '@/lib/cron-api'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/screens/dashboard/lib/formatters'
import {
  useAgentOutputs,
  type AgentOutput,
  type AgentOutputFilter,
} from '@/hooks/use-agent-outputs'

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null
  if (durationMs < 1000) return `${durationMs}ms`
  return `${Math.round(durationMs / 100) / 10}s`
}

function getStatusPill(output: AgentOutput) {
  if (output.status === 'ok') {
    return {
      label: output.statusLabel || 'Success',
      icon: '✅',
      className: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/20',
    }
  }

  if (output.status === 'error') {
    if (output.failureKind === 'delivery') {
      return {
        label: output.statusLabel || 'Delivery Failed',
        icon: '📬',
        className: 'bg-sky-500/12 text-sky-700 border-sky-500/20',
      }
    }
    if (output.failureKind === 'config') {
      return {
        label: output.statusLabel || 'Config Failed',
        icon: '⚙️',
        className: 'bg-violet-500/12 text-violet-700 border-violet-500/20',
      }
    }
    if (output.failureKind === 'approval') {
      return {
        label: output.statusLabel || 'Needs Approval',
        icon: '✋',
        className: 'bg-amber-500/12 text-amber-700 border-amber-500/20',
      }
    }
    if (output.failureKind === 'runtime') {
      return {
        label: output.statusLabel || 'Model/Runtime Failed',
        icon: '🧠',
        className: 'bg-rose-500/12 text-rose-700 border-rose-500/20',
      }
    }
    return {
      label: output.statusLabel || 'Error',
      icon: '❌',
      className: 'bg-rose-500/12 text-rose-700 border-rose-500/20',
    }
  }

  if (output.status === 'running') {
    return {
      label: output.statusLabel || 'Running',
      icon: '⏳',
      className: 'bg-amber-500/12 text-amber-700 border-amber-500/20',
    }
  }

  return {
    label: output.statusLabel || 'Unknown',
    icon: '•',
    className: 'bg-primary-200/80 text-primary-700 border-primary-300',
  }
}

function extractSageTweet(text: string) {
  const match = text.match(/\*\*Draft tweet\*\*[\s\S]*?\n([\s\S]*?)(?:\n\*\*|$)/i)
  return match?.[1]?.trim() || ''
}

function extractSagePrompt(text: string) {
  const match = text.match(/\*\*ChatGPT image prompt\*\*[\s\S]*?\n([\s\S]*?)(?:\n\*\*|$)/i)
  return match?.[1]?.trim() || ''
}

function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s)]+/i)
  return match?.[0] || ''
}

function FilterPill({
  active,
  label,
  emoji,
  onClick,
}: {
  active: boolean
  label: string
  emoji?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-[var(--theme-accent)] text-primary-950'
          : 'border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)]',
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {emoji ? <span>{emoji}</span> : null}
        <span>{label}</span>
      </span>
    </button>
  )
}

function OutputCard({ output }: { output: AgentOutput }) {
  const [expanded, setExpanded] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const status = getStatusPill(output)
  const relativeTime = formatRelativeTime(output.timestamp)
  const duration = formatDuration(output.durationMs)
  const sageTweet = useMemo(() => extractSageTweet(output.fullOutput), [output.fullOutput])
  const sagePrompt = useMemo(() => extractSagePrompt(output.fullOutput), [output.fullOutput])
  const sourceUrl = useMemo(() => extractFirstUrl(output.fullOutput), [output.fullOutput])

  async function copyText(value: string, label: string) {
    if (!value.trim()) {
      toast(`No ${label.toLowerCase()} found`, { type: 'warning' })
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      toast(`${label} copied`, { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : `Failed to copy ${label.toLowerCase()}`, {
        type: 'error',
      })
    }
  }

  async function handleRetry() {
    setIsRetrying(true)
    try {
      if (!output.jobId) throw new Error('No job ID associated with this output')
      await runCronJob(output.jobId)
      toast('Cron job started', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to retry cron job', {
        type: 'error',
      })
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_20px_60px_color-mix(in_srgb,var(--theme-shadow)_12%,transparent)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--theme-text)]">
            <span className="text-xl leading-none">{output.agentEmoji}</span>
            <h3 className="text-base font-semibold">{output.agentName}</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--theme-muted)]">{output.jobName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)] sm:justify-end">
          <span>{relativeTime}</span>
          <span>·</span>
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium', status.className)}>
            <span className={cn(output.status === 'running' && 'animate-pulse')}>{status.icon}</span>
            <span>{status.label}</span>
          </span>
          {duration ? <span>· {duration}</span> : null}
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-[var(--theme-text)]">
        <div className="rounded-[1.1rem] border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
            Summary
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--theme-text)]">{output.summary}</p>
          {output.model || output.sessionKey || output.chatSessionKey ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--theme-muted)]">
              {output.model ? <span>Model: {output.model}</span> : null}
              {output.sessionKey ? <span>Session: {output.sessionKey}</span> : null}
              {output.chatSessionKey && output.chatSessionKey !== output.sessionKey ? (
                <span>Chat: {output.chatSessionKey}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[1.1rem] border border-[var(--theme-border)] bg-[var(--theme-card)]/75 px-4 py-3">
          <div className={cn('relative', !expanded && 'max-h-[8.5rem] overflow-hidden')}>
            <Markdown>{output.fullOutput}</Markdown>
            {!expanded ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-white to-transparent" />
            ) : null}
          </div>
        </div>

        {output.error ? (
          <p
            className={cn(
              'rounded-xl border px-3 py-2 text-sm',
              output.failureKind === 'delivery'
                ? 'border-sky-500/25 bg-sky-500/8 text-sky-700'
                : output.failureKind === 'config'
                  ? 'border-violet-500/25 bg-violet-500/8 text-violet-700'
                  : output.failureKind === 'approval'
                    ? 'border-amber-500/25 bg-amber-500/8 text-amber-700'
                    : 'border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] text-[var(--theme-danger)]',
            )}
          >
            {output.failureKind === 'delivery'
              ? `Delivery issue: ${output.error}`
              : output.failureKind === 'config'
                ? `Config issue: ${output.error}`
                : output.failureKind === 'approval'
                  ? `Approval needed: ${output.error}`
                  : output.failureKind === 'runtime'
                    ? `Runtime issue: ${output.error}`
                    : `Error: ${output.error}`}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
          onClick={() => void copyText(output.fullOutput, 'Output')}
        >
          <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.8} />
          Copy
        </Button>

        {output.agentId === 'sage' && sageTweet ? (
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => void copyText(sageTweet, 'Tweet')}
          >
            Copy Tweet
          </Button>
        ) : null}

        {output.agentId === 'sage' && sagePrompt ? (
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => void copyText(sagePrompt, 'Image prompt')}
          >
            Copy Image Prompt
          </Button>
        ) : null}

        {sourceUrl ? (
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}
          >
            <HugeiconsIcon icon={Link01Icon} size={16} strokeWidth={1.8} />
            Link
          </Button>
        ) : null}

        {output.agentId === 'trader' ? (
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => toast('Signals view coming soon', { type: 'info' })}
          >
            View Signals
          </Button>
        ) : null}

        {output.status === 'error' ? (
          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => void handleRetry()}
            disabled={isRetrying}
          >
            {isRetrying ? 'Retrying…' : 'Retry'}
          </Button>
        ) : null}

        <Button
          variant="secondary"
          className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
          onClick={() => setExpanded((value) => !value)}
        >
          <HugeiconsIcon
            icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
            size={16}
            strokeWidth={1.8}
          />
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>
    </motion.article>
  )
}

export function FullOutputsView() {
  const [filter, setFilter] = useState<AgentOutputFilter>('all')
  const { outputs, availableFilters, loading, error, refresh } = useAgentOutputs(filter)

  if (loading) {
    return (
      <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-6 py-14 text-center text-sm text-[var(--theme-muted)] shadow-[0_24px_80px_var(--theme-shadow)]">
        Loading outputs…
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-6 py-14 text-center text-sm text-[var(--theme-text)] shadow-[0_24px_80px_var(--theme-shadow)]">
        {error}
      </section>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-[0_24px_80px_var(--theme-shadow)] md:p-5"
    >
      <div className="rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)]/90 p-3 backdrop-blur-sm md:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {availableFilters.map((item) => (
              <FilterPill
                key={item.id}
                active={filter === item.id}
                label={item.label}
                emoji={item.emoji}
                onClick={() => setFilter(item.id)}
              />
            ))}
          </div>

          <Button
            variant="secondary"
            className="border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
            onClick={() => void refresh()}
          >
            <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.8} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <div>
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">Outputs</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            {outputs.length} recent {outputs.length === 1 ? 'run' : 'runs'} across the team
          </p>
        </div>
      </div>

      <div className="mt-4">
        {outputs.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-12 text-center text-sm text-[var(--theme-muted)]">
            No agent outputs yet. Configure cron jobs in agent settings to get started.
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-4">
              {outputs.map((output) => (
                <OutputCard key={output.id} output={output} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  )
}
