import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getAtlantisVaultSnapshotForApi } from '../../../../server/atlantis-vault-data'
import { isAuthenticated } from '../../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/atlantis-vault/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        return json(await getAtlantisVaultSnapshotForApi(), { headers: noStoreHeaders })
      },
    },
  },
})
