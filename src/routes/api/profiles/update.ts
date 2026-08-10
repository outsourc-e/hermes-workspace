import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import {

  operationsModelSelectionPatch
} from '../../../server/operations-agent-config'
import {
  readProfile,
  updateProfileConfig,
} from '../../../server/profiles-browser'
import { requireJsonContentType } from '../../../server/rate-limit'
import { loadSubscriptionCatalog } from '../../../server/subscription-model-catalog'
import type {OperationsModelSelection} from '../../../server/operations-agent-config';

function allowlistedProfilePatch(
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!patch) return {}
  const safe: Record<string, unknown> = {}
  for (const key of ['system_prompt', 'description'] as const) {
    const value = patch[key]
    if (typeof value === 'string' || value === null) safe[key] = value
  }
  return safe
}

export const Route = createFileRoute('/api/profiles/update')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        try {
          const body = (await request.json()) as {
            name?: string
            patch?: Record<string, unknown>
            modelSelection?: OperationsModelSelection
          }
          const name = body.name || ''
          const current = readProfile(name)
          const legacyRouteRef =
            typeof body.patch?.model === 'string' ? body.patch.model.trim() : ''
          const selection =
            body.modelSelection ??
            (legacyRouteRef ? { routeRef: legacyRouteRef } : undefined)
          const safePatch = allowlistedProfilePatch(body.patch)
          const modelPatch = selection
            ? operationsModelSelectionPatch(
                selection,
                current.config,
                await loadSubscriptionCatalog(),
              )
            : {}
          const patch = { ...safePatch, ...modelPatch }
          if (Object.keys(patch).length === 0) {
            return json(
              { error: 'No supported profile changes supplied' },
              { status: 400 },
            )
          }
          const profile = updateProfileConfig(name, patch)
          return json({ ok: true, profile })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to update profile',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
