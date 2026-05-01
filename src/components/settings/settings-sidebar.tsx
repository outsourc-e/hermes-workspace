import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export type SettingsNavId =
  | 'connection'
  | 'claude'
  | 'agent'
  | 'routing'
  | 'voice'
  | 'display'
  | 'appearance'
  | 'chat'
  | 'notifications'
  | 'mcp'
  | 'language'

type NavItem = { id: SettingsNavId; label: string }

export const SETTINGS_NAV_ITEMS: Array<NavItem> = [
  { id: 'connection', label: 'Connection' },
  { id: 'claude', label: 'Model & Provider' },
  { id: 'agent', label: 'Agent Behavior' },
  { id: 'routing', label: 'Smart Routing' },
  { id: 'voice', label: 'Voice' },
  { id: 'display', label: 'Display' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'chat', label: 'Chat' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'language', label: 'Language' },
]

type ItemRendererArgs = {
  item: NavItem
  isActive: boolean
  activeClass: string
  inactiveClass: string
  indicator: React.ReactNode
}

function renderItem({
  item,
  isActive,
  activeClass,
  inactiveClass,
  indicator,
}: ItemRendererArgs) {
  const className = cn(
    'relative rounded-lg px-3 py-2 text-left text-sm transition-colors',
    isActive ? activeClass : inactiveClass,
  )
  const content = (
    <>
      {isActive ? indicator : null}
      {item.label}
    </>
  )
  if (item.id === 'mcp') {
    return (
      <Link key={item.id} to="/settings/mcp" className={className}>
        {content}
      </Link>
    )
  }
  return (
    <Link
      key={item.id}
      to="/settings"
      search={{ section: item.id }}
      className={className}
    >
      {content}
    </Link>
  )
}

export function SettingsSidebar({ activeId }: { activeId: SettingsNavId }) {
  const activeClass =
    'bg-[var(--theme-accent-subtle)] text-[var(--theme-accent)] font-semibold'
  const inactiveClass =
    'text-primary-600 hover:bg-primary-100 hover:text-primary-900'
  const indicator = (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[var(--theme-accent)]"
    />
  )

  return (
    <nav className="hidden w-48 shrink-0 md:block">
      <div className="sticky top-8">
        <h1 className="mb-4 px-3 text-lg font-semibold text-primary-900">
          Settings
        </h1>
        <div className="flex flex-col gap-0.5">
          {SETTINGS_NAV_ITEMS.map((item) =>
            renderItem({
              item,
              isActive: activeId === item.id,
              activeClass,
              inactiveClass,
              indicator,
            }),
          )}
        </div>
      </div>
    </nav>
  )
}

export function SettingsMobilePills({ activeId }: { activeId: SettingsNavId }) {
  const activeClass =
    'bg-[var(--theme-accent)] text-[var(--theme-bg)] font-semibold'
  const inactiveClass =
    'bg-primary-100 text-primary-600 hover:bg-primary-200'
  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-2 md:hidden">
      {SETTINGS_NAV_ITEMS.map((item) => {
        const isActive = activeId === item.id
        const className = cn(
          'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
          isActive ? activeClass : inactiveClass,
        )
        if (item.id === 'mcp') {
          return (
            <Link key={item.id} to="/settings/mcp" className={className}>
              {item.label}
            </Link>
          )
        }
        return (
          <Link
            key={item.id}
            to="/settings"
            search={{ section: item.id }}
            className={className}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
