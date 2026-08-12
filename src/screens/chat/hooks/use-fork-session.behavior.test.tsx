// @vitest-environment jsdom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chatQueryKeys } from '../chat-queries'
import { useForkSession } from './use-fork-session'
import type { SessionMeta } from '../types'
import { useFeatureAvailable } from '@/hooks/use-feature-available'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
}))
const queryContext = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
}))
const routeContext = vi.hoisted(() => ({
  pathname: '/chat/parent-route',
  listeners: new Set<() => void>(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useQueryClient: () => queryContext.client,
    useMutation: ({
      mutationFn,
    }: {
      mutationFn: (variables: unknown) => Promise<unknown>
    }) => ({ mutateAsync: mutationFn }),
    useQuery: ({ queryKey }: { queryKey: ReadonlyArray<unknown> }) => ({
      data: queryContext.client.getQueryData(queryKey),
    }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    get state() {
      return { location: { pathname: routeContext.pathname } }
    },
  }),
  useRouterState: <T,>({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => T
  }) =>
    React.useSyncExternalStore(
      (listener) => {
        routeContext.listeners.add(listener)
        return () => routeContext.listeners.delete(listener)
      },
      () => select({ location: { pathname: routeContext.pathname } }),
      () => select({ location: { pathname: routeContext.pathname } }),
    ),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: mocks.toast,
}))

const reactActEnvironment = globalThis as {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const mountedRoots: Array<() => void> = []

function session(
  key: string,
  source?: string,
  backendKey: string | undefined = key,
): SessionMeta {
  return {
    key,
    backendKey,
    friendlyId: `${key}-route`,
    title: key,
    ...(source ? { lineage: { source } } : {}),
  }
}

function ForkHarness({
  value,
  supported,
  activateTwice = false,
}: {
  value: SessionMeta
  supported: boolean
  activateTwice?: boolean
}) {
  const { forkSession, forkingSessionKey } = useForkSession(supported)
  return (
    <button
      type="button"
      disabled={forkingSessionKey === value.backendKey}
      onClick={() => {
        void forkSession(value)
        if (activateTwice) void forkSession(value)
      }}
    >
      Branch conversation
    </button>
  )
}

function MultiForkHarness({ values }: { values: Array<SessionMeta> }) {
  const { forkSession } = useForkSession(true)
  return values.map((value) => (
    <button
      key={value.key}
      type="button"
      onClick={() => void forkSession(value)}
    >
      Branch {value.key}
    </button>
  ))
}

function CapabilityForkHarness({ value }: { value: SessionMeta }) {
  const supported = useFeatureAvailable('sessionFork')
  const { forkSession } = useForkSession(supported)
  return supported ? (
    <button type="button" onClick={() => void forkSession(value)}>
      Branch conversation
    </button>
  ) : null
}

function renderHarness(
  element: React.ReactElement,
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  queryContext.client = queryClient
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  React.act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
    )
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  return queryClient
}

