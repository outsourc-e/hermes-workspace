import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  BrainIcon,
  Chat01Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  File01Icon,
  MessageMultiple01Icon,
  PencilEdit02Icon,
  PuzzleIcon,
  Search01Icon,

  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  CHAT_OPEN_SETTINGS_EVENT,
  type ChatOpenSettingsDetail,
} from '../chat-events'
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
type WorkspaceStats = Record<string, unknown>

function ThemeToggleMini() {
  const _theme = useSettingsStore((state) => state.settings.theme)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  void _theme
  // Detect dark/light from actual data-theme attribute
  const currentDataTheme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') || 'hermes-official'
    : 'hermes-official'
  const isDark = !currentDataTheme.endsWith('-light')

  // Map between dark and light counterparts
  const LIGHT_DARK_PAIRS: Record<string, string> = {
    'hermes-official': 'hermes-official-light',
    'hermes-official-light': 'hermes-official',
    'hermes-classic': 'hermes-classic-light',
    'hermes-classic-light': 'hermes-classic',
    'hermes-slate': 'hermes-slate-light',
    'hermes-slate-light': 'hermes-slate',
    'hermes-mono': 'hermes-mono-light',
    'hermes-mono-light': 'hermes-mono',
  }

  return (
    <button
      type="button"
      onClick={() => {
        const nextDataTheme = LIGHT_DARK_PAIRS[currentDataTheme] || (isDark ? 'hermes-official-light' : 'hermes-official')
        // Import and call setTheme to persist and apply
        import('@/lib/theme').then(({ setTheme }) => {
          setTheme(nextDataTheme as any)
        })
        // Also update settings hook
        const nextMode = nextDataTheme.endsWith('-light') ? 'light' : 'dark'
        applyTheme(nextMode)
        updateSettings({ theme: nextMode })
      }}
      className="shrink-0 rounded-lg p-1.5 transition-colors hover:opacity-80"
      style={{ color: 'var(--theme-muted)' }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <HugeiconsIcon icon={isDark ? Sun02Icon : Moon02Icon} size={16} strokeWidth={1.5} />
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



// ── Reusable nav item ───────────────────────────────────────────────────

type NavItemDef = {
  kind: 'link' | 'button'
  to?: string
  search?: Record<string, unknown>
  hash?: string
  icon: unknown
  label: string
  active: boolean
  onClick?: () => void
  disabled?: boolean
  badge?: 'error-dot' | string | number
  dataTour?: string
}

export async function fetchWorkspaceStats(): Promise<WorkspaceStats | null> {
  try {
    const response = await fetch('/api/workspace/stats')
    if (!response.ok) return null
    return (await response.json()) as WorkspaceStats
  } catch {
    return null
  }
}

export async function fetchWorkspaceProjectShortcuts(): Promise<never[]> {
  return []
}

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
          className="flex min-w-0 items-center gap-2"
        >
          <span className="overflow-hidden whitespace-nowrap">{item.label}</span>
          {item.badge && item.badge !== 'error-dot' ? (
            <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full border border-primary-700 bg-primary-900 px-2 py-0.5 text-[10px] font-semibold leading-none text-primary-300">
              {item.badge}
            </span>
          ) : null}
        </motion.span>
      ) : null}
    </AnimatePresence>
  )

  const handleSelect = () => {
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
                  to={item.to!}
                  search={item.search}
                  hash={item.hash}
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
        to={item.to!}
        search={item.search}
        hash={item.hash}
        onClick={handleSelect}
        className={cls}
        data-tour={item.dataTour}
      >
        {iconEl}
        {labelEl}
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
                onClick={() => {
                  item.onClick?.()
                  handleSelect()
                }}
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
      onClick={() => {
        item.onClick?.()
        handleSelect()
      }}
      className={cls}
      data-tour={item.dataTour}
    >
      {iconEl}
      {labelEl}
    </Button>
  )
}

// ── Last-visited route tracking ─────────────────────────────────────────

const LAST_ROUTE_KEY = 'hermes-sidebar-last-route'

function getLastRoute(section: string): string | null {
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY)
    if (!stored) return null
    const map = JSON.parse(stored) as Record<string, string>
    return map[section] || null
  } catch {
    return null
  }
}

function setLastRoute(section: string, route: string) {
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY)
    const map = stored ? (JSON.parse(stored) as Record<string, string>) : {}
    map[section] = route
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

// ── Section header ──────────────────────────────────────────────────────

