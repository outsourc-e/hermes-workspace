import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {  createTerraSlicePlan } from '../../../lib/war-room/terra/terra-local-assets'
import { isAuthenticated } from '../../../server/auth-middleware'
import type {TerraSlicePlanRequest} from '../../../lib/war-room/terra/terra-local-assets';

const noStoreHeaders = { 'cache-control': 'no-store' }

async function parseJson(request: Request): Promise<TerraSlicePlanRequest> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body as TerraSlicePlanRequest : {}
  } catch {
    return {}
  }
}

export const Route = createFileRoute('/api/war-room/terra-slice-plan')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const result = await createTerraSlicePlan(await parseJson(request))
        if (!result.ok) return json(result, { status: result.status, headers: noStoreHeaders })
        return json(result, { headers: noStoreHeaders })
      },
    },
  },
})
