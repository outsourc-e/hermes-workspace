import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getTheme, setTheme } from '@/lib/theme'

export type SettingsThemeMode = 'system' | 'light' | 'dark'
export type AccentColor = 'orange' | 'purple' | 'blue' | 'green'

export type StudioSettings = {
  claudeUrl: string
  claudeToken: string
  theme: SettingsThemeMode
  accentColor: AccentColor
  editorFontSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  notificationsEnabled: boolean
  usageThreshold: number
  smartSuggestionsEnabled: boolean
  preferredBudgetModel: string
  preferredPremiumModel: string
  onlySuggestCheaper: boolean
  showSystemMetricsFooter: boolean
  /** Mobile chat nav mode: 'dock' = iMessage (no nav in chat), 'integrated' = chat input in nav pill, 'scroll-hide' = nav shows on scroll up */
  mobileChatNavMode: 'dock' | 'integrated' | 'scroll-hide'
}

type SettingsState = {
  settings: StudioSettings
  updateSettings: (updates: Partial<StudioSettings>) => void
}

export const defaultStudioSettings: StudioSettings = {
  claudeUrl: '',
  claudeToken: '',
  theme: 'system',
  accentColor: 'blue',
  editorFontSize: 13,
  editorWordWrap: true,
  editorMinimap: false,
  notificationsEnabled: true,
  usageThreshold: 80,
  smartSuggestionsEnabled: false,
  preferredBudgetModel: '',
  preferredPremiumModel: '',
  onlySuggestCheaper: false,
  showSystemMetricsFooter: false,
  mobileChatNavMode: 'dock',
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    function createSettingsStore(set) {
      return {
        settings: defaultStudioSettings,
        updateSettings: function updateSettings(updates) {
          set(function applyUpdates(state) {
            return {
              settings: {
                ...state.settings,
                ...updates,
              },
            }
          })
        },
      }
    },
    {
      name: 'claude-settings',
      skipHydration: true,
    },
  ),
)

export function useSettings() {
  useEffect(() => {
    void useSettingsStore.persist.rehydrate()
  }, [])

  const settings = useSettingsStore(function selectSettings(state) {
    return state.settings
  })
  const updateSettings = useSettingsStore(function selectUpdateSettings(state) {
    return state.updateSettings
  })

  return {
    settings,
    updateSettings,
  }
}

export function resolveTheme(theme: SettingsThemeMode): 'light' | 'dark' {
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'

  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(_theme?: SettingsThemeMode) {
  setTheme(getTheme())
  document.documentElement.setAttribute('data-accent', 'orange')
}

export function initializeSettingsAppearance() {
  setTheme(getTheme())
  document.documentElement.setAttribute('data-accent', 'orange')
}
