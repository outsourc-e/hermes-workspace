import { describe, expect, it } from 'vitest'

import {
  isCanonicalHistoryResolutionReady,
  shouldResolveCanonicalHistory,
} from './use-chat-history'

describe('useChatHistory canonical resolution gate', () => {
  it('attempts latest-descendant for every eligible remote history', () => {
    expect(
      shouldResolveCanonicalHistory({
        shouldFetchHistory: true,
        sessionSource: 'remote',
        sessionKey: 'parent',
      }),
    ).toBe(true)
  })

  it('holds history until the resolver finishes, then permits fallback history', () => {
    expect(
      isCanonicalHistoryResolutionReady({
        shouldFetchHistory: true,
        sessionSource: 'remote',
        resolverSucceeded: false,
      }),
    ).toBe(false)
    expect(
      isCanonicalHistoryResolutionReady({
        shouldFetchHistory: true,
        sessionSource: 'remote',
        resolverSucceeded: true,
      }),
    ).toBe(true)
  })

  it('does not resolve local or portable-backed history remotely', () => {
    expect(
      shouldResolveCanonicalHistory({
        shouldFetchHistory: true,
        sessionSource: 'local',
        sessionKey: 'local-session',
      }),
    ).toBe(false)
    expect(
      isCanonicalHistoryResolutionReady({
        shouldFetchHistory: true,
        sessionSource: 'local',
        resolverSucceeded: false,
      }),
    ).toBe(true)
  })
})
