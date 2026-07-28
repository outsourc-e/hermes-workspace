import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BrainIcon,
  Building01Icon,
  Chat01Icon,
  CheckListIcon,
  Clock01Icon,
  ComputerTerminal01Icon,
  DashboardSquare01Icon,
  File01Icon,
  McpServerIcon,
  MessageMultiple01Icon,
  Moon02Icon,
  PencilEdit02Icon,
  PuzzleIcon,
  Rocket01Icon,
  Search01Icon,
  Settings01Icon,
  Sun02Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { CHAT_OPEN_SETTINGS_EVENT } from '../chat-events'
import {
  archiveSessionCard,
  branchSessionCard,
  fetchSessionCard,
  mergeSessionCardDetail,
  sessionCardQueryKeys,
  updateSessionCardMetadata,
} from '../chat-queries'
import { useChatSettings as useSidebarSettings } from '../hooks/use-chat-settings'
import { isWholeCardBranchAvailable } from '../types'
import { ProvidersDialog } from './providers-dialog'
import { SessionRenameDialog } from './sidebar/session-rename-dialog'
import { SessionDeleteDialog } from './sidebar/session-delete-dialog'
import { SidebarSessions } from './sidebar/sidebar-sessions'
import type { SessionCardListWire } from '../chat-queries'
import type { ChatOpenSettingsDetail } from '../chat-events'
import type { SessionCard, SessionMeta } from '../types'

