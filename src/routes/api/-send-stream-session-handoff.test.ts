import { describe, expect, it } from 'vitest'

import {
  STREAM_PROVENANCE_ID_LIMIT,
  cardActivityStateForEvent,
  childLifecycleStatusForEvent,
  classifyStreamTerminalEvent,
  createStreamEventProvenanceTracker,
  hasNonParentStreamFacts,
  resolveActiveParentSource,
  resolveAuthoritativeBootstrapHandoff,
  resolveAuthoritativeCardStreamHandoff,
  resolveAuthoritativeSessionSource,
  resolveAuthoritativeStreamHandoff,
} from './-send-stream-session-handoff'

describe('childLifecycleStatusForEvent', () => {
  it.each([
    'run.started',
    'message.started',
    'assistant.delta',
    'tool.running',
  ])('maps %s activity to running', (event) =>
    expect(childLifecycleStatusForEvent(event)).toBe('running'),
  )

  it.each(['run.completed', 'run.succeeded'])('maps %s to complete', (event) =>
    expect(childLifecycleStatusForEvent(event)).toBe('complete'),
  )

  it.each([
    'error',
    'run.failed',
    'run.error',
    'run.cancelled',
    'run.canceled',
  ])('maps %s to error', (event) =>
    expect(childLifecycleStatusForEvent(event)).toBe('error'),
  )
})

describe('cardActivityStateForEvent', () => {
  it.each([
    ['run.started', 'running'],
    ['approval.request', 'pending_approval'],
    ['run.completed', 'completed'],
    ['run.succeeded', 'completed'],
    ['error', 'error'],
    ['run.failed', 'error'],
    ['run.error', 'error'],
    ['run.cancelled', 'error'],
    ['run.canceled', 'error'],
  ] as const)('maps the authoritative %s event to %s', (event, expected) => {
    expect(cardActivityStateForEvent(event)).toBe(expected)
  })

  it.each([
    'assistant.delta',
    'tool.pending',
    'command approval required',
    'approval.requested',
    'approval_request',
  ])('does not infer Card activity from %s', (event) => {
    expect(cardActivityStateForEvent(event)).toBeNull()
  })
})

describe('classifyStreamTerminalEvent', () => {
  it.each([
    ['run.completed', 'success'],
    ['run.succeeded', 'success'],
    ['error', 'error'],
    ['run.failed', 'error'],
    ['run.error', 'error'],
    ['run.cancelled', 'cancelled'],
    ['run.canceled', 'cancelled'],
  ] as const)('classifies %s as %s', (event, expected) => {
    expect(classifyStreamTerminalEvent(event)).toBe(expected)
  })

  it('does not terminalize ordinary activity', () => {
    expect(classifyStreamTerminalEvent('assistant.delta')).toBeNull()
  })
})

