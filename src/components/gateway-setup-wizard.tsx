'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CloudIcon,
  ComputerIcon,
  CheckmarkCircle02Icon,
  Alert02Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useGatewaySetupStore } from '@/hooks/use-gateway-setup'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProviderSelectStep } from '@/components/onboarding/provider-select-step'

const LOCAL_GATEWAY_URL = 'ws://127.0.0.1:18789'

type SetupMode = 'local' | 'remote' | 'cloud'
type LocalSetupStatus = 'idle' | 'checking' | 'installing' | 'starting' | 'ready' | 'error'

type LocalSetupEvent = {
  status: Exclude<LocalSetupStatus, 'idle'>
  message: string
  url?: string
  token?: string
}

function SetupModeCard({
  icon,
  title,
  description,
  selected,
  onClick,
  accentLabel,
}: {
  icon: typeof CloudIcon
  title: string
  description: string
  selected: boolean
  onClick: () => void
  accentLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-2xl border bg-primary-50 p-4 text-left shadow-sm transition-all',
        'hover:border-accent-200 hover:bg-accent-50/60',
        selected
          ? 'border-accent-500 bg-accent-50/70 shadow-accent-500/10'
          : 'border-primary-200',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex size-11 items-center justify-center rounded-xl border transition-colors',
            selected
              ? 'border-accent-200 bg-accent-100 text-accent-700'
              : 'border-primary-200 bg-primary-100 text-primary-700',
          )}
        >
          <HugeiconsIcon icon={icon} className="size-5" strokeWidth={1.8} />
        </div>
        {accentLabel ? (
          <span className="rounded-full border border-accent-200 bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-700">
            {accentLabel}
          </span>
        ) : null}
      </div>
      <h3 className="text-sm font-semibold text-primary-900">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-primary-600">{description}</p>
    </button>
  )
}

