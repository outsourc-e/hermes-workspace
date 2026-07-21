export type WorkspaceNavigationSectionId =
  | 'primary'
  | 'work'
  | 'knowledge'
  | 'advanced'
  | 'labs'

export type WorkspaceRouteOwner =
  | 'workspace'
  | 'work'
  | 'agents'
  | 'knowledge'
  | 'system'
  | 'labs'

export type WorkspaceRouteVisibility =
  | 'primary'
  | 'secondary'
  | 'advanced'
  | 'hidden'

export type WorkspaceNavigationSurface =
  | 'desktop'
  | 'mobile-menu'
  | 'mobile-tabs'

export type WorkspaceRouteDefinition = {
  id: string
  label: string
  to: string
  aliases?: ReadonlyArray<string>
  search?: Readonly<Record<string, unknown>>
  section: WorkspaceNavigationSectionId
  owner: WorkspaceRouteOwner
  visibility: WorkspaceRouteVisibility
  surfaces: ReadonlyArray<WorkspaceNavigationSurface>
}

export const WORKSPACE_NAVIGATION_SECTIONS = [
  { id: 'primary', label: 'Workspace' },
  { id: 'work', label: 'Work' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'labs', label: 'Labs' },
] as const satisfies ReadonlyArray<{
  id: WorkspaceNavigationSectionId
  label: string
}>

/**
 * Canonical Workspace route and ownership registry.
 *
 * Product rule: a route can stay available without becoming a primary product.
 * `surfaces` controls where the route is user-visible; `owner` records which
 * product area is responsible for it; aliases preserve old bookmarks.
 */
export const WORKSPACE_ROUTE_REGISTRY = [
  {
    id: 'war-room',
    label: 'War Room',
    to: '/war-room',
    search: { etsyOps: 1 },
    section: 'primary',
    owner: 'workspace',
    visibility: 'primary',
    surfaces: ['desktop', 'mobile-menu', 'mobile-tabs'],
  },
  {
    id: 'tasks',
    label: 'Work',
    to: '/tasks',
    section: 'primary',
    owner: 'work',
    visibility: 'primary',
    surfaces: ['desktop', 'mobile-menu', 'mobile-tabs'],
  },
  {
    id: 'chat',
    label: 'Chat',
    to: '/chat',
    aliases: ['/', '/new'],
    section: 'primary',
    owner: 'workspace',
    visibility: 'primary',
    surfaces: ['desktop', 'mobile-menu', 'mobile-tabs'],
  },
  {
    id: 'swarm',
    label: 'Agents',
    to: '/swarm',
    aliases: ['/swarm2'],
    section: 'primary',
    owner: 'agents',
    visibility: 'primary',
    surfaces: ['desktop', 'mobile-menu', 'mobile-tabs'],
  },
  {
    id: 'product-research',
    label: 'Product Research',
    to: '/product-research',
    section: 'work',
    owner: 'work',
    visibility: 'secondary',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'product-intelligence',
    label: 'Product Intelligence',
    to: '/product-intelligence',
    section: 'work',
    owner: 'work',
    visibility: 'secondary',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'files',
    label: 'Files',
    to: '/files',
    section: 'knowledge',
    owner: 'knowledge',
    visibility: 'secondary',
    surfaces: ['desktop', 'mobile-menu', 'mobile-tabs'],
  },
  {
    id: 'memory',
    label: 'Memory',
    to: '/memory',
    section: 'knowledge',
    owner: 'knowledge',
    visibility: 'secondary',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'skills',
    label: 'Skills',
    to: '/skills',
    section: 'knowledge',
    owner: 'knowledge',
    visibility: 'secondary',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'dashboard',
    label: 'System Health',
    to: '/dashboard',
    section: 'advanced',
    owner: 'system',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'operations',
    label: 'Agent Operations',
    to: '/operations',
    section: 'advanced',
    owner: 'agents',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'conductor',
    label: 'Mission Builder',
    to: '/conductor',
    section: 'advanced',
    owner: 'agents',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    to: '/jobs',
    section: 'advanced',
    owner: 'system',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'terminal',
    label: 'Terminal',
    to: '/terminal',
    section: 'advanced',
    owner: 'system',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'mcp',
    label: 'MCP',
    to: '/mcp',
    section: 'advanced',
    owner: 'system',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'profiles',
    label: 'Profiles',
    to: '/profiles',
    section: 'advanced',
    owner: 'system',
    visibility: 'advanced',
    surfaces: ['desktop', 'mobile-menu'],
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/settings',
    section: 'advanced',
    owner: 'system',
    visibility: 'advanced',
    surfaces: [],
  },
  {
    id: 'agora',
    label: 'Agora',
    to: '/agora',
    section: 'labs',
    owner: 'labs',
    visibility: 'hidden',
    surfaces: [],
  },
] as const satisfies ReadonlyArray<WorkspaceRouteDefinition>

export type WorkspaceRouteId = (typeof WORKSPACE_ROUTE_REGISTRY)[number]['id']

const WORKSPACE_ROUTES: ReadonlyArray<WorkspaceRouteDefinition> =
  WORKSPACE_ROUTE_REGISTRY

export function getWorkspaceRoute(
  id: WorkspaceRouteId,
): WorkspaceRouteDefinition {
  const route = WORKSPACE_ROUTES.find((candidate) => candidate.id === id)
  if (!route) {
    throw new Error(`Unknown Workspace route: ${id}`)
  }
  return route
}

export function matchesWorkspaceRoute(
  id: WorkspaceRouteId,
  pathname: string,
): boolean {
  const route = getWorkspaceRoute(id)
  const candidates = [route.to, ...(route.aliases ?? [])]
  return candidates.some(
    (candidate) =>
      pathname === candidate || pathname.startsWith(`${candidate}/`),
  )
}

export function resolveCanonicalWorkspacePath(pathname: string): string {
  for (const route of WORKSPACE_ROUTES) {
    for (const alias of route.aliases ?? []) {
      if (pathname === alias) return route.to
      if (pathname.startsWith(`${alias}/`)) {
        return `${route.to}${pathname.slice(alias.length)}`
      }
    }
  }
  return pathname
}

export function getWorkspaceNavigationItems(
  surface: WorkspaceNavigationSurface,
): Array<WorkspaceRouteDefinition> {
  return WORKSPACE_ROUTES.filter((route) =>
    route.surfaces.includes(surface),
  )
}

export function getWorkspaceNavigationSections(
  surface: Exclude<WorkspaceNavigationSurface, 'mobile-tabs'>,
): Array<{
  id: Exclude<WorkspaceNavigationSectionId, 'labs'>
  label: string
  items: Array<WorkspaceRouteDefinition>
}> {
  const items = getWorkspaceNavigationItems(surface)
  return WORKSPACE_NAVIGATION_SECTIONS.filter(
    (section) => section.id !== 'labs',
  )
    .map((section) => ({
      id: section.id,
      label: section.label,
      items: items.filter((route) => route.section === section.id),
    }))
    .filter((section) => section.items.length > 0)
}

export function getWorkspacePageTitle(pathname: string): string | null {
  const route = WORKSPACE_ROUTES.find((candidate) =>
    matchesWorkspaceRoute(candidate.id as WorkspaceRouteId, pathname),
  )
  return route?.label ?? null
}
