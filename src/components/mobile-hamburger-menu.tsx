import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  Cancel01Icon,
  Chat01Icon,
  Clock01Icon,
  CommandLineIcon,
  DashboardSquare01Icon,
  File01Icon,
  Menu01Icon,
  PuzzleIcon,
  Rocket01Icon,
  Settings01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import { getTheme, getThemeVariant, isDarkTheme, setTheme } from '@/lib/theme'
import {
  selectChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'

export const MOBILE_HAMBURGER_NAV_ITEMS = [
  {
    id: 'chat',
    label: 'Chat',
    icon: Chat01Icon,
    to: '/chat/main',
    match: (p: string) => p.startsWith('/chat') || p === '/new' || p === '/',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: DashboardSquare01Icon,
    to: '/dashboard',
    match: (p: string) => p.startsWith('/dashboard'),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: CommandLineIcon,
    to: '/terminal',
    match: (p: string) => p.startsWith('/terminal'),
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: Clock01Icon,
    to: '/jobs',
    match: (p: string) => p.startsWith('/jobs'),
  },
  {
    id: 'conductor',
    label: 'Conductor',
    icon: Rocket01Icon,
    to: '/conductor',
    match: (p: string) => p.startsWith('/conductor'),
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: UserMultipleIcon,
    to: '/operations',
    match: (p: string) => p.startsWith('/operations'),
  },
  {
    id: 'swarm',
    label: 'Swarm',
    icon: UserGroupIcon,
    to: '/swarm',
    match: (p: string) => p === '/swarm' || p.startsWith('/swarm2'),
  },

  {
    id: 'memory',
    label: 'Memory',
    icon: BrainIcon,
    to: '/memory',
    match: (p: string) => p.startsWith('/memory'),
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: PuzzleIcon,
    to: '/skills',
    match: (p: string) => p.startsWith('/skills'),
  },
  {
    id: 'profiles',
    label: 'Profiles',
    icon: UserGroupIcon,
    to: '/profiles',
    match: (p: string) => p.startsWith('/profiles'),
  },
]

/** Shared drawer state — used by both the trigger button and the drawer itself */
let _setOpen: ((v: boolean) => void) | null = null

/** Call this from anywhere (e.g. chat header) to open the nav drawer */
export function openHamburgerMenu() {
  hapticTap()
  _setOpen?.(true)
}

/** The hamburger trigger button — inline, no fixed positioning */
export function HamburgerTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Open navigation menu"
      onClick={openHamburgerMenu}
      className={cn(
        'flex items-center justify-center size-9 rounded-xl',
        'text-primary-400 hover:text-primary-200 active:scale-90 transition-all duration-150',
        'touch-manipulation select-none',
        className,
      )}
    >
      <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.8} />
    </button>
  )
}

/** Mount once in WorkspaceShell — renders the drawer + backdrop */
export function MobileHamburgerMenu() {
  const [open, setOpen] = useState(false)
  _setOpen = setOpen

  // Add/remove body class to push main content
  useEffect(() => {
    document.body.classList.toggle('nav-drawer-open', open)
    return () => {
      document.body.classList.remove('nav-drawer-open')
    }
  }, [open])

  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const profileDisplayName = useChatSettingsStore(selectChatProfileDisplayName)
  const isChatRoute =
    pathname.startsWith('/chat') || pathname === '/new' || pathname === '/'

  function handleNav(to: string) {
    hapticTap()
    void navigate({ to })
    setOpen(false)
  }

  return (
    <>
      {/* No floating button — each page has MobilePageHeader with HamburgerTrigger inline */}

      {/* Push-style layout wrapper — sidebar pushes content right */}
      <div
        className={cn(
          'fixed inset-0 z-[95] md:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'pointer-events-none',
        )}
      >
        {/* Main content overlay — dims and shifts right when sidebar is open */}
        <div
          className={cn(
            'absolute inset-0 transition-all duration-300 ease-in-out',
            open
              ? 'translate-x-72 opacity-40 scale-[0.92] rounded-2xl overflow-hidden'
              : 'translate-x-0 opacity-100 scale-100',
          )}
          onClick={() => open && setOpen(false)}
          style={open ? { transformOrigin: 'left center' } : undefined}
        />
      </div>

      {/* Slide-over drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 z-[96] w-72 md:hidden',
          'shadow-2xl',
          'flex flex-col pt-[max(env(safe-area-inset-top,20px),20px)] pb-[max(env(safe-area-inset-bottom,20px),20px)]',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background: 'var(--color-surface, #fff)',
          borderColor: 'var(--color-border, #e5e7eb)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pb-4"
          style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}
        >
          <div className="flex items-center gap-2.5">
            <img
              src="/hermes-avatar.webp"
              alt="Hermes"
              className="size-8 rounded-xl shrink-0"
            />
            <div className="flex flex-col leading-tight">
              <span
                className="font-bold text-[15px] tracking-tight"
                style={{ color: 'var(--color-ink, #111)' }}
              >
                Hermes
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-muted, #888)' }}
              >
                Workspace
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center size-8 rounded-full active:scale-90 transition-all"
            style={{ color: 'var(--color-muted, #888)' }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-3 pt-4 flex-1">
          {MOBILE_HAMBURGER_NAV_ITEMS.map((item) => {
            const isActive = item.match(pathname)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.to)}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl text-left w-full',
                  'transition-all duration-150 active:scale-[0.98]',
                )}
                style={
                  isActive
                    ? {
                        background:
                          'var(--theme-accent-subtle, color-mix(in srgb, var(--theme-accent, #6366f1) 12%, transparent))',
                        color:
                          'var(--theme-accent, var(--color-accent, #6366f1))',
                      }
                    : {
                        color:
                          'var(--theme-muted, var(--color-ink-muted, #555))',
                      }
                }
              >
                <HugeiconsIcon
                  icon={item.icon}
                  size={20}
                  strokeWidth={isActive ? 2 : 1.6}
                />
                <span className="text-[15px] font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Bottom — user profile + settings + theme toggle */}
        <div
          className="px-3 pb-2 pt-3"
          style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}
        >
          <div className="flex items-center gap-3 px-2">
            {/* User avatar + name + status dot */}
            <div
              className="size-9 rounded-xl shrink-0 flex items-center justify-center"
              style={{
                background:
                  'var(--theme-accent-subtle, color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent))',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  color: 'var(--theme-accent, var(--color-accent, #6366f1))',
                }}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span
              className="text-[15px] font-semibold truncate"
              style={{ color: 'var(--color-ink, #111)' }}
            >
              {profileDisplayName}
            </span>
            <span className="size-2.5 rounded-full bg-green-500 shrink-0" />

            <div className="flex-1" />

            {/* Settings cog */}
            <button
              type="button"
              onClick={() => handleNav('/settings')}
              className="flex items-center justify-center size-9 rounded-xl active:bg-white/10 transition-colors"
              aria-label="Settings"
              style={{ color: 'var(--color-ink-muted, #888)' }}
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                size={20}
                strokeWidth={1.5}
              />
            </button>

            {/* Theme toggle — sun/moon */}
            <button
              type="button"
              onClick={() => {
                const current = getTheme()
                const dark = isDarkTheme(current)
                const next = getThemeVariant(current, dark ? 'light' : 'dark')
                setTheme(next)
              }}
              className="flex items-center justify-center size-9 rounded-xl active:bg-white/10 transition-colors"
              aria-label="Toggle theme"
              style={{ color: 'var(--color-ink-muted, #888)' }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
