import { describe, expect, it } from 'vitest'

import {
  advanceStickyStreamingText,
  createResponseWaitSnapshot,
  getChatSessionSourceState,
  isNonRemoteSessionSource,
  isTerminalActiveRunStatus,
  shouldClearWaitingForAssistantMessage,
  shouldPinMainSession,
} from './chat-screen-utils'

describe('isNonRemoteSessionSource', () => {
  it.each(['local', 'LOCAL', ' portable '])(
    'excludes %j sessions from remote canonicalization',
    (source) => {
      expect(isNonRemoteSessionSource(source)).toBe(true)
    },
  )

  it.each(['remote', '', undefined, null])(
    'keeps remotely backed source %j eligible',
    (source) => {
      expect(isNonRemoteSessionSource(source)).toBe(false)
    },
  )
})

describe('getChatSessionSourceState', () => {
  it('keeps absent cold metadata unknown only while the session list is pending', () => {
    expect(
      getChatSessionSourceState({
        embedded: false,
        sessionsStatus: 'pending',
        source: undefined,
      }),
    ).toBe('unknown')
    expect(
      getChatSessionSourceState({
        embedded: false,
        sessionsStatus: 'error',
        source: undefined,
      }),
    ).toBe('remote')
  })

  it('classifies known local and portable metadata without waiting', () => {
    expect(
      getChatSessionSourceState({
        embedded: false,
        sessionsStatus: 'pending',
        source: 'local',
      }),
    ).toBe('local')
    expect(
      getChatSessionSourceState({
        embedded: false,
        sessionsStatus: 'success',
        source: 'portable',
      }),
    ).toBe('local')
  })
})

describe('shouldPinMainSession', () => {
  it.each(['unknown', 'remote'] as const)(
    'does not pin an unresolved %s main bootstrap route',
    (sessionSource) => {
      expect(
        shouldPinMainSession({
          activeFriendlyId: 'main',
          resolvedSessionKey: 'main',
          portableMode: false,
          sessionSource,
        }),
      ).toBe(false)
    },
  )

  it.each([
    { portableMode: true, sessionSource: 'remote' as const },
    { portableMode: false, sessionSource: 'local' as const },
  ])(
    'pins main when its semantics are portable/local',
    ({ portableMode, sessionSource }) => {
      expect(
        shouldPinMainSession({
          activeFriendlyId: 'main',
          resolvedSessionKey: 'main',
          portableMode,
          sessionSource,
        }),
      ).toBe(true)
    },
  )
})

describe('advanceStickyStreamingText', () => {
  it('preserves the last non-empty streaming text when a tool phase temporarily reports empty text', () => {
    const afterText = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-1',
      rawText: 'Working through the task',
      smoothedText: 'Working through the task',
      previousState: { runId: null, text: '' },
    })

    const afterToolPhase = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-1',
      rawText: '',
      smoothedText: '',
      previousState: afterText,
    })

    expect(afterToolPhase).toEqual({
      runId: 'run-1',
      text: 'Working through the task',
    })
  })

  it('resets sticky text when a new run starts', () => {
    const next = advanceStickyStreamingText({
      isStreaming: true,
      runId: 'run-2',
      rawText: '',
      smoothedText: '',
      previousState: { runId: 'run-1', text: 'Old stream text' },
    })

    expect(next).toEqual({ runId: 'run-2', text: '' })
  })

  it('clears sticky text when streaming ends', () => {
    const next = advanceStickyStreamingText({
      isStreaming: false,
      runId: null,
      rawText: '',
      smoothedText: '',
      previousState: { runId: 'run-1', text: 'Old stream text' },
    })

    expect(next).toEqual({ runId: null, text: '' })
  })
})

describe('response wait detection', () => {
  it('treats persisted complete runs as terminal', () => {
    expect(isTerminalActiveRunStatus('complete')).toBe(true)
    expect(isTerminalActiveRunStatus('completed')).toBe(true)
    expect(isTerminalActiveRunStatus('active')).toBe(false)
  })

  it('clears waiting when a new assistant message appears after the send snapshot', () => {
    const snapshot = createResponseWaitSnapshot([
      {
        role: 'user',
        content: [{ type: 'text', text: 'remember that i like cheesecake' }],
      },
    ])

    expect(
      shouldClearWaitingForAssistantMessage(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'remember that i like cheesecake' },
            ],
          },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Remembered: you like cheesecake.' },
            ],
            id: 'assistant-1',
          },
        ],
        snapshot,
      ),
    ).toBe(true)
  })
})
