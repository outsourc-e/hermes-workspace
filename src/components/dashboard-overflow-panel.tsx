import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  ComputerTerminal01Icon,
  File01Icon,
  MessageMultiple01Icon,
  Moon02Icon,
  PuzzleIcon,
  Settings01Icon,
  Sun02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/hooks/use-settings'
import { getTheme, getThemeVariant, isDarkTheme, setTheme as setThemeFamily } from '@/lib/theme'

type OverflowItem = {
  icon: typeof File01Icon
  label: string
  to: string
}

const SYSTEM_ITEMS: Array<OverflowItem> = [
  { icon: File01Icon, label: 'Files', to: '/files' },
  { icon: ComputerTerminal01Icon, label: 'Terminal', to: '/terminal' },
  { icon: BrainIcon, label: 'Memory', to: '/memory' },
]

const HERMES_ITEMS: Array<OverflowItem> = [
  { icon: MessageMultiple01Icon, label: 'Chat', to: '/chat' },
  { icon: PuzzleIcon, label: 'Skills', to: '/skills' },
  { icon: UserGroupIcon, label: 'Profiles', to: '/profiles' },
  { icon: Settings01Icon, label: 'Settings', to: '/settings' },
]

type Props = {
  open: boolean
  onClose: () => void
}

function OverflowGrid({
  title,
  items,
  onSelect,
}: {
  title: string
  items: Array<OverflowItem>
  onSelect: (to: string) => void
}) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-primary-500">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <button
            key={item.to}
            type="button"
            onClick={() => onSelect(item.to)}
            className={cn(
              'flex min-h-12 items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-left',
              'text-sm text-ink transition-colors hover:border-accent-200 hover:bg-accent-50 active:scale-[0.99]',
            )}
          >
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
              <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.6} />
            </span>
            <span className="truncate font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function DashboardOverflowPanel({ open, onClose }: Props) {
  const navigate = useNavigate()
  const updateSettings = useSettingsStore((state) => state.updateSettings)

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  function handleSelect(to: string) {
    onClose()
    void navigate({ to })
  }

  // Detect actual current theme family from data-theme attribute
  const currentDataTheme = typeof document !== 'undefined'
    ? (document.documentElement.getAttribute('data-theme') || 'hermes-official')
    : 'hermes-official'
  const isDark = !currentDataTheme.endsWith('-light')
  const themeIcon = isDark ? Sun02Icon : Moon02Icon
  const themeLabel = isDark ? 'Light mode' : 'Dark mode'

  function toggleThemeWithinFamily() {
    const current = getTheme()
    const dark = isDarkTheme(current)
    const next = getThemeVariant(current, dark ? 'light' : 'dark')
    setThemeFamily(next)
    updateSettings({ theme: dark ? 'light' : 'dark' })
  }

  return (
    <div className="fixed inset-0 z-[80] no-swipe md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        aria-label="Close overflow panel"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-primary-200 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] shadow-2xl animate-in slide-in-from-bottom-4 duration-200 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-3 h-1.5 w-10 rounded-full bg-primary-200 dark:bg-gray-700 mx-auto" />
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-primary-500">
              Quick Menu
            </h3>
            <button
              type="button"
              onClick={toggleThemeWithinFamily}
              className="flex w-full items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-left text-sm text-ink transition-colors hover:border-accent-200 hover:bg-accent-50 active:scale-[0.99]"
            >
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                  <HugeiconsIcon icon={themeIcon} size={16} strokeWidth={1.6} />
                </span>
                <span className="font-medium">{themeLabel}</span>
              </span>
              <span className="text-xs text-primary-500">
                Tap for {nextTheme}
              </span>
            </button>
          </section>
          <OverflowGrid
            title="System"
            items={SYSTEM_ITEMS}
            onSelect={handleSelect}
          />
          <OverflowGrid
            title="Hermes"
            items={HERMES_ITEMS}
            onSelect={handleSelect}
          />
        </div>
      </div>
    </div>
  )
}
