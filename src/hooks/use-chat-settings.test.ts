// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_AGENT_DISPLAY_NAME,
  DEFAULT_DESKTOP_SIDEBAR_WIDTH,
  MAX_DESKTOP_SIDEBAR_WIDTH,
  MIN_DESKTOP_SIDEBAR_WIDTH,
  getAgentDisplayName,
  selectAgentAvatarDataUrl,
  selectAgentDisplayName,
  selectDesktopSidebarWidth,
  useChatSettingsStore,
} from './use-chat-settings'

function resetWidth(): void {
  useChatSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      desktopSidebarWidth: DEFAULT_DESKTOP_SIDEBAR_WIDTH,
    },
  }))
}

beforeEach(() => {
  localStorage.clear()
  resetWidth()
})

describe('agent identity chat settings', () => {
  it('falls back to the default agent name when the saved value is blank', () => {
    expect(getAgentDisplayName('')).toBe(DEFAULT_AGENT_DISPLAY_NAME)
    expect(getAgentDisplayName('  ')).toBe(DEFAULT_AGENT_DISPLAY_NAME)
  })

  it('uses the saved agent name and icon data URL', () => {
    const state = {
      settings: {
        agentDisplayName: 'Marty',
        agentAvatarDataUrl: 'data:image/png;base64,avatar',
      },
    } as Parameters<typeof selectAgentDisplayName>[0]

    expect(selectAgentDisplayName(state)).toBe('Marty')
    expect(selectAgentAvatarDataUrl(state)).toBe('data:image/png;base64,avatar')
  })
})

describe('desktop chat sidebar width settings', () => {
  it('clamps updates before storing and persists the normalized width', () => {
    const { updateSettings } = useChatSettingsStore.getState()

    updateSettings({ desktopSidebarWidth: MAX_DESKTOP_SIDEBAR_WIDTH + 500 })
    expect(selectDesktopSidebarWidth(useChatSettingsStore.getState())).toBe(
      MAX_DESKTOP_SIDEBAR_WIDTH,
    )
    expect(
      JSON.parse(localStorage.getItem('chat-settings') ?? '{}'),
    ).toMatchObject({
      state: {
        settings: { desktopSidebarWidth: MAX_DESKTOP_SIDEBAR_WIDTH },
      },
    })

    updateSettings({ desktopSidebarWidth: MIN_DESKTOP_SIDEBAR_WIDTH - 500 })
    expect(selectDesktopSidebarWidth(useChatSettingsStore.getState())).toBe(
      MIN_DESKTOP_SIDEBAR_WIDTH,
    )

    updateSettings({ desktopSidebarWidth: Number.NaN })
    expect(selectDesktopSidebarWidth(useChatSettingsStore.getState())).toBe(
      DEFAULT_DESKTOP_SIDEBAR_WIDTH,
    )
    expect(
      JSON.parse(localStorage.getItem('chat-settings') ?? '{}'),
    ).toMatchObject({
      state: {
        settings: { desktopSidebarWidth: DEFAULT_DESKTOP_SIDEBAR_WIDTH },
      },
    })
  })

  it('hydrates legacy settings without a width and normalizes invalid persisted data', async () => {
    localStorage.setItem(
      'chat-settings',
      JSON.stringify({ state: { settings: { showToolMessages: true } } }),
    )
    await useChatSettingsStore.persist.rehydrate()

    expect(useChatSettingsStore.getState().settings.showToolMessages).toBe(true)
    expect(selectDesktopSidebarWidth(useChatSettingsStore.getState())).toBe(
      DEFAULT_DESKTOP_SIDEBAR_WIDTH,
    )

    localStorage.setItem(
      'chat-settings',
      JSON.stringify({
        state: {
          settings: { desktopSidebarWidth: MAX_DESKTOP_SIDEBAR_WIDTH * 10 },
        },
      }),
    )
    await useChatSettingsStore.persist.rehydrate()

    expect(selectDesktopSidebarWidth(useChatSettingsStore.getState())).toBe(
      MAX_DESKTOP_SIDEBAR_WIDTH,
    )
  })
})
