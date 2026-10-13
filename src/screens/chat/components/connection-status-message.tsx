import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

type ConnectionStatusMessageProps = {
  state: 'checking' | 'error'
  error?: string | null
  status?: number | null
  onRetry?: () => void
  className?: string
}

function classifyConnectionError(
  error?: string | null,
  status?: number | null,
): {
  title: string
  description: string
  action: string
} {
  const normalizedError = error?.trim()
  const lower = normalizedError?.toLowerCase() ?? ''

  if (!normalizedError && !status) {
    return {
      title: 'Не подключено',
      description: "AWG GPT не может подключиться к шлюзу.",
      action: 'Убедитесь, что AWG GPT запущен, и повторите попытку.',
    }
  }

  if (
    status === 401 ||
    lower.includes('auth') ||
    lower.includes('token') ||
    lower.includes('unauthorized')
  ) {
    return {
      title: 'Требуется аутентификация',
      description: 'AWG GPT отклонил токен подключения.',
      action: 'Откройте «Настройки → Дополнительно → AWG GPT», чтобы обновить токен.',
    }
  }

  if (
    status === 403 ||
    lower.includes('pair') ||
    lower.includes('not paired')
  ) {
    return {
      title: 'Требуется сопряжение',
      description: "Это устройство ещё не подключено к AWG GPT.",
      action: 'Проверьте подключение AWG GPT.',
    }
  }

  if (lower.includes('econnrefused') && lower.includes('8642')) {
    return {
      title: 'Шлюз AWG GPT не запущен',
      description: 'Шлюз AWG GPT не запущен на порту 8642.',
      action: 'Запустите официальный установщик, затем стартуйте шлюз командой: hermes gateway run',
    }
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return {
      title: 'AWG GPT недоступен',
      description: "Не удаётся подключиться к AWG GPT по указанному URL.",
      action: 'Убедитесь, что AWG GPT запущен, а URL указан верно.',
    }
  }

  return {
    title: 'Ошибка подключения',
    description: normalizedError || 'Something went wrong.',
    action: 'Обновите страницу или проверьте «Настройки → Дополнительно → AWG GPT».',
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
            {isChecking ? 'Connecting to AWG GPT...' : errorInfo.title}
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
            Повторить
          </button>
        )}
      </div>
    </div>
  )
}
