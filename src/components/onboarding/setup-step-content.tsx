'use client'

import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import type { OnboardingStepComponentProps } from './onboarding-steps'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AuthCheckResponse = {
  authenticated?: boolean
  authRequired?: boolean
  error?: string
}

type ClaudeConfigResponse = {
  activeProvider?: string
  activeModel?: string
}

type ConnectionStatus = 'checking' | 'connected' | 'disconnected'

export function ConnectionCheckStep({
  setCanProceed,
}: OnboardingStepComponentProps) {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [lastError, setLastError] = useState<string | null>(null)

  const checkConnection = useCallback(async () => {
    setStatus('checking')
    setLastError(null)

    try {
      const response = await fetch('/api/auth-check', {
        signal: AbortSignal.timeout(5000),
      })
      const data = (await response.json()) as AuthCheckResponse
      const connected =
        response.ok &&
        data.error !== 'server_timeout' &&
        (data.authenticated === true || data.authRequired === false)

      setStatus(connected ? 'connected' : 'disconnected')
      if (!connected) {
        setLastError(
          data.error === 'server_timeout'
            ? 'AWG GPT не ответил вовремя.'
            : 'AWG GPT пока недоступен.',
        )
      }
    } catch (error) {
      setStatus('disconnected')
      setLastError(
        error instanceof Error ? error.message : 'Проверка подключения не пройдена.',
      )
    }
  }, [])

  useEffect(() => {
    void checkConnection()
  }, [checkConnection])

  useEffect(() => {
    setCanProceed(status === 'connected')
  }, [setCanProceed, status])

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div
        className={cn(
          'mb-5 flex size-20 items-center justify-center rounded-2xl',
          status === 'connected'
            ? 'bg-emerald-100 text-emerald-600'
            : status === 'disconnected'
              ? 'bg-red-100 text-red-600'
              : 'bg-primary-100 text-primary-500',
        )}
      >
        <HugeiconsIcon
          icon={
            status === 'connected'
              ? CheckmarkCircle02Icon
              : status === 'disconnected'
                ? Cancel01Icon
                : RefreshIcon
          }
          className={cn('size-10', status === 'checking' && 'animate-spin')}
          strokeWidth={1.8}
        />
      </div>

      <h2 className="mb-3 text-2xl font-semibold text-primary-900">
        Проверка подключения
      </h2>

      <p className="mb-6 max-w-md text-base leading-relaxed text-primary-600">
        {status === 'connected'
          ? 'Бэкенд доступен и готов к настройке.'
          : status === 'checking'
            ? 'Проверяю, доступен ли OpenAI-совместимый бэкенд...'
            : 'Совместимый бэкенд пока не подключён.'}
      </p>

      {status === 'disconnected' && (
        <div className="mb-6 w-full rounded-2xl border border-red-200 bg-red-50 p-4 text-left">
          <p className="mb-3 text-sm font-medium text-red-700">
            Убедитесь, что HTTP API-сервер AWG GPT включён:
          </p>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-red-700 mb-1">
                1. Включите API-сервер в <code>~/.hermes/.env</code>:
              </p>
              <code className="block overflow-x-auto rounded-lg bg-red-100 px-3 py-2 text-xs text-red-900">
                API_SERVER_ENABLED=true
              </code>
            </div>
            <div>
              <p className="text-xs font-medium text-red-700 mb-1">
                2. Перезапустите шлюз:
              </p>
              <code className="block overflow-x-auto rounded-lg bg-red-100 px-3 py-2 text-xs text-red-900">
                cd hermes-agent && hermes --gateway
              </code>
            </div>
          </div>
          <p className="mt-3 text-xs text-red-700">
            Or point <code>HERMES_API_URL</code> на любой OpenAI-совместимый бэкенд (Ollama, LiteLLM, vLLM и др.).
          </p>
          {lastError && (
            <p className="mt-3 text-xs text-red-700">{lastError}</p>
          )}
        </div>
      )}

      <Button
        variant={status === 'connected' ? 'secondary' : 'default'}
        onClick={() => void checkConnection()}
        className="gap-2"
      >
        <HugeiconsIcon icon={RefreshIcon} className="size-4" />
        Проверить подключение
      </Button>
    </div>
  )
}

export function ModelConfigurationStep({
  setCanProceed,
}: OnboardingStepComponentProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [config, setConfig] = useState<ClaudeConfigResponse | null>(null)

  useEffect(() => {
    setCanProceed(true)
  }, [setCanProceed])

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const response = await fetch('/api/claude-config', {
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = (await response.json()) as ClaudeConfigResponse
        if (!cancelled) {
          setConfig(data)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) {
          setStatus('error')
        }
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  const provider = config?.activeProvider?.trim()
  const model = config?.activeModel?.trim()
  const hasModel = Boolean(provider && model)

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="mb-5 flex size-20 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
        <HugeiconsIcon
          icon={Settings01Icon}
          className="size-10"
          strokeWidth={1.8}
        />
      </div>

      <h2 className="mb-3 text-2xl font-semibold text-primary-900">
        Настройка модели
      </h2>

      <p className="mb-6 max-w-md text-base leading-relaxed text-primary-600">
        Чат работает с любым OpenAI-совместимым бэкендом. API шлюза позволяет менять провайдера и модель прямо из интерфейса.
      </p>

      <div className="mb-6 w-full rounded-2xl border border-primary-200 bg-primary-100/70 p-4 text-left">
        {status === 'loading' && (
          <p className="text-sm text-primary-600">
            Загрузка данных о текущем провайдере и модели...
          </p>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-3 text-amber-700">
            <HugeiconsIcon
              icon={Alert02Icon}
              className="mt-0.5 size-5 shrink-0"
            />
            <p className="text-sm">
              Сейчас не удаётся загрузить редактируемую конфигурацию бэкенда. Если чат работает, можно продолжить и изменить настройки там, где их хранит бэкенд.
            </p>
          </div>
        )}

        {status === 'ready' && hasModel && (
          <p className="text-sm font-medium text-primary-900">
            Текущая модель: <span className="text-accent-700">{model}</span> via{' '}
            <span className="text-accent-700">{provider}</span>
          </p>
        )}

        {status === 'ready' && !hasModel && (
          <div className="flex items-start gap-3 text-amber-700">
            <HugeiconsIcon
              icon={Alert02Icon}
              className="mt-0.5 size-5 shrink-0"
            />
            <p className="text-sm">
              Модель пока не определена. Если бэкенд управляет моделями отдельно, завершите настройку там и проверьте подключение тестом чата.
            </p>
          </div>
        )}
      </div>

      <Link
        to="/settings/providers"
        className={buttonVariants({ variant: 'outline', className: 'gap-2' })}
      >
        <HugeiconsIcon icon={Settings01Icon} className="size-4" />
        Открыть настройки провайдера
      </Link>
    </div>
  )
}
