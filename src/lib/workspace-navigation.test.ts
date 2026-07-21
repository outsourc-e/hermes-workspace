import { describe, expect, it } from 'vitest'

import {
  WORKSPACE_ROUTE_REGISTRY,
  getWorkspaceNavigationItems,
  getWorkspaceNavigationSections,
  getWorkspaceRoute,
  matchesWorkspaceRoute,
  resolveCanonicalWorkspacePath,
} from './workspace-navigation'

describe('workspace navigation registry', () => {
  it('keeps the mobile primary contract to five clear destinations', () => {
    expect(
      getWorkspaceNavigationItems('mobile-tabs').map((route) => route.id),
    ).toEqual(['war-room', 'tasks', 'chat', 'swarm', 'files'])
  })

  it('uses one canonical user-facing Agents destination', () => {
    const visibleAgentRoutes = WORKSPACE_ROUTE_REGISTRY.filter(
      (route) => route.owner === 'agents' && route.visibility === 'primary',
    )

    expect(visibleAgentRoutes.map((route) => route.id)).toEqual(['swarm'])
    expect(getWorkspaceRoute('swarm')).toMatchObject({
      label: 'Agents',
      to: '/swarm',
    })
    expect(resolveCanonicalWorkspacePath('/swarm2')).toBe('/swarm')
    expect(matchesWorkspaceRoute('swarm', '/swarm2')).toBe(true)
  })

  it('keeps Conductor and Operations owned by Agents but out of primary navigation', () => {
    expect(getWorkspaceRoute('conductor')).toMatchObject({
      owner: 'agents',
      section: 'advanced',
      visibility: 'advanced',
    })
    expect(getWorkspaceRoute('operations')).toMatchObject({
      owner: 'agents',
      section: 'advanced',
      visibility: 'advanced',
    })
  })

  it('keeps Agora registered as Labs-only and absent from user navigation', () => {
    expect(getWorkspaceRoute('agora')).toMatchObject({
      section: 'labs',
      visibility: 'hidden',
    })

    for (const surface of ['desktop', 'mobile-menu', 'mobile-tabs'] as const) {
      expect(
        getWorkspaceNavigationItems(surface).some((route) => route.id === 'agora'),
      ).toBe(false)
    }
  })

  it('defines stable ordered navigation sections', () => {
    expect(
      getWorkspaceNavigationSections('desktop').map((section) => section.id),
    ).toEqual(['primary', 'work', 'knowledge', 'advanced'])
  })

  it('has unique route ids and canonical destinations', () => {
    const ids = WORKSPACE_ROUTE_REGISTRY.map((route) => route.id)
    const destinations = WORKSPACE_ROUTE_REGISTRY.map((route) => route.to)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(destinations).size).toBe(destinations.length)
  })
})