function SectionLabel({
  label,
  isCollapsed,
  transition,
  collapsible,
  expanded,
  onToggle,
  navigateTo,
}: {
  label: string
  isCollapsed: boolean
  transition: Record<string, unknown>
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  navigateTo?: string
}) {
  if (isCollapsed) return null

  const labelContent = (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400 select-none">
      {label}
    </span>
  )

  if (collapsible) {
    return (
      <motion.div
        layout
        transition={{ layout: transition }}
        className="flex items-center gap-1.5 px-3 pt-3 pb-1 w-full"
      >
        {navigateTo ? (
          <Link
            to={navigateTo}
            className="text-[10px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400 hover:text-primary-700 dark:hover:text-neutral-200 select-none transition-colors"
          >
            {label}
          </Link>
        ) : (
          labelContent
        )}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto p-0.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className={cn(
              'text-primary-500 transition-transform duration-150',
              expanded ? 'rotate-0' : '-rotate-90',
            )}
          />
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      transition={{ layout: transition }}
      className="px-3 pt-3 pb-1"
    >
      {navigateTo ? (
        <Link
          to={navigateTo}
          className="text-[10px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400 hover:text-primary-700 dark:hover:text-neutral-200 select-none transition-colors"
        >
          {label}
        </Link>
      ) : (
        labelContent
      )}
    </motion.div>
  )
}

// ── Collapsible section wrapper ─────────────────────────────────────────

function CollapsibleSection({
  expanded,
  items,
  isCollapsed,
  transition,
  onSelectSession,
}: {
  expanded: boolean
  items: NavItemDef[]
  isCollapsed: boolean
  transition: Record<string, unknown>
  onSelectSession?: () => void
}) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden space-y-0.5"
        >
          {items.map((item) => (
            <motion.div
              key={item.label}
              layout
              transition={{ layout: transition }}
              className="w-full"
            >
              <NavItem
                item={item}
                isCollapsed={isCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Persist helper ──────────────────────────────────────────────────────

function usePersistedBool(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === 'true') return true
      if (stored === 'false') return false
      return defaultValue
    } catch {
      return defaultValue
    }
  })

  function toggle() {
    setValue((prev) => {
      const next = !prev
      try {
        localStorage.setItem(key, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return [value, toggle] as const
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
  const {
    settingsOpen,
    settingsSection,
    setSettingsOpen,
    handleOpenSettings,
  } = useSidebarSettings()
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

  useEffect(() => {
    function handleOpenSettingsEvent(event: Event) {
      const detail = (event as CustomEvent<ChatOpenSettingsDetail>).detail
      handleOpenSettings(detail?.section === 'appearance' ? 'appearance' : 'hermes')
    }

    window.addEventListener(CHAT_OPEN_SETTINGS_EVENT, handleOpenSettingsEvent)
    return () => {
      window.removeEventListener(
        CHAT_OPEN_SETTINGS_EVENT,
        handleOpenSettingsEvent,
      )
    }
  }, [handleOpenSettings])

  // Platform-aware modifier key
  const _mod = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
        ? '⌘'
        : 'Ctrl+',
    [],
  )

  // Route active states
  const isChatActive =
    pathname === '/' || pathname === '/new' || pathname.startsWith('/chat')
  const isNewSessionActive =
    pathname === '/new' || pathname.startsWith('/chat/new')
  const _isSettingsActive = pathname === '/settings'
  const isSkillsActive = pathname === '/skills'
  const isFilesActive = pathname === '/files'
  const isSessionsActive = pathname === '/sessions'
  const isJobsActive = pathname === '/jobs' || pathname === '/cron'
  const isTerminalActive = pathname === '/terminal'
  const isMemoryActive = pathname === '/memory'
  const mainRoutes = ['/chat', '/new', '/sessions', '/files', '/jobs', '/cron', '/terminal']
  const knowledgeRoutes = ['/memory', '/skills']
  const systemRoutes = ['/settings', '/logs']

  useEffect(() => {
    if (mainRoutes.includes(pathname)) setLastRoute('main', pathname)
    if (knowledgeRoutes.includes(pathname)) setLastRoute('knowledge', pathname)
    if (systemRoutes.includes(pathname)) setLastRoute('system', pathname)
  }, [pathname])

  const mainNav = getLastRoute('main') || '/chat'
  const knowledgeNav = getLastRoute('knowledge') || '/memory'
  const _systemNav = getLastRoute('system') || '/settings'

  const transition = {
    duration: 0.15,
    ease: isCollapsed ? 'easeIn' : 'easeOut',
  } as const



  // Collapsible section states
  const [mainExpanded, toggleMain] = usePersistedBool(
    'hermes-sidebar-main-expanded',
    true,
  )
  const [knowledgeExpanded, toggleKnowledge] = usePersistedBool(
    'hermes-sidebar-knowledge-expanded',
    true,
  )
  const [_systemExpanded, _toggleSystem] = usePersistedBool(
    'hermes-sidebar-system-expanded',
    false,
  )

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

  const mainItems: NavItemDef[] = [
    {
      kind: 'link',
      to: '/chat',
      icon: MessageMultiple01Icon,
      label: 'Chat',
      active: isChatActive,
    },
    {
      kind: 'link',
      to: '/sessions',
      icon: Chat01Icon,
      label: 'Sessions',
      active: isSessionsActive,
    },
    {
      kind: 'link',
      to: '/files',
      icon: File01Icon,
      label: 'Files',
      active: isFilesActive,
    },
    {
      kind: 'link',
      to: '/jobs',
      icon: Clock01Icon,
      label: 'Jobs',
      active: isJobsActive,
    },
    {
      kind: 'link',
      to: '/terminal',
      icon: ComputerTerminal01Icon,
      label: 'Terminal',
      active: isTerminalActive,
    },
  ]

  const knowledgeItems: NavItemDef[] = [
    {
      kind: 'link',
      to: '/memory',
      icon: BrainIcon,
      label: 'Memory',
      active: isMemoryActive,
    },
    {
      kind: 'link',
      to: '/skills',
      icon: PuzzleIcon,
      label: 'Skills',
      active: isSkillsActive,
      dataTour: 'skills',
    },
  ]

  const _systemItems: NavItemDef[] = [
    // Settings is now a popup dialog, not a nav route
  ]

  return (
    <motion.aside
      ref={(node) => {
        sidebarRef.current = node
      }}
      initial={false}
      animate={{
        width: isVisuallyCollapsed ? (isMobile ? 0 : 48) : isMobile ? '85vw' : 300,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(asideProps.className, isMobile && isCollapsed && 'pointer-events-none overflow-hidden')}
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
                to="/chat"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'w-full pl-1.5 justify-start gap-2',
                )}
              >
                <img src="/hermes-avatar.webp" alt="Hermes" className="size-6 rounded-lg" />
                <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--theme-text)' }}>Hermes Workspace</span>
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
                  aria-label={isVisuallyCollapsed ? 'Open Sidebar' : 'Close Sidebar'}
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
          <SectionLabel
            label="Main"
            isCollapsed={isVisuallyCollapsed}
            transition={transition}
            collapsible
            expanded={mainExpanded}
            onToggle={toggleMain}
            navigateTo={mainNav}
          />
          <CollapsibleSection
            expanded={mainExpanded || isCollapsed}
            items={mainItems}
            isCollapsed={isVisuallyCollapsed}
            transition={transition}
            onSelectSession={onSelectSession}
          />

          <SectionLabel
            label="Knowledge"
            isCollapsed={isVisuallyCollapsed}
            transition={transition}
            collapsible
            expanded={knowledgeExpanded}
            onToggle={toggleKnowledge}
            navigateTo={knowledgeNav}
          />
          <CollapsibleSection
            expanded={knowledgeExpanded || isCollapsed}
            items={knowledgeItems}
            isCollapsed={isVisuallyCollapsed}
            transition={transition}
            onSelectSession={onSelectSession}
          />

          {/* System section removed — settings is a popup now */}
        </div>

        {/* Sessions list */}
        <div
          className={cn(
            'shrink-0 mt-1',
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
        <div className={cn(
          'flex items-center rounded-lg transition-colors',
          isVisuallyCollapsed ? 'flex-col gap-2 py-2' : 'gap-2.5 px-2 py-1.5',
        )}>
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
                  handleOpenSettings('hermes')
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
              </MenuItem>
            </MenuContent>
          </MenuRoot>

          {/* Settings + Theme toggle */}
          {!isVisuallyCollapsed && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleOpenSettings('hermes')}
                className="shrink-0 rounded-lg p-1.5 text-primary-400 hover:bg-primary-200 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-neutral-300 transition-colors"
                aria-label="Settings"
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
              </button>
              <ThemeToggleMini />
            </div>
          )}
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
      />

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
