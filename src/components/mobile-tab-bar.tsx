import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  Building01Icon,
  Chat01Icon,
  Clock01Icon,
  CommandLineIcon,
  DashboardSquare01Icon,
  File01Icon,
  PuzzleIcon,
  Settings01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { TouchEvent } from 'react'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import { useSettings } from '@/hooks/use-settings'

/** Height constant for consistent bottom insets on mobile routes with tab bar */
export const MOBILE_TAB_BAR_OFFSET = 'var(--tabbar-h, 80px)'

/**
 * Z-index layer map (documented for maintainability):
 *   z-40  — tab bar (below everything interactive)
 *   z-50  — chat composer input area
 *   z-60  — quick menus, modal sheets, overlays
 *   z-70  — composer wrapper (fixed on mobile)
 */

type TabItem = {
  id: string
  label: string
  icon: typeof Chat01Icon
  to: string
  match: (path: string) => boolean
}

export const MOBILE_NAV_TABS: Array<TabItem> = [
  {
    id: 'dashboard',
    label: 'Home',
    icon: DashboardSquare01Icon,
    to: '/dashboard',
    match: (p) => p === '/dashboard',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: Chat01Icon,
    to: '/chat/main',
    match: (p) => p.startsWith('/chat') || p === '/new',
  },
  {
    id: 'agora',
    label: 'Agora',
    icon: Building01Icon,
    to: '/agora',
    match: (p) => p.startsWith('/agora'),
  },
  {
    id: 'files',
    label: 'Files',
    icon: File01Icon,
    to: '/files',
    match: (p) => p.startsWith('/files'),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: CommandLineIcon,
    to: '/terminal',
    match: (p) => p.startsWith('/terminal'),
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: Clock01Icon,
    to: '/jobs',
    match: (p) => p.startsWith('/jobs'),
  },
  {
    id: 'swarm',
    label: 'Swarm',
    icon: UserGroupIcon,
    to: '/swarm',
    match: (p) => p === '/swarm' || p.startsWith('/swarm2'),
  },

  {
    id: 'memory',
    label: 'Memory',
    icon: BrainIcon,
    to: '/memory',
    match: (p) => p.startsWith('/memory'),
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: PuzzleIcon,
    to: '/skills',
    match: (p) => p.startsWith('/skills'),
  },
  {
    id: 'profiles',
    label: 'Profiles',
    icon: UserGroupIcon,
    to: '/profiles',
    match: (p) => p.startsWith('/profiles'),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings01Icon,
    to: '/settings',
    match: (p) => p.startsWith('/settings'),
  },
]

