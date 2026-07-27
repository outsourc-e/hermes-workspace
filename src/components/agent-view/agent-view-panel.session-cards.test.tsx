// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentViewPanel } from './agent-view-panel'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { SessionCard } from '@/screens/chat/types'
import { useAgentViewStore } from '@/hooks/use-agent-view'

type SessionCardWithChildAliases = SessionCard & {
  childNodes: Array<
    SessionCard['childNodes'][number] & {
      continuationSegmentKeys: Array<string>
    }
  >
}

type QueryOptions = {
  queryKey: ReadonlyArray<unknown>
  queryFn: () => Promise<SessionCardListWire>
}

type QueryState = {
  status: 'pending' | 'error' | 'success'
  data?: SessionCardListWire
  error?: Error
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  queryOptions: [] as Array<QueryOptions>,
  queryState: {} as QueryState,
  startGatewayPoll: vi.fn(),
  stopGatewayPoll: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions.push(options)
    return mocks.queryState
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('zustand', () => ({
  create:
    () =>
    (
      creator: (
        set: (
          update:
            | Record<string, unknown>
            | ((state: Record<string, unknown>) => Record<string, unknown>),
        ) => void,
      ) => Record<string, unknown>,
    ) => {
      let state: Record<string, unknown>
      const set = (
        update:
          | Record<string, unknown>
          | ((current: Record<string, unknown>) => Record<string, unknown>),
      ) => {
        state = {
          ...state,
          ...(typeof update === 'function' ? update(state) : update),
        }
      }
      state = creator(set)
      const useStore = (
        selector: (current: Record<string, unknown>) => unknown,
      ) => selector(state)
      useStore.setState = set
      return useStore
    },
}))

vi.mock('zustand/middleware', () => ({
  persist: (creator: unknown) => creator,
}))

vi.mock('motion/react', () => {
  function stripMotionProps(props: Record<string, unknown>) {
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      layoutId: _layoutId,
      ...domProps
    } = props
    return domProps
  }

  return {
    AnimatePresence: ({ children }: React.PropsWithChildren) => children,
    LayoutGroup: ({ children }: React.PropsWithChildren) => children,
    motion: {
      aside: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => (
        <aside {...stripMotionProps(props)}>{children}</aside>
      ),
      button: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => (
        <button {...stripMotionProps(props)}>{children}</button>
      ),
      div: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => (
        <div {...stripMotionProps(props)}>{children}</div>
      ),
      p: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => (
        <p {...stripMotionProps(props)}>{children}</p>
      ),
      span: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => (
        <span {...stripMotionProps(props)}>{children}</span>
      ),
    },
    useReducedMotion: () => true,
  }
})

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: () => <span aria-hidden="true" />,
}))

vi.mock('@hugeicons/core-free-icons', () => ({
  ArrowDown01Icon: {},
  ArrowRight01Icon: {},
  BotIcon: {},
  Cancel01Icon: {},
}))

vi.mock('./agent-card', () => ({
  AgentCard: ({
    node,
    onChat,
  }: {
    node: {
      id: string
      name: string
      task: string
      sessionKey?: string
    }
    onChat?: (id: string) => void
  }) => (
    <article data-has-control-identity={String(Boolean(node.sessionKey))}>
      <h3>{node.name}</h3>
      <p>{node.task}</p>
      {onChat ? (
        <button type="button" onClick={() => onChat(node.id)}>
          View Output
        </button>
      ) : null}
    </article>
  ),
}))

vi.mock('./background-runs-section', () => ({
  BackgroundRunsSection: () => null,
}))

vi.mock('./hooks/use-agent-spawn', () => ({
  useAgentSpawn: () => ({
    shouldRenderCard: () => true,
    isSpawning: () => false,
    getSharedLayoutId: () => undefined,
    getCardLayoutId: () => undefined,
  }),
}))

vi.mock('@/components/agent-card', () => ({
  AgentCard: ({ sessionLabel }: { sessionLabel: string }) => (
    <div>{sessionLabel}</div>
  ),
}))

vi.mock('@/components/orchestrator-avatar', () => ({
  OrchestratorAvatar: () => null,
}))

vi.mock('@/components/inspector/inspector-panel', () => ({
  InspectorPanel: () => null,
  InspectorToggleButton: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: React.PropsWithChildren) => children,
  CollapsiblePanel: ({ children }: React.PropsWithChildren) => children,
  CollapsibleTrigger: ({ children }: React.PropsWithChildren) => (
    <button type="button">{children}</button>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollAreaCorner: () => null,
  ScrollAreaRoot: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  ScrollAreaScrollbar: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  ScrollAreaThumb: () => null,
  ScrollAreaViewport: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  DialogRoot: ({
    children,
    open,
  }: React.PropsWithChildren<{ open: boolean }>) => (open ? children : null),
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/agent-chat/AgentChatHeader', () => ({
  AgentChatHeader: ({ agentName }: { agentName: string }) => (
    <h2>{agentName}</h2>
  ),
}))

vi.mock('@/components/agent-chat/AgentChatMessages', () => ({
  AgentChatMessages: () => null,
}))

vi.mock('@/components/agent-chat/AgentChatInput', () => ({
  AgentChatInput: () => null,
}))

vi.mock('@/hooks/use-cli-agents', () => ({
  useCliAgents: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}))

vi.mock('@/hooks/use-sounds', () => ({ useSounds: () => undefined }))

