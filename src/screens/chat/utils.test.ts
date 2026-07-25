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

describe('normalizeSessions lineage', () => {
  it('retains valid lineage metadata and normalizes timestamps', () => {
    const sessions = normalizeSessions([
      {
        key: 'child',
        friendlyId: 'child',
        lineage: {
          parentSessionId: ' parent ',
          relationshipType: 'child_session',
          relationshipKind: 'child',
          parentTitle: ' Parent title ',
          parentSource: 'cli',
          sessionSource: 'fork',
          lineageRootId: 'root',
          lineageTipId: 'tip',
          compressionSegmentCount: 3,
          parentLineageRootId: 'parent-root',
          parentLineageTipId: 'parent-tip',
          isCrossSurfaceChild: true,
          isPreCompressionSnapshot: false,
          source: 'cli',
          endReason: 'compression',
          startedAt: 10,
          endedAt: 20,
        },
      },
    ])

    expect(sessions[0]?.lineage).toEqual({
      parentSessionId: 'parent',
      relationshipType: 'child_session',
      relationshipKind: 'child',
      parentTitle: 'Parent title',
      parentSource: 'cli',
      sessionSource: 'fork',
      lineageRootId: 'root',
      lineageTipId: 'tip',
      compressionSegmentCount: 3,
      parentLineageRootId: 'parent-root',
      parentLineageTipId: 'parent-tip',
      isCrossSurfaceChild: true,
      isPreCompressionSnapshot: false,
      source: 'cli',
      endReason: 'compression',
      startedAt: 10_000,
      endedAt: 20_000,
    })
  })

  it('drops malformed optional lineage fields safely', () => {
    const sessions = normalizeSessions([
      {
        key: 'bad',
        friendlyId: 'bad',
        lineage: {
          parentSessionId: ' ',
          relationshipType: '',
          relationshipKind: 'surprise',
          compressionSegmentCount: -1,
          isCrossSurfaceChild: 'yes',
          startedAt: 'not-a-date',
        } as unknown as SessionSummary['lineage'],
      },
    ])

    expect(sessions[0]?.lineage).toBeUndefined()
  })

  it('keeps legacy rows unchanged and treats local source rows as roots', () => {
    const legacy = normalizeSessions([
      {
        key: 'legacy',
        friendlyId: 'legacy',
        title: 'Legacy',
        updatedAt: 123,
      },
    ])[0]
    const local = normalizeSessions([
      {
        key: 'local',
        friendlyId: 'local',
        source: 'local',
      },
    ])[0]

    expect(legacy).toEqual({
      key: 'legacy',
      backendKey: 'legacy',
      friendlyId: 'legacy',
      title: 'Legacy',
      derivedTitle: undefined,
      label: undefined,
      updatedAt: 123,
      lastMessage: null,
      titleStatus: 'ready',
      titleSource: 'manual',
      titleError: null,
      preview: null,
    })
    expect(local?.lineage).toEqual({ source: 'local' })
  })
})
