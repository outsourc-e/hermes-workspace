// @vitest-environment jsdom

import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ContextBar } from './context-bar'

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/components/ui/preview-card', () => ({
  PreviewCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PreviewCardTrigger: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  PreviewCardPopup: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
}))

function mockViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('ContextBar', () => {
  it('requests only the latest continuation segment usage for the active Card', async () => {
    mockViewport()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          payload: {
            cards: [
              {
                cardId: 'remote:parent-card',
                usage: {
                  model: 'gpt-5.4',
                  contextPercent: 35,
                  maxTokens: 1_000,
                  usedTokens: 350,
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await React.act(async () => {
      root.render(<ContextBar cardId="remote:parent-card" />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session-status?cardId=remote%3Aparent-card&usageScope=latest-continuation',
    )

    React.act(() => root.unmount())
    container.remove()
  })
})