vi.mock('@/hooks/use-orchestrator-state', () => ({
  useOrchestratorState: () => ({ state: 'idle', label: 'Idle' }),
}))

vi.mock('@/stores/chat-activity-store', () => ({
  useChatActivityStore: (
    selector: (state: {
      startGatewayPoll: () => void
      stopGatewayPoll: () => void
    }) => unknown,
  ) =>
    selector({
      startGatewayPoll: mocks.startGatewayPoll,
      stopGatewayPoll: mocks.stopGatewayPoll,
    }),
}))

vi.mock('@/stores/mission-store', () => ({
  useMissionStore: (
    selector: (state: {
      activeMission: null
      agentSessionMap: Record<string, string>
    }) => unknown,
  ) => selector({ activeMission: null, agentSessionMap: {} }),
}))

const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const mountedRoots: Array<() => void> = []

function card(
  overrides: Partial<SessionCardWithChildAliases> = {},
): SessionCardWithChildAliases {
  return {
    cardId: 'remote:parent-card',
    canonicalSource: 'remote',
    canonicalTransport: 'gateway',
    title: 'Parent Card',
    titleSource: 'manual',
    canonicalSegmentKey: 'remote:parent-tip',
    continuationSegmentKeys: ['remote:parent-card', 'remote:parent-tip'],
    continuationCount: 2,
    relationshipKind: 'root',
    childNodes: [
      {
        cardId: 'remote:child-card',
        sessionKey: 'remote:child-tip',
        continuationSegmentKeys: [
          'remote:child-card',
          'remote:child-middle',
          'remote:child-tip',
        ],
        relationshipKind: 'child',
        title: 'Delegated research',
        status: 'running',
        updatedAt: Date.now(),
        continuationCount: 3,
      },
    ],
    updatedAt: Date.now(),
    archived: false,
    pinned: false,
    ...overrides,
  }
}

function wire(
  completeness: 'complete' | 'incomplete' = 'complete',
): SessionCardListWire {
  return {
    cards: [card()],
    cardResolutions: [
      {
        cardId: 'remote:parent-card',
        completeness,
        retryable: completeness === 'incomplete',
      },
    ],
    completeness,
    retryable: completeness === 'incomplete',
    sources: [
      {
        source: 'gateway',
        status: completeness,
        fetched: 1,
        retryable: completeness === 'incomplete',
        ...(completeness === 'incomplete'
          ? { reason: 'safe-cap' as const }
          : {}),
      },
    ],
  }
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function renderPanel() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(<AgentViewPanel />)
    await Promise.resolve()
  })
  mountedRoots.push(() => {
    React.act(() => root.unmount())
    container.remove()
  })
}

beforeEach(() => {
  window.innerWidth = 1280
  mocks.navigate.mockReset()
  mocks.queryOptions.length = 0
  mocks.startGatewayPoll.mockReset()
  mocks.stopGatewayPoll.mockReset()
  useAgentViewStore.setState({ isOpen: true, historyOpen: true })
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  vi.unstubAllGlobals()
  vi.clearAllTimers()
})

describe('AgentViewPanel mounted Card cutover', () => {
  it('loads only Cards and opens delegated activity under its owning parent Card', async () => {
    const body = wire()
    mocks.queryState = { status: 'success', data: body }
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input)
      if (url === '/api/session-cards') return Promise.resolve(response(body))
      return Promise.resolve(response({}, 404))
    })
    vi.stubGlobal('fetch', fetchMock)

    await renderPanel()

    expect(screen.getByText('Delegated research')).toBeTruthy()
    expect(screen.getByText('Child Card activity')).toBeTruthy()
    expect(document.body.textContent).not.toContain('remote:child-tip')
    expect(
      screen
        .getByText('Delegated research')
        .closest('article')
        ?.getAttribute('data-has-control-identity'),
    ).toBe('false')
    expect(mocks.queryOptions).toHaveLength(1)
    expect(mocks.queryOptions[0]?.queryKey).toEqual([
      'chat',
      'session-cards',
      'list',
      false,
    ])

    await expect(mocks.queryOptions[0]?.queryFn()).resolves.toEqual(body)
    React.act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'View Output' }))
    })

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'remote:parent-card' },
      search: { inspect: 'remote:child-card' },
    })
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls).toContain('/api/session-cards')
    expect(urls).not.toContain('/api/sessions')
    expect(urls.some((url) => url.startsWith('/api/history'))).toBe(false)
    expect(urls).not.toContain('/api/sessions/send')
  })

  it('fails closed when the authoritative Card projection is incomplete', async () => {
    const body = wire('incomplete')
    mocks.queryState = { status: 'success', data: body }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(body))
    vi.stubGlobal('fetch', fetchMock)

    await renderPanel()

    expect(screen.getByText('Card activity unavailable')).toBeTruthy()
    expect(screen.queryByText('Delegated research')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View Output' })).toBeNull()
    expect(document.body.textContent).not.toContain('remote:child-tip')
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.queryOptions).toHaveLength(1)
  })

  it('shows a closed unavailable state when the Card request fails', async () => {
    mocks.queryState = {
      status: 'error',
      error: new Error('Session Cards unavailable'),
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503))
    vi.stubGlobal('fetch', fetchMock)

    await renderPanel()

    expect(screen.getByText('Card activity unavailable')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View Output' })).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls).not.toContain('/api/sessions')
    expect(urls.some((url) => url.startsWith('/api/history'))).toBe(false)
    expect(urls).not.toContain('/api/sessions/send')
  })
})
