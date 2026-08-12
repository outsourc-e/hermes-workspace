// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  readLastSessionCard,
  syncLastSessionCardPersistence,
} from './-last-session-card'

const LAST_SESSION_CARD_KEY = 'hermes-last-session-card'

describe('last Session Card route persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('bootstraps new from the root route after the selected Card is archived and navigation reaches new', () => {
    syncLastSessionCardPersistence({
      activeFriendlyId: 'card-a',
      selectedCardId: 'card-a',
    })
    expect(localStorage.getItem(LAST_SESSION_CARD_KEY)).toBe('card-a')

    syncLastSessionCardPersistence({
      activeFriendlyId: 'new',
      selectedCardId: undefined,
    })

    expect(localStorage.getItem(LAST_SESSION_CARD_KEY)).toBeNull()
    expect(readLastSessionCard()).toBe('new')
  })

  it('restores a validated selected Card without persisting its raw route segment', () => {
    syncLastSessionCardPersistence({
      activeFriendlyId: 'raw-segment-key',
      selectedCardId: 'card-a',
    })

    expect(readLastSessionCard()).toBe('card-a')

    syncLastSessionCardPersistence({
      activeFriendlyId: 'another-raw-segment',
      selectedCardId: undefined,
    })

    expect(readLastSessionCard()).toBe('card-a')
  })
})
