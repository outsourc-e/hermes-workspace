import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Copy01Icon,
  RefreshIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { MessageTimestamp } from './message-timestamp'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { writeTextToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type MessageActionsBarProps = {
  text: string
  align: 'start' | 'end'
  timestamp: number
  forceVisible?: boolean
  isQueued?: boolean
  isFailed?: boolean
  onRetry?: () => void
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    try {
      textarea.focus()
      textarea.select()
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}

export function MessageActionsBar({
  text,
  align,
  timestamp,
  forceVisible = false,
  isQueued = false,
  isFailed = false,
  onRetry,
}: MessageActionsBarProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await writeTextToClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const positionClass = align === 'end' ? 'justify-end' : 'justify-start'

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-primary-600 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 duration-100 ease-out',
        forceVisible || isQueued || isFailed ? 'opacity-100' : 'opacity-0',
        positionClass,
      )}
    >
      {isFailed && onRetry && (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.6} />
              <span className="text-[11px] font-medium">Retry</span>
            </TooltipTrigger>
            <TooltipContent side="top">Resend failed message</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      )}
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger
            type="button"
            onClick={() => {
              handleCopy().catch(() => {})
            }}
            className="inline-flex items-center justify-center rounded border border-transparent bg-transparent p-1 text-primary-700 hover:text-primary-900 hover:bg-primary-100 dark:hover:bg-primary-800"
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              size={16}
              strokeWidth={1.6}
            />
          </TooltipTrigger>
          <TooltipContent side="top">Copy</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
      <MessageTimestamp timestamp={timestamp} />
    </div>
  )
}
