import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { WAR_ROOM_WORKER_PROFILES, listWarRoomRuntimeCapabilities } from '../../../lib/war-room/body'

export const Route = createFileRoute('/api/war-room/capabilities')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          ...listWarRoomRuntimeCapabilities(),
          workerProfiles: WAR_ROOM_WORKER_PROFILES,
        }, { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
