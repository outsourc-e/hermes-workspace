import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { getConnectionErrorInfo } from '@/lib/connection-errors'

type ConnectionStatusMessageProps = {
  state: 'checking' | 'error'
  error?: string | null
  status?: number | null
  onRetry?: () => void
  className?: string
}

// Classification previously duplicated an inline copy of this logic that
// treated any message containing "auth" or "token" as a Hermes-Agent gateway
// rejection — including a plain 401 from /api/ping, which only ever reflects
// this Workspace's own password-session cookie, never the gateway token. That
// misrouted users to "Settings -> Advanced -> Hermes Agent" for a problem
// solved by just logging back in. `getConnectionErrorInfo` (src/lib/connection-errors.ts)
// already disambiguates this correctly (and is unit-tested for it) but was
// never wired into this component — use it instead of re-deriving locally.
function classifyConnectionError(
  error?: string | null,
  status?: number | null,
): {
  title: string
  description: string
  action: string
} {
  if (!error?.trim() && !status) {
    return {
      title: 'Not connected',
      description: "Hermes Workspace can't reach Hermes Agent.",
      action: 'Check that Hermes is running, then try again.',
    }
  }

  const info = getConnectionErrorInfo(error, status)
  return {
    title: info.title,
    description: info.description,
    action: info.action ?? 'Try again, or review the gateway settings.',
  }
}

export function ConnectionStatusMessage({
  state,
  error,
  status,
  onRetry,
  className,
}: ConnectionStatusMessageProps) {
  const isChecking = state === 'checking'
  const [visible, setVisible] = useState(true)
  const [fadingOut, setFadingOut] = useState(false)
  const errorInfo = classifyConnectionError(error, status)

  // Auto-dismiss when server comes back
  useEffect(() => {
    function handleRestored() {
      setFadingOut(true)
      setTimeout(() => setVisible(false), 300)
    }
    window.addEventListener('claude:health-restored', handleRestored)
    return () =>
      window.removeEventListener('claude:health-restored', handleRestored)
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
            {isChecking ? 'Connecting to Hermes Agent...' : errorInfo.title}
          </p>
          {!isChecking ? (
            <>
              <p className="mt-0.5 text-amber-700">{errorInfo.description}</p>
              <p className="mt-1 font-medium text-amber-800">
                {errorInfo.action}
              </p>
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
