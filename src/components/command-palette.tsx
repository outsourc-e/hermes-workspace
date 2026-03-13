'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Chat01Icon,
  Clock01Icon,
  CommandLineIcon,
  ComputerTerminal01Icon,
  Folder01Icon,
  GlobeIcon,
  Home01Icon,
  ListViewIcon,
  Notification03Icon,
  PuzzleIcon,
  Settings01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from '@/components/ui/command'
import {
  CHAT_PENDING_COMMAND_STORAGE_KEY,
  CHAT_RUN_COMMAND_EVENT,
} from '@/screens/chat/chat-events'
import type { SessionMeta } from '@/screens/chat/types'
import { cn } from '@/lib/utils'

type CommandPaletteProps = {
  pathname: string
  sessions: Array<SessionMeta>
}

type CommandAction = {
  id: string
  group: 'Screens' | 'Recent Sessions' | 'Slash Commands'
  label: string
  keywords: string
  shortcut?: string
  icon: React.ComponentProps<typeof import('@hugeicons/react').HugeiconsIcon>['icon']
  onSelect: () => void
}

type ScoredAction = CommandAction & {
  score: number
}

const SCREEN_GROUP_ORDER = ['Screens', 'Recent Sessions', 'Slash Commands'] as const

function getSessionLabel(session: SessionMeta) {
  return (
    session.label ||
    session.title ||
    session.derivedTitle ||
    session.friendlyId ||
    session.key
  )
}

function scoreCommandAction(action: CommandAction, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 1

  const haystack = `${action.label} ${action.keywords}`.toLowerCase()
  const directIndex = haystack.indexOf(normalizedQuery)
  if (directIndex >= 0) {
    return 400 - directIndex - Math.max(0, haystack.length - normalizedQuery.length)
  }

  let queryIndex = 0
  let gaps = 0
  let lastMatch = -1

  for (let i = 0; i < haystack.length && queryIndex < normalizedQuery.length; i += 1) {
    if (haystack[i] !== normalizedQuery[queryIndex]) continue
    if (lastMatch >= 0) gaps += Math.max(0, i - lastMatch - 1)
    lastMatch = i
    queryIndex += 1
  }

  if (queryIndex !== normalizedQuery.length) return 0
  return 180 - gaps - Math.max(0, haystack.length - normalizedQuery.length)
}

