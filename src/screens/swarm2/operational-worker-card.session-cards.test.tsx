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
vi.mock('./swarm2-live-chat', () => ({
  Swarm2LiveChat: ({ cardOwner }: { cardOwner?: SwarmSessionCardOwner }) => (
    <div data-testid="embedded-card-owner">{JSON.stringify(cardOwner)}</div>
  ),
}))

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
  cardId: 'remote:builder-child-card',
  parentCardId: 'remote:builder-parent-card',
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

function compileTimeOperationalCardContract() {
  // @ts-expect-error Raw worker/session identity props are retired.
  const legacy = <OperationalWorkerCard member={member} sessionId="builder" />
  void legacy
}
void compileTimeOperationalCardContract