export function MobileTabBar() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navRef = useRef<HTMLElement>(null)

  // Drag-to-switch state
  const dragStartXRef = useRef<number | null>(null)
  const dragStartTimeRef = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const { settings } = useSettings()
  void settings.mobileChatNavMode // reserved for future use
  const isOnChat =
    pathname.startsWith('/chat') || pathname === '/new' || pathname === '/'

  // Always hide tab bar on chat routes — iMessage/Telegram pattern
  const isChatRoute = isOnChat

  // Drag-to-switch: horizontal swipe across pill switches tabs
  const handlePillTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    dragStartXRef.current = event.touches[0].clientX
    dragStartTimeRef.current = Date.now()
    setIsDragging(false)
  }, [])

  const handlePillTouchMove = useCallback((_event: TouchEvent<HTMLElement>) => {
    if (dragStartXRef.current !== null) {
      setIsDragging(true)
    }
  }, [])

  const handlePillTouchEnd = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const startX = dragStartXRef.current
      dragStartXRef.current = null
      setIsDragging(false)

      if (startX === null) return
      const endX = event.changedTouches[0].clientX
      const delta = endX - startX
      const elapsed = Date.now() - (dragStartTimeRef.current ?? Date.now())
      const pillWidth = navRef.current?.getBoundingClientRect().width ?? 200
      // Fast flick (< 250ms) needs less distance, slow drag needs 20% of pill width
      const threshold = elapsed < 250 ? 20 : pillWidth * 0.2

      if (Math.abs(delta) < threshold) return

      const currentIdx = MOBILE_NAV_TABS.findIndex((tab) => tab.match(pathname))
      const nextIdx =
        delta < 0
          ? Math.min(currentIdx + 1, MOBILE_NAV_TABS.length - 1) // swipe left → next tab
          : Math.max(currentIdx - 1, 0) // swipe right → prev tab

      if (
        nextIdx !== currentIdx &&
        nextIdx >= 0 &&
        nextIdx < MOBILE_NAV_TABS.length
      ) {
        hapticTap()
        void navigate({ to: MOBILE_NAV_TABS[nextIdx].to })
      }
    },
    [navigate, pathname],
  )

  // Measure pill for --tabbar-h (~80px total = pill + bottom offset)
  useLayoutEffect(() => {
    const root = document.documentElement
    const measure = () => {
      const el = navRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) return
      // pill height + its bottom margin (safe-area + 8px) + 12px breathing room
      const safeArea =
        window.innerHeight - document.documentElement.clientHeight || 0
      const bottomInset = Math.max(safeArea, 16) + 8
      const total = Math.ceil(rect.height) + bottomInset + 12
      root.style.setProperty('--tabbar-h', `${total}px`)
    }

    measure()
    const ro = new ResizeObserver(measure)
    if (navRef.current) ro.observe(navRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Keep --tabbar-h fresh when tab bar hides/shows
  useEffect(() => {
    const root = document.documentElement
    if (isChatRoute) {
      // Tab bar hidden in chat routes — remove extra padding
      root.style.setProperty('--tabbar-h', '0px')
    } else {
      // Restore measured value on next paint
      const el = navRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        if (rect.height > 0) {
          const safeArea2 =
            window.innerHeight - document.documentElement.clientHeight || 0
          const bInset = Math.max(safeArea2, 16) + 8
          root.style.setProperty(
            '--tabbar-h',
            `${Math.ceil(rect.height) + bInset + 12}px`,
          )
        }
      }
    }
  }, [isChatRoute])

  return (
    <>
      <nav
        ref={navRef}
        className={cn(
          // Pill: fixed bottom center, shrink to content width
          'fixed bottom-0 left-0 right-0 mx-auto w-fit z-[80] md:hidden',
          // Vertical position: above home indicator
          'mb-[max(env(safe-area-inset-bottom,8px),16px)]',
          // Keep the pill visually isolated from page and error-state backgrounds
          'bg-surface/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface/90',
          'rounded-full',
          'border border-primary-200/40',
          // Inner padding
          'px-3 py-2',
          // Hide/show animation
          'transition-all duration-300 ease-in-out',
          isChatRoute
            ? 'translate-y-[200%] opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100',
          isDragging ? 'cursor-grabbing' : '',
        )}
        aria-label="Mobile navigation"
        onTouchStart={handlePillTouchStart}
        onTouchMove={handlePillTouchMove}
        onTouchEnd={handlePillTouchEnd}
      >
        <div className="flex items-center gap-1">
          {MOBILE_NAV_TABS.map((tab, idx) => {
            const isActive = tab.match(pathname)
            const isCenter = tab.id === 'chat'
            const circleSize =
              isCenter && isActive ? 'size-10' : isActive ? 'size-9' : 'size-10'

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  // Don't fire navigate if this was a drag swipe
                  if (!isDragging) {
                    hapticTap()
                    void navigate({ to: tab.to })
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                className={cn(
                  // 40x40 touch target (slightly smaller to fit 5 tabs)
                  'flex items-center justify-center',
                  'size-10 rounded-full',
                  'transition-all duration-200 active:scale-90',
                  'select-none touch-manipulation',
                  'outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0',
                )}
                data-tab-idx={idx}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full transition-all duration-200',
                    circleSize,
                    isActive
                      ? 'bg-accent-500 text-white shadow-sm'
                      : 'text-primary-500',
                  )}
                >
                  <HugeiconsIcon
                    icon={tab.icon}
                    size={isCenter ? 20 : 18}
                    strokeWidth={isActive ? 2 : 1.6}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