describe('createStreamEventProvenanceTracker', () => {
  it('keeps a shared run quarantined after explicit parent ownership', () => {
    const tracker = createStreamEventProvenanceTracker()
    tracker.recordParentRun('shared-run')
    tracker.quarantine({
      sessionKey: 'child-session',
      runId: 'shared-run',
      sourceIsExplicitlyNonParent: true,
    })

    tracker.recordParentRun('shared-run')

    expect(tracker.isImplicitParentEligible('shared-run', 'shared-run')).toBe(
      false,
    )
    expect(tracker.isExplicitlyRejectedSession('child-session')).toBe(true)
  })

  it('accepts identifier-less events only for an unconflicted parent run', () => {
    const tracker = createStreamEventProvenanceTracker()
    tracker.recordParentRun('parent-run')
    tracker.quarantine({
      sessionKey: 'child-session',
      runId: 'child-run',
      sourceIsExplicitlyNonParent: true,
    })

    expect(tracker.isImplicitParentEligible('parent-run', 'parent-run')).toBe(
      true,
    )
    expect(tracker.isImplicitParentEligible('child-run', 'parent-run')).toBe(
      false,
    )
    expect(tracker.isImplicitParentEligible(undefined, 'parent-run')).toBe(
      false,
    )
  })

  it('fails closed after a rejected source without run provenance', () => {
    const tracker = createStreamEventProvenanceTracker()
    tracker.quarantine({
      sessionKey: 'child-session',
      sourceIsExplicitlyNonParent: true,
    })
    tracker.recordParentRun('parent-run')

    expect(tracker.isImplicitParentEligible('parent-run', 'parent-run')).toBe(
      false,
    )
  })

  it('enforces one unique identity limit across every provenance category', () => {
    const tracker = createStreamEventProvenanceTracker()

    for (let index = 0; index < 20; index += 1) {
      tracker.recordParentRun(`identity-${index}`)
    }
    for (let index = 20; index < 40; index += 1) {
      tracker.quarantine({
        runId: `identity-${index}`,
        sourceIsExplicitlyNonParent: false,
      })
    }
    for (let index = 40; index < STREAM_PROVENANCE_ID_LIMIT; index += 1) {
      tracker.quarantine({
        sessionKey: `identity-${index}`,
        sourceIsExplicitlyNonParent: true,
      })
    }

    expect(tracker.getTrackedIdentityCount()).toBe(STREAM_PROVENANCE_ID_LIMIT)

    // Reusing an identity in other categories does not consume more capacity.
    tracker.quarantine({
      sessionKey: 'identity-0',
      runId: 'identity-0',
      sourceIsExplicitlyNonParent: true,
    })
    expect(tracker.getTrackedIdentityCount()).toBe(STREAM_PROVENANCE_ID_LIMIT)

    // The 65th distinct identity is not recorded and saturates implicit trust.
    tracker.recordParentRun(`identity-${STREAM_PROVENANCE_ID_LIMIT}`)
    expect(tracker.getTrackedIdentityCount()).toBe(STREAM_PROVENANCE_ID_LIMIT)
    expect(
      tracker.isImplicitParentEligible(
        `identity-${STREAM_PROVENANCE_ID_LIMIT}`,
        `identity-${STREAM_PROVENANCE_ID_LIMIT}`,
      ),
    ).toBe(false)
    expect(tracker.isImplicitParentEligible(undefined, undefined)).toBe(false)
  })
})

describe('resolveAuthoritativeBootstrapHandoff', () => {
  it.each(['new', 'main'])(
    'promotes bootstrap key %s to a concrete id',
    (key) => {
      expect(resolveAuthoritativeBootstrapHandoff(key, ' concrete ')).toEqual({
        fromSessionKey: key,
        sessionKey: 'concrete',
      })
    },
  )

  it.each([
    ['parent', 'child'],
    ['new', 'main'],
    ['main', 'new'],
    ['new', '   '],
  ])(
    'does not synthesize an unsafe bootstrap handoff from %j to %j',
    (from, to) => {
      expect(resolveAuthoritativeBootstrapHandoff(from, to)).toBeNull()
    },
  )
})

describe('resolveActiveParentSource', () => {
  it.each([
    [{ source: 'cli' }, 'cli'],
    [{ session_source: ' CLI ' }, 'cli'],
    [{ source: 'browser', session_source: 'hermes_browser' }, 'hermes_browser'],
    [
      {
        source: 'cli',
        session_source: 'cli',
        parent_source: 'cli',
      },
      'cli',
    ],
  ] as const)(
    'derives the active parent source from %j',
    (session, expected) => {
      expect(resolveActiveParentSource(session)).toBe(expected)
    },
  )

  it.each([
    {},
    { source: null },
    { source: '   ' },
    { source: 'mystery' },
    { source: 'cli', session_source: 'telegram' },
    { source: 'cli', parent_source: 'telegram' },
  ])(
    'fails closed for unavailable or contradictory context (%j)',
    (session) => {
      expect(resolveActiveParentSource(session)).toBeNull()
    },
  )
})

describe('resolveAuthoritativeSessionSource', () => {
  it('binds source facts to the exact backend session record', () => {
    expect(
      resolveAuthoritativeSessionSource('target', {
        id: 'target',
        source: 'cli',
        session_source: 'cli',
      }),
    ).toBe('cli')
  })

  it.each([
    {},
    { id: 'other', source: 'cli' },
    { id: 'target' },
    { id: 'target', source: 'mystery' },
  ])(
    'fails closed for an unbound or untrusted target context (%j)',
    (context) => {
      expect(resolveAuthoritativeSessionSource('target', context)).toBeNull()
    },
  )
})

