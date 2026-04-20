import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/prompt-kit/markdown'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/screens/dashboard/lib/formatters'
import { useAgentChat } from '../hooks/use-agent-chat'

export function OperationsAgentChat({
  agentId,
  agentName,
}: {
  agentId: string
  agentName: string
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { messages, sendMessage, isRefreshing, isSending, error, refresh } =
    useAgentChat(`agent:main:ops-${agentId}`)

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
    <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_20px_70px_color-mix(in_srgb,var(--theme-shadow)_14%,transparent)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--theme-text)]">Chat</h3>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            Persistent session with {agentName}
          </p>
        </div>
        <Button
          variant="secondary"
          className="border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
          onClick={() => void refresh()}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={16}
            strokeWidth={1.8}
            className={cn(isRefreshing && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4"
      >
        {renderedMessages.length > 0 ? (
          renderedMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-2xl border px-4 py-3 text-sm shadow-sm',
                message.role === 'user'
                  ? 'ml-auto max-w-[90%] border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
                  : 'max-w-[95%] border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)]',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                <span>{message.role}</span>
                {message.timestamp ? (
                  <span>{formatRelativeTime(message.timestamp)}</span>
                ) : null}
              </div>
              {message.role === 'assistant' ? (
                <Markdown>{message.content}</Markdown>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--theme-muted)]">
            No messages yet. Start the conversation with this agent.
          </p>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : null}

      <div className="mt-4 flex items-end gap-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleSend()
            }
          }}
          placeholder="Type a message..."
          className="min-h-[112px] flex-1 resize-y rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)]"
        />
        <Button
          className="bg-[var(--theme-accent)] text-primary-950 hover:bg-[var(--theme-accent-strong)]"
          onClick={() => void handleSend()}
          disabled={!draft.trim() || isSending}
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={1.8} />
          {isSending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </section>
  )
}
