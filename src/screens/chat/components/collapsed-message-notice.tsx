import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import type { ChatMessage } from '../types'

import { cn } from '@/lib/utils'

const CONTEXT_COMPACTION_PREFIX = '[CONTEXT COMPACTION — REFERENCE ONLY]'
const ASYNC_DELEGATION_BATCH_COMPLETE_PATTERN =
  /^\[ASYNC DELEGATION BATCH COMPLETE — ([^\]\r\n]+)\]/

export type CollapsedMessageNotice = {
  kind: 'context-compression' | 'delegation-result'
  label: string
}

export function rawTextForCollapseDetection(message: ChatMessage): string {
  const content = Array.isArray(message.content) ? message.content : []
  const contentText = content
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
    .join('')
  if (contentText.length > 0) return contentText

  const rawMessage = message as Record<string, unknown>
  for (const key of ['text', 'body', 'message']) {
    const value = rawMessage[key]
    if (typeof value === 'string') return value
  }
  return ''
}

export function getCollapsedMessageNotice(
  text: string,
): CollapsedMessageNotice | null {
  if (text.startsWith(CONTEXT_COMPACTION_PREFIX)) {
    return {
      kind: 'context-compression',
      label: '🗜️ Context Compression Complete',
    }
  }

  const delegationMatch = text.match(ASYNC_DELEGATION_BATCH_COMPLETE_PATTERN)
  const delegationId = delegationMatch?.[1]?.trim()
  if (!delegationId) return null

  return {
    kind: 'delegation-result',
    label: `Delegation ${delegationId} Result`,
  }
}

type CollapsedMessageNoticeProps = {
  text: string
  notice?: CollapsedMessageNotice | null
  className?: string
}

export function CollapsedMessageNotice({
  text,
  notice = getCollapsedMessageNotice(text),
  className,
}: CollapsedMessageNoticeProps) {
  if (!notice) return null

  return (
    <details
      className={cn(
        'group/collapsed-message w-fit max-w-[var(--chat-content-max-width)] overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] open:w-full',
        className,
      )}
      data-chat-collapsed-message={notice.kind}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-left text-sm font-medium [&::-webkit-details-marker]:hidden hover:bg-[var(--theme-card2)]">
        <span>{notice.label}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          strokeWidth={1.75}
          className="shrink-0 transition-transform group-open/collapsed-message:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div
        data-chat-collapsed-message-content
        className="max-h-[32rem] overflow-auto border-t border-[var(--theme-border)] px-3 py-2 text-sm whitespace-pre-wrap break-words text-[var(--theme-muted)]"
      >
        {text}
      </div>
    </details>
  )
}
