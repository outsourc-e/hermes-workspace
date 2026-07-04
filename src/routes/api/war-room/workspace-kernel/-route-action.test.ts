import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { Route, workspaceKernelPayloadFromBody } from './route-action'

vi.mock('../../../../server/auth-middleware', () => ({
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
let tempDirs: Array<string> = []

function makePost(body: unknown) {
  return new Request('http://localhost/api/war-room/workspace-kernel/route-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-kernel-route-api-'))
  tempDirs.push(rootDir)
  process.env.WORKSPACE_KERNEL_STORE_DIR = rootDir
})

afterEach(async () => {
  delete process.env.WORKSPACE_KERNEL_STORE_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('/api/war-room/workspace-kernel/route-action', () => {
  it('returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await handlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action?q=smart%20intake'),
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid JSON', async () => {
    const response = await handlers.POST({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Invalid JSON')
  })

  it('routes GET q smoke requests to Smart Intake kernel runs without cache', async () => {
    const response = await handlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action?q=AliExpress%20Drive%20Google%20Sheet%20local%20image%20Dolaro'),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as {
      ok: boolean
      result: { route: { blueprint: { blueprintId: string; stationId?: string } }; run: { blueprintId: string; artifacts: Array<{ kind: string }> } }
    }
    expect(body.ok).toBe(true)
    expect(body.result.route.blueprint).toMatchObject({
      blueprintId: 'etsy-smart-product-intake-v1',
      stationId: 'etsy-loki-product-hunt',
    })
    expect(body.result.run.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(body.result.run.artifacts[0].kind).toBe('product-candidate-packet')
  })

  it('accepts bounded POST WorkspaceAction payloads', async () => {
    const response = await handlers.POST({
      request: makePost({
        actionId: 'route-api-post',
        source: 'ui',
        intent: 'CAD packet',
        summary: `OpenSCAD STL print packet ${'x'.repeat(9_000)}`,
        input: {
          text: 'OpenSCAD STL STEP slicer G-code',
          payload: {
            huge: 'y'.repeat(2_000),
            nested: { unsafe: true },
          },
        },
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      ok: boolean
      result: {
        route: { action: { summary: string; input: { payload?: Record<string, unknown> } }; blueprint: { blueprintId: string }; safety: { usageAllowed: boolean; workerSpawnAllowed: boolean; liveActionsAllowed: boolean } }
        run: { status: string; approvals: Array<{ status: string }> }
      }
    }
    expect(body.ok).toBe(true)
    expect(body.result.route.action.summary).toHaveLength(8_000)
    expect(String(body.result.route.action.input.payload?.huge)).toHaveLength(1_200)
    expect(body.result.route.action.input.payload?.nested).toBe('[object omitted]')
    expect(body.result.route.blueprint.blueprintId).toBe('cad-3d-print-design-v1')
    expect(body.result.run.status).toBe('waiting_approval')
    expect(body.result.run.approvals[0].status).toBe('waiting_operator')
    expect(body.result.route.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('drops invalid route hints during body parsing', () => {
    const action = workspaceKernelPayloadFromBody({
      preferredBlueprintId: 'unknown-blueprint',
      preferredRoomId: 'unknown-room',
      preferredStationId: 'unknown-station',
      requestedWorkerProfileId: 'unknown-worker',
      source: 'bad-source',
      summary: 'daily news packet',
    }, 500)
    expect(action.preferredBlueprintId).toBeUndefined()
    expect(action.preferredRoomId).toBeUndefined()
    expect(action.preferredStationId).toBeUndefined()
    expect(action.requestedWorkerProfileId).toBeUndefined()
    expect(action.source).toBe('operator')
    expect(action.summary).toBe('daily news packet')
  })
})
