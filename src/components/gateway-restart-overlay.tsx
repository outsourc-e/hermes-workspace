'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon,
  RefreshIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { BrailleSpinner } from '@/components/ui/braille-spinner'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────

type RestartPhase =
  | 'idle'
  | 'restarting'
  | 'ready'
  | 'error'

type GatewayRestartContextValue = {
  /** Whether a restart is currently in progress */
  isRestarting: boolean
  /**
   * Trigger a provider config save + gateway restart.
   * @param saveProvider async fn that applies the config change before restart
   */
  triggerRestart: (saveProvider?: () => Promise<void>) => Promise<void>
}

type ProviderRestartConfirmState = {
  open: boolean
  pendingSave: (() => Promise<void>) | null
}

// ── Constants ─────────────────────────────────────────────────────

const HEALTH_POLL_INTERVAL_MS = 2_000
const RESTART_TIMEOUT_MS = 30_000

// ── Context ───────────────────────────────────────────────────────

const GatewayRestartContext = createContext<GatewayRestartContextValue>({
  isRestarting: false,
  triggerRestart: async () => {},
})

// ── Health polling ────────────────────────────────────────────────

async function pingGateway(): Promise<boolean> {
  try {
    const res = await fetch('/api/ping', {
      signal: AbortSignal.timeout(3_000),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean }
    return Boolean(data.ok)
  } catch {
    return false
  }
}

async function callGatewayRestart(): Promise<void> {
  const res = await fetch('/api/gateway-restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || 'Hermes restart request failed')
  }
}

// ── Provider ──────────────────────────────────────────────────────

export function GatewayRestartProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [phase, setPhase] = useState<RestartPhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmState, setConfirmState] = useState<ProviderRestartConfirmState>(
    { open: false, pendingSave: null },
  )

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimers() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current)
      timeoutTimerRef.current = null
    }
  }

  // Start polling for gateway recovery
  function startRecoveryPolling() {
    clearTimers()

    timeoutTimerRef.current = setTimeout(() => {
      clearTimers()
      setPhase('error')
      setErrorMsg('Hermes did not come back within 30 seconds.')
    }, RESTART_TIMEOUT_MS)

    pollTimerRef.current = setInterval(() => {
      void (async () => {
        const healthy = await pingGateway()
        if (healthy) {
          clearTimers()
          setPhase('ready')
          // Dispatch event so other components can re-subscribe to SSE / refetch
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gateway:restarted'))
            window.dispatchEvent(new CustomEvent('gateway:health-restored'))
          }
          // Auto-dismiss after 2.5s
          setTimeout(() => setPhase('idle'), 2_500)
        }
      })()
    }, HEALTH_POLL_INTERVAL_MS)
  }

  // Core restart flow (called after user confirms)
  async function executeRestart(saveProvider?: () => Promise<void>) {
    setPhase('restarting')
    setErrorMsg('')

    try {
      // Step 1: apply the config change
      if (saveProvider) {
        await saveProvider()
      }
      // Step 2: fire gateway restart
      await callGatewayRestart()
    } catch (err) {
      // Connection drop is expected — gateway is restarting
      const msg = err instanceof Error ? err.message : String(err)
      const isExpected =
        msg.includes('closed') ||
        msg.includes('Failed to fetch') ||
        msg.includes('timed out') ||
        msg.includes('NetworkError')

      if (!isExpected) {
        setPhase('error')
        setErrorMsg(msg)
        return
      }
    }

    // Step 3: poll until health check passes
    startRecoveryPolling()
  }

  const triggerRestart = useCallback(
    async (saveProvider?: () => Promise<void>) => {
      // Show the confirmation dialog; actual restart happens on confirm
      setConfirmState({ open: true, pendingSave: saveProvider ?? null })
    },
    [],
  )

  function handleConfirm() {
    const { pendingSave } = confirmState
    setConfirmState({ open: false, pendingSave: null })
    void executeRestart(pendingSave ?? undefined)
  }

  function handleCancel() {
    setConfirmState({ open: false, pendingSave: null })
  }

  function handleRetry() {
    setPhase('restarting')
    setErrorMsg('')
    startRecoveryPolling()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers()
  }, [])

  const isRestarting = phase === 'restarting'

  return (
    <GatewayRestartContext.Provider value={{ isRestarting, triggerRestart }}>
      {children}

      {/* Confirm dialog */}
      {confirmState.open ? (
        <ProviderRestartConfirmDialog
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : null}

      {/* Restart overlay */}
      {phase !== 'idle' ? (
        <GatewayRestartOverlayView
          phase={phase}
          errorMsg={errorMsg}
          onRetry={handleRetry}
          onDismiss={() => setPhase('idle')}
        />
      ) : null}
    </GatewayRestartContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────

/**
 * Returns a function to trigger the provider add/remove restart flow.
 * Shows a confirm dialog first, then restarts the gateway and polls for recovery.
 */
export function useGatewayRestart(): GatewayRestartContextValue {
  return useContext(GatewayRestartContext)
}

// ── Confirm Dialog ────────────────────────────────────────────────

function ProviderRestartConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-restart-title"
      aria-describedby="provider-restart-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-primary-950/30 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-[min(420px,92vw)] rounded-2xl border border-primary-200 bg-primary-50 p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/30">
            <HugeiconsIcon
              icon={RefreshIcon}
              size={18}
              strokeWidth={1.5}
              className="text-amber-600 dark:text-amber-400"
            />
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="provider-restart-title"
              className="text-sm font-semibold text-primary-900 dark:text-neutral-100"
            >
              Hermes restart required
            </h2>
            <p
              id="provider-restart-desc"
              className="mt-1 text-sm text-primary-600 text-pretty dark:text-neutral-400"
            >
              Adding or removing a provider requires a Hermes restart. Active
              sessions will be paused briefly. Continue?
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Restart & Apply
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Overlay View ──────────────────────────────────────────────────

function GatewayRestartOverlayView({
  phase,
  errorMsg,
  onRetry,
  onDismiss,
}: {
  phase: Exclude<RestartPhase, 'idle'>
  errorMsg: string
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9980] flex items-center justify-center p-4',
        'bg-primary-950/60 backdrop-blur-md',
        'transition-opacity duration-200 opacity-100',
      )}
      role="status"
      aria-live="polite"
      aria-label={
        phase === 'restarting'
          ? 'Hermes restarting'
          : phase === 'ready'
            ? 'Hermes ready'
            : 'Hermes restart failed'
      }
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary-200/60 bg-primary-50/95 px-8 py-8 shadow-2xl backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/95">
        {phase === 'restarting' ? (
          <>
            <BrailleSpinner
              preset="claw"
              size={32}
              className="text-accent-500"
              label="Hermes restarting"
            />
            <div className="text-center">
              <p className="text-base font-semibold text-primary-900 dark:text-neutral-100">
                Hermes restarting…
              </p>
              <p className="mt-1 text-sm text-primary-500 dark:text-neutral-400">
                Applying provider changes. Active sessions are paused.
              </p>
            </div>
            <ReconnectingBadge />
          </>
        ) : phase === 'ready' ? (
          <>
            <span className="inline-flex size-12 items-center justify-center rounded-full border border-green-200 bg-green-50 dark:border-green-700/40 dark:bg-green-900/30">
              <HugeiconsIcon
                icon={Tick02Icon}
                size={24}
                strokeWidth={1.5}
                className="text-green-600 dark:text-green-400"
              />
            </span>
            <div className="text-center">
              <p className="text-base font-semibold text-primary-900 dark:text-neutral-100">
                Hermes ready ✓
              </p>
              <p className="mt-1 text-sm text-primary-500 dark:text-neutral-400">
                Provider changes applied. Resuming…
              </p>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex size-12 items-center justify-center rounded-full border border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-900/30">
              <HugeiconsIcon
                icon={Alert02Icon}
                size={24}
                strokeWidth={1.5}
                className="text-red-600 dark:text-red-400"
              />
            </span>
            <div className="text-center">
              <p className="text-base font-semibold text-primary-900 dark:text-neutral-100">
                Hermes restart failed
              </p>
              <p className="mt-1 text-sm text-primary-500 dark:text-neutral-400 text-pretty">
                {errorMsg || 'Hermes did not come back in time.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onRetry}>
                <HugeiconsIcon
                  icon={RefreshIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                Retry
              </Button>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Small "Reconnecting..." badge shown in overlay during restart
function ReconnectingBadge() {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-100 px-3 py-1 dark:border-neutral-700 dark:bg-neutral-800">
      <span className="size-1.5 animate-pulse rounded-full bg-accent-500" />
      <span className="text-xs font-medium text-primary-600 dark:text-neutral-400">
        Reconnecting…
      </span>
    </div>
  )
}
