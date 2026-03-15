export type ThemeId =
  | 'hermes-dark'
  | 'hermes-dark-light'
  | 'hermes-slate'
  | 'hermes-slate-light'
  | 'hermes-mono'
  | 'hermes-mono-light'

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
    id: 'hermes-dark-light',
    label: 'Hermes Light',
    description: 'Warm parchment with bronze accents',
    icon: '☀',
  },
  {
    id: 'hermes-slate',
    label: 'Slate',
    description: 'Cool blue developer theme',
    icon: '🔷',
  },
  {
    id: 'hermes-slate-light',
    label: 'Slate Light',
    description: 'GitHub-light palette with blue accents',
    icon: '☀',
  },
  {
    id: 'hermes-mono',
    label: 'Mono',
    description: 'Clean monochrome grayscale',
    icon: '◐',
  },
  {
    id: 'hermes-mono-light',
    label: 'Mono Light',
    description: 'Bright monochrome grayscale',
    icon: '☀',
  },
]

const STORAGE_KEY = 'clawsuite-theme'
const DEFAULT_THEME: ThemeId = 'hermes-dark'
const THEME_SET = new Set<ThemeId>(THEMES.map((theme) => theme.id))
const LIGHT_THEME_MAP: Record<Exclude<ThemeId, `${string}-light`>, Extract<ThemeId, `${string}-light`>> = {
  'hermes-dark': 'hermes-dark-light',
  'hermes-slate': 'hermes-slate-light',
  'hermes-mono': 'hermes-mono-light',
}
const DARK_THEME_MAP: Record<Extract<ThemeId, `${string}-light`>, Exclude<ThemeId, `${string}-light`>> = {
  'hermes-dark-light': 'hermes-dark',
  'hermes-slate-light': 'hermes-slate',
  'hermes-mono-light': 'hermes-mono',
}

export function isValidTheme(value: string | null | undefined): value is ThemeId {
  return typeof value === 'string' && THEME_SET.has(value as ThemeId)
}

export function isDarkTheme(theme: ThemeId): boolean {
  return !theme.endsWith('-light')
}

export function getThemeVariant(theme: ThemeId, mode: 'light' | 'dark'): ThemeId {
  if (mode === 'light') {
    return isDarkTheme(theme)
      ? LIGHT_THEME_MAP[theme as keyof typeof LIGHT_THEME_MAP]
      : theme
  }

  return isDarkTheme(theme)
    ? theme
    : DARK_THEME_MAP[theme as keyof typeof DARK_THEME_MAP]
}

export function getTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = localStorage.getItem(STORAGE_KEY)
  return isValidTheme(stored) ? stored : DEFAULT_THEME
}

export function setTheme(theme: ThemeId): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.remove('light', 'dark', 'system')
  const nextMode = isDarkTheme(theme) ? 'dark' : 'light'
  root.classList.add(nextMode)
  root.style.setProperty('color-scheme', nextMode)
  localStorage.setItem(STORAGE_KEY, theme)
}
