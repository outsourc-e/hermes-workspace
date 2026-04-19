/**
 * WorkspaceShell — persistent layout wrapper.
 *
 * ┌──────────┬──────────────────────────┐
 * │ Sidebar  │  Content (Outlet)        │
 * │ (nav +   │  (sub-page or chat)      │
 * │ sessions)│                          │
 * └──────────┴──────────────────────────┘
 *
 * The sidebar is always visible. Routes render in the content area.
 * Chat routes get the full ChatScreen treatment.
 * Non-chat routes show the sub-page content.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import type { SessionMeta } from '@/screens/chat/types'
import type { AuthStatus } from '@/lib/hermes-auth'
import { cn } from '@/lib/utils'
import { ConnectionStartupScreen } from '@/components/connection-startup-screen'
import { ChatSidebar } from '@/screens/chat/components/chat-sidebar'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
import { ChatPanel } from '@/components/chat-panel'
import { ChatPanelToggle } from '@/components/chat-panel-toggle'
import { LoginScreen } from '@/components/auth/login-screen'
import { MobileTabBar } from '@/components/mobile-tab-bar'
import { MobileHamburgerMenu } from '@/components/mobile-hamburger-menu'
import { MobilePageHeader } from '@/components/mobile-page-header'

import { MobileTerminalInput } from '@/components/terminal/mobile-terminal-input'
import { HermesReconnectBanner } from '@/components/hermes-reconnect-banner'
import { useMobileKeyboard } from '@/hooks/use-mobile-keyboard'
// System metrics footer removed — not used in Hermes Workspace
import { CommandPalette } from '@/components/command-palette'
import { useSettings } from '@/hooks/use-settings'
// ActivityTicker moved to dashboard-only (too noisy for global header)

const TerminalWorkspace = lazy(() =>
  import('@/components/terminal/terminal-workspace').then((m) => ({
    default: m.TerminalWorkspace,
  })),
)

type SessionsListResponse = Array<SessionMeta>
export const DESKTOP_SIDEBAR_BACKDROP_CLASS =
  'fixed left-0 bottom-0 top-[var(--titlebar-h,0px)] w-[300px] z-10 bg-black/10 backdrop-blur-[1px]'

async function fetchSessions(): Promise<SessionsListResponse> {
  const res = await fetch('/api/sessions')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.sessions)
    ? data.sessions
    : Array.isArray(data)
      ? data
      : []
}

type WorkspaceShellProps = {
  children?: React.ReactNode
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isElectron = useMemo(
    () =>
      typeof navigator !== 'undefined' && /Electron/.test(navigator.userAgent),
    [],
  )

  const { settings } = useSettings()
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const chatFocusMode = useWorkspaceStore((s) => s.chatFocusMode)
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed)
  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipeNavigation()

  // ChatGPT-style: track visual viewport height for keyboard-aware layout
  useMobileKeyboard()

  const [creatingSession, setCreatingSession] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })

  // Slide transition direction tracking (mobile only)
  const [slideClass, setSlideClass] = useState<string>('')
  const prevTabIndexRef = useRef<number>(-1)

  // Map pathname to tab index (mirrors TABS order in mobile-tab-bar)
  const getTabIndex = useCallback((path: string): number => {
    if (path === '/dashboard') return 0
    if (path.startsWith('/chat') || path === '/new' || path === '/') return 1
    if (path.startsWith('/files')) return 2
    if (path.startsWith('/terminal')) return 3
    if (path.startsWith('/jobs')) return 4
    if (path.startsWith('/memory')) return 5
    if (path.startsWith('/skills')) return 6
    if (path.startsWith('/profiles')) return 7
    if (path.startsWith('/settings')) return 8
    return -1
  }, [])

  const isClient = typeof window !== 'undefined'
  // Both SSR and client start with the same value to avoid hydration mismatch.
  // The ConnectionStartupScreen overlay verifies the real status on mount.
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [connectionVerified, setConnectionVerified] = useState(false)

  const authState = {
    checked: !isClient || connectionVerified,
    authenticated: authStatus?.authenticated ?? true,
    authRequired: authStatus?.authRequired ?? false,
  }

  const handleStartupConnected = useCallback((status: AuthStatus) => {
    setAuthStatus(status)
    setConnectionVerified(true)
  }, [])

  // Derive active session from URL
  const mobilePageTitle = (() => {
    if (pathname.startsWith('/terminal')) return 'Terminal'
    if (pathname.startsWith('/files')) return 'Files'
    if (pathname.startsWith('/jobs')) return 'Jobs'
    if (pathname.startsWith('/memory')) return 'Memory'
    if (pathname.startsWith('/skills')) return 'Skills'
    if (pathname.startsWith('/profiles')) return 'Profiles'
    if (pathname.startsWith('/settings')) return 'Settings'
    if (pathname.startsWith('/debug')) return 'Debug'
    if (pathname.startsWith('/activity')) return 'Activity'
    return null
  })()

  const chatMatch = pathname.match(/^\/chat\/(.+)$/)
  const activeFriendlyId = chatMatch ? chatMatch[1] : 'main'
  const isOnChatRoute = Boolean(chatMatch) || pathname === '/new'
  const isOnTerminalRoute = pathname.startsWith('/terminal')
  const hideChatSidebar = isOnChatRoute && chatFocusMode
  const showDesktopSidebarBackdrop =
    !isMobile && !isOnChatRoute && !sidebarCollapsed

  // Sessions query — shared across sidebar and chat
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const sessions = sessionsQuery.data ?? []
  const sessionsLoading = sessionsQuery.isLoading
  const sessionsFetching = sessionsQuery.isFetching
  const sessionsError = sessionsQuery.isError
    ? sessionsQuery.error instanceof Error
      ? sessionsQuery.error.message
      : 'Failed to load sessions'
    : null

  const refetchSessions = useCallback(() => {
    void sessionsQuery.refetch()
  }, [sessionsQuery])

  const startNewChat = useCallback(() => {
    setCreatingSession(true)
    navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } }).then(
      () => {
        setCreatingSession(false)
      },
    )
  }, [navigate])

  const handleSelectSession = useCallback(() => {
    // On mobile, collapse sidebar after selecting
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true)
    }
  }, [setSidebarCollapsed])

  const handleActiveSessionDelete = useCallback(() => {
    navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'main' } })
  }, [navigate])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const titlebarHeight = isElectron ? '40px' : '0px'
    document.documentElement.style.setProperty('--titlebar-h', titlebarHeight)
    return () => {
      document.documentElement.style.removeProperty('--titlebar-h')
    }
  }, [isElectron])

  // Keep mobile sidebar state closed after resize and route changes.
  useEffect(() => {
    if (!isMobile) return
    setSidebarCollapsed(true)
  }, [isMobile, pathname, setSidebarCollapsed])

  // Slide transitions on mobile tab navigation
  useEffect(() => {
    if (!isMobile) return
    const currentIdx = getTabIndex(pathname)
    const prevIdx = prevTabIndexRef.current

    if (prevIdx !== -1 && currentIdx !== -1 && currentIdx !== prevIdx) {
      // Navigate right (higher index) = slide left; left = slide right
      const direction =
        currentIdx > prevIdx ? 'slide-enter-left' : 'slide-enter-right'
      setSlideClass(direction)
      // Remove class after animation completes
      const timer = setTimeout(() => setSlideClass(''), 250)
      prevTabIndexRef.current = currentIdx
      return () => clearTimeout(timer)
    }

    prevTabIndexRef.current = currentIdx
    return undefined
  }, [isMobile, pathname, getTabIndex])

  // Listen for global sidebar toggle shortcut
  useEffect(() => {
    function handleToggleEvent() {
      if (isMobile) {
        setSidebarCollapsed(true)
        return
      }
      toggleSidebar()
    }
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleEvent)
    return () =>
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggleEvent)
  }, [isMobile, setSidebarCollapsed, toggleSidebar])

  // Show login screen if auth is required and not authenticated
  if (authState.authRequired && !authState.authenticated) {
    return <LoginScreen />
  }

  const shellStyle: React.CSSProperties & Record<'--titlebar-h', string> = {
    height: 'var(--vvh, 100dvh)',
    paddingTop: isElectron ? 40 : 0,
    '--titlebar-h': isElectron ? '40px' : '0px',
  }

  return (
    <>
      <div
        className="relative overflow-hidden theme-bg theme-text"
        style={shellStyle}
      >
        <HermesReconnectBanner enabled={authState.checked} />
        {/* Electron: native-style title bar (absolute over the padding) */}
        {isElectron && (
          <div
            className="absolute inset-x-0 top-0 flex h-10 items-center border-b border-primary-200 z-40"
            style={
              {
                WebkitAppRegion: 'drag',
                background: 'var(--theme-sidebar)',
              } as React.CSSProperties
            }
          >
            {/* Traffic light spacer (left ~78px for macOS buttons) */}
            <div className="w-[78px] shrink-0" />
            {/* Centered title */}
            <div className="flex-1 text-center">
              <span
                className="text-[13px] font-medium select-none"
                style={{ color: 'var(--theme-accent, #B98A44)' }}
              >
                Hermes
              </span>
            </div>
            {/* Right spacer to balance */}
            <div className="w-[78px] shrink-0" />
          </div>
        )}
        <div
          className={cn(
            'grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden',
            hideChatSidebar ? 'md:grid-cols-1' : 'md:grid-cols-[auto_1fr]',
          )}
        >
          {/* Activity ticker bar */}
          {/* Persistent sidebar */}
          {!isMobile && !hideChatSidebar && (
            <div className="relative z-30">
              <ChatSidebar
                sessions={sessions}
                activeFriendlyId={activeFriendlyId}
                creatingSession={creatingSession}
                onCreateSession={startNewChat}
                isCollapsed={sidebarCollapsed}
                onToggleCollapse={toggleSidebar}
                onSelectSession={handleSelectSession}
                onActiveSessionDelete={handleActiveSessionDelete}
                sessionsLoading={sessionsLoading}
                sessionsFetching={sessionsFetching}
                sessionsError={sessionsError}
                onRetrySessions={refetchSessions}
              />
            </div>
          )}

          {/* Main content area — renders the matched route */}
          <main
            onTouchStart={isMobile ? onTouchStart : undefined}
            onTouchMove={isMobile ? onTouchMove : undefined}
            onTouchEnd={isMobile ? onTouchEnd : undefined}
            className={[
              'h-full min-h-0 min-w-0 overflow-x-hidden bg-[var(--theme-bg)] relative',
              isOnChatRoute ? 'overflow-hidden' : 'overflow-y-auto',
              isMobile && !isOnChatRoute
                ? 'pb-[calc(var(--tabbar-h,0px)+0.5rem)]'
                : !isMobile &&
                    !isOnChatRoute &&
                    settings.showSystemMetricsFooter
                  ? 'pb-[calc(1.5rem+1.75rem)]'
                  : '',
            ].join(' ')}
            data-tour="chat-area"
          >
            {/* Persistent terminal — stays mounted to preserve session across navigation */}
            <div
              className="flex flex-col"
              style={{
                position: 'absolute',
                inset: 0,
                visibility: isOnTerminalRoute ? 'visible' : 'hidden',
                pointerEvents: isOnTerminalRoute ? 'auto' : 'none',
                zIndex: isOnTerminalRoute ? 1 : -1,
              }}
            >
              {isMobile && isOnTerminalRoute && (
                <MobilePageHeader title="Terminal" />
              )}
              <div className="flex-1 min-h-0 overflow-hidden">
                <Suspense fallback={null}>
                  <TerminalWorkspace
                    mode="fullscreen"
                    panelVisible={isOnTerminalRoute}
                  />
                </Suspense>
              </div>
              {/* Mobile input bar — sibling to terminal, NOT a child, so SSE re-renders don't freeze it */}
              {isMobile && <MobileTerminalInput />}
            </div>

            <div
              className={[
                'page-transition h-full flex flex-col',
                slideClass,
                isOnTerminalRoute ? 'hidden' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {isMobile &&
                !isOnChatRoute &&
                !isOnTerminalRoute &&
                mobilePageTitle && <MobilePageHeader title={mobilePageTitle} />}
              {children}
            </div>
          </main>

          {/* Chat panel — visible on non-chat routes */}
          {!isOnChatRoute && !isMobile && <ChatPanel />}
        </div>

        {/* Floating chat toggle — visible on non-chat routes */}
        {!isOnChatRoute && !isMobile && <ChatPanelToggle />}

        {showDesktopSidebarBackdrop ? (
          <button
            type="button"
            aria-label="Collapse navigation sidebar"
            onClick={() => setSidebarCollapsed(true)}
            className={DESKTOP_SIDEBAR_BACKDROP_CLASS}
          />
        ) : null}

        {!authState.checked ? (
          <ConnectionStartupScreen onConnected={handleStartupConnected} />
        ) : null}
      </div>

      <MobileHamburgerMenu />
      {/* System metrics footer removed */}
      <CommandPalette pathname={pathname} sessions={sessions} />
    </>
  )
}
