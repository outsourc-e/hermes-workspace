// @vitest-environment jsdom

import React from 'react'
import { waitFor } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isGenericTitle, useAutoSessionTitle } from './use-auto-session-title'
import type { SessionCard } from '../types'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const queryClient = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClient,
  useMutation: ({
    mutationFn,
    onSuccess,
    onError,
  }: {
    mutationFn: (payload: unknown) => Promise<unknown>
    onSuccess?: (result: unknown, payload: unknown) => void
    onError?: (error: unknown, payload: unknown) => void
  }) => ({
    isPending: false,
    mutate: (payload: unknown) => {
      void mutationFn(payload).then(
        (result) => onSuccess?.(result, payload),
        (error) => onError?.(error, payload),
      )
    },
  }),
}))

function card(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'card:root',
    title: 'New Session',
    titleSource: 'default',
    canonicalSegmentKey: 'remote:tip',
    continuationSegmentKeys: ['remote:tip'],
    continuationCount: 1,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt: 1,
    archived: false,
    pinned: false,
    ...overrides,
  }
}

const mountedRoots: Array<() => void> = []
afterEach(() => {
  vi.unstubAllGlobals()
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
})

function AutoTitleHarness({ sessionCard }: { sessionCard: SessionCard }) {
  useAutoSessionTitle({
    friendlyId: sessionCard.cardId,
    sessionKey: sessionCard.canonicalSegmentKey,
    sessionCard,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Investigate the routing bug' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I found the cause.' }],
      },
    ],
    enabled: true,
  })
  return null
}

function renderHarness(sessionCard: SessionCard) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(React.createElement(AutoTitleHarness, { sessionCard }))
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

describe('isGenericTitle', () => {
  it('treats empty and placeholder titles as generic', () => {
    expect(isGenericTitle('')).toBe(true)
    expect(isGenericTitle('New Session')).toBe(true)
    expect(isGenericTitle('Conversation')).toBe(true)
  })

  it('keeps meaningful titles', () => {
    expect(isGenericTitle('Repair Session Card routing')).toBe(false)
  })
})

describe('useAutoSessionTitle Card persistence', () => {
  it('persists generated titles through the Card metadata endpoint, never the legacy sessions endpoint', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('/api/session-cards/card%3Aroot')
        expect(init?.method).toBe('PATCH')
        expect(JSON.parse(String(init?.body))).toEqual({
          autoTitle: 'Investigate the routing bug',
        })
        return new Response(
          JSON.stringify({
            card: card({
              title: 'Investigate the routing bug',
              titleSource: 'auto',
            }),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    renderHarness(card())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/api/sessions'),
    ).toBe(false)
  })

  it('does not overwrite a manually titled Card', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHarness(card({ title: 'Keep manual title', titleSource: 'manual' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