import { t } from '@/lib/i18n'
import { SettingsDialog } from '@/components/settings-dialog'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { AgentIdentityAvatar, UserAvatar } from '@/components/avatars'
import { SEARCH_MODAL_EVENTS, useSearchModal } from '@/hooks/use-search-modal'
import {
  selectChatProfileAvatarDataUrl,
  selectChatProfileDisplayName,
  selectSidebarHoverExpand,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import { StatusDot } from '@/components/status-indicator'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { applyTheme, useSettingsStore } from '@/hooks/use-settings'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { useChatSessionCardInventory } from '@/screens/chat/hooks/use-chat-session-card-inventory'

type WorkspaceStats = Record<string, unknown>

type DesktopCardAction = 'rename' | 'pin' | 'branch' | 'archive'

type DesktopCardActionFailure = {
  action: DesktopCardAction
  actionLabel: string
  cardId: string
  cardTitle: string
  message: string
  retry: () => void
}

type DesktopSessionCardActionsOptions = {
  activeCardId: string
  onActiveSessionDelete?: () => void
  invalidateCards: (cardId: string) => Promise<unknown> | unknown
  navigateToCard: (cardId: string) => Promise<unknown> | unknown
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The Card service did not complete this action.'
}

export function useDesktopSessionCardActions({
  activeCardId,
  onActiveSessionDelete,
  invalidateCards,
  navigateToCard,
}: DesktopSessionCardActionsOptions) {
  const pendingCardIdsRef = useRef<Set<string>>(new Set())
  const activeCardIdRef = useRef(activeCardId)
  const navigateToCardRef = useRef(navigateToCard)
  const onActiveSessionDeleteRef = useRef(onActiveSessionDelete)
  activeCardIdRef.current = activeCardId
  navigateToCardRef.current = navigateToCard
  onActiveSessionDeleteRef.current = onActiveSessionDelete
  const [pendingCardIds, setPendingCardIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [failure, setFailure] = useState<DesktopCardActionFailure | null>(null)

  function setCardPending(cardId: string, pending: boolean) {
    const next = new Set(pendingCardIdsRef.current)
    if (pending) next.add(cardId)
    else next.delete(cardId)
    pendingCardIdsRef.current = next
    setPendingCardIds(next)
  }

  async function runCardAction(
    card: SessionCard,
    action: DesktopCardAction,
    actionLabel: string,
    mutation: () => Promise<unknown>,
    onSuccess?: () => Promise<unknown> | unknown,
  ): Promise<void> {
    if (pendingCardIdsRef.current.has(card.cardId)) return
    setFailure((current) => (current?.cardId === card.cardId ? null : current))
    setCardPending(card.cardId, true)
    try {
      await mutation()
      await onSuccess?.()
      setFailure((current) =>
        current?.cardId === card.cardId && current.action === action
          ? null
          : current,
      )
    } catch (error) {
      setFailure({
        action,
        actionLabel,
        cardId: card.cardId,
        cardTitle: card.title,
        message: mutationErrorMessage(error),
        retry: () => {
          void runCardAction(card, action, actionLabel, mutation, onSuccess)
        },
      })
    } finally {
      setCardPending(card.cardId, false)
      try {
        await invalidateCards(card.cardId)
      } catch {
        // The mutation outcome is already known. A later poll can reconcile the list.
      }
    }
  }

  return {
    pendingCardIds,
    failure,
    dismissFailure: () => setFailure(null),
    rename(card: SessionCard, newTitle: string) {
      void runCardAction(card, 'rename', 'Rename', () =>
        updateSessionCardMetadata(card.cardId, { manualTitle: newTitle }),
      )
    },
    togglePin(card: SessionCard) {
      void runCardAction(card, 'pin', card.pinned ? 'Unpin' : 'Pin', () =>
        updateSessionCardMetadata(card.cardId, { pinned: !card.pinned }),
      )
    },
    branch(card: SessionCard) {
      const idempotencyKey = crypto.randomUUID()
      void runCardAction(
        card,
        'branch',
        'Branch',
        () =>
          branchSessionCard(card.cardId, card.canonicalSegmentKey, {
            idempotencyKey,
          }),
        () => {
          if (activeCardIdRef.current !== card.cardId) return
          return navigateToCardRef.current(card.cardId)
        },
      )
    },
    archive(card: SessionCard) {
      void runCardAction(
        card,
        'archive',
        'Archive',
        () => archiveSessionCard(card.cardId),
        () => {
          if (activeCardIdRef.current !== card.cardId) return
          return onActiveSessionDeleteRef.current?.()
        },
      )
    },
  }
}

export function DesktopCardActionFailureNotice({
  failure,
  pending,
  onDismiss,
}: {
  failure: DesktopCardActionFailure
  pending: boolean
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      data-card-action-error={failure.cardId}
    >
      <div className="font-medium">
        {failure.actionLabel} unavailable for “{failure.cardTitle}”.
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer select-none text-[11px]">
          Details
        </summary>
        <div className="mt-1 text-[11px] opacity-80">{failure.message}</div>
      </details>
      <div className="mt-2 flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Retry ${failure.action} for ${failure.cardTitle}`}
          onClick={failure.retry}
        >
          Retry
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  )
}

function ThemeToggleMini() {
  const _theme = useSettingsStore((state) => state.settings.theme)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  void _theme
  // Detect dark/light from actual data-theme attribute
  const currentDataTheme =
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') || 'claude-nous'
      : 'claude-nous'
  const isDark = !currentDataTheme.endsWith('-light')

  // Map between dark and light counterparts — must include all theme families
  const LIGHT_DARK_PAIRS: Record<string, string> = {
    'claude-nous': 'claude-nous-light',
    'claude-nous-light': 'claude-nous',
    'claude-official': 'claude-official-light',
    'claude-official-light': 'claude-official',
    'claude-classic': 'claude-classic-light',
    'claude-classic-light': 'claude-classic',
    'claude-slate': 'claude-slate-light',
    'claude-slate-light': 'claude-slate',
  }

  return (
    <button
      type="button"
      onClick={() => {
        // Fall back to current family rather than dropping the user into claude-official
        const nextDataTheme =
          LIGHT_DARK_PAIRS[currentDataTheme] ||
          (isDark
            ? `${currentDataTheme}-light`
            : currentDataTheme.replace(/-light$/, ''))
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

// ── Reusable nav item ───────────────────────────────────────────────────

type NavItemDef = {
  kind: 'link' | 'button'
  to?: string
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

export async function fetchWorkspaceProjectShortcuts(): Promise<Array<never>> {
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
          <span className="overflow-hidden whitespace-nowrap">
            {item.label}
          </span>
          {item.badge && item.badge !== 'error-dot' ? (
            <span
              className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none"
              style={
                item.badge === 'NEW'
                  ? {
                      background:
                        'linear-gradient(180deg, #fde68a 0%, #fbbf24 50%, #d4a017 100%)',
                      color: '#0b1320',
                      boxShadow: '0 0 8px rgba(250,204,21,0.4)',
                      letterSpacing: '0.08em',
                    }
                  : undefined
              }
            >
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
                  to={item.to}
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
        to={item.to}
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

const LAST_ROUTE_KEY = 'claude-sidebar-last-route'

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
  items: Array<NavItemDef>
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

type DesktopSidebarContentProps = {
  activeCardId: string
  inspectedChildCardId?: string
  isVisuallyCollapsed: boolean
  transition: Record<string, unknown>
  searchItem: NavItemDef
  mainItems: Array<NavItemDef>
  knowledgeItems: Array<NavItemDef>
  onSelectSession?: () => void
  onToggleCollapse: () => void
  profileDisplayName: string
  profileAvatarDataUrl: string | null
  handleOpenSettings: (section?: 'appearance' | 'claude') => void
  /** The card tree is only useful on Chat routes and is expensive for large inventories. */
  showSessions: boolean
  sessionCards: Array<SessionCard>
  cardResolutions: SessionCardListWire['cardResolutions']
  completeness: SessionCardListWire['completeness']
  sessionForkAvailable: boolean
  onTogglePin: (card: SessionCard) => void
  onRename: (card: SessionCard) => void
  onArchive: (card: SessionCard) => void
  onBranch: (card: SessionCard) => void
  pendingCardIds: ReadonlySet<string>
  cardActionFailure: DesktopCardActionFailure | null
  onDismissCardActionFailure: () => void
  loading: boolean
  fetching: boolean
  error: string | null
  onRetry: () => void
  hasMoreOlderSessions: boolean
  loadingOlderSessions: boolean
  olderSessionsError: string | null
  onLoadOlderSessions: () => void
}

function DesktopSidebarContent({
  activeCardId,
  inspectedChildCardId,
  isVisuallyCollapsed,
  transition,
  searchItem,
  mainItems,
  knowledgeItems,
  onSelectSession,
  onToggleCollapse,
  profileDisplayName,
  profileAvatarDataUrl,
  handleOpenSettings,
  showSessions,
  sessionCards,
  cardResolutions,
  completeness,
  sessionForkAvailable,
  onTogglePin,
  onRename,
  onArchive,
  onBranch,
  pendingCardIds,
  cardActionFailure,
  onDismissCardActionFailure,
  loading,
  fetching,
  error,
  onRetry,
  hasMoreOlderSessions,
  loadingOlderSessions,
  olderSessionsError,
  onLoadOlderSessions,
}: DesktopSidebarContentProps) {
  return (
    <div className="flex h-full min-w-0 flex-1">
      <nav
        aria-label="Workspace navigation"
        className="flex w-12 shrink-0 flex-col border-r theme-border"
      >
        <div className="flex h-12 shrink-0 items-center justify-center">
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                render={
                  <Link
                    to="/chat"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                      'size-8',
                    )}
                    aria-label="Hermes Workspace"
                  >
                    <AgentIdentityAvatar alt="" className="size-6 rounded-lg" />
                  </Link>
                }
              />
              <TooltipContent side="right">Hermes Workspace</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-2">
          <NavItem
            item={searchItem}
            isCollapsed
            transition={transition}
            onSelectSession={onSelectSession}
          />
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                render={
                  <Link
                    to="/chat/$sessionKey"
                    params={{ sessionKey: 'new' }}
                    onClick={onSelectSession}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'mt-0.5 flex min-h-11 w-full items-center justify-center px-0 py-2 text-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800',
                    )}
                    aria-label="New Session"
                    data-tour="new-session"
                  >
                    <HugeiconsIcon
                      icon={PencilEdit02Icon}
                      size={20}
                      strokeWidth={1.5}
                      className="size-5 shrink-0"
                    />
                  </Link>
                }
              />
              <TooltipContent side="right">New Session</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>

          <div className="my-1.5 border-t theme-border" />
          <div aria-label="Main navigation" className="space-y-0.5">
            <CollapsibleSection
              expanded
              items={mainItems}
              isCollapsed
              transition={transition}
              onSelectSession={onSelectSession}
            />
          </div>
          <div className="my-1.5 border-t theme-border" />
          <div aria-label="Knowledge navigation" className="space-y-0.5">
            <CollapsibleSection
              expanded
              items={knowledgeItems}
              isCollapsed
              transition={transition}
              onSelectSession={onSelectSession}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 border-t py-2 theme-border">
          <MenuRoot>
            <MenuTrigger
              data-tour="settings"
              className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-primary-200 dark:hover:bg-neutral-800"
              aria-label={`${profileDisplayName} settings`}
            >
              <UserAvatar size={28} src={profileAvatarDataUrl} alt="" />
            </MenuTrigger>
            <MenuContent side="right" align="end" className="min-w-[200px]">
              <MenuItem
                onClick={function onOpenSettings() {
                  handleOpenSettings('claude')
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
          <ThemeToggleMini />
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                onClick={onToggleCollapse}
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={
                      isVisuallyCollapsed
                        ? 'Open sessions sidebar'
                        : 'Close sessions sidebar'
                    }
                    data-tour="sidebar-collapse-toggle"
                  >
                    <HugeiconsIcon
                      icon={
                        isVisuallyCollapsed ? ArrowRight01Icon : ArrowLeft01Icon
                      }
                      size={18}
                      strokeWidth={1.75}
                    />
                  </Button>
                }
              />
              <TooltipContent side="right">
                {isVisuallyCollapsed
                  ? 'Open sessions sidebar'
                  : 'Close sessions sidebar'}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>
      </nav>

      {showSessions ? (
        <AnimatePresence initial={false}>
          {!isVisuallyCollapsed ? (
            <motion.section
              key="sessions-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
              aria-label="Session history"
              className="flex min-w-0 flex-1 flex-col"
            >
              <div className="flex min-h-0 flex-1 flex-col">
                {cardActionFailure ? (
                  <DesktopCardActionFailureNotice
                    failure={cardActionFailure}
                    pending={pendingCardIds.has(cardActionFailure.cardId)}
                    onDismiss={onDismissCardActionFailure}
                  />
                ) : null}
                <div className="flex min-h-0 flex-1">
                  <SidebarSessions
                    sessionCards={sessionCards}
                    cardResolutions={cardResolutions}
                    completeness={completeness}
                    sessionForkAvailable={sessionForkAvailable}
                    activeCardId={activeCardId}
                    inspectedChildCardId={inspectedChildCardId}
                    onSelect={onSelectSession}
                    onTogglePin={onTogglePin}
                    onRename={onRename}
                    onArchive={onArchive}
                    onBranch={onBranch}
                    pendingCardIds={pendingCardIds}
                    loading={loading}
                    fetching={fetching}
                    error={error}
                    onRetry={onRetry}
                    hasMoreOlderSessions={hasMoreOlderSessions}
                    loadingOlderSessions={loadingOlderSessions}
                    olderSessionsError={olderSessionsError}
                    onLoadOlderSessions={onLoadOlderSessions}
                  />
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      ) : null}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

function ChatSidebarComponent({
  activeFriendlyId,
  isCollapsed,
  onToggleCollapse,
  onSelectSession,
  onActiveSessionDelete,
}: ChatSidebarProps) {
  const { settingsOpen, settingsSection, setSettingsOpen, handleOpenSettings } =
    useSidebarSettings()
  const profileDisplayName = useChatSettingsStore(selectChatProfileDisplayName)
  const profileAvatarDataUrl = useChatSettingsStore(
    selectChatProfileAvatarDataUrl,
  )
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openSearchModal = useSearchModal((state) => state.openModal)
  const isSearchModalOpen = useSearchModal((state) => state.isOpen)
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })
  const isChatActive =
    pathname === '/' || pathname === '/new' || pathname.startsWith('/chat')
  const inspectedChildCardId = useRouterState({
    select: function selectInspectedChild(state) {
      const search = state.location.search as Record<string, unknown>
      return typeof search.inspect === 'string' ? search.inspect : undefined
    },
  })
  const sessionCardInventory = useChatSessionCardInventory({
    enabled: isChatActive,
  })
  const sessionCardDetailQuery = useQuery({
    queryKey: sessionCardQueryKeys.detail(activeFriendlyId),
    queryFn: () => fetchSessionCard(activeFriendlyId),
    enabled: isChatActive && activeFriendlyId !== 'new',
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const sessionCardList = mergeSessionCardDetail(
    sessionCardInventory.sessionCardList,
    sessionCardDetailQuery.data,
  )
  const sessionForkAvailable = useFeatureAvailable('sessionFork')

  useEffect(() => {
    function handleOpenSettingsEvent(event: Event) {
      const detail = (event as CustomEvent<ChatOpenSettingsDetail>).detail
      handleOpenSettings(
        detail.section === 'appearance' ? 'appearance' : 'claude',
      )
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
  const isNewSessionActive =
    pathname === '/new' || pathname.startsWith('/chat/new')
  const _isSettingsActive = pathname === '/settings'
  const isSkillsActive = pathname === '/skills'
  const isMcpActive = pathname === '/mcp'
  const isFilesActive = pathname === '/files'

  const isAgoraActive = pathname === '/agora'
  const isTerminalActive = pathname === '/terminal'
  const isJobsActive = pathname === '/jobs'
  const isMemoryActive = pathname === '/memory'
  const isTasksActive = pathname === '/tasks'
  const isConductorActive = pathname === '/conductor'
  const isOperationsActive = pathname === '/operations'
  const isSwarmActive = pathname === '/swarm' || pathname === '/swarm2'
  const echoStudioEnabled = useSettingsStore(
    (state) => state.settings.experimentalEchoStudio,
  )
  const mainRoutes = ['/chat', '/new', '/files', '/terminal']
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
    'claude-sidebar-main-expanded',
    true,
  )
  const [knowledgeExpanded, toggleKnowledge] = usePersistedBool(
    'claude-sidebar-knowledge-expanded',
    true,
  )
  const [_systemExpanded, _toggleSystem] = usePersistedBool(
    'claude-sidebar-system-expanded',
    false,
  )

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameCard, setRenameCard] = useState<SessionCard | null>(null)
  const [renameSessionTitle, setRenameSessionTitle] = useState('')

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [archiveCard, setArchiveCard] = useState<SessionCard | null>(null)
  const [deleteSessionTitle, setDeleteSessionTitle] = useState('')
  const [providersOpen, setProvidersOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isHoverExpanded, setIsHoverExpanded] = useState(false)
  const sidebarHoverExpand = useChatSettingsStore(selectSidebarHoverExpand)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  const cardActions = useDesktopSessionCardActions({
    activeCardId: activeFriendlyId,
    onActiveSessionDelete,
    invalidateCards: (cardId) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.lists,
        }),
        queryClient.invalidateQueries({
          queryKey: sessionCardQueryKeys.detail(cardId),
        }),
      ]),
    navigateToCard: (cardId) =>
      navigate({
        to: '/chat/$sessionKey',
        params: { sessionKey: cardId },
        search: {},
      }),
  })

  function handleOpenRename(card: SessionCard) {
    setRenameCard(card)
    setRenameSessionTitle(card.title)
    setRenameDialogOpen(true)
  }

  function handleSaveRename(newTitle: string) {
    const card = renameCard
    setRenameDialogOpen(false)
    setRenameCard(null)
    if (!card) return
    cardActions.rename(card, newTitle)
  }

  function handleOpenArchive(card: SessionCard) {
    setArchiveCard(card)
    setDeleteSessionTitle(card.title)
    setDeleteDialogOpen(true)
  }

  function handleConfirmArchive() {
    const card = archiveCard
    setDeleteDialogOpen(false)
    setArchiveCard(null)
    if (!card) return
    cardActions.archive(card)
  }

  function handleTogglePin(card: SessionCard) {
    cardActions.togglePin(card)
  }

  function handleBranch(card: SessionCard) {
    if (!isWholeCardBranchAvailable(card, sessionForkAvailable)) return
    cardActions.branch(card)
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (isMobile || !isCollapsed || !sidebarHoverExpand) {
      setIsHoverExpanded(false)
    }
  }, [isCollapsed, isMobile, sidebarHoverExpand])

  const isHoverPreviewExpanded =
    sidebarHoverExpand && !isMobile && isCollapsed && isHoverExpanded
  const isVisuallyCollapsed = isCollapsed && !isHoverPreviewExpanded

  function handleSidebarToggle() {
    // In hover-preview mode, a click should dismiss the preview first;
    // otherwise toggle the persistent collapsed state.
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
      if (!touch) return
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY }
    }

    function handleTouchEnd(event: TouchEvent) {
      const start = swipeStartRef.current
      swipeStartRef.current = null
      if (!start || event.changedTouches.length !== 1) return
      const touch = event.changedTouches[0]
      if (!touch) return
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

  const isDashboardActive = pathname === '/dashboard'

  const mainItems: Array<NavItemDef> = [
    {
      kind: 'link',
      to: '/dashboard',
      icon: DashboardSquare01Icon,
      label: t('nav.dashboard'),
      active: isDashboardActive,
    },
    {
      kind: 'link',
      to: '/chat',
      icon: MessageMultiple01Icon,
      label: t('nav.chat'),
      active: isChatActive,
    },

    {
      kind: 'link',
      to: '/files',
      icon: File01Icon,
      label: t('nav.files'),
      active: isFilesActive,
    },
    {
      kind: 'link',
      to: '/terminal',
      icon: ComputerTerminal01Icon,
      label: t('nav.terminal'),
      active: isTerminalActive,
    },
    {
      kind: 'link',
      to: '/jobs',
      icon: Clock01Icon,
      label: t('nav.jobs'),
      active: isJobsActive,
    },
    {
      kind: 'link',
      to: '/tasks',
      icon: CheckListIcon,
      label: 'Tasks',
      active: isTasksActive,
    },
    {
      kind: 'link',
      to: '/conductor',
      icon: Rocket01Icon,
      label: 'Conductor',
      active: isConductorActive,
    },
    {
      kind: 'link',
      to: '/operations',
      icon: UserMultipleIcon,
      label: 'Operations',
      active: isOperationsActive,
    },
    {
      kind: 'link',
      to: '/swarm',
      icon: UserGroupIcon,
      label: 'Swarm',
      active: isSwarmActive,
    },
    ...(echoStudioEnabled
      ? [
          {
            kind: 'link' as const,
            to: '/echo-studio',
            icon: DashboardSquare01Icon,
            label: 'Echo Studio',
            active: pathname.startsWith('/echo-studio'),
          },
        ]
      : []),
  ]

  const knowledgeItems: Array<NavItemDef> = [
    {
      kind: 'link',
      to: '/memory',
      icon: BrainIcon,
      label: t('nav.memory'),
      active: isMemoryActive,
    },
    {
      kind: 'link',
      to: '/skills',
      icon: PuzzleIcon,
      label: t('nav.skills'),
      active: isSkillsActive,
      dataTour: 'skills',
    },
    {
      kind: 'link',
      to: '/mcp',
      icon: McpServerIcon,
      label: 'MCP',
      active: isMcpActive,
    },
    {
      kind: 'link',
      to: '/profiles',
      icon: UserMultipleIcon,
      label: t('nav.profiles'),
      active: pathname === '/profiles',
    },
  ]

  const systemItems: Array<NavItemDef> = []

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
        if (sidebarHoverExpand && !isMobile && isCollapsed) {
          setIsHoverExpanded(true)
        }
      }}
      onMouseLeave={() => {
        if (sidebarHoverExpand && !isMobile) setIsHoverExpanded(false)
      }}
      aria-hidden={isMobile && isCollapsed ? true : undefined}
      {...(isMobile && isCollapsed ? { inert: true } : {})}
    >
      {!isMobile ? (
        <DesktopSidebarContent
          activeCardId={activeFriendlyId}
          inspectedChildCardId={inspectedChildCardId}
          isVisuallyCollapsed={isVisuallyCollapsed}
          transition={transition}
          searchItem={searchItem}
          mainItems={mainItems}
          knowledgeItems={knowledgeItems}
          onSelectSession={onSelectSession}
          onToggleCollapse={handleSidebarToggle}
          profileDisplayName={profileDisplayName}
          profileAvatarDataUrl={profileAvatarDataUrl}
          handleOpenSettings={handleOpenSettings}
          showSessions={isChatActive}
          sessionCards={sessionCardList?.cards ?? []}
          cardResolutions={sessionCardList?.cardResolutions ?? []}
          completeness={sessionCardList?.completeness ?? 'complete'}
          sessionForkAvailable={sessionForkAvailable}
          onTogglePin={handleTogglePin}
          onRename={handleOpenRename}
          onArchive={handleOpenArchive}
          onBranch={handleBranch}
          pendingCardIds={cardActions.pendingCardIds}
          cardActionFailure={cardActions.failure}
          onDismissCardActionFailure={cardActions.dismissFailure}
          loading={sessionCardInventory.isLoading}
          fetching={sessionCardInventory.isFetching}
          error={
            !sessionCardInventory.sessionCardList &&
            sessionCardInventory.error instanceof Error
              ? sessionCardInventory.error.message
              : null
          }
          onRetry={() => void sessionCardInventory.refetch()}
          hasMoreOlderSessions={sessionCardInventory.hasNextPage}
          loadingOlderSessions={sessionCardInventory.isFetchingNextPage}
          olderSessionsError={sessionCardInventory.olderSessionsError}
          onLoadOlderSessions={() =>
            void sessionCardInventory.loadOlderSessions()
          }
        />
      ) : (
        <>
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
                    <AgentIdentityAvatar className="size-6 rounded-lg" />
                    <span
                      className="text-sm font-semibold tracking-tight"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      Hermes Workspace
                    </span>
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
            <div className="shrink-0 space-y-0.5 px-2 order-2">
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

              {/* System */}
              <CollapsibleSection
                expanded={true}
                items={systemItems}
                isCollapsed={isVisuallyCollapsed}
                transition={transition}
                onSelectSession={onSelectSession}
              />
            </div>

            {/* Sessions list */}
            {isChatActive ? (
              <div className="shrink-0 mt-1 order-1">
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
                          sessionCards={sessionCardList?.cards ?? []}
                          cardResolutions={
                            sessionCardList?.cardResolutions ?? []
                          }
                          completeness={
                            sessionCardList?.completeness ?? 'complete'
                          }
                          sessionForkAvailable={sessionForkAvailable}
                          activeCardId={activeFriendlyId}
                          inspectedChildCardId={inspectedChildCardId}
                          onSelect={onSelectSession}
                          onTogglePin={handleTogglePin}
                          onRename={handleOpenRename}
                          onArchive={handleOpenArchive}
                          onBranch={handleBranch}
                          pendingCardIds={cardActions.pendingCardIds}
                          loading={sessionCardInventory.isLoading}
                          fetching={sessionCardInventory.isFetching}
                          error={
                            !sessionCardInventory.sessionCardList &&
                            sessionCardInventory.error instanceof Error
                              ? sessionCardInventory.error.message
                              : null
                          }
                          onRetry={() => void sessionCardInventory.refetch()}
                          hasMoreOlderSessions={
                            sessionCardInventory.hasNextPage
                          }
                          loadingOlderSessions={
                            sessionCardInventory.isFetchingNextPage
                          }
                          olderSessionsError={
                            sessionCardInventory.olderSessionsError
                          }
                          onLoadOlderSessions={() =>
                            void sessionCardInventory.loadOlderSessions()
                          }
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : null}
          </div>
          {/* end scrollable body */}

          {/* ── Footer with User Menu ─────────────────────────────────── */}
          <div className="px-2 py-2.5 border-t shrink-0 theme-border theme-panel">
            {/* User card + actions */}
            <div
              className={cn(
                'flex items-center rounded-lg transition-colors',
                isVisuallyCollapsed
                  ? 'flex-col gap-2 py-2'
                  : 'gap-2.5 px-2 py-1.5',
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
                        <StatusDot />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </MenuTrigger>
                <MenuContent side="top" align="start" className="min-w-[200px]">
                  <MenuItem
                    onClick={function onOpenSettings() {
                      handleOpenSettings('claude')
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
                    onClick={() => handleOpenSettings('claude')}
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
        </>
      )}

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
            setRenameCard(null)
            setRenameSessionTitle('')
          }
        }}
        sessionTitle={renameSessionTitle}
        onSave={handleSaveRename}
        onCancel={() => {
          setRenameDialogOpen(false)
          setRenameCard(null)
          setRenameSessionTitle('')
        }}
      />

      <SessionDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        sessionTitle={deleteSessionTitle}
        mode="archive"
        onConfirm={handleConfirmArchive}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </motion.aside>
  )
}

function areSidebarPropsEqual(
  prevProps: ChatSidebarProps,
  nextProps: ChatSidebarProps,
): boolean {
  if (prevProps.activeFriendlyId !== nextProps.activeFriendlyId) return false
  if (prevProps.creatingSession !== nextProps.creatingSession) return false
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false
  return true
}

const MemoizedChatSidebar = memo(ChatSidebarComponent, areSidebarPropsEqual)

export { MemoizedChatSidebar as ChatSidebar }
