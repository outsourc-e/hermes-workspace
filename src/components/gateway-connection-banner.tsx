'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Alert02Icon,
  Cancel01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  pingGateway,
  useGatewaySetupStore,
} from '@/hooks/use-gateway-setup'
import { getConnectionErrorInfo } from '@/lib/connection-errors'
import { cn } from '@/lib/utils'

const HEALTH_CHECK_INTERVAL_MS = 15_000
const HEALTH_CHECK_DELAY_MS = 1_000
const REQUIRED_FAILURES = 4
const DISMISS_STORAGE_KEY = 'clawsuite-gateway-banner-dismissed-until'
const DISMISS_TTL_MS = 60 * 60 * 1000

type GatewayConnectionSetupFormProps = {
  variant?: 'banner' | 'card'
  title?: string
  description?: string
  className?: string
  onSuccess?: () => void
}

export function GatewayConnectionSetupForm({
  variant = 'card',
  title = 'Connect to OpenClaw Gateway',
  description = 'Enter your gateway URL and token to test the connection and save it.',
  className,
  onSuccess,
}: GatewayConnectionSetupFormProps) {
  const gatewayUrl = useGatewaySetupStore((state) => state.gatewayUrl)
  const gatewayToken = useGatewaySetupStore((state) => state.gatewayToken)
  const testStatus = useGatewaySetupStore((state) => state.testStatus)
  const testError = useGatewaySetupStore((state) => state.testError)
  const saving = useGatewaySetupStore((state) => state.saving)
  const initialize = useGatewaySetupStore((state) => state.initialize)
  const setGatewayUrl = useGatewaySetupStore((state) => state.setGatewayUrl)
  const setGatewayToken = useGatewaySetupStore((state) => state.setGatewayToken)
  const saveAndTest = useGatewaySetupStore((state) => state.saveAndTest)
  const errorInfo = getConnectionErrorInfo(testError)
  const isBusy = saving || testStatus === 'testing'
  const isBanner = variant === 'banner'

  useEffect(() => {
    void initialize()
  }, [initialize])

  async function handleSubmit() {
    const ok = await saveAndTest()
    if (ok) {
      onSuccess?.()
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-amber-200 bg-amber-100/80 text-primary-900 shadow-sm',
        isBanner ? 'p-3' : 'p-4 sm:p-5',
        className,
      )}
    >
      <div className={cn('flex gap-3', isBanner ? 'items-start' : 'items-start sm:items-center')}>
        <img
          src="/hermes-icon.png"
          alt="Hermes Workspace logo"
          width={isBanner ? 24 : 32}
          height={isBanner ? 24 : 32}
          className={cn(
            'shrink-0 rounded-lg',
            isBanner ? 'size-6' : 'size-8',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className={cn('flex flex-col gap-1', isBanner ? 'sm:flex-row sm:items-center sm:justify-between' : '')}>
            <div>
              <p className={cn('font-semibold text-primary-950', isBanner ? 'text-sm' : 'text-base')}>
                {title}
              </p>
              <p className={cn('text-primary-700', isBanner ? 'text-xs' : 'mt-1 text-sm')}>
                {description}
              </p>
            </div>
            {testStatus === 'success' ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Connected
              </span>
            ) : null}
          </div>

          <div className={cn('mt-3 grid gap-2', isBanner ? 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]')}>
            <Input
              type="url"
              placeholder="ws://127.0.0.1:18789"
              value={gatewayUrl}
              onChange={(event) => setGatewayUrl(event.target.value)}
              className={cn(isBanner ? 'h-9' : 'h-10')}
              aria-label="Gateway URL"
            />
            <Input
              type="password"
              placeholder="Gateway token"
              value={gatewayToken}
              onChange={(event) => setGatewayToken(event.target.value)}
              className={cn(isBanner ? 'h-9' : 'h-10')}
              aria-label="Gateway token"
            />
            <Button
              onClick={() => void handleSubmit()}
              disabled={!gatewayUrl.trim() || isBusy}
              className={cn(
                'bg-accent-500 text-white hover:bg-accent-400',
                isBanner ? 'h-9 px-4' : 'h-10 px-5',
              )}
            >
              {isBusy ? (
                <>
                  <HugeiconsIcon
                    icon={RefreshIcon}
                    size={16}
                    strokeWidth={1.6}
                    className="animate-spin"
                  />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </div>

          {testStatus === 'error' && testError ? (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-700">
              <p className="font-medium">{errorInfo.title}</p>
              <p className="mt-0.5">{errorInfo.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function GatewayConnectionBanner() {
  const initialize = useGatewaySetupStore((state) => state.initialize)
  const loadCurrentConfig = useGatewaySetupStore((state) => state.loadCurrentConfig)
  const saveAndTest = useGatewaySetupStore((state) => state.saveAndTest)
  const setupConfigured = useGatewaySetupStore((state) => state.setupConfigured)
  const testStatus = useGatewaySetupStore((state) => state.testStatus)
  const testError = useGatewaySetupStore((state) => state.testError)
  const saving = useGatewaySetupStore((state) => state.saving)

  const [healthState, setHealthState] = useState<'unknown' | 'healthy' | 'unhealthy'>('unknown')
  const [dismissed, setDismissed] = useState(false)
  const consecutiveFailuresRef = useRef(0)
  const wasUnhealthyRef = useRef(false)
  const errorInfo = getConnectionErrorInfo(testError)
  const isReconnecting = setupConfigured && (saving || testStatus === 'testing')

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_STORAGE_KEY) ?? '0')
      if (dismissedUntil > Date.now()) {
        setDismissed(true)
        return
      }
      localStorage.removeItem(DISMISS_STORAGE_KEY)
    } catch {
      localStorage.removeItem(DISMISS_STORAGE_KEY)
    }

    setDismissed(false)
  }, [])

  useEffect(() => {
    let mounted = true

    async function checkHealth() {
      const { ok } = await pingGateway()
      if (!mounted) return

      if (ok) {
        consecutiveFailuresRef.current = 0
        setHealthState('healthy')
        if (wasUnhealthyRef.current && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gateway:health-restored'))
        }
        wasUnhealthyRef.current = false
        setDismissed(false)
        if (typeof window !== 'undefined') {
          localStorage.removeItem(DISMISS_STORAGE_KEY)
        }
        return
      }

      consecutiveFailuresRef.current += 1
      if (consecutiveFailuresRef.current >= REQUIRED_FAILURES) {
        wasUnhealthyRef.current = true
        setHealthState('unhealthy')
      }
    }

    const initialTimer = window.setTimeout(() => {
      void checkHealth()
    }, HEALTH_CHECK_DELAY_MS)
    const interval = window.setInterval(() => {
      void checkHealth()
    }, HEALTH_CHECK_INTERVAL_MS)

    return () => {
      mounted = false
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
    }
  }, [setupConfigured])

  async function handleReconnect() {
    await loadCurrentConfig()
    await saveAndTest()
  }

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        DISMISS_STORAGE_KEY,
        String(Date.now() + DISMISS_TTL_MS),
      )
    }
    setDismissed(true)
  }

  const showBanner = setupConfigured && healthState === 'unhealthy' && !dismissed

  return (
    <AnimatePresence initial={false}>
      {showBanner ? (
        <motion.div
          key="gateway-connection-banner"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed right-4 z-[90] w-[calc(100vw-2rem)] max-w-72 bottom-[calc(var(--tabbar-h,0px)+1rem)] sm:bottom-4"
        >
          <div className="rounded-xl border border-amber-300 bg-amber-100/95 px-3 py-2.5 text-primary-900 shadow-lg">
            <div className="flex items-start gap-2">
              <HugeiconsIcon
                icon={isReconnecting ? RefreshIcon : Alert02Icon}
                size={18}
                strokeWidth={1.7}
                className={cn(
                  'mt-0.5 shrink-0 text-amber-700',
                  isReconnecting ? 'animate-spin' : '',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-amber-950">
                  {isReconnecting
                    ? 'Gateway reconnecting...'
                    : '⚠ Gateway offline · Chat unavailable'}
                </p>
                {!isReconnecting && testStatus === 'error' && testError ? (
                  <p className="mt-1 text-[11px] text-amber-800">
                    {errorInfo.title}. {errorInfo.description}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleReconnect()}
                    disabled={isReconnecting}
                    className="h-7 border-amber-300 bg-amber-50 px-2 text-xs text-amber-900 hover:bg-amber-200"
                  >
                    <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.6} />
                    Reconnect
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-md p-1 text-amber-800 transition-colors hover:bg-amber-200"
                aria-label="Dismiss gateway connection banner"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
