import { describe, expect, it } from 'vitest'

import { normalizeSessions, textFromMessage } from './utils'
import type { ChatMessage, SessionSummary } from './types'

describe('chat utils workspace directive cleanup', () => {
  it('hides workspace_context directives from user-visible message text', () => {
    const message: ChatMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '<workspace_context active="true" name="Home" path="/Users/aurora/workspace" />\n\nRun the tests',
        },
      ],
    }

    expect(textFromMessage(message)).toBe('Run the tests')
  })

  it('strips workspace_context directives from session previews and derived titles', () => {
    const sessions = normalizeSessions([
      {
        key: 'session-1',
        friendlyId: 'session-1',
        preview:
          '<workspace_context active="true" name="Home" path="/Users/aurora/workspace" />\n\nReview the open PRs',
      },
      {
        key: 'session-2',
        friendlyId: 'session-2',
        derivedTitle:
          '<workspace_context active="true" name="Home" path="/Users/aurora/workspace" />\n\nFix Docker publish',
      },
    ] satisfies Array<SessionSummary>)

    expect(sessions[0]?.preview).toBe('Review the open PRs')
    expect(sessions[0]?.derivedTitle).toBe('Review the open PRs')
    expect(sessions[1]?.derivedTitle).toBe('Fix Docker publish')
  })
})

describe('chat session pin normalization', () => {
  it('preserves the durable backend pinned flag', () => {
    const sessions = normalizeSessions([
      {
        key: 'pinned-session',
        friendlyId: 'pinned-session',
        pinned: true,
      },
      {
        key: 'regular-session',
        friendlyId: 'regular-session',
        pinned: false,
      },
    ] satisfies Array<SessionSummary>)

    expect(sessions.map((session) => session.pinned)).toEqual([true, false])
  })

  it('preserves source and leaves missing pin state undefined', () => {
    const [session] = normalizeSessions([
      {
        key: 'legacy-session',
        friendlyId: 'legacy-session',
        source: 'desktop',
      },
    ])

    expect(session?.source).toBe('desktop')
    expect(session?.pinned).toBeUndefined()
  })
})
