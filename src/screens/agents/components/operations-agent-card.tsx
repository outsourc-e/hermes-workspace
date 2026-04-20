import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight01Icon,
  Clock01Icon,
  PauseIcon,
  PlayIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { AgentProgress } from '@/components/agent-view/agent-progress'
import { PixelAvatar } from '@/components/agent-swarm/pixel-avatar'
import { Markdown } from '@/components/prompt-kit/markdown'
import { toast } from '@/components/ui/toast'
import { runCronJob, toggleCronJob } from '@/lib/cron-api'
import { cn } from '@/lib/utils'
import { useAgentChat, type OperationsChatMessage } from '../hooks/use-agent-chat'
import type { OperationsAgent } from '../hooks/use-operations'

function getStatusStyles(status: OperationsAgent['status']) {
  if (status === 'error') {
    return {
      dot: 'bg-red-500',
      ring: 'text-red-500',
      label: 'Error',
    }
  }

  if (status === 'active') {
    return {
      dot: 'bg-emerald-500',
      ring: 'text-emerald-500',
      label: 'Active',
    }
  }

  return {
    dot: 'bg-primary-300',
    ring: 'text-primary-300',
    label: 'Idle',
  }
}

function stripEmojiPrefix(value: string) {
  return value
    .replace(
      /^((\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(\u200D(\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*)\s*/u,
      '',
    )
    .trim()
}

function displayJobName(jobName: string, agentId: string) {
  const prefix = `ops:${agentId}:`
  if (jobName.startsWith(prefix)) {
    return jobName.slice(prefix.length).replace(/-/g, ' ')
  }
  return jobName
}

function describeJob(job: OperationsAgent['jobs'][number]) {
  return job.description?.trim() || job.schedule
}

export function OperationsInlineChat({
  agentName,
  messages,
  sendMessage,
  isSending,
  error,
}: {
  agentName: string
  messages: OperationsChatMessage[]
  sendMessage: (message: string) => Promise<unknown>
  isSending: boolean
  error: string | null
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const renderedMessages = useMemo(() => messages.slice(-50), [messages])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [renderedMessages])

  async function handleSend() {
    const message = draft.trim()
    if (!message || isSending) return
    await sendMessage(message)
    setDraft('')
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[1.25rem] border border-[var(--theme-border)] bg-[var(--theme-card)]">
      <div
        ref={scrollRef}
        className="flex min-h-[100px] max-h-[160px] flex-1 flex-col justify-center overflow-y-auto px-3 py-3"
      >
        {renderedMessages.length > 0 ? (
          <div className="space-y-2">
            {renderedMessages.map((message) => {
              const isUser = message.role === 'user'

              return (
                <div
                  key={message.id}
                  className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm',
                      isUser
                        ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
                        : 'bg-[var(--theme-card2)] text-[var(--theme-text)]',
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <Markdown>{message.content}</Markdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-center text-xs text-[var(--theme-muted)]">
            Send a message...
          </p>
        )}
      </div>

      <div className="border-t border-[var(--theme-border)] px-3 py-3">
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <div className="flex items-center gap-2 rounded-[1rem] border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder={`Message ${stripEmojiPrefix(agentName)}...`}
            className="h-8 flex-1 bg-transparent px-1.5 text-xs text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)]"
          />
          <Button
            size="icon-sm"
            className="rounded-lg bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || isSending}
            aria-label={isSending ? 'Sending message' : 'Send message'}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      </div>
    </section>
  )
}

export function OperationsAgentCard({
  agent,
  onOpenSettings,
}: {
  agent: OperationsAgent
  onOpenSettings: (agentId: string) => void
}) {
  const queryClient = useQueryClient()
  const status = getStatusStyles(agent.status)
  const displayName = stripEmojiPrefix(agent.name)
  const [showCronPanel, setShowCronPanel] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const { messages, sendMessage, isSending, error } = useAgentChat(agent.sessionKey)
  const cronJobCount = agent.jobs.length
  const isActive = agent.status === 'active' && !isPaused

  const toggleMutation = useMutation({
    mutationFn: async (payload: { jobId: string; enabled: boolean }) =>
      toggleCronJob(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations', 'cron'] })
    },
    onError: (mutationError) => {
      toast(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to update cron job',
        { type: 'error' },
      )
    },
  })

  const runCronMutation = useMutation({
    mutationFn: async (jobId: string) => runCronJob(jobId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operations', 'cron'] })
      toast('Cron job started', { type: 'success' })
    },
    onError: (mutationError) => {
      toast(
        mutationError instanceof Error ? mutationError.message : 'Failed to run cron job',
        { type: 'error' },
      )
    },
  })

  async function handlePlayPause() {
    if (isActive) {
      setIsPaused(true)
      return
    }

    setIsPaused(false)
    await sendMessage('Run your primary task now')
  }

  return (
    <article className="flex min-h-[19rem] flex-col rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 shadow-[0_20px_60px_color-mix(in_srgb,var(--theme-shadow)_14%,transparent)]">
      <div className="relative flex min-h-8 items-center">
        <div className="absolute left-0 flex items-center">
          <button
            type="button"
            aria-label={
              cronJobCount > 0
                ? `${cronJobCount} cron jobs for ${displayName}`
                : `No cron jobs for ${displayName}`
            }
            onClick={() => setShowCronPanel((value) => !value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]',
              showCronPanel && 'bg-[var(--theme-bg)] text-[var(--theme-text)]',
            )}
          >
            <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.9} />
            {cronJobCount > 0 ? (
              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--theme-bg)] px-1.5 text-[10px] font-medium text-[var(--theme-text)]">
                {cronJobCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="flex w-full justify-center px-20">
          <h3 className="min-w-0 text-center text-sm font-semibold text-[var(--theme-text)]">
          <span className="inline-flex max-w-full items-center justify-center gap-2">
            <span className="truncate">{displayName}</span>
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                agent.status === 'active' && !isPaused && 'animate-pulse',
                status.dot,
              )}
              aria-label={status.label}
              title={status.label}
            />
          </span>
          </h3>
        </div>

        <div className="absolute right-0 flex items-center gap-1">
          <button
            type="button"
            aria-label={isActive ? `Pause ${displayName}` : `Run ${displayName} now`}
            onClick={() => void handlePlayPause()}
            disabled={isSending && !isActive}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HugeiconsIcon
              icon={isActive ? PauseIcon : PlayIcon}
              size={16}
              strokeWidth={1.8}
            />
          </button>

          <button
            type="button"
            aria-label={`Open settings for ${displayName}`}
            onClick={() => onOpenSettings(agent.id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
          >
            <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 px-2 py-2 text-center">
        <div className="relative flex size-12 shrink-0 items-center justify-center">
          <AgentProgress
            value={agent.progressValue}
            status={agent.progressStatus}
            size={48}
            strokeWidth={2.5}
            className={status.ring}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <PixelAvatar
              size={40}
              color={agent.meta.color}
              accentColor="#ffffff"
              status={
                agent.status === 'error'
                  ? 'failed'
                  : agent.status === 'active'
                    ? 'running'
                    : 'idle'
              }
            />
          </div>
        </div>

        <p className="w-full truncate text-[11px] text-[var(--theme-muted)]">
          {agent.meta.description || 'No description'}
        </p>
        <p className="w-full truncate text-[10px] text-[var(--theme-muted)]/80">
          {agent.jobs.length > 0 ? `${agent.jobs.length} scheduled job${agent.jobs.length === 1 ? '' : 's'}` : 'Manual only'}
        </p>
      </div>

      <AnimatePresence initial={false}>
        {showCronPanel ? (
          <motion.section
            key="cron-panel"
            initial={{ height: 0, opacity: 0, y: -8 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mb-4 rounded-[1.25rem] border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-3">
              {agent.jobs.length > 0 ? (
                <>
                  <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                    {agent.jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-2"
                      >
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={job.enabled}
                            onChange={() =>
                              toggleMutation.mutate({
                                jobId: job.id,
                                enabled: !job.enabled,
                              })
                            }
                            className="peer sr-only"
                            aria-label={job.enabled ? 'Disable job' : 'Enable job'}
                          />
                          <span className="h-5 w-9 rounded-full bg-primary-200 transition-colors peer-checked:bg-[var(--theme-accent)]" />
                          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--theme-card)] shadow-sm transition-transform peer-checked:translate-x-4" />
                        </label>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-[var(--theme-text)]">
                            {displayJobName(job.name, agent.id)}
                          </p>
                          <p className="truncate text-[11px] text-[var(--theme-muted)]">
                            {describeJob(job)}
                          </p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="h-7 w-7 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                          onClick={() => runCronMutation.mutate(job.id)}
                          aria-label={`Run ${displayJobName(job.name, agent.id)} now`}
                        >
                          <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.9} />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      render={<a href="/cron" />}
                      variant="secondary"
                      className="h-8 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 text-xs font-medium text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                    >
                      + Add Job
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[var(--theme-muted)]">
                    No scheduled jobs
                  </p>
                  <Button
                    render={<a href="/cron" />}
                    variant="secondary"
                    className="h-8 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 text-xs font-medium text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                  >
                    + Add Job
                  </Button>
                </div>
              )}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <div className="min-h-0 flex-1">
        <OperationsInlineChat
          agentName={agent.name}
          messages={messages}
          sendMessage={sendMessage}
          isSending={isSending}
          error={error}
        />
      </div>
    </article>
  )
}
