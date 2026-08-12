import { createHmac, timingSafeEqual } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  listSwarmMissions,
  recordMissionExternalEvent,
} from '../../server/swarm-missions'
import { appendCoordinationEvent, recordWebhookReceipt } from '../../server/mission-coordinator/coordination-db'

function signatureMatches(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const provided = signature.trim().replace(/^sha256=/i, '')
  if (!provided || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function findMissionId(payload: Record<string, unknown>): string | null {
  if (typeof payload.mission_id === 'string') return payload.mission_id
  if (typeof payload.missionId === 'string') return payload.missionId
  const taskId =
    typeof payload.task_id === 'string'
      ? payload.task_id
      : typeof payload.taskId === 'string'
        ? payload.taskId
        : null
  if (!taskId) return null
  for (const mission of listSwarmMissions(100)) {
    if (
      mission.assignments.some(
        (assignment) => assignment.hermesTaskId === taskId,
      )
    )
      return mission.id
  }
  return null
}

export const Route = createFileRoute('/api/hermes-webhooks')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.HERMES_WEBHOOK_SECRET?.trim()
        if (!secret)
          return json(
            { ok: false, error: 'HERMES_WEBHOOK_SECRET is not configured' },
            { status: 503 },
          )
        const contentLength = Number(request.headers.get('content-length') ?? 0)
        if (contentLength > 1_000_000)
          return json({ ok: false, error: 'Webhook body too large' }, { status: 413 })
        const rawBody = await request.text()
        if (rawBody.length > 1_000_000)
          return json({ ok: false, error: 'Webhook body too large' }, { status: 413 })
        const signature =
          request.headers.get('x-hermes-signature') ??
          request.headers.get('x-hermes-webhook-signature') ??
          ''
        if (!signatureMatches(rawBody, signature, secret))
          return json(
            { ok: false, error: 'Invalid webhook signature' },
            { status: 401 },
          )
        let payload: Record<string, unknown>
        try {
          const parsed = JSON.parse(rawBody) as unknown
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('payload must be an object')
          payload = parsed as Record<string, unknown>
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error ? error.message : 'Invalid JSON payload',
            },
            { status: 400 },
          )
        }
        const eventType =
          typeof payload.event === 'string'
            ? payload.event
            : typeof payload.type === 'string'
              ? payload.type
              : 'unknown'
        const eventId =
          typeof payload.event_id === 'string'
            ? payload.event_id
            : typeof payload.eventId === 'string'
              ? payload.eventId
              : ''
        if (!eventId)
          return json({ ok: false, error: 'event_id required' }, { status: 400 })
        const timestamp =
          typeof payload.timestamp === 'number'
            ? payload.timestamp
            : typeof payload.timestamp === 'string'
              ? Number(payload.timestamp)
              : NaN
        if (Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp * 1000) > 5 * 60 * 1000)
          return json({ ok: false, error: 'Webhook timestamp outside replay window' }, { status: 401 })
        const missionId = findMissionId(payload)
        if (!recordWebhookReceipt({ eventId, missionId, eventType }))
          return json({ ok: true, recorded: false, duplicate: true, eventId })
        if (!missionId)
          return json({ ok: true, recorded: false, eventId, reason: 'No linked Workspace mission' })
        recordMissionExternalEvent({ missionId, eventType, payload })
        appendCoordinationEvent(missionId, 'hermes_webhook_received', { eventId, eventType })
        return json({ ok: true, recorded: true, missionId, eventType, eventId })
      },
    },
  },
})
