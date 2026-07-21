import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { loadSharedEtsyRoomStore, resetSharedEtsyRoomStore, saveSharedEtsyRoomState } from '../../../../lib/war-room/body/etsy-room-shared-store'
import type { EtsyRoomState } from '../../../../lib/war-room/living-v3/etsy-room-contracts'
import { isAuthenticated } from '../../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

type SharedRoomRequestBody = {
  roomState?: EtsyRoomState
  reason?: string
  reset?: boolean
}

export const Route = createFileRoute('/api/war-room/etsy-live/shared-room')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const store = await loadSharedEtsyRoomStore()
        return json({ ok: true, ...store }, { headers: noStoreHeaders })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }

        let body: SharedRoomRequestBody
        try {
          body = await request.json() as SharedRoomRequestBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: noStoreHeaders })
        }

        try {
          const store = body.reset
            ? await resetSharedEtsyRoomStore({ reason: body.reason ?? 'UI reset', source: 'ui' })
            : body.roomState
              ? await saveSharedEtsyRoomState(body.roomState, { reason: body.reason ?? 'UI sync', source: 'ui' })
              : null
          if (!store) {
            return json({ ok: false, error: 'Missing roomState or reset flag' }, { status: 400, headers: noStoreHeaders })
          }
          return json({ ok: true, ...store }, { headers: noStoreHeaders })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: noStoreHeaders })
        }
      },
    },
  },
})
