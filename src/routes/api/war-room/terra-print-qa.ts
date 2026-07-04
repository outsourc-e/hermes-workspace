import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {  createTerraPrintQaPacket } from '../../../lib/war-room/terra/terra-local-assets'
import { isAuthenticated } from '../../../server/auth-middleware'
import type {TerraPrintQaRequest} from '../../../lib/war-room/terra/terra-local-assets';

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/terra-print-qa')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        let body: TerraPrintQaRequest = {}
        try {
          body = await request.json() as TerraPrintQaRequest
        } catch {
          body = {}
        }
        return json(await createTerraPrintQaPacket(body), { headers: noStoreHeaders })
      },
    },
  },
})
