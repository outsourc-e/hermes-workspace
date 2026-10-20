import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  SentIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import type { ExternalConversationMessage } from '@/lib/external-harness-api'
import {
  fetchExternalConversation,
  fetchExternalMessages,
  sendExternalMessage,
} from '@/lib/external-harness-api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function messageText(message: ExternalConversationMessage): string {
  const { content } = message
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const row = part as Record<string, unknown>
          if (typeof row.text === 'string') return row.text
          if (typeof row.content === 'string') return row.content
          if (typeof row.message === 'string') return row.message
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    const row = content as Record<string, unknown>
    if (typeof row.content === 'string') return row.content
    if (typeof row.text === 'string') return row.text
    if (typeof row.message === 'string') return row.message
  }
  if (content == null) return ''
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

export function ExternalHarnessChatScreen({
  conversationId,
}: {
  conversationId: string
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()
  const conversationQuery = useQuery({
    queryKey: ['external-conversation', conversationId],
    queryFn: () => fetchExternalConversation(conversationId),
    refetchInterval: 2_000,
  })
  const messagesQuery = useQuery({
    queryKey: ['external-conversation-messages', conversationId],
    queryFn: () => fetchExternalMessages(conversationId),
    refetchInterval: 2_000,
  })
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      sendExternalMessage(conversationId, content),
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['external-conversation-messages', conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['external-conversation', conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['external-conversations'],
        }),
      ])
    },
  })

  const visibleMessages = useMemo(
    () =>
      (messagesQuery.data ?? []).filter((message) => {
        const text = messageText(message)
        return (
          text || message.type === 'tool_call' || message.type === 'thinking'
        )
      }),
    [messagesQuery.data],
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [visibleMessages.length, conversationQuery.data?.runtime?.isProcessing])

  const conversation = conversationQuery.data
  const processing = conversation?.runtime?.isProcessing === true
  const canSend = conversation?.runtime?.canSendMessage !== false

  function submit() {
    const content = draft.trim()
    if (!content || sendMutation.isPending || !canSend) return
    sendMutation.mutate(content)
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-surface text-primary-900">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-primary-200 bg-primary-50/80 px-3 md:px-5">
        <Link
          to={conversation?.runtimeId ? '/chat/harness/$runtimeId' : '/chat'}
          params={
            conversation?.runtimeId
              ? { runtimeId: conversation.runtimeId }
              : undefined
          }
          className="flex size-9 items-center justify-center rounded-xl text-primary-600 hover:bg-primary-100"
          aria-label="Back to command center"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={19} />
        </Link>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
          <HugeiconsIcon icon={UserMultipleIcon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            {conversation?.name || 'Agent session'}
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-primary-500">
            <span
              className={cn(
                'size-1.5 rounded-full',
                processing ? 'animate-pulse bg-emerald-500' : 'bg-primary-300',
              )}
            />
            {conversation?.backend || 'External harness'} ·{' '}
            {processing ? 'working' : 'ready'}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 md:px-6">
          {messagesQuery.isPending ? (
            <div className="flex flex-1 items-center justify-center text-sm text-primary-500">
              Loading session…
            </div>
          ) : messagesQuery.error instanceof Error ? (
            <div className="m-auto max-w-md rounded-xl border border-red-300 bg-red-500/5 px-4 py-3 text-center text-sm text-red-700">
              {messagesQuery.error.message}
            </div>
          ) : visibleMessages.length ? (
            <div className="mt-auto space-y-4">
              {visibleMessages.map((message) => {
                const isUser = message.position === 'right'
                const text = messageText(message)
                const isMeta =
                  message.type === 'thinking' || message.type === 'tool_call'
                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      isUser ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[88%] whitespace-pre-wrap break-words text-sm leading-6',
                        isUser
                          ? 'rounded-2xl rounded-br-md bg-accent-500 px-4 py-2.5 text-white'
                          : isMeta
                            ? 'border-l-2 border-primary-300 pl-3 text-xs text-primary-500'
                            : 'text-primary-900',
                      )}
                    >
                      {isMeta && (
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-400">
                          {message.type.replace('_', ' ')}
                        </div>
                      )}
                      {text}
                    </div>
                  </div>
                )
              })}
              {processing && (
                <div className="flex items-center gap-2 text-xs text-primary-500">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Agent is working…
                </div>
              )}
              <div ref={endRef} />
            </div>
          ) : (
            <div className="m-auto max-w-md text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
                <HugeiconsIcon icon={UserMultipleIcon} size={22} />
              </span>
              <h2 className="mt-4 text-base font-semibold">
                Start the conversation
              </h2>
              <p className="mt-1 text-sm text-primary-500">
                This chat is connected directly to the selected agent harness.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-primary-200 bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-5">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-primary-300 bg-primary-50 p-2 shadow-sm focus-within:border-accent-500">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={canSend ? 'Message this agent…' : 'Agent is busy…'}
            disabled={!canSend}
            className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-primary-400 disabled:opacity-60"
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={!draft.trim() || sendMutation.isPending || !canSend}
            aria-label="Send message"
            className="rounded-xl"
          >
            <HugeiconsIcon icon={SentIcon} size={18} />
          </Button>
        </div>
        {sendMutation.error instanceof Error && (
          <p className="mx-auto mt-2 max-w-3xl text-xs text-red-600">
            {sendMutation.error.message}
          </p>
        )}
      </footer>
    </main>
  )
}
