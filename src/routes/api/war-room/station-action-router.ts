import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {

  isLivingV3RoomId,
  isLivingV3StationId,
  isWorkspaceStationActionKind,
  isWorkspaceStationActionSource,
  isWorkspaceStationToolId,
  isWorkspaceToolSurfaceId,
  routeWorkspaceStationActionEvent
} from '../../../lib/war-room/living-v3/workspace-station-action-router'
import type {WorkspaceStationActionEventInput} from '../../../lib/war-room/living-v3/workspace-station-action-router';

export function stationActionPayloadFromBody(body: unknown): WorkspaceStationActionEventInput {
  if (!body || typeof body !== 'object') return {}
  const candidate = body as Record<string, unknown>
  return {
    eventId: typeof candidate.eventId === 'string' ? candidate.eventId : undefined,
    source: isWorkspaceStationActionSource(candidate.source) ? candidate.source : undefined,
    kind: isWorkspaceStationActionKind(candidate.kind) ? candidate.kind : undefined,
    taskText: typeof candidate.taskText === 'string'
      ? candidate.taskText
      : typeof candidate.prompt === 'string'
        ? candidate.prompt
        : typeof candidate.operatorNote === 'string'
          ? candidate.operatorNote
          : undefined,
    toolId: isWorkspaceStationToolId(candidate.toolId) ? candidate.toolId : undefined,
    roomId: isLivingV3RoomId(candidate.roomId) ? candidate.roomId : undefined,
    stationId: isLivingV3StationId(candidate.stationId) ? candidate.stationId : undefined,
    surfaceId: isWorkspaceToolSurfaceId(candidate.surfaceId) ? candidate.surfaceId : undefined,
    readback: typeof candidate.readback === 'string' ? candidate.readback : undefined,
    payload: candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)
      ? candidate.payload as Record<string, unknown>
      : undefined,
  }
}

export const Route = createFileRoute('/api/war-room/station-action-router')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const result = routeWorkspaceStationActionEvent({
          source: 'hermes',
          kind: 'route_task',
          taskText: url.searchParams.get('q') ?? '',
        })
        return json({ ok: true, result }, { headers: { 'cache-control': 'no-store' } })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const result = routeWorkspaceStationActionEvent(stationActionPayloadFromBody(body))
        return json({ ok: true, result }, { headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