function GatewayStepContent() {
  const {
    gatewayUrl,
    gatewayToken,
    testStatus,
    testError,
    saving,
    setGatewayUrl,
    setGatewayToken,
    saveAndTest,
    autoDetectGateway,
    proceed,
  } = useGatewaySetupStore()
  const [autoDetecting, setAutoDetecting] = useState(false)
  const [autoDetectMessage, setAutoDetectMessage] = useState<string | null>(null)
  const [autoDetectError, setAutoDetectError] = useState<string | null>(null)
  const [setupMode, setSetupMode] = useState<SetupMode | null>(null)
  const [localSetupStatus, setLocalSetupStatus] = useState<LocalSetupStatus>('idle')
  const [localSetupMessage, setLocalSetupMessage] = useState<string | null>(null)
  const [localSetupError, setLocalSetupError] = useState<string | null>(null)
  const localSetupSourceRef = useRef<EventSource | null>(null)

  const handleSaveAndTest = async () => {
    const ok = await saveAndTest()
    if (ok) {
      setTimeout(() => proceed(), 800)
    }
  }

  const closeLocalSetupStream = () => {
    const current = localSetupSourceRef.current
    if (!current) return
    current.close()
    localSetupSourceRef.current = null
  }

  const runLocalSetup = () => {
    if (typeof window === 'undefined') return

    closeLocalSetupStream()
    setLocalSetupStatus('checking')
    setLocalSetupMessage('Checking for OpenClaw...')
    setLocalSetupError(null)
    setAutoDetectMessage(null)
    setAutoDetectError(null)

    const source = new EventSource('/api/local-setup')
    let terminalEvent = false

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as LocalSetupEvent
        setLocalSetupStatus(payload.status)
        setLocalSetupMessage(payload.message)

        if (payload.status === 'ready') {
          terminalEvent = true
          closeLocalSetupStream()
          setGatewayUrl(payload.url || LOCAL_GATEWAY_URL)
          setGatewayToken(payload.token || '')
          void handleSaveAndTest()
          return
        }

        if (payload.status === 'error') {
          terminalEvent = true
          closeLocalSetupStream()
          setLocalSetupError(payload.message || 'Local setup failed.')
        }
      } catch {
        terminalEvent = true
        closeLocalSetupStream()
        setLocalSetupStatus('error')
        setLocalSetupError('Received an invalid setup event from the server.')
      }
    }

    source.onerror = () => {
      if (terminalEvent) return
      closeLocalSetupStream()
      setLocalSetupStatus('error')
      setLocalSetupError('Local setup was interrupted before it finished.')
    }

    localSetupSourceRef.current = source
  }

  const handleAutoDetect = async () => {
    setAutoDetecting(true)
    setAutoDetectMessage(null)
    setAutoDetectError(null)

    const result = await autoDetectGateway()
    if (!result.ok || !result.url) {
      setAutoDetectError(
        result.error || 'No gateway found on localhost ports 18789-18800.',
      )
      setAutoDetecting(false)
      return
    }

    setAutoDetectMessage(`Detected gateway at ${result.url}`)
    setAutoDetecting(false)
  }

  const handleSetupModeChange = (mode: SetupMode) => {
    closeLocalSetupStream()
    setSetupMode(mode)
    setLocalSetupStatus('idle')
    setLocalSetupMessage(null)
    setLocalSetupError(null)
    setAutoDetectMessage(null)
    setAutoDetectError(null)
  }

  useEffect(() => {
    if (setupMode !== 'local') return
    if (localSetupStatus !== 'idle') return
    runLocalSetup()
  }, [localSetupStatus, setupMode])

  useEffect(() => {
    return () => {
      closeLocalSetupStream()
    }
  }, [])

  const isBusy = testStatus === 'testing' || saving
  const canProceed = testStatus === 'success'
  const localSetupSteps = [
    {
      id: 'checking',
      label: 'Checking for OpenClaw...',
    },
    {
      id: 'installing',
      label: 'Installing OpenClaw...',
    },
    {
      id: 'starting',
      label: 'Starting gateway...',
    },
    {
      id: 'ready',
      label: 'Connected!',
    },
  ] as const

  const currentLocalStepIndex =
    localSetupStatus === 'idle'
      ? 0
      : Math.max(
          localSetupSteps.findIndex((step) => step.id === localSetupStatus),
          0,
        )

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg">
          <HugeiconsIcon icon={CloudIcon} className="size-10" strokeWidth={1.5} />
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-primary-900">
          Connect to Gateway
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-primary-600">
          Choose how you want to get started.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3">
          <SetupModeCard
            icon={ComputerIcon}
            title="Use this computer"
            description="Install and run everything locally. Best for personal use."
            selected={setupMode === 'local'}
            onClick={() => handleSetupModeChange('local')}
          />
          <SetupModeCard
            icon={CloudIcon}
            title="Connect another machine"
            description="Connect to OpenClaw running on a server, Pi, or another computer."
            selected={setupMode === 'remote'}
            onClick={() => handleSetupModeChange('remote')}
          />
          <SetupModeCard
            icon={CloudIcon}
            title="ClawSuite Cloud"
            description="No setup needed. Managed hosting with one click. (Coming soon)"
            selected={setupMode === 'cloud'}
            onClick={() => handleSetupModeChange('cloud')}
            accentLabel="Soon"
          />
        </div>

        {setupMode === 'cloud' ? (
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 shadow-sm">
            <h3 className="text-base font-semibold text-primary-900">
              ClawSuite Cloud is coming soon
            </h3>
            <p className="mt-1 text-sm text-primary-600">
              Managed hosting isn&apos;t available yet. Join the waitlist and
              we&apos;ll let you know when it launches.
            </p>
            <div className="mt-4">
              <a
                href="https://clawsuite.io"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'bg-accent-500 hover:bg-accent-600',
                )}
              >
                Join Waitlist
              </a>
            </div>
          </div>
        ) : setupMode === 'local' ? (
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-primary-900">Setting up local gateway</h3>
              <p className="mt-1 text-sm text-primary-600">
                ClawSuite is installing and starting OpenClaw in the background.
              </p>
            </div>

            <div className="space-y-3">
              {localSetupSteps.map((step, index) => {
                const isComplete =
                  localSetupStatus === 'ready'
                    ? true
                    : localSetupStatus !== 'error' && index < currentLocalStepIndex
                const isCurrent =
                  localSetupStatus !== 'error' &&
                  step.id === localSetupStatus

                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      isComplete
                        ? 'border-green-200 bg-green-50'
                        : isCurrent
                          ? 'border-accent-200 bg-accent-50'
                          : 'border-primary-200 bg-primary-100/60',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full border',
                        isComplete
                          ? 'border-green-300 bg-green-100 text-green-700'
                          : isCurrent
                            ? 'border-accent-300 bg-accent-100 text-accent-700'
                            : 'border-primary-200 bg-primary-50 text-primary-500',
                      )}
                    >
                      {isComplete ? (
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          className="size-4"
                          strokeWidth={2}
                        />
                      ) : (
                        <span className="text-xs font-semibold">{index + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary-900">{step.label}</p>
                      {isCurrent && localSetupMessage ? (
                        <p className="mt-0.5 text-xs text-primary-500">{localSetupMessage}</p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

            {localSetupError ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={2}
                />
                <div className="min-w-0 flex-1">
                  <p>{localSetupError}</p>
                </div>
              </div>
            ) : null}

            {testError ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={2}
                />
                <div className="min-w-0 flex-1">
                  <p>{testError}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setLocalSetupStatus('idle')
                  setLocalSetupMessage(null)
                  setLocalSetupError(null)
                }}
                disabled={localSetupStatus !== 'error'}
                className="flex-1"
              >
                Retry Setup
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSetupModeChange('remote')}
                className="flex-1"
              >
                Enter Manually
              </Button>
            </div>
          </div>
        ) : setupMode === 'remote' ? (
          <>
            <div>
              <label
                htmlFor="gateway-url"
                className="mb-1.5 block text-sm font-medium text-primary-900"
              >
                Gateway URL
              </label>
              <Input
                id="gateway-url"
                type="text"
                placeholder="ws://127.0.0.1:18789"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                className="h-10"
              />
              <p className="mt-1 text-xs text-primary-500">
                Default: ws://127.0.0.1:18789 for local OpenClaw (18790 for nanobot)
              </p>
              <Button
                variant="outline"
                onClick={() => void handleAutoDetect()}
                disabled={autoDetecting}
                className="mt-3 w-full"
              >
                {autoDetecting ? 'Scanning localhost...' : 'Auto-detect Gateway'}
              </Button>
            </div>

            <div>
              <label
                htmlFor="gateway-token"
                className="mb-1.5 block text-sm font-medium text-primary-900"
              >
                Gateway Token{' '}
                <span className="font-normal text-primary-400">(optional)</span>
              </label>
              <Input
                id="gateway-token"
                type="password"
                placeholder="Leave empty if no token is set"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                className="h-10"
              />
            </div>

            {testError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={2}
                />
                <div>
                  <p>{testError}</p>
                </div>
              </div>
            )}

            {autoDetectError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={2}
                />
                <span>{autoDetectError}</span>
              </div>
            )}

            {autoDetectMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={2}
                />
                <span>{autoDetectMessage}</span>
              </div>
            )}

            {testStatus === 'success' && (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="mt-0.5 size-4 shrink-0"
                  strokeWidth={2}
                />
                <span>Connected to gateway!</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                variant="secondary"
                onClick={() => void handleSaveAndTest()}
                disabled={isBusy || !gatewayUrl.trim()}
                className="flex-1"
              >
                {saving
                  ? 'Saving...'
                  : testStatus === 'testing'
                    ? 'Testing...'
                    : 'Save & Test Connection'}
              </Button>
              <Button
                variant="default"
                onClick={proceed}
                disabled={!canProceed}
                className="flex-1 bg-accent-500 hover:bg-accent-600"
              >
                Continue
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ProviderStepContent() {
  const { skipProviderSetup, completeSetup } = useGatewaySetupStore()

  const handleProviderComplete = async (providerId: string, apiKey: string) => {
    // Save the provider config to the gateway
    try {
      await fetch('/api/gateway-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, apiKey }),
      })
    } catch {
      // Non-blocking — user can configure later
    }
    completeSetup()
  }

  return (
    <ProviderSelectStep
      onComplete={handleProviderComplete}
      onSkip={skipProviderSetup}
    />
  )
}

export function GatewaySetupWizard() {
  const { isOpen, step, initialize } = useGatewaySetupStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-[min(620px,92vw)] min-w-[320px] overflow-hidden rounded-2xl border border-primary-200 bg-primary-50 shadow-2xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-500/5 via-transparent to-transparent" />

            <div className="relative px-8 pb-8 pt-8">
              {/* Step dots */}
              <div className="mb-6 flex items-center justify-center gap-2">
                {(['gateway', 'provider'] as const).map((s) => (
                  <div
                    key={s}
                    className={cn(
                      'size-2 rounded-full transition-colors',
                      step === s
                        ? 'bg-accent-500'
                        : 'bg-primary-300',
                    )}
                  />
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {step === 'gateway' && <GatewayStepContent />}
                  {step === 'provider' && <ProviderStepContent />}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="border-t border-primary-200 bg-primary-100/50 px-6 py-3">
              <p className="text-center text-xs text-primary-500">
                Need help?{' '}
                <a
                  href="https://docs.openclaw.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-600 underline hover:text-accent-700"
                >
                  Documentation
                </a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
