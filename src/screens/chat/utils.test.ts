import { describe, expect, it } from 'vitest'

import { normalizeSessions, textFromMessage, isMissingAuth, missingAuthMessage } from './utils'
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

  it('hides project_context directives from user-visible message text', () => {
    const message: ChatMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '<project_context active="true" id="seo" name="SEO" goal="Launch" instructions="Stay focused" />\n\nWhat should we do next?',
        },
      ],
    }

    expect(textFromMessage(message)).toBe('What should we do next?')
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

describe('chat auth error detection', () => {
  it('detects legacy gateway auth failure text', () => {
    expect(isMissingAuth(missingAuthMessage)).toBe(true)
  })

  it('detects expired workspace session responses', () => {
    expect(isMissingAuth('Unauthorized')).toBe(true)
    expect(isMissingAuth('{"ok":false,"error":"Unauthorized"}')).toBe(true)
    expect(isMissingAuth('401 Unauthorized')).toBe(true)
  })
})
