// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { usePinnedSessionsStore } from './use-pinned-sessions'

describe('pinned session persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    usePinnedSessionsStore.setState({ pinnedSessionKeys: [] })
  })

  it('atomically migrates an ancestor pin to its visible continuation tip', () => {
    usePinnedSessionsStore.getState().pinSession('ancestor')
    usePinnedSessionsStore.getState().pinSession('tip')
    usePinnedSessionsStore.getState().migratePinnedSession('ancestor', 'tip')

    expect(usePinnedSessionsStore.getState().pinnedSessionKeys).toEqual(['tip'])
    expect(
      JSON.parse(localStorage.getItem('pinned-sessions') ?? '{}'),
    ).toMatchObject({
      state: { pinnedSessionKeys: ['tip'] },
    })
  })
})
