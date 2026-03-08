import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons'
import { getConnectionErrorInfo } from '@/lib/connection-errors'
import { cn } from '@/lib/utils'

type GatewayStatusMessageProps = {
  state: 'checking' | 'error'
  error?: string | null
  onRetry?: () => void
  className?: string
}

export function GatewayStatusMessage({
  state,
  error,
  onRetry,
  className,
}: GatewayStatusMessageProps) {
  const isChecking = state === 'checking'
  const [visible, setVisible] = useState(true)
  const [fadingOut, setFadingOut] = useState(false)
  const errorInfo = getConnectionErrorInfo(error)

  // Auto-dismiss when gateway comes back
  useEffect(() => {
    function handleRestored() {
      setFadingOut(true)
      setTimeout(() => setVisible(false), 300)
    }
    window.addEventListener('gateway:health-restored', handleRestored)
    return () => window.removeEventListener('gateway:health-restored', handleRestored)
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        'mx-auto max-w-lg rounded-lg border px-3 py-2 transition-all duration-300',
        isChecking
          ? 'border-primary-200 bg-primary-50 text-primary-600'
          : 'border-amber-200 bg-amber-50 text-amber-800',
        fadingOut && 'opacity-0 translate-y-[-4px]',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <HugeiconsIcon
          icon={isChecking ? WifiDisconnected01Icon : Alert02Icon}
          size={16}
          strokeWidth={1.5}
          className={cn(
            'mt-0.5 shrink-0',
            isChecking ? 'text-primary-500' : 'text-amber-600',
          )}
        />
        <div className="flex-1 text-xs">
          <p className="font-medium">
            {isChecking ? 'Connecting to gateway...' : errorInfo.title}
          </p>
          {!isChecking ? (
            <>
              <p className="mt-0.5 text-amber-700">{errorInfo.description}</p>
              {errorInfo.action ? (
                <p className="mt-1 font-medium text-amber-800">{errorInfo.action}</p>
              ) : null}
              {errorInfo.details ? (
                <p className="mt-1 text-[11px] text-amber-600">{errorInfo.details}</p>
              ) : null}
            </>
          ) : null}
        </div>
        {!isChecking && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:hover:bg-amber-900/30"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