describe('resolveAuthoritativeStreamHandoff', () => {
  const verifiedContinuation = {
    requestedSessionId: 'parent',
    sessionId: 'continuation',
    path: ['parent', 'continuation'],
    changed: true,
    supported: true,
  }

  it('distinguishes an absent relationship from explicit null or undefined', () => {
    expect(hasNonParentStreamFacts({})).toBe(false)
    expect(hasNonParentStreamFacts({ relationship_type: null })).toBe(true)
    expect(hasNonParentStreamFacts({ relationship_type: undefined })).toBe(true)
  })

  it.each([null, undefined])(
    'fails closed for an explicitly present %j relationship',
    (relationshipType) => {
      expect(
        resolveAuthoritativeStreamHandoff(
          'parent',
          {
            session_id: 'continuation',
            relationship_type: relationshipType,
          },
          verifiedContinuation,
          'cli',
          'cli',
        ),
      ).toBeNull()
    },
  )

  it('accepts a backend-confirmed continuation in the same logical parent', () => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: ' continuation ' },
        verifiedContinuation,
        'cli',
        'cli',
      ),
    ).toEqual({ fromSessionKey: 'parent', sessionKey: 'continuation' })
  })

  it.each([
    ['omitted event source facts', {}],
    [
      'spoofed same-parent event source facts',
      { source: 'cli', session_source: 'cli', parent_source: 'cli' },
    ],
  ])(
    'rejects a backend-qualified cross-source target with %s',
    (_label, eventSources) => {
      expect(
        resolveAuthoritativeStreamHandoff(
          'parent',
          { session_id: 'continuation', ...eventSources },
          verifiedContinuation,
          'cli',
          'telegram',
        ),
      ).toBeNull()
    },
  )

  it.each([null, undefined, '', 'mystery'])(
    'fails closed when authoritative target source is unavailable (%j)',
    (targetSource) => {
      expect(
        resolveAuthoritativeStreamHandoff(
          'parent',
          { session_id: 'continuation' },
          verifiedContinuation,
          'cli',
          targetSource,
        ),
      ).toBeNull()
    },
  )

  it.each([
    { session_source: 'cli' },
    { source: 'cli' },
    { session_source: ' CLI ', source: 'cli' },
    { parent_source: 'cli' },
    {
      session_source: ' CLI ',
      source: 'cli',
      parent_source: 'cli',
    },
  ])('accepts source facts bound to the active parent (%j)', (sources) => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: 'continuation', ...sources },
        verifiedContinuation,
        'cli',
        'cli',
      ),
    ).toEqual({ fromSessionKey: 'parent', sessionKey: 'continuation' })
  })

  it.each([
    [
      'candidate source contradicts its session source',
      { source: 'cli', session_source: 'telegram' },
    ],
    ['candidate source contradicts parent', { source: 'telegram' }],
    [
      'candidate session source contradicts parent',
      { session_source: 'telegram' },
    ],
    [
      'candidate parent source contradicts parent',
      { parent_source: 'telegram' },
    ],
  ])('rejects a continuation when %s', (_label, sources) => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: 'continuation', ...sources },
        verifiedContinuation,
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it.each([null, undefined, '', '   '])(
    'fails closed when the active parent source is unavailable (%j)',
    (parentSource) => {
      expect(
        resolveAuthoritativeStreamHandoff(
          'parent',
          { session_id: 'continuation' },
          verifiedContinuation,
          parentSource,
          'cli',
        ),
      ).toBeNull()
    },
  )

  it('keeps an equal stream target unchanged', () => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: ' parent ' },
        {
          requestedSessionId: 'parent',
          sessionId: 'parent',
          path: ['parent'],
          changed: false,
          supported: true,
        },
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it.each([
    ['child session', { relationship_type: 'child_session' }],
    ['subagent', { relationship_type: 'subagent' }],
    ['delegated worker', { session_source: 'delegated_worker' }],
  ])('rejects an explicitly identified %s', (_label, relation) => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: 'continuation', ...relation },
        verifiedContinuation,
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it.each([
    ['fork', { session_source: 'fork' }],
    ['cross-surface child', { _cross_surface_child_session: true }],
  ])('rejects an explicitly identified %s', (_label, relation) => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: 'continuation', ...relation },
        verifiedContinuation,
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it.each([
    [
      'unknown relation',
      { session_id: 'continuation', relationship_type: 'mystery' },
      verifiedContinuation,
    ],
    [
      'malformed relation',
      { session_id: 'continuation', relationship_type: 42 },
      verifiedContinuation,
    ],
    [
      'unsupported verification',
      { session_id: 'continuation' },
      { ...verifiedContinuation, supported: false },
    ],
    [
      'mismatched verification',
      { session_id: 'continuation' },
      { ...verifiedContinuation, sessionId: 'other' },
    ],
    [
      'malformed verification path',
      { session_id: 'continuation' },
      { ...verifiedContinuation, path: ['other', 'continuation'] },
    ],
  ])('fails closed for %s', (_label, data, verification) => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        data,
        verification,
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it.each([
    ['blank session source', { session_source: '' }],
    ['whitespace source', { source: '   ' }],
    ['null session source', { session_source: null }],
    ['undefined source', { source: undefined }],
    ['unknown session source', { session_source: 'mystery' }],
    ['unknown source', { source: 'mystery' }],
    ['malformed session source', { session_source: 42 }],
    ['malformed source', { source: {} }],
    [
      'conflicting known sources',
      { session_source: 'cli', source: 'telegram' },
    ],
  ])('fails closed for %s', (_label, sources) => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        { session_id: 'continuation', ...sources },
        verifiedContinuation,
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it('does not infer a continuation from parent_session_id or a bare changed id', () => {
    expect(
      resolveAuthoritativeStreamHandoff(
        'parent',
        {
          session_id: 'continuation',
          parent_session_id: 'parent',
        },
        null,
        'cli',
        'cli',
      ),
    ).toBeNull()
  })

  it.each([undefined, null, '', '   ', 42, {}, 'parent', 'main', 'new'])(
    'safely ignores malformed or unchanged session ids (%j)',
    (sessionId) => {
      expect(
        resolveAuthoritativeStreamHandoff(
          'parent',
          { session_id: sessionId },
          verifiedContinuation,
          'cli',
          'cli',
        ),
      ).toBeNull()
    },
  )
})

