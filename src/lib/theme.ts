export type ThemeId =
  | 'paper-light'
  | 'ops-dark'
  | 'premium-dark'
  | 'sunset-brand'
  | 'hermes'

const DARK_THEMES: ThemeId[] = ['ops-dark', 'premium-dark', 'sunset-brand', 'hermes']
const THEME_SET = new Set<ThemeId>([
  'paper-light',
  'ops-dark',
  'premium-dark',
  'sunset-brand',
  'hermes',
])

export const THEMES: Array<{
  id: ThemeId
  label: string
  description: string
  icon: string
}> = [
  { id: 'paper-light', label: 'Paper Light', description: 'Clean warm gray with soft shadows', icon: '☀️' },
  { id: 'ops-dark', label: 'Ops Dark', description: 'Slate dark with teal secondary accents', icon: '🖥️' },
  { id: 'premium-dark', label: 'Premium Dark', description: 'OLED black with high contrast', icon: '✨' },
  { id: 'sunset-brand', label: 'Sunset Brand', description: 'Warm brown immersion with amber accents', icon: '🌇' },
  { id: 'hermes', label: 'Hermes', description: 'Nous Research deep blue palette', icon: '⚕' },
]

const STORAGE_KEY = 'clawsuite-theme'

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'hermes'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && THEME_SET.has(stored as ThemeId)) return stored as ThemeId
  return 'hermes'
}

export function applyTheme(theme: ThemeId): void {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
  if (DARK_THEMES.includes(theme)) {
    html.classList.add('dark')
    html.classList.remove('light')
  } else {
    html.classList.add('light')
    html.classList.remove('dark')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

export function initTheme(): void {
  applyTheme(getStoredTheme())
}