export function CommandPalette({
  pathname,
  sessions,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(min-width: 768px)').matches
  })
  const isMacPlatform = useMemo(() => {
    if (typeof navigator === 'undefined') return true
    return navigator.platform.toLowerCase().includes('mac')
  }, [])

  const runSlashCommand = (command: string) => {
    if (command === '/new') {
      void navigate({ to: '/new' })
      return
    }

    if (
      pathname.startsWith('/chat') ||
      pathname === '/new' ||
      pathname === '/'
    ) {
      window.dispatchEvent(
        new CustomEvent(CHAT_RUN_COMMAND_EVENT, {
          detail: { command },
        }),
      )
      return
    }

    window.sessionStorage.setItem(CHAT_PENDING_COMMAND_STORAGE_KEY, command)
    void navigate({ to: '/new' })
  }

  const screenActions = useMemo<Array<CommandAction>>(
    () => [
      {
        id: 'screen-chat',
        group: 'Screens',
        label: 'Chat',
        keywords: 'conversation new session home',
        shortcut: 'Go',
        icon: Chat01Icon,
        onSelect: () => void navigate({ to: '/new' }),
      },
      {
        id: 'screen-dashboard',
        group: 'Screens',
        label: 'Dashboard',
        keywords: 'home overview metrics',
        shortcut: 'Go',
        icon: Home01Icon,
        onSelect: () => void navigate({ to: '/dashboard' }),
      },
      {
        id: 'screen-workspace',
        group: 'Screens',
        label: 'Workspace',
        keywords: 'projects reviews runs teams',
        shortcut: 'Go',
        icon: Folder01Icon,
        onSelect: () => void navigate({ to: '/workspace' }),
      },
      {
        id: 'screen-agent-hub',
        group: 'Screens',
        label: 'Agent Hub',
        keywords: 'agent swarm orchestrator',
        shortcut: 'Go',
        icon: UserGroupIcon,
        onSelect: () => void navigate({ to: '/agent-swarm' }),
      },
      {
        id: 'screen-terminal',
        group: 'Screens',
        label: 'Terminal',
        keywords: 'shell console command line',
        shortcut: 'Go',
        icon: ComputerTerminal01Icon,
        onSelect: () => void navigate({ to: '/terminal' }),
      },
      {
        id: 'screen-browser',
        group: 'Screens',
        label: 'Browser',
        keywords: 'web page inspect',
        shortcut: 'Go',
        icon: GlobeIcon,
        onSelect: () => void navigate({ to: '/browser' }),
      },
      {
        id: 'screen-skills',
        group: 'Screens',
        label: 'Skills',
        keywords: 'install tools capabilities',
        shortcut: 'Go',
        icon: PuzzleIcon,
        onSelect: () => void navigate({ to: '/skills' }),
      },
      {
        id: 'screen-cron',
        group: 'Screens',
        label: 'Cron',
        keywords: 'jobs schedules automations',
        shortcut: 'Go',
        icon: Clock01Icon,
        onSelect: () => void navigate({ to: '/cron' }),
      },
      {
        id: 'screen-sessions',
        group: 'Screens',
        label: 'Sessions',
        keywords: 'gateway conversations history',
        shortcut: 'Go',
        icon: UserMultipleIcon,
        onSelect: () => void navigate({ to: '/sessions' }),
      },
      {
        id: 'screen-usage',
        group: 'Screens',
        label: 'Usage',
        keywords: 'metrics costs consumption',
        shortcut: 'Go',
        icon: ListViewIcon,
        onSelect: () => void navigate({ to: '/usage' }),
      },
      {
        id: 'screen-logs',
        group: 'Screens',
        label: 'Logs',
        keywords: 'activity debug events',
        shortcut: 'Go',
        icon: Notification03Icon,
        onSelect: () => void navigate({ to: '/activity' }),
      },
      {
        id: 'screen-settings',
        group: 'Screens',
        label: 'Settings',
        keywords: 'preferences configuration',
        shortcut: 'Go',
        icon: Settings01Icon,
        onSelect: () => void navigate({ to: '/settings' }),
      },
    ],
    [navigate],
  )

  const recentSessionActions = useMemo<Array<CommandAction>>(
    () =>
      [...sessions]
        .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
        .slice(0, 5)
        .map((session) => ({
          id: `session-${session.key}`,
          group: 'Recent Sessions',
          label: getSessionLabel(session),
          keywords: `${session.key} ${session.friendlyId} ${session.title ?? ''} ${session.derivedTitle ?? ''}`,
          shortcut: 'Open',
          icon: Chat01Icon,
          onSelect: () =>
            void navigate({
              to: '/chat/$sessionKey',
              params: { sessionKey: session.key },
            }),
        })),
    [navigate, sessions],
  )

  const slashCommandActions = useMemo<Array<CommandAction>>(
    () => [
      {
        id: 'slash-new',
        group: 'Slash Commands',
        label: '/new',
        keywords: 'start new session conversation',
        shortcut: 'Run',
        icon: CommandLineIcon,
        onSelect: () => runSlashCommand('/new'),
      },
      {
        id: 'slash-reset',
        group: 'Slash Commands',
        label: '/reset',
        keywords: 'reset conversation context',
        shortcut: 'Run',
        icon: CommandLineIcon,
        onSelect: () => runSlashCommand('/reset'),
      },
      {
        id: 'slash-clear',
        group: 'Slash Commands',
        label: '/clear',
        keywords: 'clear conversation history',
        shortcut: 'Run',
        icon: CommandLineIcon,
        onSelect: () => runSlashCommand('/clear'),
      },
      {
        id: 'slash-status',
        group: 'Slash Commands',
        label: '/status',
        keywords: 'show session status health',
        shortcut: 'Run',
        icon: CommandLineIcon,
        onSelect: () => runSlashCommand('/status'),
      },
    ],
    [pathname],
  )

  const actions = useMemo(
    () => [...screenActions, ...recentSessionActions, ...slashCommandActions],
    [recentSessionActions, screenActions, slashCommandActions],
  )

  const filteredActions = useMemo<Array<ScoredAction>>(() => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return actions.map((action) => ({ ...action, score: 1 }))
    }

    return actions
      .map((action) => ({ ...action, score: scoreCommandAction(action, normalizedQuery) }))
      .filter((action) => action.score > 0)
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
  }, [actions, query])

  const groupedActions = useMemo(
    () =>
      SCREEN_GROUP_ORDER.map((group) => ({
        group,
        items: filteredActions.filter((action) => action.group === group),
      })).filter((group) => group.items.length > 0),
    [filteredActions],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(min-width: 768px)')
    const updateDesktop = () => setIsDesktop(media.matches)
    updateDesktop()
    media.addEventListener('change', updateDesktop)
    return () => media.removeEventListener('change', updateDesktop)
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, open])

  useEffect(() => {
    if (selectedIndex < filteredActions.length) return
    setSelectedIndex(Math.max(0, filteredActions.length - 1))
  }, [filteredActions.length, selectedIndex])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || !isDesktop) return
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return
      }
      if (event.key.toLowerCase() !== 'k') return

      event.preventDefault()
      setOpen((current) => !current)
    }

    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  }, [isDesktop])

  useEffect(() => {
    if (!open) return

    function handleOpenKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return

      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (filteredActions.length === 0) return
        setSelectedIndex((current) => (current + 1) % filteredActions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (filteredActions.length === 0) return
        setSelectedIndex(
          (current) => (current - 1 + filteredActions.length) % filteredActions.length,
        )
        return
      }

      if (event.key === 'Enter') {
        if (filteredActions.length === 0) return
        event.preventDefault()
        filteredActions[selectedIndex]?.onSelect()
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleOpenKey, true)
    return () => window.removeEventListener('keydown', handleOpenKey, true)
  }, [filteredActions, open, selectedIndex])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
  }, [open])

  if (!isDesktop) return null

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup className="mx-auto self-start">
        <Command
          items={filteredActions}
          value={query}
          onValueChange={setQuery}
          mode="none"
        >
          <CommandInput placeholder="Search screens, sessions, and commands" />
          <CommandPanel className="flex min-h-0 flex-1 flex-col">
            {groupedActions.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-sm text-primary-600">
                No results for “{query.trim()}”.
              </div>
            ) : (
              <CommandList className="h-72 min-h-0">
                {groupedActions.map((group, groupIndex) => (
                  <Fragment key={group.group}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.group}</CommandGroupLabel>
                      {group.items.map((action) => {
                        const actionIndex = filteredActions.findIndex(
                          (item) => item.id === action.id,
                        )
                        const isSelected = actionIndex === selectedIndex
                        return (
                          <CommandItem
                            key={action.id}
                            value={action.label}
                            onMouseMove={() => setSelectedIndex(actionIndex)}
                            onClick={() => {
                              action.onSelect()
                              setOpen(false)
                            }}
                            className={cn(
                              'gap-3 rounded-lg px-3 py-2',
                              isSelected && 'bg-primary-100 text-primary-900',
                            )}
                          >
                            <HugeiconsIcon icon={action.icon} size={18} strokeWidth={1.6} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">
                                {action.label}
                              </div>
                            </div>
                            {action.shortcut ? (
                              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary-500">
                                {action.shortcut}
                              </span>
                            ) : null}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                    {groupIndex < groupedActions.length - 1 ? <CommandSeparator /> : null}
                  </Fragment>
                ))}
              </CommandList>
            )}
          </CommandPanel>
          <CommandFooter>
            <div className="flex items-center gap-4 text-primary-700">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                  <HugeiconsIcon icon={ArrowUp01Icon} size={14} strokeWidth={1.5} />
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
                </span>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                  Enter
                </span>
                <span>Select</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-primary-700">
              <span className="rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                {isMacPlatform ? '⌘K' : 'Ctrl K'}
              </span>
              <span>Toggle</span>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  )
}
