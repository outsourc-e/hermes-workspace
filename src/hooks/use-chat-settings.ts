import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'system' | 'light' | 'dark'
export type LoaderStyle =
  | 'dots'
  | 'braille-claude'
  | 'braille-orbit'
  | 'braille-breathe'
  | 'braille-pulse'
  | 'braille-wave'
  | 'lobster'
  | 'logo'
export const DEFAULT_CHAT_DISPLAY_NAME = 'User'

export type EnterBehavior = 'send' | 'newline'
export type ChatWidth = 'comfortable' | 'wide' | 'full'

export type ChatSettings = {
  showToolMessages: boolean
  showReasoningBlocks: boolean
  theme: ThemeMode
  loaderStyle: LoaderStyle
  displayName: string
  avatarDataUrl: string | null
  /**
   * Controls how Enter behaves in the chat composer.
   *  - 'send'    — Enter sends, Shift+Enter / Cmd+Enter inserts a newline (default)
   *  - 'newline' — Enter inserts a newline, Cmd+Enter / Ctrl+Enter sends
   */
  enterBehavior: EnterBehavior
  /**
   * Max-width of the chat content column (#89).
   *  - 'comfortable' — 900px (default, keeps prior layout)
   *  - 'wide'        — 1200px
   *  - 'full'        — 100% of the pane (edge-to-edge)
   * Implemented via the --chat-content-max-width CSS variable switched by
   * the `data-chat-width` attribute on <html>.
   */
  chatWidth: ChatWidth
  /**
   * When the chat sidebar is collapsed to the 48px rail, should hovering
   * the rail temporarily expand it? Follow-up to #91 — some users liked the
   * previous hover-preview behavior.
   *  - false (default) — rail stays 48px, icons directly clickable
   *  - true            — rail expands on hover, re-collapses on leave
   */
  sidebarHoverExpand: boolean
  /**
   * Play a short notification sound in the browser when the agent finishes
   * responding in the main chat. Off by default so existing users don't get
   * surprised by sound on next page load.
   */
  soundOnChatComplete: boolean
}

type ChatSettingsState = {
  settings: ChatSettings
  updateSettings: (updates: Partial<ChatSettings>) => void
}

function defaultChatSettings(): ChatSettings {
  return {
    showToolMessages: false,
    showReasoningBlocks: false,
    theme: 'light',
    loaderStyle: 'dots',
    displayName: DEFAULT_CHAT_DISPLAY_NAME,
    avatarDataUrl: null,
    enterBehavior: 'send',
    chatWidth: 'comfortable',
    sidebarHoverExpand: false,
    soundOnChatComplete: false,
  }
}

function mergePersistedSettings(
  persistedState: unknown,
  currentState: ChatSettingsState,
): ChatSettingsState {
  if (
    !persistedState ||
    typeof persistedState !== 'object' ||
    !('settings' in persistedState)
  ) {
    return currentState
  }

  const state = persistedState as Partial<ChatSettingsState>
  return {
    ...currentState,
    ...state,
    settings: {
      ...currentState.settings,
      ...(state.settings || {}),
    },
  }
}

export const useChatSettingsStore = create<ChatSettingsState>()(
  persist(
    function createSettingsStore(set) {
      return {
        settings: defaultChatSettings(),
        updateSettings: function updateSettings(updates) {
          set(function applyUpdates(state) {
            return {
              settings: { ...state.settings, ...updates },
            }
          })
        },
      }
    },
    {
      name: 'chat-settings',
      merge: function merge(persistedState, currentState) {
        return mergePersistedSettings(persistedState, currentState)
      },
    },
  ),
)

export function getChatProfileDisplayName(displayName: string): string {
  const trimmed = displayName.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_CHAT_DISPLAY_NAME
}

export function selectChatProfileDisplayName(state: ChatSettingsState): string {
  return getChatProfileDisplayName(state.settings.displayName)
}

export function selectChatProfileAvatarDataUrl(
  state: ChatSettingsState,
): string | null {
  return state.settings.avatarDataUrl
}

export function selectEnterBehavior(state: ChatSettingsState): EnterBehavior {
  return state.settings.enterBehavior
}

export function selectChatWidth(state: ChatSettingsState): ChatWidth {
  return state.settings.chatWidth
}

export function selectSidebarHoverExpand(state: ChatSettingsState): boolean {
  return state.settings.sidebarHoverExpand
}

/**
 * Hook: keep <html data-chat-width='...'> in sync with the current setting.
 * Call once in the app root so CSS vars react to the pref.
 */
export function useApplyChatWidth(): void {
  const chatWidth = useChatSettingsStore(selectChatWidth)
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-chat-width', chatWidth)
  }, [chatWidth])
}

export function useChatSettings() {
  const settings = useChatSettingsStore((state) => state.settings)
  const updateSettings = useChatSettingsStore((state) => state.updateSettings)

  return {
    settings,
    updateSettings,
  }
}

export function useResolvedTheme() {
  const theme = useChatSettingsStore((state) => state.settings.theme)
  const [systemIsDark, setSystemIsDark] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemIsDark(media.matches)
    function handleChange(event: MediaQueryListEvent) {
      setSystemIsDark(event.matches)
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return useMemo(() => {
    if (theme === 'dark') return 'dark'
    if (theme === 'light') return 'light'
    return systemIsDark ? 'dark' : 'light'
  }, [theme, systemIsDark])
}
