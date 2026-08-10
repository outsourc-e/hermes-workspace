import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import {

  operationsModelSelectionPatch
} from '../../../server/operations-agent-config'
import {
  createProfile,
  readProfile,
  updateProfileConfig,
} from '../../../server/profiles-browser'
import { requireJsonContentType } from '../../../server/rate-limit'
import { loadSubscriptionCatalog } from '../../../server/subscription-model-catalog'
import type {OperationsModelSelection} from '../../../server/operations-agent-config';

export const Route = createFileRoute('/api/profiles/create')({
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
            cloneFrom?: string
            model?: string
            modelSelection?: OperationsModelSelection
          }
          const selection =
            body.modelSelection ??
            (body.model?.trim() ? { routeRef: body.model.trim() } : undefined)
          let modelPatch: Record<string, unknown> = {}
          if (selection) {
            const baseConfig = readProfile(body.cloneFrom || 'default').config
            modelPatch = operationsModelSelectionPatch(
              selection,
              baseConfig,
              await loadSubscriptionCatalog(),
            )
          }

          createProfile(body.name || '', { cloneFrom: body.cloneFrom })
          const profile =
            Object.keys(modelPatch).length > 0
              ? updateProfileConfig(body.name || '', modelPatch)
              : readProfile(body.name || '')
          return json({ ok: true, profile })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to create profile',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
