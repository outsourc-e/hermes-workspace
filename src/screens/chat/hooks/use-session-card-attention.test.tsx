// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  SESSION_CARD_ATTENTION_STORAGE_KEY,
  parseSessionCardAttentionState,
  sessionCardAttentionReducer,
  useSessionCardAttention,
} from './use-session-card-attention'
import type { SessionCard } from '../types'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function card(cardId: string, activity?: SessionCard['activity']): SessionCard {
  return {
    cardId,
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: cardId,
    titleSource: 'manual',
    canonicalSegmentKey: cardId,
    continuationSegmentKeys: [cardId],
    continuationCount: 1,
    relationshipKind: 'root',
    childNodes: [],
    ...(activity ? { activity } : {}),
    updatedAt: 999_999,
    archived: false,
    pinned: false,
  }
}

const emptyState = { cards: {} }

describe('session Card attention reducer and persistence', () => {
  it('establishes a first-seen baseline without flashing historical activity', () => {
    const state = sessionCardAttentionReducer(emptyState, {
      type: 'observe',
      cards: [card('card:a', { state: 'completed', updatedAt: 10 })],
    })

    expect(state.cards['card:a']).toEqual({
      observedAt: 10,
      acknowledgedAt: 10,
      attentionAt: null,
    })
  })

  it('ignores exact duplicates and latches only newer terminal or approval evidence', () => {
    const baseline = sessionCardAttentionReducer(emptyState, {
      type: 'observe',
      cards: [card('card:a', { state: 'running', updatedAt: 10 })],
    })
    const duplicate = sessionCardAttentionReducer(baseline, {
      type: 'observe',
      cards: [card('card:a', { state: 'running', updatedAt: 10 })],
    })
    expect(duplicate).toBe(baseline)

    const completed = sessionCardAttentionReducer(duplicate, {
      type: 'observe',
      cards: [card('card:a', { state: 'completed', updatedAt: 11 })],
    })
    expect(completed.cards['card:a']?.attentionAt).toBe(11)

    const missingSnapshot = sessionCardAttentionReducer(completed, {
      type: 'observe',
      cards: [card('card:a')],
    })
    expect(missingSnapshot).toBe(completed)

    const error = sessionCardAttentionReducer(missingSnapshot, {
      type: 'observe',
      cards: [card('card:a', { state: 'error', updatedAt: 12 })],
    })
    expect(error.cards['card:a']?.attentionAt).toBe(11)

    const approval = sessionCardAttentionReducer(error, {
      type: 'observe',
      cards: [card('card:a', { state: 'pending_approval', updatedAt: 13 })],
    })
    expect(approval.cards['card:a']?.attentionAt).toBe(13)
  })

  it('acknowledges only evidence at or before the actual view boundary', () => {
    const baseline = sessionCardAttentionReducer(emptyState, {
      type: 'observe',
      cards: [card('card:a', { state: 'running', updatedAt: 10 })],
    })
    const completed = sessionCardAttentionReducer(baseline, {
      type: 'observe',
      cards: [card('card:a', { state: 'completed', updatedAt: 11 })],
    })
    const acknowledged = sessionCardAttentionReducer(completed, {
      type: 'acknowledge',
      cardId: 'card:a',
      throughUpdatedAt: 11,
    })
    expect(acknowledged.cards['card:a']?.attentionAt).toBeNull()

    const newer = sessionCardAttentionReducer(completed, {
      type: 'observe',
      cards: [card('card:a', { state: 'pending_approval', updatedAt: 12 })],
    })
    const racedView = sessionCardAttentionReducer(newer, {
      type: 'acknowledge',
      cardId: 'card:a',
      throughUpdatedAt: 11,
    })
    expect(racedView.cards['card:a']?.attentionAt).toBe(12)
  })

  it('rejects malformed or mismatched persisted state conservatively', () => {
    expect(parseSessionCardAttentionState('{not json')).toEqual(emptyState)
    expect(
      parseSessionCardAttentionState(
        JSON.stringify({
          version: 999,
          cards: [
            {
              cardId: 'card:a',
              observedAt: 10,
              acknowledgedAt: 10,
              attentionAt: null,
            },
          ],
        }),
      ),
    ).toEqual(emptyState)
    expect(
      parseSessionCardAttentionState(
        JSON.stringify({
          version: 1,
          cards: [
            {
              cardId: 'card:a',
              observedAt: '10',
              acknowledgedAt: 10,
              attentionAt: 11,
            },
          ],
        }),
      ),
    ).toEqual(emptyState)
  })
})

type HarnessProps = {
  cards: Array<SessionCard>
  activeCardId: string
}

function Harness({ cards, activeCardId }: HarnessProps) {
  const attention = useSessionCardAttention({ cards, activeCardId })
  return (
    <div>
      <output data-testid="attention">
        {[...attention.attentionCardIds].sort().join(',')}
      </output>
      <button
        type="button"
        onClick={() => attention.markCardForViewing('card:a')}
      >
        View A
      </button>
    </div>
  )
}

const mountedRoots: Array<() => void> = []

function renderHarness(props: HarnessProps) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(<Harness {...props} />))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return {
    rerender(next: HarnessProps) {
      React.act(() => root.render(<Harness {...next} />))
    },
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

describe('useSessionCardAttention', () => {
  it('persists latched evidence and clears it only after the Card becomes active', () => {
    const running = card('card:a', { state: 'running', updatedAt: 10 })
    const view = renderHarness({ cards: [running], activeCardId: 'card:b' })
    expect(screen.getByTestId('attention').textContent).toBe('')

    const completed = card('card:a', { state: 'completed', updatedAt: 11 })
    view.rerender({ cards: [completed], activeCardId: 'card:b' })
    expect(screen.getByTestId('attention').textContent).toBe('card:a')
    expect(localStorage.getItem(SESSION_CARD_ATTENTION_STORAGE_KEY)).toContain(
      '"attentionAt":11',
    )

    view.rerender({ cards: [completed], activeCardId: 'card:a' })
    expect(screen.getByTestId('attention').textContent).toBe('')
  })

  it('retains a transition that lands after a view click but before routing completes', () => {
    const running = card('card:a', { state: 'running', updatedAt: 10 })
    const view = renderHarness({ cards: [running], activeCardId: 'card:b' })

    React.act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'View A' })),
    )
    const completed = card('card:a', { state: 'completed', updatedAt: 11 })
    view.rerender({ cards: [completed], activeCardId: 'card:a' })

    expect(screen.getByTestId('attention').textContent).toBe('card:a')
    view.rerender({ cards: [completed], activeCardId: 'card:b' })
    expect(screen.getByTestId('attention').textContent).toBe('card:a')
  })

  it('restores persisted unacknowledged evidence without depending on a current activity object', () => {
    localStorage.setItem(
      SESSION_CARD_ATTENTION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        cards: [
          {
            cardId: 'card:a',
            observedAt: 11,
            acknowledgedAt: 10,
            attentionAt: 11,
          },
        ],
      }),
    )

    renderHarness({ cards: [card('card:a')], activeCardId: 'card:b' })
    expect(screen.getByTestId('attention').textContent).toBe('card:a')
  })
})
