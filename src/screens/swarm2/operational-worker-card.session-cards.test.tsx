// @vitest-environment jsdom

import React from 'react'
import { screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { OperationalWorkerCard } from './operational-worker-card'
import type { CrewMember } from '@/hooks/use-crew-status'
import type { SwarmSessionCardOwner } from '@/hooks/use-swarm-chat'

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: {}, isPending: false, isFetching: false }),
}))
vi.mock('@/components/agent-swarm/pixel-avatar', () => ({
  PixelAvatar: () => null,
}))
vi.mock('@/components/agent-view/agent-progress', () => ({
  AgentProgress: () => null,
}))
vi.mock('./swarm2-artifacts', () => ({ Swarm2Artifacts: () => null }))
vi.mock('./swarm2-task-queue', () => ({ Swarm2TaskQueue: () => null }))
vi.mock('./swarm2-live-chat', async () => {
  const ReactModule = await vi.importActual<typeof React>('react')
  return {
    Swarm2LiveChat: ({ cardOwner }: { cardOwner?: SwarmSessionCardOwner }) => {
      const [mountedOwner] = ReactModule.useState(cardOwner)
      return (
        <>
          <div data-testid="embedded-card-owner">
            {JSON.stringify(cardOwner)}
          </div>
          <div data-testid="mounted-card-owner">
            {JSON.stringify(mountedOwner)}
          </div>
        </>
      )
    },
  }
})

const member: CrewMember = {
  id: 'builder',
  displayName: 'Builder',
  role: 'Builder',
  profileFound: true,
  gatewayState: 'running',
  processAlive: true,
  platforms: {},
  model: 'test-model',
  provider: 'test-provider',
  cronJobCount: 0,
  assignedTaskCount: 1,
}

const owner: SwarmSessionCardOwner = {
  kind: 'session-card-owner',
  cardId: 'local:builder-child-card',
  parentCardId: 'local:builder-parent-card',
}

const mountedRoots: Array<{
  root: ReturnType<typeof createRoot>
  container: HTMLDivElement
}> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop()!
    React.act(() => mounted.root.unmount())
    mounted.container.remove()
  }
})

it('forwards only the explicit parent/child Card owner into embedded worker Chat', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })

  await React.act(async () => {
    root.render(
      <OperationalWorkerCard
        member={member}
        chatCardOwner={owner}
        inRoom={false}
        selected={false}
        onSelect={vi.fn()}
        onToggleRoom={vi.fn()}
        onOpenTui={vi.fn()}
        onOpenTasks={vi.fn()}
      />,
    )
    await Promise.resolve()
  })

  expect(screen.getByTestId('embedded-card-owner').textContent).toBe(
    JSON.stringify(owner),
  )
})

it('remounts embedded Chat immediately when the worker owner rolls from Card A to Card B', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push({ root, container })
  const ownerB: SwarmSessionCardOwner = {
    kind: 'session-card-owner',
    cardId: 'local:builder-current-card',
    parentCardId: null,
  }
  const render = (chatCardOwner: SwarmSessionCardOwner) => (
    <OperationalWorkerCard
      member={member}
      chatCardOwner={chatCardOwner}
      inRoom={false}
      selected={false}
      onSelect={vi.fn()}
      onToggleRoom={vi.fn()}
      onOpenTui={vi.fn()}
      onOpenTasks={vi.fn()}
    />
  )

  await React.act(async () => {
    root.render(render(owner))
    await Promise.resolve()
  })
  expect(screen.getByTestId('mounted-card-owner').textContent).toBe(
    JSON.stringify(owner),
  )

  await React.act(async () => {
    root.render(render(ownerB))
    await Promise.resolve()
  })
  expect(screen.getByTestId('embedded-card-owner').textContent).toBe(
    JSON.stringify(ownerB),
  )
  expect(screen.getByTestId('mounted-card-owner').textContent).toBe(
    JSON.stringify(ownerB),
  )
})

function compileTimeOperationalCardContract() {
  // @ts-expect-error Raw worker/session identity props are retired.
  const legacy = <OperationalWorkerCard member={member} sessionId="builder" />
  void legacy
}
void compileTimeOperationalCardContract
