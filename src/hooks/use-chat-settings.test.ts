import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_DISPLAY_NAME,
  getAgentDisplayName,
  selectAgentAvatarDataUrl,
  selectAgentDisplayName,
} from './use-chat-settings'

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
