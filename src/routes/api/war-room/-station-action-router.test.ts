import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../server/auth-middleware'
import { Route, stationActionPayloadFromBody } from './station-action-router'

vi.mock('../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type RouteWithHandlers = typeof Route & {
  options: {
    server: {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>
        POST: (ctx: { request: Request }) => Promise<Response>
      }
    }
  }
}

const handlers = (Route as RouteWithHandlers).options.server.handlers
const mockIsAuthenticated = vi.mocked(isAuthenticated)

function makePost(body: unknown) {
  return new Request('http://localhost/api/war-room/station-action-router', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
})

describe('/api/war-room/station-action-router', () => {
  it('returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await handlers.GET({
      request: new Request('http://localhost/api/war-room/station-action-router?q=smart%20intake'),
    })
    expect(response.status).toBe(401)
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid JSON', async () => {
    const response = await handlers.POST({
      request: new Request('http://localhost/api/war-room/station-action-router', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Invalid JSON')
  })

  it('routes GET q smoke requests to Smart Intake without cache', async () => {
    const response = await handlers.GET({
      request: new Request('http://localhost/api/war-room/station-action-router?q=AliExpress%20Drive%20Google%20Sheet%20local%20image'),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as { ok: boolean; result: { route: { stationHandoff: { toolId: string }; target: { stationId?: string; surfaceId: string } } } }
    expect(body.ok).toBe(true)
    expect(body.result.route.stationHandoff.toolId).toBe('smart-intake-v2')
    expect(body.result.route.target).toMatchObject({
      stationId: 'etsy-loki-product-hunt',
      surfaceId: 'smart-intake',
    })
  })

  it('accepts bounded POST typed event payloads', async () => {
    const longInput = `AliExpress Google Drive Google Sheet local image freeform ${'x'.repeat(9_000)}`
    const response = await handlers.POST({
      request: makePost({
        eventId: 'station-api-test',
        source: 'controlled-worker',
        kind: 'prefill_tool',
        taskText: longInput,
        toolId: 'smart-intake-v2',
        payload: {
          packetLabel: 'api-packet',
          huge: 'y'.repeat(2_000),
          nested: { unsafe: true },
        },
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      ok: boolean
      result: {
        event: { taskText: string; payload: Record<string, unknown> }
        route: { stationHandoff: { toolId: string } }
        safety: { usageAllowed: boolean; workerSpawnAllowed: boolean; externalRequestsAllowed: boolean; liveActionsAllowed: boolean; spawnsWorkers: boolean }
      }
    }
    expect(body.ok).toBe(true)
    expect(body.result.event.taskText).toHaveLength(8_000)
    expect(String(body.result.event.payload.huge)).toHaveLength(1_200)
    expect(body.result.event.payload.nested).toBe('[object omitted]')
    expect(body.result.route.stationHandoff.toolId).toBe('smart-intake-v2')
    expect(body.result.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
      spawnsWorkers: false,
    })
  })

  it('drops invalid route hints before router normalization', () => {
    const payload = stationActionPayloadFromBody({
      toolId: 'unknown-tool',
      stationId: 'unknown-station',
      surfaceId: 'unknown-surface',
      source: 'bad-source',
      kind: 'bad-kind',
      taskText: 'approval needed',
    })
    expect(payload.toolId).toBeUndefined()
    expect(payload.stationId).toBeUndefined()
    expect(payload.surfaceId).toBeUndefined()
    expect(payload.source).toBeUndefined()
    expect(payload.kind).toBeUndefined()
    expect(payload.taskText).toBe('approval needed')
  })
})
