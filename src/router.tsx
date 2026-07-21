import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

declare global {
  interface Window {
    /**
     * Optional runtime override for the TanStack router basepath. Allows the
     * same built artifact to be hosted under a path prefix by reverse proxies
     * or container orchestrators (e.g. mounted at `/workspaces/<id>/`) without
     * a rebuild. Set this on `window` before the app bundle executes — for
     * example via an inline `<script>` injected by the proxy.
     */
    __HERMES_WORKSPACE_BASEPATH__?: string
  }
}

export function resolveRouterBasepath(): string {
  if (typeof window === 'undefined') return '/'
  const value = window.__HERMES_WORKSPACE_BASEPATH__
  if (typeof value !== 'string') return '/'
  const trimmed = value.trim()
  if (!trimmed) return '/'
  // Normalize to leading slash and no trailing slash so TanStack's internal
  // pathname matching produces stable results (`basepath: ''` and trailing
  // slashes both cause subtle mismatches in route resolution).
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const withoutTrailing = withLeadingSlash.replace(/\/+$/, '')
  return withoutTrailing.length > 0 ? withoutTrailing : '/'
}

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    basepath: resolveRouterBasepath(),

    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  return router
}
