'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  Alert02Icon,
  Cancel01Icon,
  LinkSquare02Icon,
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

const HEALTH_CHECK_INTERVAL_MS = 5_000
const HEALTH_CHECK_DELAY_MS = 1_000

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
          src="/logo-icon.png"
          alt="ClawSuite logo"
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
  const wasUnhealthyRef = useRef(false)
  const errorInfo = getConnectionErrorInfo(testError)
  const isReconnecting = setupConfigured && (saving || testStatus === 'testing')

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    let mounted = true

    async function checkHealth() {
      const { ok } = await pingGateway()
      if (!mounted) return

      if (ok) {
        setHealthState('healthy')
        if (wasUnhealthyRef.current && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gateway:health-restored'))
        }
        wasUnhealthyRef.current = false
        setDismissed(false)
        return
      }

      wasUnhealthyRef.current = true
      setHealthState('unhealthy')
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

  const showBanner = healthState === 'unhealthy' && !dismissed

  return (
    <AnimatePresence initial={false}>
      {showBanner ? (
        <motion.div
          key="gateway-connection-banner"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mx-auto mb-3 w-full max-w-[1600px] px-3 pt-3 sm:px-4 md:mb-4 md:px-6 md:pt-4"
        >
          {setupConfigured ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-100/85 px-3 py-3 text-primary-900 shadow-sm">
              <div className="flex items-start gap-3">
                <img
                  src="/logo-icon.png"
                  alt="ClawSuite logo"
                  width={24}
                  height={24}
                  className="mt-0.5 size-6 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-primary-950">
                      {isReconnecting ? 'Reconnecting...' : 'Gateway disconnected'}
                    </p>
                    {isReconnecting ? (
                      <HugeiconsIcon
                        icon={RefreshIcon}
                        size={16}
                        strokeWidth={1.6}
                        className="animate-spin text-amber-700"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={16}
                        strokeWidth={1.8}
                        className="text-amber-700"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-primary-700">
                    {isReconnecting
                      ? 'Trying the saved gateway connection again.'
                      : 'Only chat and agent features need the gateway. The rest of ClawSuite stays available offline.'}
                  </p>
                  {!isReconnecting && testStatus === 'error' && testError ? (
                    <p className="mt-1 text-xs text-red-700">
                      {errorInfo.title}. {errorInfo.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleReconnect()}
                      disabled={isReconnecting}
                      className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-200"
                    >
                      <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.6} />
                      Reconnect
                    </Button>
                    <Link
                      to="/settings"
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 underline decoration-amber-400 underline-offset-4 transition-colors hover:text-primary-950"
                    >
                      <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.8} />
                      Configure
                    </Link>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="rounded-lg p-1 text-amber-800 transition-colors hover:bg-amber-200"
                  aria-label="Dismiss gateway connection banner"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <GatewayConnectionSetupForm
                variant="banner"
                className="pr-11"
                onSuccess={() => setDismissed(false)}
              />
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="absolute right-3 top-3 rounded-lg p-1 text-amber-800 transition-colors hover:bg-amber-200"
                aria-label="Dismiss gateway connection banner"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
