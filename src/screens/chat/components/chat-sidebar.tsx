import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BotIcon,
  Clock01Icon,
  ComputerTerminal01Icon,
  GlobeIcon,
  Home01Icon,
  ListViewIcon,
  PencilEdit02Icon,
  PlayCircleIcon,
  PuzzleIcon,
  Search01Icon,
  ApiIcon,
  CheckmarkCircle02Icon,
  Folder01Icon,
  Settings01Icon,
  Task01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useChatSettings as useSidebarSettings } from '../hooks/use-chat-settings'
import { useDeleteSession } from '../hooks/use-delete-session'
import { useRenameSession } from '../hooks/use-rename-session'
import { SettingsDialog } from '@/components/settings-dialog'
import { ProvidersDialog } from './providers-dialog'
import { SessionRenameDialog } from './sidebar/session-rename-dialog'
import { SessionDeleteDialog } from './sidebar/session-delete-dialog'
import { SidebarSessions } from './sidebar/sidebar-sessions'
import type { SessionMeta } from '../types'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { OpenClawStudioIcon } from '@/components/icons/clawsuite'
import { UserAvatar } from '@/components/avatars'
import { SEARCH_MODAL_EVENTS, useSearchModal } from '@/hooks/use-search-modal'
import {
  selectChatProfileAvatarDataUrl,
  selectChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import { GatewayStatusDot } from '@/components/gateway-status-indicator'
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from '@/components/ui/menu'
import { Sun02Icon, Moon02Icon } from '@hugeicons/core-free-icons'
import { applyTheme, useSettingsStore } from '@/hooks/use-settings'
import {
  extractProjects,
  normalizeStats,
  type WorkspaceProject,
} from '@/screens/projects/lib/workspace-types'
import { getProjectProgress } from '@/screens/projects/lib/workspace-utils'

function ThemeToggleMini() {
  const theme = useSettingsStore((state) => state.settings.theme)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'))

  return (
    <button
      type="button"
      onClick={() => {
        const nextTheme = isDark ? 'light' : 'dark'
        applyTheme(nextTheme)
        updateSettings({ theme: nextTheme })
      }}
      className="shrink-0 rounded-lg p-1.5 text-primary-400 hover:bg-primary-200 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-neutral-300 transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <HugeiconsIcon
        icon={isDark ? Sun02Icon : Moon02Icon}
        size={16}
        strokeWidth={1.5}
      />
    </button>
  )
}

type ChatSidebarProps = {
  sessions: Array<SessionMeta>
  activeFriendlyId: string
  creatingSession: boolean
  onCreateSession: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelectSession?: () => void
  onActiveSessionDelete?: () => void
  sessionsLoading: boolean
  sessionsFetching: boolean
  sessionsError: string | null
  onRetrySessions: () => void
}

type WorkspaceStats = ReturnType<typeof normalizeStats>

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function fetchWorkspaceStats(): Promise<WorkspaceStats> {
  const response = await fetch('/api/workspace/stats')
  const payload = await readPayload(response)
  if (!response.ok) {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null
    throw new Error(
      (typeof record?.error === 'string' && record.error) ||
        `Request failed with status ${response.status}`,
    )
  }
  return normalizeStats(payload)
}

async function fetchWorkspaceProjects(): Promise<Array<WorkspaceProject>> {
  const response = await fetch('/api/workspace/projects')
  const payload = await readPayload(response)
  if (!response.ok) {
    const record =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null
    throw new Error(
      (typeof record?.error === 'string' && record.error) ||
        `Request failed with status ${response.status}`,
    )
  }
  return extractProjects(payload)
}

function getProjectShortcutEmoji(name: string): string {
  if (name === 'ClawSuite') return '🔧'
  if (name === 'LuxeLab') return '💎'
  return '📁'
}

// ── Reusable nav item ───────────────────────────────────────────────────

type NavSectionItemDef = {
  kind: 'section'
  label: string
}

type NavLinkItemDef = {
  kind: 'link'
  to: string
  icon: unknown
  label: string
  active: boolean
  onClick?: () => void
  disabled?: boolean
  badge?: 'error-dot'
  countBadge?: {
    value: number
    tone?: 'default' | 'danger'
  }
  dataTour?: string
  search?: Record<string, string | undefined>
}

type NavButtonItemDef = {
  kind: 'button'
  icon: unknown
  label: string
  active: boolean
  onClick?: () => void
  disabled?: boolean
  badge?: 'error-dot'
  countBadge?: {
    value: number
    tone?: 'default' | 'danger'
  }
  dataTour?: string
}

type NavItemDef = NavSectionItemDef | NavLinkItemDef | NavButtonItemDef

function NavItem({
  item,
  isCollapsed,
  transition,
  onSelectSession,
}: {
  item: NavItemDef
  isCollapsed: boolean
  transition: Record<string, unknown>
  onSelectSession?: () => void
}) {
  if (item.kind === 'section') {
    if (isCollapsed) return null
    return (
      <div className="px-3 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[1.2px] text-primary-600">
        {item.label}
      </div>
    )
  }

  const cls = cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'w-full h-auto min-h-11 gap-2.5 py-2 md:min-h-0',
    isCollapsed ? 'justify-center px-0' : 'justify-start px-3',
    item.active
      ? 'bg-accent-500/10 text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-900/300/15'
      : 'text-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800',
  )

  const iconEl =
    item.badge === 'error-dot' ? (
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <HugeiconsIcon
          icon={item.icon as any}
          size={20}
          strokeWidth={1.5}
          className="size-5 shrink-0"
        />
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500" />
      </span>
    ) : (
      <HugeiconsIcon
        icon={item.icon as any}
        size={20}
        strokeWidth={1.5}
        className="size-5 shrink-0"
      />
    )

  const labelEl = (
    <AnimatePresence initial={false} mode="wait">
      {!isCollapsed ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left"
        >
          {item.label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  )

  const countBadge =
    !isCollapsed &&
    item.countBadge &&
    item.countBadge.value > 0 ? (
      <span
        className={cn(
          'ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
          item.countBadge.tone === 'danger'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-primary-200 text-primary-700 dark:bg-primary-800 dark:text-primary-300',
        )}
      >
        {item.countBadge.value}
      </span>
    ) : null

  const handleSelect = () => {
    item.onClick?.()
    onSelectSession?.()
  }

  if (item.kind === 'link') {
    if (isCollapsed) {
      return (
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              render={
                <Link
                  to={item.to}
                  search={item.search}
                  onClick={handleSelect}
                  className={cls}
                  data-tour={item.dataTour}
                >
                  {iconEl}
                </Link>
              }
            />
            <TooltipContent side="right">{item.label}</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      )
    }
    return (
      <Link
        to={item.to}
        search={item.search}
        onClick={handleSelect}
        className={cls}
        data-tour={item.dataTour}
      >
        {iconEl}
        {labelEl}
        {countBadge}
      </Link>
    )
  }

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger
            render={
              <Button
                disabled={item.disabled}
                variant="ghost"
                size="sm"
                onClick={handleSelect}
                className={cls}
                data-tour={item.dataTour}
              >
                {iconEl}
              </Button>
            }
          />
          <TooltipContent side="right">{item.label}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    )
  }

  return (
    <Button
      disabled={item.disabled}
      variant="ghost"
      size="sm"
      onClick={handleSelect}
      className={cls}
      data-tour={item.dataTour}
    >
      {iconEl}
      {labelEl}
      {countBadge}
    </Button>
  )
}

