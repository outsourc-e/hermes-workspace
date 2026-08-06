// @vitest-environment jsdom
import React, { useEffect } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getChatSessionSourceState } from '../chat-screen-utils'
import { persistPendingMessage } from '../pending-send'
import { useChatHistory } from './use-chat-history'
import type { QueryClient as QueryClientType } from '@tanstack/react-query'

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const ReactModule = await import('react')
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useQuery: (options: {
      queryKey: ReadonlyArray<unknown>
      queryFn: (context: { signal: AbortSignal }) => Promise<unknown>
      enabled?: boolean
      initialData?: () => unknown
    }) => {
      const initialData = options.initialData?.()
      const [state, setState] = ReactModule.useState<{
        data: unknown
        error: unknown
        isSuccess: boolean
      }>({
        data: initialData,
        error: null,
        isSuccess: initialData !== undefined,
      })
      const queryKey = JSON.stringify(options.queryKey)
      ReactModule.useEffect(() => {
        if (options.enabled === false) return
        const controller = new AbortController()
        void options
          .queryFn({ signal: controller.signal })
          .then((data) => setState({ data, error: null, isSuccess: true }))
          .catch((error) => {
            if (!controller.signal.aborted) {
              setState({ data: undefined, error, isSuccess: false })
            }
          })
        return () => controller.abort()
      }, [options.enabled, queryKey])
      return {
        data: state.data,
        error: state.error,
        isError: state.error !== null,
        isSuccess: state.isSuccess,
      }
    },
  }
})

vi.mock('../../../hooks/use-chat-settings', () => ({
  useChatSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { showToolMessages: false } }),
}))

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true

type SessionsStatus = 'pending' | 'success' | 'error'

function HistoryHarness({
  queryClient,
  sessionsStatus,
  source,
  onCanonicalSessionResolved,
  onSettled,
}: {
  queryClient: QueryClientType
  sessionsStatus: SessionsStatus
  source?: string
  onCanonicalSessionResolved: (payload: {
    requestedSessionKey: string
    sessionKey: string
  }) => void
  onSettled: () => void
}) {
  const sessionSource = getChatSessionSourceState({
    embedded: false,
    sessionsStatus,
    source,
  })
  const history = useChatHistory({
    activeFriendlyId: 'cold-local-friendly',
    activeSessionKey: sessionsStatus === 'success' ? 'cold-local-backend' : '',
    isNewChat: false,
    isRedirecting: false,
    activeExists: sessionsStatus === 'success',
    sessionsReady: sessionsStatus === 'success',
    queryClient,
    sessionSource,
    onCanonicalSessionResolved,
  })
  useEffect(() => {
    if (history.historyQuery.isSuccess) onSettled()
  }, [history.historyQuery.isSuccess, onSettled])
  return null
}

function PendingNewHistoryHarness({
  queryClient,
}: {
  queryClient: QueryClientType
}) {
  const history = useChatHistory({
    activeFriendlyId: 'new',
    activeSessionKey: 'new',
    forcedSessionKey: 'new',
    isNewChat: true,
    isRedirecting: false,
    activeExists: false,
    sessionsReady: true,
    queryClient,
  })
  return (
    <div data-testid="new-chat-transcript">
      {history.displayMessages.map((message, index) => (
        <article key={index}>
          {message.content?.map((part) =>
            part.type === 'text' ? part.text : '',
          )}
          {(message as Record<string, unknown>).status === 'error' ? (
            <button type="button">Retry message</button>
          ) : null}
        </article>
      ))}
    </div>
  )
}

async function flushQueries() {
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('useChatHistory cold session source behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('/latest-descendant')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              supported: true,
              changed: false,
              requestedSessionKey: 'cold-local-friendly',
              sessionKey: 'cold-local-friendly',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
      }
      if (url.startsWith('/api/history?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              sessionKey: url.includes('cold-local-backend')
                ? 'cold-local-backend'
                : 'cold-local-friendly',
              messages: [],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defers while source is unknown, then loads direct local history without lineage or redirect', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const onCanonicalSessionResolved = vi.fn()
    const onSettled = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(
        <HistoryHarness
          queryClient={queryClient}
          sessionsStatus="pending"
          onCanonicalSessionResolved={onCanonicalSessionResolved}
          onSettled={onSettled}
        />,
      )
    })
    await flushQueries()
    expect(fetch).not.toHaveBeenCalled()

    React.act(() => {
      root.render(
        <HistoryHarness
          queryClient={queryClient}
          sessionsStatus="success"
          source="local"
          onCanonicalSessionResolved={onCanonicalSessionResolved}
          onSettled={onSettled}
        />,
      )
    })
    await flushQueries()

    const requestedUrls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
    expect(requestedUrls).toEqual([
      '/api/history?limit=1000&sessionKey=cold-local-backend&friendlyId=cold-local-friendly',
    ])
    expect(onCanonicalSessionResolved).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalled()

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('restores a failed first turn from the provisional owner after /chat/new remount', async () => {
    const optimisticMessage = {
      role: 'user',
      content: [{ type: 'text' as const, text: 'first turn survives' }],
      timestamp: Date.now(),
      clientId: 'first-turn-client',
      client_id: 'first-turn-client',
      __optimisticId: 'opt-first-turn-client',
      status: 'error',
    }
    expect(
      persistPendingMessage({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'first turn survives',
        attachments: [],
        optimisticMessage,
      }),
    ).toBe(true)
    expect(
      window.localStorage.getItem(
        'workspace.chat-provisional-send.v1:new-chat',
      ),
    ).toContain('first turn survives')
    expect(window.localStorage.getItem('claude_pending_msg_new')).toBeNull()

    const mount = async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      React.act(() => {
        root.render(<PendingNewHistoryHarness queryClient={queryClient} />)
      })
      await flushQueries()
      expect(container.textContent).toContain('first turn survives')
      expect(container.textContent).toContain('Retry message')
      React.act(() => root.unmount())
      document.body.removeChild(container)
      queryClient.clear()
    }

    await mount()
    await mount()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats missing metadata after a session-list failure as remote-eligible', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(
        <HistoryHarness
          queryClient={queryClient}
          sessionsStatus="error"
          onCanonicalSessionResolved={vi.fn()}
          onSettled={vi.fn()}
        />,
      )
    })
    await flushQueries()
    await flushQueries()

    const requestedUrls = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
    expect(requestedUrls[0]).toBe(
      '/api/sessions/cold-local-friendly/latest-descendant',
    )
    expect(requestedUrls[1]).toBe(
      '/api/history?limit=1000&sessionKey=cold-local-friendly&friendlyId=cold-local-friendly',
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })
})
