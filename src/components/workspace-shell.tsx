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
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'
import { ChatSidebar } from '@/screens/chat/components/chat-sidebar'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { SIDEBAR_TOGGLE_EVENT } from '@/hooks/use-global-shortcuts'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
import { ChatPanel } from '@/components/chat-panel'
import { ChatPanelToggle } from '@/components/chat-panel-toggle'
import { LoginScreen } from '@/components/auth/login-screen'
import { HermesHealthBanner } from '@/components/hermes-health-banner'
import { MobileTabBar } from '@/components/mobile-tab-bar'
import { useMobileKeyboard } from '@/hooks/use-mobile-keyboard'
import { ErrorBoundary } from '@/components/error-boundary'
import { SystemMetricsFooter } from '@/components/system-metrics-footer'
import { CommandPalette } from '@/components/command-palette'
import { useSettings } from '@/hooks/use-settings'
import { Button } from '@/components/ui/button'
// ActivityTicker moved to dashboard-only (too noisy for global header)
import type { SessionMeta } from '@/screens/chat/types'

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

export function WorkspaceShell() {
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
    if (path.startsWith('/chat') || path === '/new' || path === '/') return 0
    if (path.startsWith('/files')) return 1
    if (path.startsWith('/terminal')) return 2
    if (path.startsWith('/memory')) return 3
    if (path.startsWith('/skills')) return 4
    if (path.startsWith('/settings')) return 5
    return -1
  }, [])

  // Fetch actual auth status from server instead of hardcoding
  interface AuthStatus {
    authenticated: boolean
    authRequired: boolean
    error?: string
  }

  const authQuery = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: async () => {
      const controller = new AbortController()
      const timeout = globalThis.setTimeout(() => controller.abort(), 5_000)

      let res: Response
      try {
        res = await fetch('/api/auth-check', { signal: controller.signal })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Request timed out after 5 seconds')
        }
        throw error instanceof Error
          ? error
          : new Error('Failed to connect to Hermes server')
      } finally {
        globalThis.clearTimeout(timeout)
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as AuthStatus
      if (data.error) throw new Error(data.error)
      return data
    },
    staleTime: 60_000,
    retry: 2,
    retryDelay: 1_000,
  })

  const authState = {
    checked: !authQuery.isLoading,
    authenticated: authQuery.data?.authenticated ?? false,
    authRequired: authQuery.data?.authRequired ?? true,
  }

  // Derive active session from URL
  const chatMatch = pathname.match(/^\/chat\/(.+)$/)
  const activeFriendlyId = chatMatch ? chatMatch[1] : 'main'
  const isOnChatRoute = Boolean(chatMatch) || pathname === '/new'
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
      const direction = currentIdx > prevIdx ? 'slide-enter-left' : 'slide-enter-right'
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

  // Show loading indicator while checking auth
  if (!authState.checked) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent-500 border-r-transparent mb-4" />
          <p className="text-sm text-primary-500">Initializing Hermes...</p>
        </div>
      </div>
    )
  }

  if (authQuery.isError) {
    const errorMessage =
      authQuery.error instanceof Error
        ? authQuery.error.message
        : 'Failed to connect to Hermes server'
    const showBackendHint = /gateway|websocket|backend/i.test(errorMessage)

    return (
      <div className="flex h-screen items-center justify-center bg-surface px-6">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-primary-800 bg-primary-900/80 text-2xl">
            <span role="img" aria-label="Warning">
              ⚠️
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-primary-100">
            Could not connect to Hermes server
          </h1>
          <p className="mt-3 text-sm text-primary-300">
            The server may still be starting up. Wait a moment and try again.
          </p>
          {showBackendHint ? (
            <p className="mt-3 text-sm text-accent-400">
              Make sure the Hermes backend is running:{' '}
              <code className="rounded bg-primary-900 px-1.5 py-0.5 text-xs text-primary-200">
                python -m webapi
              </code>
            </p>
          ) : null}
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void authQuery.refetch()}
            >
              <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.8} />
              Retry
            </Button>
            <Button size="lg" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </div>
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs text-primary-400">
              Details
            </summary>
            <p className="mt-2 rounded-lg border border-primary-800 bg-primary-900/80 px-3 py-2 text-xs text-primary-300">
              {errorMessage}
            </p>
          </details>
        </div>
      </div>
    )
  }

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
        {/* Electron: native-style title bar (absolute over the padding) */}
        {isElectron && (
          <div
            className="absolute inset-x-0 top-0 flex h-10 items-center border-b border-primary-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 z-40"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            {/* Traffic light spacer (left ~78px for macOS buttons) */}
            <div className="w-[78px] shrink-0" />
            {/* Centered title */}
            <div className="flex-1 text-center">
              <span className="text-[13px] font-medium select-none" style={{ color: 'var(--theme-accent, #B98A44)' }}>Hermes</span>
            </div>
            {/* Right spacer to balance */}
            <div className="w-[78px] shrink-0" />
          </div>
        )}
        <HermesHealthBanner />
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
              'h-full min-h-0 min-w-0 overflow-x-hidden bg-transparent',
              isOnChatRoute ? 'overflow-hidden' : 'overflow-y-auto',
              isMobile && !isOnChatRoute
                ? 'pb-[calc(var(--tabbar-h,120px)+0.5rem)]'
                : !isMobile &&
                    !isOnChatRoute &&
                    settings.showSystemMetricsFooter
                  ? 'pb-[calc(1.5rem+1.75rem)]'
                  : '',
            ].join(' ')}
            data-tour="chat-area"
          >
            <div className={['page-transition h-full', slideClass].filter(Boolean).join(' ')}>
              <ErrorBoundary
                className="h-full"
                title="Something went wrong"
                description="This page failed to render. Reload to try again."
              >
                <Outlet />
              </ErrorBoundary>
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
      </div>

      {isMobile ? <MobileTabBar /> : null}
      {settings.showSystemMetricsFooter ? <SystemMetricsFooter /> : null}
      <CommandPalette pathname={pathname} sessions={sessions} />
    </>
  )
}