// ── Main component ──────────────────────────────────────────────────────

function ChatSidebarComponent({
  sessions,
  activeFriendlyId,
  isCollapsed,
  onToggleCollapse,
  onSelectSession,
  onActiveSessionDelete,
  sessionsLoading,
  sessionsFetching,
  sessionsError,
  onRetrySessions,
}: ChatSidebarProps) {
  const { settingsOpen, setSettingsOpen, handleOpenSettings } =
    useSidebarSettings()
  const profileDisplayName = useChatSettingsStore(selectChatProfileDisplayName)
  const profileAvatarDataUrl = useChatSettingsStore(
    selectChatProfileAvatarDataUrl,
  )
  const { deleteSession } = useDeleteSession()
  const { renameSession } = useRenameSession()
  const openSearchModal = useSearchModal((state) => state.openModal)
  const isSearchModalOpen = useSearchModal((state) => state.isOpen)
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })
  const projectsSearchId = useRouterState({
    select: function selectProjectSearch(state) {
      const project = state.location.search.project
      const projectId = state.location.search.projectId
      return typeof project === 'string'
        ? project
        : typeof projectId === 'string'
          ? projectId
          : null
    },
  })

  // Platform-aware modifier key
  const mod = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
        ? '⌘'
        : 'Ctrl+',
    [],
  )

  // Route active states
  const isDashboardActive = pathname === '/dashboard'
  const isAgentSwarmActive = pathname === '/agent-swarm'
  const isNewSessionActive =
    pathname === '/new' || pathname.startsWith('/chat/new')
  const isBrowserActive = pathname === '/browser'
  const isTerminalActive = pathname === '/terminal'
  const isTasksActive = pathname === '/tasks'
  const isProjectsActive = pathname.startsWith('/projects')
  const isReviewActive = pathname.startsWith('/review')
  const isRunsActive = pathname.startsWith('/runs')
  const isCronActive = pathname === '/cron'
  const isAgentsActive = pathname === '/agents'
  const isSkillsActive = pathname === '/skills'
  const isLogsActive = pathname === '/activity' || pathname === '/logs'

  const transition = {
    duration: 0.15,
    ease: isCollapsed ? 'easeIn' : 'easeOut',
  } as const

  const workspaceStatsQuery = useQuery({
    queryKey: ['workspace', 'sidebar-stats'],
    queryFn: fetchWorkspaceStats,
    refetchInterval: 20_000,
    retry: false,
  })
  const workspaceProjectsQuery = useQuery({
    queryKey: ['workspace', 'sidebar-projects'],
    queryFn: fetchWorkspaceProjects,
    refetchInterval: 20_000,
    retry: false,
  })
  const workspaceStats = workspaceStatsQuery.data
  const reviewCount = workspaceStats?.checkpointsPending ?? 0
  const activeRunCount = workspaceStats?.running ?? 0
  const projectShortcuts = (workspaceProjectsQuery.data ?? []).slice(0, 5)

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameSessionKey, setRenameSessionKey] = useState<string | null>(null)
  const [renameFriendlyId, setRenameFriendlyId] = useState<string | null>(null)
  const [renameSessionTitle, setRenameSessionTitle] = useState('')

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)
  const [deleteFriendlyId, setDeleteFriendlyId] = useState<string | null>(null)
  const [deleteSessionTitle, setDeleteSessionTitle] = useState('')
  const [providersOpen, setProvidersOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isHoverExpanded, setIsHoverExpanded] = useState(false)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  function handleOpenRename(session: SessionMeta) {
    setRenameSessionKey(session.key)
    setRenameFriendlyId(session.friendlyId)
    setRenameSessionTitle(
      session.label || session.title || session.derivedTitle || '',
    )
    setRenameDialogOpen(true)
  }

  function handleSaveRename(newTitle: string) {
    if (renameSessionKey) {
      void renameSession(renameSessionKey, renameFriendlyId, newTitle)
    }
    setRenameDialogOpen(false)
    setRenameSessionKey(null)
    setRenameFriendlyId(null)
  }

  function handleOpenDelete(session: SessionMeta) {
    setDeleteSessionKey(session.key)
    setDeleteFriendlyId(session.friendlyId)
    setDeleteSessionTitle(
      session.label ||
        session.title ||
        session.derivedTitle ||
        session.friendlyId,
    )
    setDeleteDialogOpen(true)
  }

  function handleConfirmDelete() {
    if (deleteSessionKey && deleteFriendlyId) {
      const isActive = deleteFriendlyId === activeFriendlyId
      if (isActive && onActiveSessionDelete) {
        onActiveSessionDelete()
      }
      void deleteSession(deleteSessionKey, deleteFriendlyId, isActive)
    }
    setDeleteDialogOpen(false)
    setDeleteSessionKey(null)
    setDeleteFriendlyId(null)
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (isMobile || !isCollapsed) {
      setIsHoverExpanded(false)
    }
  }, [isCollapsed, isMobile])

  const isVisuallyCollapsed = isCollapsed && !isHoverExpanded
  const isHoverPreviewExpanded = !isMobile && isCollapsed && isHoverExpanded

  function handleSidebarToggle() {
    if (isHoverPreviewExpanded) {
      setIsHoverExpanded(false)
      return
    }
    onToggleCollapse()
  }

  const asideProps = {
    className: cn(
      'border-r h-full overflow-hidden flex flex-col theme-sidebar theme-border',
      isMobile && 'fixed inset-y-0 left-0 z-50 shadow-2xl',
      isMobile && isCollapsed && 'pointer-events-none',
    ),
  }

  useEffect(() => {
    if (!isMobile || isCollapsed) return
    const node = sidebarRef.current
    if (!node) return

    const SWIPE_CLOSE_PX = 64
    const MAX_VERTICAL_DRIFT_PX = 72

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY }
    }

    function handleTouchEnd(event: TouchEvent) {
      const start = swipeStartRef.current
      swipeStartRef.current = null
      if (!start || event.changedTouches.length !== 1) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX) return
      if (dx <= -SWIPE_CLOSE_PX) {
        onToggleCollapse()
      }
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isCollapsed, isMobile, onToggleCollapse])

  useEffect(() => {
    function handleOpenSettingsFromSearch() {
      handleOpenSettings()
    }

    window.addEventListener(
      SEARCH_MODAL_EVENTS.OPEN_SETTINGS,
      handleOpenSettingsFromSearch,
    )
    return () => {
      window.removeEventListener(
        SEARCH_MODAL_EVENTS.OPEN_SETTINGS,
        handleOpenSettingsFromSearch,
      )
    }
  }, [handleOpenSettings])

  // ── Nav definitions ─────────────────────────────────────────────────

  // Search button definition (placed above Studio section)
  const searchItem: NavItemDef = {
    kind: 'button',
    icon: Search01Icon,
    label: 'Search',
    active: isSearchModalOpen,
    onClick: openSearchModal,
  }

  const topNavItems: NavItemDef[] = [
    {
      kind: 'link',
      to: '/dashboard',
      icon: Home01Icon,
      label: 'Dashboard',
      active: isDashboardActive,
      dataTour: 'dashboard',
    },
    {
      kind: 'link',
      to: '/agent-swarm',
      icon: BotIcon,
      label: 'Agent Hub',
      active: isAgentSwarmActive,
      dataTour: 'agent-hub',
    },
  ]

  const workspaceNavItems: NavItemDef[] = [
    {
      kind: 'section',
      label: 'WORKSPACE',
    },
    {
      kind: 'link',
      to: '/projects',
      icon: Folder01Icon,
      label: 'Projects',
      active: isProjectsActive,
    },
    {
      kind: 'link',
      to: '/review',
      icon: CheckmarkCircle02Icon,
      label: 'Review Queue',
      active: isReviewActive,
      countBadge:
        reviewCount > 0
          ? {
              value: reviewCount,
              tone: 'danger',
            }
          : undefined,
    },
    {
      kind: 'link',
      to: '/runs',
      icon: PlayCircleIcon,
      label: 'Runs / Console',
      active: isRunsActive,
      countBadge:
        activeRunCount > 0
          ? {
              value: activeRunCount,
            }
          : undefined,
    },
    {
      kind: 'link',
      to: '/agents',
      icon: UserGroupIcon,
      label: 'Agents',
      active: isAgentsActive,
    },
    {
      kind: 'link',
      to: '/skills',
      icon: PuzzleIcon,
      label: 'Skills & Memory',
      active: isSkillsActive,
      dataTour: 'skills',
    },
  ]

  const toolsNavItems: NavItemDef[] = [
    {
      kind: 'section',
      label: 'TOOLS',
    },
    {
      kind: 'link',
      to: '/browser',
      icon: GlobeIcon,
      label: 'Browser',
      active: isBrowserActive,
    },
    {
      kind: 'link',
      to: '/terminal',
      icon: ComputerTerminal01Icon,
      label: 'Terminal',
      active: isTerminalActive,
      dataTour: 'terminal',
    },
    {
      kind: 'link',
      to: '/tasks',
      icon: Task01Icon,
      label: 'Tasks',
      active: isTasksActive,
    },
    {
      kind: 'link',
      to: '/cron',
      icon: Clock01Icon,
      label: 'Cron Jobs',
      active: isCronActive,
    },
    {
      kind: 'link',
      to: '/activity',
      icon: ListViewIcon,
      label: 'Logs',
      active: isLogsActive,
    },
  ]

  const systemNavItems: NavItemDef[] = [
    {
      kind: 'section',
      label: 'SYSTEM',
    },
    {
      kind: 'button',
      icon: Settings01Icon,
      label: 'Settings',
      active: settingsOpen,
      onClick: handleOpenSettings,
    },
  ]

  return (
    <motion.aside
      ref={(node) => {
        sidebarRef.current = node
      }}
      initial={false}
      animate={{
        width: isVisuallyCollapsed
          ? isMobile
            ? 0
            : 48
          : isMobile
            ? '85vw'
            : 300,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        asideProps.className,
        isMobile && isCollapsed && 'pointer-events-none overflow-hidden',
      )}
      data-tour="sidebar-container"
      style={isMobile ? { maxWidth: 360 } : undefined}
      onMouseEnter={() => {
        if (!isMobile && isCollapsed) setIsHoverExpanded(true)
      }}
      onMouseLeave={() => {
        if (!isMobile) setIsHoverExpanded(false)
      }}
      aria-hidden={isMobile && isCollapsed ? true : undefined}
      {...(isMobile && isCollapsed ? { inert: '' as unknown as boolean } : {})}
    >
      {/* Electron title bar is rendered at shell level (workspace-shell.tsx) */}
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div
        layout
        transition={{ layout: transition }}
        className="relative flex h-12 items-center px-2"
      >
        <AnimatePresence initial={false}>
          {!isVisuallyCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
            >
              <Link
                to="/new"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'w-full pl-1.5 justify-start',
                )}
              >
                <OpenClawStudioIcon className="size-5 rounded-lg overflow-hidden" />
                ClawSuite
              </Link>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              onClick={handleSidebarToggle}
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    isVisuallyCollapsed ? 'Open Sidebar' : 'Close Sidebar'
                  }
                  className="absolute right-2 top-1/2 shrink-0 -translate-y-1/2 opacity-80 hover:opacity-100"
                  data-tour="sidebar-collapse-toggle"
                >
                  {isVisuallyCollapsed ? (
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={18}
                      strokeWidth={1.75}
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={ArrowLeft01Icon}
                      size={18}
                      strokeWidth={1.75}
                    />
                  )}
                </Button>
              }
            />
            <TooltipContent side="right">
              {isVisuallyCollapsed ? 'Open Sidebar' : 'Close Sidebar'}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      </motion.div>

      {/* ── Search (ChatGPT-style, above sections) ─────────────────── */}
      <div className="px-2 pb-1">
        <motion.div
          layout
          transition={{ layout: transition }}
          className="w-full"
        >
          <NavItem
            item={searchItem}
            isCollapsed={isVisuallyCollapsed}
            transition={transition}
            onSelectSession={onSelectSession}
          />
        </motion.div>
      </div>

      {/* ── New Session button ──────────────────────────────────────── */}
      {!isVisuallyCollapsed && (
        <div className="px-2 pb-1">
          <Link
            to="/chat/$sessionKey"
            params={{ sessionKey: 'new' }}
            onClick={() => {
              onSelectSession?.()
            }}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'w-full justify-start gap-2.5 px-3 py-2 text-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800',
              isNewSessionActive &&
                'bg-accent-500/10 text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-900/300/15',
            )}
            data-tour="new-session"
          >
            <HugeiconsIcon
              icon={PencilEdit02Icon}
              size={20}
              strokeWidth={1.5}
              className="size-5 shrink-0"
            />
            <span>New Session</span>
          </Link>
        </div>
      )}

      {/* ── Scrollable body: nav + sessions ─────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col">
        {/* Navigation sections */}
        <div className={cn('shrink-0 space-y-0.5 px-2', isMobile && 'order-2')}>
          {topNavItems.map((item) => (
            <motion.div
              key={`${item.kind}:${item.label}`}
              layout
              transition={{ layout: transition }}
              className="w-full"
            >
              <NavItem
                item={item}
                isCollapsed={isVisuallyCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </motion.div>
          ))}

          {workspaceNavItems.map((item) => (
            <motion.div
              key={`${item.kind}:${item.label}`}
              layout
              transition={{ layout: transition }}
              className="w-full"
            >
              <NavItem
                item={item}
                isCollapsed={isVisuallyCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </motion.div>
          ))}

          {!isVisuallyCollapsed && projectShortcuts.length > 0 && (
            <div className="pt-0.5">
              <NavItem
                item={{ kind: 'section', label: 'PROJECTS' }}
                isCollapsed={isVisuallyCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
              <div className="space-y-0.5">
                {projectShortcuts.map((project) => {
                  const progress = getProjectProgress(project)
                  const isDone =
                    progress >= 100 ||
                    ['completed', 'done'].includes(
                      project.status.trim().toLowerCase(),
                    )

                  return (
                    <Link
                      key={project.id}
                      to="/projects"
                      search={{
                        project: project.id,
                        projectId: undefined,
                        phaseId: undefined,
                        phaseName: undefined,
                        goal: undefined,
                      }}
                      onClick={() => {
                        onSelectSession?.()
                      }}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'sm' }),
                        'h-auto min-h-11 w-full justify-start gap-2.5 px-3 py-2 text-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800 md:min-h-0',
                        pathname === '/projects' &&
                          projectsSearchId === project.id &&
                          'bg-accent-500/10 text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-900/300/15',
                      )}
                    >
                      <span className="text-sm leading-none" aria-hidden="true">
                        {getProjectShortcutEmoji(project.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {project.name}
                      </span>
                      <span
                        className={cn(
                          'ml-auto inline-flex shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                          isDone
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-accent-500/15 text-accent-400',
                        )}
                      >
                        {progress}%
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {toolsNavItems.map((item) => (
            <motion.div
              key={`${item.kind}:${item.label}`}
              layout
              transition={{ layout: transition }}
              className="w-full"
            >
              <NavItem
                item={item}
                isCollapsed={isVisuallyCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </motion.div>
          ))}

          {systemNavItems.map((item) => (
            <motion.div
              key={`${item.kind}:${item.label}`}
              layout
              transition={{ layout: transition }}
              className="w-full"
            >
              <NavItem
                item={item}
                isCollapsed={isVisuallyCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </motion.div>
          ))}
        </div>

        {/* Sessions list */}
        <div
          className={cn(
            'shrink-0 border-t border-primary-200/60 mt-1',
            isMobile && 'order-1',
          )}
        >
          <AnimatePresence initial={false}>
            {!isVisuallyCollapsed && (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
                className="flex flex-col w-full min-h-0 h-full"
              >
                <div className="flex-1 min-h-0">
                  <SidebarSessions
                    sessions={sessions}
                    activeFriendlyId={activeFriendlyId}
                    onSelect={onSelectSession}
                    onRename={handleOpenRename}
                    onDelete={handleOpenDelete}
                    loading={sessionsLoading}
                    fetching={sessionsFetching}
                    error={sessionsError}
                    onRetry={onRetrySessions}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* end scrollable body */}

      {/* ── Footer with User Menu ─────────────────────────────────── */}
      <div className="px-2 py-2.5 border-t shrink-0 theme-border theme-panel">
        {/* User card + actions */}
        <div
          className={cn(
            'flex items-center rounded-lg transition-colors',
            isVisuallyCollapsed ? 'flex-col gap-2 py-2' : 'gap-2.5 px-2 py-1.5',
          )}
        >
          {/* User menu trigger */}
          <MenuRoot>
            <MenuTrigger
              data-tour="settings"
              className={cn(
                'flex items-center gap-2.5 rounded-lg py-1 transition-colors hover:bg-primary-200 dark:hover:bg-neutral-800 flex-1 min-w-0',
                isVisuallyCollapsed ? 'justify-center px-0' : 'px-1.5',
              )}
            >
              <UserAvatar
                size={28}
                src={profileAvatarDataUrl}
                alt={profileDisplayName}
              />
              <AnimatePresence initial={false} mode="wait">
                {!isVisuallyCollapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={transition}
                    className="flex-1 min-w-0 flex items-center gap-1.5"
                  >
                    <span className="block truncate text-sm font-medium text-primary-900 dark:text-neutral-100">
                      {profileDisplayName}
                    </span>
                    <GatewayStatusDot />
                  </motion.div>
                )}
              </AnimatePresence>
            </MenuTrigger>
            <MenuContent side="top" align="start" className="min-w-[200px]">
              <MenuItem
                onClick={function onOpenSettings() {
                  setSettingsOpen(true)
                }}
                className="justify-between"
              >
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Settings01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                  Settings
                </span>
                <kbd className="ml-auto text-[10px] text-primary-500 dark:text-neutral-400 font-mono">
                  {mod},
                </kbd>
              </MenuItem>
              <MenuItem
                onClick={function onOpenProviders() {
                  setProvidersOpen(true)
                }}
                className="justify-between"
              >
                <span className="flex items-center gap-2">
                  <HugeiconsIcon icon={ApiIcon} size={20} strokeWidth={1.5} />
                  Providers
                </span>
                <kbd className="ml-auto text-[10px] text-primary-500 dark:text-neutral-400 font-mono">
                  {mod}P
                </kbd>
              </MenuItem>
            </MenuContent>
          </MenuRoot>

          {/* Settings + Theme toggle */}
          {!isVisuallyCollapsed && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 rounded-lg p-1.5 text-primary-400 hover:bg-primary-200 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-neutral-300 transition-colors"
                aria-label="Settings"
              >
                <HugeiconsIcon
                  icon={Settings01Icon}
                  size={16}
                  strokeWidth={1.5}
                />
              </button>
              <ThemeToggleMini />
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <ProvidersDialog open={providersOpen} onOpenChange={setProvidersOpen} />

      <SessionRenameDialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open)
          if (!open) {
            setRenameSessionKey(null)
            setRenameFriendlyId(null)
            setRenameSessionTitle('')
          }
        }}
        sessionTitle={renameSessionTitle}
        onSave={handleSaveRename}
        onCancel={() => {
          setRenameDialogOpen(false)
          setRenameSessionKey(null)
          setRenameFriendlyId(null)
          setRenameSessionTitle('')
        }}
      />

      <SessionDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        sessionTitle={deleteSessionTitle}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </motion.aside>
  )
}

function areSessionsEqual(
  prevSessions: Array<SessionMeta>,
  nextSessions: Array<SessionMeta>,
): boolean {
  if (prevSessions === nextSessions) return true
  if (prevSessions.length !== nextSessions.length) return false
  for (let i = 0; i < prevSessions.length; i += 1) {
    const prev = prevSessions[i]
    const next = nextSessions[i]
    if (prev.key !== next.key) return false
    if (prev.friendlyId !== next.friendlyId) return false
    if (prev.label !== next.label) return false
    if (prev.title !== next.title) return false
    if (prev.derivedTitle !== next.derivedTitle) return false
    if (prev.updatedAt !== next.updatedAt) return false
    if (prev.titleStatus !== next.titleStatus) return false
    if (prev.titleSource !== next.titleSource) return false
    if (prev.titleError !== next.titleError) return false
  }
  return true
}

function areSidebarPropsEqual(
  prevProps: ChatSidebarProps,
  nextProps: ChatSidebarProps,
): boolean {
  if (prevProps.activeFriendlyId !== nextProps.activeFriendlyId) return false
  if (prevProps.creatingSession !== nextProps.creatingSession) return false
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false
  if (prevProps.sessionsLoading !== nextProps.sessionsLoading) return false
  if (prevProps.sessionsFetching !== nextProps.sessionsFetching) return false
  if (prevProps.sessionsError !== nextProps.sessionsError) return false
  if (prevProps.onRetrySessions !== nextProps.onRetrySessions) return false
  if (!areSessionsEqual(prevProps.sessions, nextProps.sessions)) return false
  return true
}

const MemoizedChatSidebar = memo(ChatSidebarComponent, areSidebarPropsEqual)

export { MemoizedChatSidebar as ChatSidebar }
