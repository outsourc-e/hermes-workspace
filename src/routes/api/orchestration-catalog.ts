import { createFileRoute } from '@tanstack/react-router'

import { requireLocalOrAuth } from '../../server/auth-middleware'
import { loadSubscriptionCatalog } from '../../server/subscription-model-catalog'

async function getCatalog({ request }: { request: Request }): Promise<Response> {
  if (!requireLocalOrAuth(request)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return Response.json({ ok: true, ...(await loadSubscriptionCatalog()) })
  } catch (error) {
    console.error('[orchestration-catalog] failed to load catalog:', error)
    return Response.json({ ok: false, error: 'Failed to load orchestration catalog.' }, { status: 500 })
  }
}

export const Route = createFileRoute('/api/orchestration-catalog')({
  server: { handlers: { GET: getCatalog } },
})
