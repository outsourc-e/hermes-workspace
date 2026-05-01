'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { MobileSetupModal } from './MobileSetupModal'

export function MobilePromptTrigger() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [isDismissedForSession, setIsDismissedForSession] = useState(false)
  const mountTimeRef = useRef<number | null>(null)

  useEffect(() => {
    mountTimeRef.current = Date.now()

    // ?mobile-preview forces modal open immediately (dev/review only)
    // Strip the param from URL so navigation doesn't re-trigger it
    if (
      new URLSearchParams(window.location.search).get('mobile-preview') === '1'
    ) {
      const url = new URL(window.location.href)
      url.searchParams.delete('mobile-preview')
      window.history.replaceState({}, '', url.toString())
      setIsModalOpen(true)
      return
    }

    const isDismissed =
      localStorage.getItem('claude-mobile-access-dismissed') === 'true' ||
      localStorage.getItem('claude-mobile-prompt-dismissed') === 'true'
    const isSetup = localStorage.getItem('claude-mobile-setup-seen') === 'true'

    if (isDismissed || isSetup) {
      return
    }

    const checkPrompt = () => {
      if (!mountTimeRef.current) {
        return
      }

      const elapsedTime = Date.now() - mountTimeRef.current
      const isDesktop = window.innerWidth > 768
      const hasBeenOnPageLongEnough = elapsedTime >= 45_000

      if (isDesktop && hasBeenOnPageLongEnough && !isDismissedForSession) {
        setShowPrompt(true)
      }
    }

    checkPrompt()
    const interval = window.setInterval(checkPrompt, 5_000)
    return () => window.clearInterval(interval)
  }, [isDismissedForSession])

  const persistDismissalPreference = () => {
    if (dontShowAgain) {
      localStorage.setItem('claude-mobile-access-dismissed', 'true')
    }
  }

  const dismissPrompt = () => {
    persistDismissalPreference()
    setIsDismissedForSession(true)
    setShowPrompt(false)
  }

  const openSetup = () => {
    persistDismissalPreference()
    setIsDismissedForSession(true)
    setShowPrompt(false)
    setIsModalOpen(true)
  }

  const closeSetup = () => {
    persistDismissalPreference()
    setIsModalOpen(false)
  }

  return (
    <>
      <AnimatePresence>
        {showPrompt ? (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="fixed left-1/2 z-[9999] w-[90vw] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl shadow-2xl top-[calc(var(--titlebar-h,0px)+1rem)]"
            style={{
              background: 'var(--theme-card)',
              border: '1px solid var(--theme-border)',
              color: 'var(--theme-text)',
              boxShadow: 'var(--theme-shadow-3)',
            }}
          >
            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex shrink-0 items-center gap-1.5">
                  <img
                    src="/claude-avatar.webp"
                    alt="Claude"
                    className="size-8 rounded-lg"
                  />
                  <span className="text-xs text-primary-600">+</span>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-[#232b3b]">
                    <svg viewBox="0 0 100 100" className="size-5">
                      <circle
                        cx="50"
                        cy="10"
                        r="10"
                        fill="#fff"
                        opacity="0.9"
                      />
                      <circle cx="50" cy="50" r="10" fill="#fff" />
                      <circle
                        cx="50"
                        cy="90"
                        r="10"
                        fill="#fff"
                        opacity="0.9"
                      />
                      <circle
                        cx="10"
                        cy="30"
                        r="10"
                        fill="#fff"
                        opacity="0.6"
                      />
                      <circle
                        cx="90"
                        cy="30"
                        r="10"
                        fill="#fff"
                        opacity="0.6"
                      />
                      <circle
                        cx="10"
                        cy="70"
                        r="10"
                        fill="#fff"
                        opacity="0.6"
                      />
                      <circle
                        cx="90"
                        cy="70"
                        r="10"
                        fill="#fff"
                        opacity="0.6"
                      />
                      <circle
                        cx="10"
                        cy="50"
                        r="10"
                        fill="#fff"
                        opacity="0.3"
                      />
                      <circle
                        cx="90"
                        cy="50"
                        r="10"
                        fill="#fff"
                        opacity="0.3"
                      />
                    </svg>
                  </div>
                </div>

                <div className="min-w-0 flex-1 text-center">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    Set up mobile access
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Connect your phone to this Claude Workspace instance in a
                    few steps.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openSetup}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: 'var(--theme-accent)' }}
                  >
                    Set up
                  </button>
                  <button
                    type="button"
                    onClick={dismissPrompt}
                    className="rounded-lg p-1.5 transition-colors hover:opacity-80"
                    style={{ color: 'var(--theme-muted)' }}
                    aria-label="Dismiss mobile setup prompt"
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={16}
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>

              <label
                className="mt-3 flex items-center gap-2 text-xs"
                style={{ color: 'var(--theme-muted)' }}
              >
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(event) => setDontShowAgain(event.target.checked)}
                  className="size-3.5 rounded"
                  style={{
                    border: '1px solid var(--theme-border)',
                    background: 'var(--theme-card2)',
                  }}
                />
                <span>Don&apos;t show this again</span>
              </label>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MobileSetupModal isOpen={isModalOpen} onClose={closeSetup} />
    </>
  )
}
