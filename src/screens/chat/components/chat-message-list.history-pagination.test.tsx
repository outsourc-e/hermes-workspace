// @vitest-environment jsdom
import React, { useState } from 'react'
import { fireEvent } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatMessageList } from './chat-message-list'
import type { ChatMessage } from '../types'

vi.mock('./message-item', () => ({
  MessageItem: ({ message: itemMessage }: { message: ChatMessage }) => (
    <div data-chat-message-id={String(itemMessage.id)}>
      {String(itemMessage.id)}
    </div>
  ),
}))

vi.mock('./scroll-to-bottom-button', () => ({
  ScrollToBottomButton: () => <div data-scroll-to-bottom-button />,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    { create: (component: React.ComponentType) => component },
    {
      get: (target, tag: string) => (tag === 'create' ? target.create : tag),
    },
  ),
}))

const mounted: Array<() => void> = []

function message(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: [{ type: 'text', text: id }],
    timestamp: Number(id.replace(/\D/gu, '')) || 1,
  } as ChatMessage
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(async () => {
  while (mounted.length > 0) mounted.pop()?.()
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('ChatMessageList continuation history loading', () => {
  it('loads once at the top while pending and preserves the viewport anchor after prepend', async () => {
    let resolveLoad!: () => void
    const pendingLoad = new Promise<void>((resolve) => {
      resolveLoad = resolve
    })
    const loader = vi.fn(() => pendingLoad)

    function Harness() {
      const [messages, setMessages] = useState([message('m4'), message('m5')])
      const [loading, setLoading] = useState(false)
      const load = async () => {
        setLoading(true)
        await loader()
        setMessages((current) => [
          message('m2'),
          message('m3'),
          ...current,
          message('m6'),
        ])
        setLoading(false)
        return true
      }
      return (
        <ChatMessageList
          messages={messages}
          loading={false}
          empty={false}
          waitingForResponse={false}
          pinToTop={false}
          pinGroupMinHeight={0}
          headerHeight={0}
          sessionKey="remote:fifth"
          hasOlderHistory
          loadingOlderHistory={loading}
          onLoadOlderHistory={load}
        />
      )
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => root.render(<Harness />))
    mounted.push(() => React.act(() => root.unmount()))

    const viewport = container.querySelector(
      '[data-chat-scroll-viewport]',
    ) as HTMLDivElement
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 100 },
      scrollHeight: {
        configurable: true,
        get: () =>
          container.querySelectorAll('[data-chat-message-id]').length * 100,
      },
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this === viewport) {
          return { top: 0, bottom: 100 } as DOMRect
        }
        const messageElements = Array.from(
          viewport.querySelectorAll<HTMLElement>('[data-chat-message-id]'),
        )
        const index = messageElements.indexOf(this)
        if (index >= 0) {
          const top = index * 100 - viewport.scrollTop
          return { top, bottom: top + 100 } as DOMRect
        }
        return { top: 0, bottom: 0 } as DOMRect
      },
    )
    const scrollTo = vi.fn()
    viewport.scrollTo = scrollTo

    viewport.scrollTop = 50
    React.act(() => fireEvent.scroll(viewport))
    expect(loader).not.toHaveBeenCalled()

    viewport.scrollTop = 0
    React.act(() => {
      fireEvent.scroll(viewport)
      fireEvent.scroll(viewport)
    })
    expect(loader).toHaveBeenCalledTimes(1)

    await React.act(async () => {
      resolveLoad()
      await pendingLoad
    })

    expect(container.querySelectorAll('[data-chat-message-id]')).toHaveLength(5)
    expect(viewport.scrollTop).toBe(200)
    expect(scrollTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ top: viewport.scrollHeight }),
    )
  })

  it('loads older history from an upward wheel attempt when the recent window cannot scroll', async () => {
    let resolveLoad!: () => void
    const pendingLoad = new Promise<void>((resolve) => {
      resolveLoad = resolve
    })
    const loader = vi.fn(() => pendingLoad)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() =>
      root.render(
        <ChatMessageList
          messages={[message('m5')]}
          loading={false}
          empty={false}
          waitingForResponse={false}
          pinToTop={false}
          pinGroupMinHeight={0}
          headerHeight={0}
          sessionKey="remote:fifth"
          hasOlderHistory
          loadingOlderHistory={false}
          onLoadOlderHistory={loader}
        />,
      ),
    )
    mounted.push(() => React.act(() => root.unmount()))

    const viewport = container.querySelector(
      '[data-chat-scroll-viewport]',
    ) as HTMLDivElement
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => 100 },
      scrollHeight: { configurable: true, get: () => 100 },
    })

    React.act(() => fireEvent.wheel(viewport, { deltaY: -24 }))
    expect(loader).toHaveBeenCalledTimes(1)
    await React.act(async () => {
      resolveLoad()
      await pendingLoad
    })
  })
})
