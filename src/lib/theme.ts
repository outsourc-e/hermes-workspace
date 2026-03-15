export type ThemeId = 'hermes-dark' | 'hermes-slate' | 'hermes-mono'

export const THEMES: Array<{
  id: ThemeId
  label: string
  description: string
  icon: string
}> = [
  {
    id: 'hermes-dark',
    label: 'Hermes Dark',
    description: 'Bronze accents on dark charcoal',
    icon: '⚕',
  },
  {
    id: 'hermes-slate',
    label: 'Slate',
    description: 'Cool blue developer theme',
    icon: '🔷',
  },
  {
    id: 'hermes-mono',
    label: 'Mono',
    description: 'Clean monochrome grayscale',
    icon: '◐',
  },
]

const STORAGE_KEY = 'clawsuite-theme'
const DEFAULT_THEME: ThemeId = 'hermes-dark'
const THEME_SET = new Set<ThemeId>(THEMES.map((theme) => theme.id))

export function isValidTheme(value: string | null | undefined): value is ThemeId {
  return typeof value === 'string' && THEME_SET.has(value as ThemeId)
}

export function isDarkTheme(_theme: ThemeId): boolean {
  return true
}

export function getTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = localStorage.getItem(STORAGE_KEY)
  return isValidTheme(stored) ? stored : DEFAULT_THEME
}

export function setTheme(theme: ThemeId): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.remove('light', 'system')
  root.classList.add('dark')
  root.style.setProperty('color-scheme', 'dark')
  localStorage.setItem(STORAGE_KEY, theme)
}
