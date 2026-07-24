import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {


  listWarRoomEvents,
  listWarRoomEventsByAgent,
  listWarRoomEventsByTask
} from '../../../lib/war-room/body'
import type {WarRoomAgentId, WarRoomTaskId} from '../../../lib/war-room/body';

export const Route = createFileRoute('/api/war-room/events')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const agentId = url.searchParams.get('agentId')?.trim()
        const taskId = url.searchParams.get('taskId')?.trim()
        const events = agentId
          ? listWarRoomEventsByAgent(agentId as WarRoomAgentId)
          : taskId
            ? listWarRoomEventsByTask(taskId)
            : listWarRoomEvents()
        return json({ ok: true, events }, { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
