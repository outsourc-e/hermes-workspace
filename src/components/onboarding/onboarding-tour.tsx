'use client'

import { useEffect, useState } from 'react'
import Joyride, { ACTIONS, STATUS } from 'react-joyride'
import { tourSteps } from './tour-steps'
import type { CallBackProps, Styles } from 'react-joyride'
import { useSettingsStore } from '@/hooks/use-settings'
import { useResolvedTheme } from '@/hooks/use-chat-settings'

const TOUR_STORAGE_KEY = 'claude-onboarding-completed'

// Accent color mapping to hex values
const ACCENT_COLORS = {
  orange: '#f97316',
  purple: '#a855f7',
  blue: '#3b82f6',
  green: '#10b981',
}

export function shouldCompleteOnboardingTour(
  action: string,
  status: string,
): boolean {
  const finishedStatuses: Array<string> = [STATUS.FINISHED, STATUS.SKIPPED]
  return finishedStatuses.includes(status) || action === ACTIONS.CLOSE
}

export function OnboardingTour() {
  const [mounted, setMounted] = useState(false)
  const [run, setRun] = useState(false)
  const accentColor = useSettingsStore((state) => state.settings.accentColor)
  const resolvedTheme = useResolvedTheme()
  const isDark = resolvedTheme === 'dark'

  // Wait for client-side mount before doing anything — prevents SSR hydration errors
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    try {
      const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY)
      if (hasCompletedTour) return

      // Wait for setup wizard to finish before starting tour
      const CLAUDE_SETUP_KEY = 'claude-configured'
      const checkAndStart = () => {
        const claudeConfigured =
          localStorage.getItem(CLAUDE_SETUP_KEY) === 'true'
        if (claudeConfigured) {
          setRun(true)
          return true
        }
        return false
      }

      // Check immediately
      if (checkAndStart()) return

      // Poll until setup wizard completes (check every 2s)
      const interval = setInterval(() => {
        if (checkAndStart()) clearInterval(interval)
      }, 2000)
      return () => clearInterval(interval)
    } catch {
      // ignore localStorage errors
    }
  }, [mounted])

  // Don't render Joyride at all during SSR — prevents localStorage/DOM errors
  if (!mounted) return null

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { action, status } = data
    const shouldCompleteTour = shouldCompleteOnboardingTour(action, status)

    if (shouldCompleteTour) {
      try {
        localStorage.setItem(TOUR_STORAGE_KEY, 'true')
      } catch {
        // ignore
      }
      setRun(false)
    }
  }

  const primaryColor = ACCENT_COLORS[accentColor] || ACCENT_COLORS.orange

  const styles: Partial<Styles> = {
    options: {
      primaryColor,
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      textColor: isDark ? '#f3f4f6' : '#1f2937',
      overlayColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
      arrowColor: isDark ? '#1f2937' : '#ffffff',
      zIndex: 10000,
    },
    tooltip: {
      borderRadius: 12,
      fontSize: 14,
      padding: 20,
    },
    tooltipContainer: {
      textAlign: 'center',
    },
    tooltipTitle: {
      fontSize: 16,
      fontWeight: 600,
      marginBottom: 8,
      color: isDark ? '#f9fafb' : '#111827',
      textAlign: 'center',
    },
    tooltipContent: {
      padding: '8px 0',
      fontSize: 14,
      lineHeight: 1.6,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    buttonNext: {
      backgroundColor: primaryColor,
      color: '#ffffff',
      borderRadius: 8,
      padding: '8px 16px',
      fontSize: 14,
      fontWeight: 500,
      transition: 'all 0.2s ease',
    },
    buttonBack: {
      color: isDark ? '#9ca3af' : '#6b7280',
      marginRight: 8,
      fontSize: 14,
    },
    buttonSkip: {
      color: isDark ? '#9ca3af' : '#9ca3af',
      fontSize: 14,
    },
    buttonClose: {
      width: 24,
      height: 24,
      padding: 0,
      top: 8,
      right: 8,
      opacity: 0.6,
      transition: 'all 0.2s ease',
    },
    spotlight: {
      borderRadius: 8,
    },
  }

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={styles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip tour',
      }}
      floaterProps={{
        disableAnimation: false,
        styles: {
          floater: {
            filter: 'drop-shadow(0 10px 15px rgba(0, 0, 0, 0.1))',
          },
        },
      }}
      spotlightPadding={4}
    />
  )
}
