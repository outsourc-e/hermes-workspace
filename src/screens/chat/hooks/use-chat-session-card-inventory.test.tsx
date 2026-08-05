// @vitest-environment jsdom

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionCardQueryKeys } from '../chat-queries'
import { useChatSessionCardInventory } from './use-chat-session-card-inventory'

const invalidateQueries = vi.fn().mockResolvedValue(undefined)
const useInfiniteQuery = vi.fn((_options: unknown) => ({
  data: undefined,
  error: null,
  isFetchNextPageError: false,
  fetchNextPage: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: unknown) => useInfiniteQuery(options),
  useQueryClient: () => ({ invalidateQueries }),
}))

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

type Listener = (event: Event) => void

class StubEventSource {
  static instances: Array<StubEventSource> = []

  readonly listeners = new Map<string, Set<Listener>>()
  readonly removeEventListener = vi.fn((type: string, listener: Listener) => {
    this.listeners.get(type)?.delete(listener)
  })
  readonly close = vi.fn()

  constructor(readonly url: string) {
    StubEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type))
    }
  }
}

function Harness({ enabled = true }: { enabled?: boolean }) {
  useChatSessionCardInventory({ enabled })
  return null
}

const mountedRoots: Array<() => void> = []

function renderHarness(enabled = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => root.render(<Harness enabled={enabled} />))
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  invalidateQueries.mockClear()
  useInfiniteQuery.mockClear()
  StubEventSource.instances = []
  vi.stubGlobal('EventSource', StubEventSource)
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
})

describe('useChatSessionCardInventory activity events', () => {
  it('invalidates exactly the chat inventory only for named card_activity events', () => {
    renderHarness()
    const source = StubEventSource.instances[0]
    expect(source?.url).toBe('/api/events')

    React.act(() => {
      source?.emit('connected')
      source?.emit('message')
    })
    expect(invalidateQueries).not.toHaveBeenCalled()

    React.act(() => source?.emit('card_activity'))
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: sessionCardQueryKeys.chatInventory(false),
      exact: true,
      refetchType: 'active',
    })
  })

  it('removes the named listener and closes the stream on cleanup', () => {
    renderHarness()
    const source = StubEventSource.instances[0]
    const listener = [...(source?.listeners.get('card_activity') ?? [])][0]
    expect(listener).toBeTruthy()

    mountedRoots.pop()?.()

    expect(source?.removeEventListener).toHaveBeenCalledWith(
      'card_activity',
      listener,
    )
    expect(source?.close).toHaveBeenCalledTimes(1)
  })

  it('does not create a browser stream while disabled or without EventSource', () => {
    renderHarness(false)
    expect(StubEventSource.instances).toHaveLength(0)

    mountedRoots.pop()?.()
    vi.stubGlobal('EventSource', undefined)
    expect(() => renderHarness()).not.toThrow()
  })
})
