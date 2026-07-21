import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { attachWorkspaceArtifact, createWorkspaceApprovalForRun, createWorkspaceArtifactForRun, createWorkspaceRun, requestWorkspaceApproval, routeWorkspaceActionToBlueprint } from '../../../../lib/workspace-kernel'
import { Route as EventsRoute } from './events'
import { Route as ResetRoute } from './reset-local-demo'
import { Route as ResolveRunRoute } from './resolve-run'
import { Route as StateRoute } from './state'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type StateHandlers = typeof StateRoute & {
  options: { server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response>; POST: (ctx: { request: Request }) => Promise<Response> } } }
}
type EventsHandlers = typeof EventsRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}
type ResetHandlers = typeof ResetRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}
type ResolveRunHandlers = typeof ResolveRunRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}

const stateHandlers = (StateRoute as StateHandlers).options.server.handlers
const eventsHandlers = (EventsRoute as EventsHandlers).options.server.handlers
const resetHandlers = (ResetRoute as ResetHandlers).options.server.handlers
const resolveRunHandlers = (ResolveRunRoute as ResolveRunHandlers).options.server.handlers
const mockIsAuthenticated = vi.mocked(isAuthenticated)
let tempDirs: Array<string> = []

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createRun() {
  const route = routeWorkspaceActionToBlueprint({
    actionId: 'api-state-run',
    createdAtMs: 100,
    source: 'ui',
    intent: 'smart intake',
    summary: 'Dolaro AliExpress Drive local image',
    input: { text: 'Dolaro AliExpress Drive local image' },
  })
  const run = createWorkspaceRun(route.action, route.blueprint, 100)
  return attachWorkspaceArtifact({ runs: [run] }, run.runId, createWorkspaceArtifactForRun(run, route.blueprint, 101)).runs[0]
}

function createApprovalRun() {
  const route = routeWorkspaceActionToBlueprint({
    actionId: 'api-resolve-run',
    createdAtMs: 200,
    source: 'ui',
    intent: 'publish',
    summary: 'Publish live Etsy listing',
    input: { text: 'publish upload live listing' },
  })
  const run = createWorkspaceRun(route.action, route.blueprint, 200)
  const withArtifact = attachWorkspaceArtifact({ runs: [run] }, run.runId, createWorkspaceArtifactForRun(run, route.blueprint, 201)).runs[0]
  return requestWorkspaceApproval({ runs: [withArtifact] }, withArtifact.runId, createWorkspaceApprovalForRun(withArtifact, route.blueprint, 202)).runs[0]
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-kernel-api-v2-'))
  tempDirs.push(rootDir)
  process.env.WORKSPACE_KERNEL_STORE_DIR = rootDir
})

afterEach(async () => {
  delete process.env.WORKSPACE_KERNEL_STORE_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('/api/war-room/workspace-kernel V2 state/events APIs', () => {
  it('state GET returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await stateHandlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/state'),
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('state POST persists a bounded local run snapshot with safety flags', async () => {
    const run = createRun()
    const response = await stateHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/state', { runs: [run] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as {
      ok: boolean
      stateVersion: string
      state: { runs: Array<{ runId: string }>; events: Array<{ eventId: string }> }
      displayStates: Array<{ agentId: string; mode: string }>
      usageAllowed: boolean
      workerSpawnAllowed: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
    }
    expect(body.ok).toBe(true)
    expect(body.stateVersion).toContain('workspace-kernel-v2')
    expect(body.state.runs[0].runId).toBe(run.runId)
    expect(body.state.events.length).toBeGreaterThan(0)
    expect(body.displayStates[0]).toMatchObject({ agentId: 'loki' })
    expect(body).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('events POST accepts typed local ingress and returns event-driven display state', async () => {
    const response = await eventsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/events', {
        producer: 'hermes',
        blueprintId: 'etsy-smart-product-intake-v1',
        eventType: 'run.started',
        summary: 'Stage Smart Intake locally for Dolaro Google Drive image evidence.',
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      ok: boolean
      event: { type: string }
      telemetry: { agentId: string; motion: string }
      displayStates: Array<{ agentId: string; mode: string }>
      localOnly: boolean
      usageAllowed: boolean
      workerSpawnAllowed: boolean
    }
    expect(body.ok).toBe(true)
    expect(body.event.type).toBe('run.started')
    expect(body.telemetry).toMatchObject({ agentId: 'loki', motion: 'basic_station_walk' })
    expect(body.displayStates[0]).toMatchObject({ agentId: 'loki', mode: 'walking' })
    expect(body).toMatchObject({ localOnly: true, usageAllowed: false, workerSpawnAllowed: false })
  })

  it('events POST returns 400 for bad JSON and invalid typed events', async () => {
    const badJson = await eventsHandlers.POST({
      request: new Request('http://localhost/api/war-room/workspace-kernel/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    })
    expect(badJson.status).toBe(400)

    const invalid = await eventsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/events', {
        producer: 'bad',
        eventType: 'run.started',
        summary: 'bad',
      }),
    })
    expect(invalid.status).toBe(400)
  })

  it('resolve-run records approval without live execution and persists readback', async () => {
    const run = createApprovalRun()
    await stateHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/state', { runs: [run] }),
    })

    const response = await resolveRunHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/resolve-run', {
        action: 'approved',
        approvalId: run.approvals[0].approvalId,
      }),
    })
    const body = await response.json() as {
      ok: boolean
      run: { status: string; readback: string; approvals: Array<{ status: string }>; events: Array<{ type: string; payload?: Record<string, unknown> }> }
      liveActionsAllowed: boolean
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.run.status).toBe('blocked')
    expect(body.run.approvals[0].status).toBe('approved')
    expect(body.run.readback).toContain('Live executor is still gated')
    expect(body.run.events.map((event) => event.type)).toContain('approval.approved')
    expect(body.run.events.at(-1)?.payload).toMatchObject({ liveExecutorConnected: false })
    expect(body.liveActionsAllowed).toBe(false)
  })

  it('resolve-run cancels a run and returns 404 for unknown ids', async () => {
    const run = createApprovalRun()
    await stateHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/state', { runs: [run] }),
    })

    const cancelled = await resolveRunHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/resolve-run', {
        action: 'cancel',
        runId: run.runId,
        reason: 'Operator cancelled from API test.',
      }),
    })
    const cancelBody = await cancelled.json() as { ok: boolean; run: { status: string; approvals: Array<{ status: string }>; events: Array<{ type: string }> } }
    expect(cancelled.status).toBe(200)
    expect(cancelBody.ok).toBe(true)
    expect(cancelBody.run.status).toBe('cancelled')
    expect(cancelBody.run.approvals[0].status).toBe('rejected')
    expect(cancelBody.run.events.map((event) => event.type)).toContain('run.cancelled')

    const missing = await resolveRunHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/resolve-run', {
        action: 'approved',
        approvalId: 'missing-approval',
      }),
    })
    expect(missing.status).toBe(404)
  })

  it('reset-local-demo clears only the local durable kernel store', async () => {
    const run = createRun()
    await stateHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/state', { runs: [run] }),
    })
    const response = await resetHandlers.POST({
      request: new Request('http://localhost/api/war-room/workspace-kernel/reset-local-demo', { method: 'POST' }),
    })
    const body = await response.json() as { ok: boolean; state: { runs: Array<unknown>; events: Array<unknown> } }
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.state.runs).toEqual([])
    expect(body.state.events).toEqual([])
  })
})
