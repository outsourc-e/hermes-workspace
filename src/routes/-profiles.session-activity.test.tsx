// @vitest-environment jsdom

import React from 'react'
import { fireEvent, screen } from '@testing-library/dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './profiles'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  refetch: vi.fn(),
  routeImports: [] as Array<Promise<Record<string, unknown>>>,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (options: unknown) => options,
  lazyRouteComponent: (
    importer: () => Promise<Record<string, React.ComponentType>>,
    exportName: string,
  ) => {
    const componentPromise = importer()
    mocks.routeImports.push(componentPromise)
    return React.lazy(async () => {
      const componentModule = await componentPromise
      return { default: componentModule[exportName]! }
    })
  },
  useNavigate: () => mocks.navigate,
}))

vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => null }))
vi.mock('@/hooks/use-page-title', () => ({ usePageTitle: vi.fn() }))
vi.mock('@/screens/profiles/profiles-screen', () => ({
  ProfilesScreen: () => <div>Profile configuration</div>,
}))
vi.mock('@/hooks/use-crew-status', () => ({
  getOnlineStatus: () => 'online',
  useCrewStatus: () => ({
    crew: [
      {
        id: 'agent-one',
        displayName: 'Agent One',
        role: 'Builder',
        profileFound: true,
        gatewayState: 'running',
        processAlive: true,
        platforms: {
          telegram: { state: 'connected', updatedAt: '2026-07-27T00:00:00Z' },
        },
        model: 'test-model',
        provider: 'test-provider',
        cronJobCount: 2,
        assignedTaskCount: 3,
        // Negative-control legacy payload: the mounted route must not render it.
        lastSessionTitle: 'RAW STATE DB SESSION TITLE',
        lastSessionAt: 1_700_000_000,
        sessionCount: 47,
        messageCount: 912,
        toolCallCount: 77,
        totalTokens: 123_456,
        estimatedCostUsd: 42.5,
      },
    ],
    lastUpdated: Date.now(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
  }),
}))

const mountedRoots: Array<() => void> = []
const reactActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.refetch.mockReset()
})

afterEach(() => {
  while (mountedRoots.length > 0) mountedRoots.pop()?.()
  document.body.replaceChildren()
})

describe('mounted /profiles monitoring route', () => {
  it('preserves profile health and controls without rendering raw session activity', async () => {
    const ProfilesRoute = (
      Route as unknown as { component: React.ComponentType }
    ).component
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await Promise.all(mocks.routeImports)
    await React.act(async () => {
      root.render(
        <React.Suspense fallback={<div>Loading route</div>}>
          <ProfilesRoute />
        </React.Suspense>,
      )
      await Promise.resolve()
    })
    mountedRoots.push(() => React.act(() => root.unmount()))

    const monitoringButton = screen.getByRole('button', {
      name: 'Monitoring',
    })
    await React.act(async () => {
      fireEvent.click(monitoringButton)
      await Promise.resolve()
    })

    expect(screen.getByText('Agent One')).toBeTruthy()
    expect(screen.getByText('test-model · test-provider')).toBeTruthy()
    expect(screen.getByText('Telegram: connected')).toBeTruthy()
    expect(screen.getByText('3 assigned')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cron Jobs' })).toBeTruthy()

    const text = document.body.textContent
    expect(text).not.toContain('RAW STATE DB SESSION TITLE')
    expect(text).not.toContain('Last active')
    expect(text).not.toContain('Sessions')
    expect(text).not.toContain('Messages')
    expect(text).not.toContain('Tools')
    expect(text).not.toContain('Tokens')
    expect(text).not.toContain('Est. cost')
  })
})