async function flush() {
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function changeRoute(pathname: string) {
  React.act(() => {
    routeContext.pathname = pathname
    for (const listener of routeContext.listeners) listener()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  routeContext.pathname = '/chat/parent-route'
  routeContext.listeners.clear()
  mocks.navigate.mockResolvedValue(undefined)
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.restoreAllMocks()
})

describe('useForkSession whole-conversation mutation', () => {
  it.each([
    ['unsupported', session('unsupported'), false],
    ['local', session('local', 'local'), true],
    ['portable', session('portable', 'portable'), true],
    ['route-only', { ...session('route-only'), backendKey: undefined }, true],
  ] as const)(
    'does not POST for an ineligible %s session',
    (_name, value, supported) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch')
      renderHarness(<ForkHarness value={value} supported={supported} />)

      React.act(() => fireEvent.click(screen.getByText('Branch conversation')))

      expect(fetchMock).not.toHaveBeenCalled()
      expect(mocks.navigate).not.toHaveBeenCalled()
    },
  )

  it('POSTs exactly an empty JSON object, refetches sessions, and navigates to the returned child route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          supported: true,
          parentSessionKey: 'parent-backend',
          sessionKey: 'child-backend',
          entry: {
            key: 'child-backend',
            friendlyId: 'child-route',
            title: 'Alternate path',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let resolveRefresh!: () => void
    invalidate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    renderHarness(
      <ForkHarness
        value={session('parent', undefined, 'parent-backend')}
        supported
      />,
      queryClient,
    )

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/parent-backend/fork',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: chatQueryKeys.sessions,
    })
    expect(mocks.navigate).not.toHaveBeenCalled()

    resolveRefresh()
    await flush()

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'child-route' },
    })
    expect(window.localStorage.getItem('claude-last-session')).toBe(
      'child-route',
    )
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('deduplicates activation while the same fork is pending', async () => {
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    renderHarness(
      <ForkHarness
        value={session('parent', undefined, 'parent-backend')}
        supported
        activateTwice
      />,
    )

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText('Branch conversation').hasAttribute('disabled'),
    ).toBe(true)

    resolveResponse(
      new Response(
        JSON.stringify({
          ok: true,
          supported: true,
          parentSessionKey: 'parent-backend',
          sessionKey: 'child',
          entry: { key: 'child', friendlyId: 'child-route' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a fork for a different session while another fork is pending', async () => {
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    renderHarness(
      <MultiForkHarness
        values={[
          session('first', undefined, 'first-backend'),
          session('second', undefined, 'second-backend'),
        ]}
      />,
    )

    React.act(() => fireEvent.click(screen.getByText('Branch first')))
    React.act(() => fireEvent.click(screen.getByText('Branch second')))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/sessions/first-backend/fork',
    )

    resolveResponse(
      new Response(
        JSON.stringify({
          ok: true,
          supported: true,
          parentSessionKey: 'first-backend',
          sessionKey: 'first-child',
          entry: { key: 'first-child', friendlyId: 'first-child-route' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledTimes(1)
  })

  it('does not refetch, navigate, or persist when the route changes while a fork is pending', async () => {
    let resolveResponse!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    window.localStorage.setItem('claude-last-session', 'parent-route')
    renderHarness(
      <ForkHarness
        value={session('parent', undefined, 'parent-backend')}
        supported
      />,
      queryClient,
    )

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    changeRoute('/dashboard')
    resolveResponse(
      new Response(
        JSON.stringify({
          ok: true,
          supported: true,
          parentSessionKey: 'parent-backend',
          sessionKey: 'child-backend',
          entry: { key: 'child-backend', friendlyId: 'child-route' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    await flush()

    expect(invalidate).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('claude-last-session')).toBe(
      'parent-route',
    )
  })

  it.each([
    [
      'a mismatched parent key',
      {
        ok: true,
        supported: true,
        parentSessionKey: 'other-parent',
        sessionKey: 'child-backend',
        entry: { key: 'child-backend', friendlyId: 'child-route' },
      },
    ],
    [
      'an array entry',
      {
        ok: true,
        supported: true,
        parentSessionKey: 'parent-backend',
        sessionKey: 'child-backend',
        entry: [{ key: 'child-backend', friendlyId: 'child-route' }],
      },
    ],
    [
      'a null entry',
      {
        ok: true,
        supported: true,
        parentSessionKey: 'parent-backend',
        sessionKey: 'child-backend',
        entry: null,
      },
    ],
    [
      'an empty authoritative child key',
      {
        ok: true,
        supported: true,
        parentSessionKey: 'parent-backend',
        sessionKey: '   ',
        entry: { key: 'child-backend', friendlyId: 'child-route' },
      },
    ],
    [
      'the requested parent as its purported child',
      {
        ok: true,
        supported: true,
        parentSessionKey: 'parent-backend',
        sessionKey: 'parent-backend',
        entry: { key: 'parent-backend', friendlyId: 'self-child-route' },
      },
    ],
    [
      'a mismatched entry key',
      {
        ok: true,
        supported: true,
        parentSessionKey: 'parent-backend',
        sessionKey: 'child-backend',
        entry: { key: 'different-child', friendlyId: 'child-route' },
      },
    ],
    ['a non-object response', null],
  ] as const)(
    'rejects a successful HTTP response with %s',
    async (_name, body) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
      const queryClient = new QueryClient()
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      const sessions = [session('parent', undefined, 'parent-backend')]
      queryClient.setQueryData(chatQueryKeys.sessions, sessions)
      window.localStorage.setItem('claude-last-session', 'parent-route')
      renderHarness(<ForkHarness value={sessions[0]!} supported />, queryClient)

      React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
      await flush()

      expect(invalidate).not.toHaveBeenCalled()
      expect(queryClient.getQueryData(chatQueryKeys.sessions)).toBe(sessions)
      expect(mocks.navigate).not.toHaveBeenCalled()
      expect(window.localStorage.getItem('claude-last-session')).toBe(
        'parent-route',
      )
      expect(mocks.toast).toHaveBeenCalledWith(
        'Could not branch conversation. Please try again.',
        { type: 'error' },
      )
    },
  )

  it('preserves the prior stored selection when navigation rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          supported: true,
          parentSessionKey: 'parent-backend',
          sessionKey: 'child-backend',
          entry: { key: 'child-backend', friendlyId: 'child-route' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    mocks.navigate.mockRejectedValue(new Error('navigation failed'))
    window.localStorage.setItem('claude-last-session', 'parent-route')
    renderHarness(
      <ForkHarness
        value={session('parent', undefined, 'parent-backend')}
        supported
      />,
    )

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    await flush()

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'child-route' },
    })
    expect(window.localStorage.getItem('claude-last-session')).toBe(
      'parent-route',
    )
    expect(mocks.toast).toHaveBeenCalledWith(
      'Could not branch conversation. Please try again.',
      { type: 'error' },
    )
  })

  it('keeps route and session cache stable and shows a safe error toast on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'sensitive upstream detail' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const sessions = [session('parent', undefined, 'parent-backend')]
    queryClient.setQueryData(chatQueryKeys.sessions, sessions)
    window.localStorage.setItem('claude-last-session', 'parent-route')
    renderHarness(<ForkHarness value={sessions[0]!} supported />, queryClient)

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    await flush()

    expect(queryClient.getQueryData(chatQueryKeys.sessions)).toBe(sessions)
    expect(window.localStorage.getItem('claude-last-session')).toBe(
      'parent-route',
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(
      'Could not branch conversation. Please try again.',
      { type: 'error' },
    )
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.stringContaining('sensitive upstream detail'),
      expect.anything(),
    )
  })

  it('reconciles a 503 into an unavailable capability and hides the action on the next render', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          code: 'capability_unavailable',
          capability: 'sessionFork',
          supported: false,
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['gateway-status'], {
      capabilities: { sessions: true, sessionFork: true },
    })
    const sessions = [session('parent', undefined, 'parent-backend')]
    queryClient.setQueryData(chatQueryKeys.sessions, sessions)
    window.localStorage.setItem('claude-last-session', 'parent-route')
    renderHarness(<CapabilityForkHarness value={sessions[0]!} />, queryClient)

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      queryClient.getQueryData<{ capabilities: Record<string, boolean> }>([
        'gateway-status',
      ])?.capabilities.sessionFork,
    ).toBe(false)
    expect(screen.queryByText('Branch conversation')).toBeNull()
    expect(queryClient.getQueryData(chatQueryKeys.sessions)).toBe(sessions)
    expect(window.localStorage.getItem('claude-last-session')).toBe(
      'parent-route',
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(
      'Could not branch conversation. Please try again.',
      { type: 'error' },
    )
  })

  it('cancels an in-flight gateway status query before caching a 503 capability downgrade', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ supported: false }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['gateway-status'], {
      capabilities: { sessions: true, sessionFork: true },
    })
    let resolveStatus!: (value: {
      capabilities: { sessions: boolean; sessionFork: boolean }
    }) => void
    const staleStatusQuery = queryClient
      .fetchQuery({
        queryKey: ['gateway-status'],
        queryFn: () =>
          new Promise<{
            capabilities: { sessions: boolean; sessionFork: boolean }
          }>((resolve) => {
            resolveStatus = resolve
          }),
      })
      .catch(() => undefined)
    await flush()
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries')
    const setQueryData = vi.spyOn(queryClient, 'setQueryData')
    renderHarness(
      <CapabilityForkHarness
        value={session('parent', undefined, 'parent-backend')}
      />,
      queryClient,
    )

    React.act(() => fireEvent.click(screen.getByText('Branch conversation')))
    await flush()

    expect(cancelQueries).toHaveBeenCalledWith({
      queryKey: ['gateway-status'],
      exact: true,
    })
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      setQueryData.mock.invocationCallOrder[0]!,
    )
    expect(
      queryClient.getQueryData<{ capabilities: Record<string, boolean> }>([
        'gateway-status',
      ])?.capabilities.sessionFork,
    ).toBe(false)

    resolveStatus({
      capabilities: { sessions: true, sessionFork: true },
    })
    await staleStatusQuery
    await flush()

    expect(
      queryClient.getQueryData<{ capabilities: Record<string, boolean> }>([
        'gateway-status',
      ])?.capabilities.sessionFork,
    ).toBe(false)
    expect(screen.queryByText('Branch conversation')).toBeNull()
  })
})
