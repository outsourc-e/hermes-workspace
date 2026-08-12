// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { useChatStore } from '../../../stores/chat-store'
import { activeRunCheckUrl, useActiveRunCheck } from './use-active-run-check'

function ActiveRunCheckHarness({
  sessionKey,
  shouldApplyResult,
}: {
  sessionKey: string
  shouldApplyResult: (checkedSessionKey: string) => boolean
}) {
  useActiveRunCheck({
    sessionKey,
    enabled: true,
    shouldApplyResult,
  })
  return null
}

describe('activeRunCheckUrl', () => {
  it('uses the stable Card identity for Card-aware recovery', () => {
    expect(activeRunCheckUrl('remote:tip', 'remote:parent card')).toBe(
      '/api/sessions/remote%3Atip/active-run?cardId=remote%3Aparent%20card',
    )
  })

  it('retains the legacy session recovery path when no Card is selected', () => {
    expect(activeRunCheckUrl('main')).toBe('/api/sessions/main/active-run')
  })
})

describe('useActiveRunCheck', () => {
  it('does not let a recovery response clear a wait acquired by a newer local reader', async () => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const sessionKey = 'remote:tip'
    let resolveResponse: (response: Response) => void = () => {}
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => fetchPromise),
    )
    useChatStore.getState().setSessionWaiting(sessionKey, 'local-run')

    let localReaderOwnsSession = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        React.createElement(ActiveRunCheckHarness, {
          sessionKey,
          shouldApplyResult: (checkedSessionKey: string) =>
            !(localReaderOwnsSession && checkedSessionKey === sessionKey),
        }),
      )
    })
    await React.act(async () => {
      await Promise.resolve()
    })

    // The recovery request was started first. Before it responds, a local SSE
    // reader begins ownership of this same session.
    localReaderOwnsSession = true
    resolveResponse({
      ok: true,
      json: () => Promise.resolve({ ok: true, run: null }),
    } as Response)
    await React.act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(useChatStore.getState().isSessionWaiting(sessionKey)).toBe(true)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    useChatStore.getState().clearSession(sessionKey)
    vi.unstubAllGlobals()
  })
})