describe('resolveAuthoritativeCardStreamHandoff', () => {
  const parentCard = {
    cardId: 'remote:parent-card',
    canonicalSegmentKey: 'remote:parent',
    continuationSegmentKeys: ['remote:parent'],
    upstreamKeyBySegmentKey: new Map([['remote:parent', 'parent']]),
    relationshipKind: 'root' as const,
    collectionCompleteness: 'complete' as const,
  }

  it('accepts a fresh same-card continuation tip through source-qualified mappings', () => {
    expect(
      resolveAuthoritativeCardStreamHandoff(
        'parent',
        { session_id: 'continuation' },
        parentCard,
        {
          ...parentCard,
          canonicalSegmentKey: 'remote:continuation',
          continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
          upstreamKeyBySegmentKey: new Map([
            ['remote:parent', 'parent'],
            ['remote:continuation', 'continuation'],
          ]),
        },
      ),
    ).toEqual({
      cardId: 'remote:parent-card',
      fromSegmentKey: 'remote:parent',
      canonicalSegmentKey: 'remote:continuation',
      verifiedContinuationSegmentKeys: ['remote:parent', 'remote:continuation'],
    })
  })

  it.each([
    ['current upstream key', ' parent', { session_id: 'continuation' }],
    ['successor upstream key', 'parent', { session_id: ' continuation ' }],
  ])('rejects a whitespace-padded %s', (_label, currentUpstreamKey, data) => {
    expect(
      resolveAuthoritativeCardStreamHandoff(
        currentUpstreamKey,
        data,
        parentCard,
        {
          ...parentCard,
          canonicalSegmentKey: 'remote:continuation',
          continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
          upstreamKeyBySegmentKey: new Map([
            ['remote:parent', 'parent'],
            ['remote:continuation', 'continuation'],
          ]),
        },
      ),
    ).toBeNull()
  })

  it.each([
    ['cardId', { cardId: ' remote:parent-card ' }],
    [
      'canonicalSegmentKey',
      {
        canonicalSegmentKey: ' remote:continuation ',
        continuationSegmentKeys: ['remote:parent', ' remote:continuation '],
        upstreamKeyBySegmentKey: new Map([
          ['remote:parent', 'parent'],
          [' remote:continuation ', 'continuation'],
        ]),
      },
    ],
    [
      'upstream map value',
      {
        upstreamKeyBySegmentKey: new Map([
          ['remote:parent', 'parent'],
          ['remote:continuation', ' continuation '],
        ]),
      },
    ],
  ])('rejects a Card with a whitespace-padded %s', (_label, overrides) => {
    const successorCard = {
      ...parentCard,
      canonicalSegmentKey: 'remote:continuation',
      continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
      upstreamKeyBySegmentKey: new Map([
        ['remote:parent', 'parent'],
        ['remote:continuation', 'continuation'],
      ]),
      ...overrides,
    }
    const currentCard =
      'cardId' in overrides ? { ...parentCard, ...overrides } : parentCard

    expect(
      resolveAuthoritativeCardStreamHandoff(
        'parent',
        { session_id: 'continuation' },
        currentCard,
        successorCard,
      ),
    ).toBeNull()
  })

  it.each([
    [
      'child successor',
      {
        ...parentCard,
        canonicalSegmentKey: 'remote:child',
        continuationSegmentKeys: ['remote:parent', 'remote:child'],
        upstreamKeyBySegmentKey: new Map([
          ['remote:parent', 'parent'],
          ['remote:child', 'child'],
        ]),
        relationshipKind: 'child' as const,
        parentCardId: 'remote:parent-card',
      },
    ],
    [
      'different parent card',
      {
        ...parentCard,
        cardId: 'remote:other-card',
        canonicalSegmentKey: 'remote:continuation',
        continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
        upstreamKeyBySegmentKey: new Map([
          ['remote:parent', 'parent'],
          ['remote:continuation', 'continuation'],
        ]),
      },
    ],
    [
      'incomplete card projection',
      {
        ...parentCard,
        canonicalSegmentKey: 'remote:continuation',
        continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
        upstreamKeyBySegmentKey: new Map([
          ['remote:parent', 'parent'],
          ['remote:continuation', 'continuation'],
        ]),
        collectionCompleteness: 'incomplete' as const,
      },
    ],
  ])('rejects a %s', (_label, successorCard) => {
    expect(
      resolveAuthoritativeCardStreamHandoff(
        'parent',
        {
          session_id:
            successorCard.upstreamKeyBySegmentKey.get(
              successorCard.canonicalSegmentKey,
            ) ?? successorCard.canonicalSegmentKey,
        },
        parentCard,
        successorCard,
      ),
    ).toBeNull()
  })

  it('rejects explicit child provenance despite matching card data', () => {
    expect(
      resolveAuthoritativeCardStreamHandoff(
        'parent',
        { session_id: 'continuation', relationship_type: 'child_session' },
        parentCard,
        {
          ...parentCard,
          canonicalSegmentKey: 'remote:continuation',
          continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
          upstreamKeyBySegmentKey: new Map([
            ['remote:parent', 'parent'],
            ['remote:continuation', 'continuation'],
          ]),
        },
      ),
    ).toBeNull()
  })

  it('rejects a successor whose upstream identity is not mapped by the card', () => {
    expect(
      resolveAuthoritativeCardStreamHandoff(
        'parent',
        { session_id: 'unmapped-successor' },
        parentCard,
        {
          ...parentCard,
          canonicalSegmentKey: 'remote:continuation',
          continuationSegmentKeys: ['remote:parent', 'remote:continuation'],
          upstreamKeyBySegmentKey: new Map([
            ['remote:parent', 'parent'],
            ['remote:continuation', 'continuation'],
          ]),
        },
      ),
    ).toBeNull()
  })
})
