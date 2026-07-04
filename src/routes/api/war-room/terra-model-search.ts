import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {  searchTerraInternetModels } from '../../../lib/war-room/terra/terra-model-search'
import { isAuthenticated } from '../../../server/auth-middleware'
import type {TerraInternetModelSearchRequest} from '../../../lib/war-room/terra/terra-model-search';

const noStoreHeaders = { 'cache-control': 'no-store' }

async function parseJson(request: Request): Promise<TerraInternetModelSearchRequest> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body as TerraInternetModelSearchRequest : {}
  } catch {
    return {}
  }
}

export const Route = createFileRoute('/api/war-room/terra-model-search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const result = await searchTerraInternetModels(await parseJson(request))
        if (!result.ok) return json(result, { status: result.status, headers: noStoreHeaders })
        return json(result, { headers: noStoreHeaders })
      },
    },
  },
})
