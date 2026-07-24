import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { setEtsyLiveResearchRunnerForTests } from '../../../../lib/war-room/body/etsy-live-backend'
import { createInitialEtsyRoomState } from '../../../../lib/war-room/living-v3/etsy-room-contracts'
import { Route as ScoutRoute } from './scout'
import { Route as SharedRoomRoute } from './shared-room'
import { Route as StateRoute } from './state'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type ScoutHandlers = typeof ScoutRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}

type StateHandlers = typeof StateRoute & {
  options: { server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } } }
}

type SharedRoomHandlers = typeof SharedRoomRoute & {
  options: { server: { handlers: {
    GET: (ctx: { request: Request }) => Promise<Response>
    POST: (ctx: { request: Request }) => Promise<Response>
  } } }
}

const scoutHandler = (ScoutRoute as ScoutHandlers).options.server.handlers.POST
const stateHandler = (StateRoute as StateHandlers).options.server.handlers.GET
const sharedRoomGetHandler = (SharedRoomRoute as SharedRoomHandlers).options.server.handlers.GET
const sharedRoomPostHandler = (SharedRoomRoute as SharedRoomHandlers).options.server.handlers.POST
const mockIsAuthenticated = vi.mocked(isAuthenticated)
let tempDirs: Array<string> = []

function post(body: unknown) {
  return new Request('http://localhost/api/war-room/etsy-live/scout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postSharedRoom(body: unknown) {
  return new Request('http://localhost/api/war-room/etsy-live/shared-room', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'etsy-live-scout-api-'))
  tempDirs.push(rootDir)
  process.env.WORKSPACE_KERNEL_STORE_DIR = rootDir
  delete process.env.WAR_ROOM_ETSY_LIVE_SCOUT_ENABLED
  setEtsyLiveResearchRunnerForTests(undefined)
})

afterEach(async () => {
  setEtsyLiveResearchRunnerForTests(undefined)
  delete process.env.WORKSPACE_KERNEL_STORE_DIR
  delete process.env.WAR_ROOM_ETSY_LIVE_SCOUT_ENABLED
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('POST /api/war-room/etsy-live/scout', () => {
  it('returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await scoutHandler({ request: post({ query: 'gold initial necklace' }) })
    expect(response.status).toBe(401)
  })

  it('records a blocked kernel run when the injected read-only runner is unavailable', async () => {
    setEtsyLiveResearchRunnerForTests((request, context) => Promise.resolve({
      runId: context.runId,
      status: 'blocked',
      query: request.query,
      startedAt: new Date(context.startedAtMs).toISOString(),
      completedAt: new Date(context.startedAtMs + 10).toISOString(),
      candidates: [],
      connectorStatus: 'blocked',
      blockedReason: 'Injected read-only research connector unavailable for this test.',
    }))

    const response = await scoutHandler({
      request: post({
        query: 'gold initial necklace gift for DolaroBoutique',
        mode: 'read-only-live-research',
      }),
    })

    expect(response.status).toBe(200)
    const body = await response.json() as {
      ok: boolean
      liveRun: { status: string; blockedReason: string; candidates: Array<unknown> }
      artifact: { kind: string }
      run: { events: Array<{ type: string }>; safety: { usageAllowed: boolean; workerSpawnAllowed: boolean; externalRequestsAllowed: boolean; liveActionsAllowed: boolean } }
      state: { events: Array<{ type: string }> }
    }

    expect(body.ok).toBe(true)
    expect(body.liveRun).toMatchObject({
      status: 'blocked',
      candidates: [],
    })
    expect(body.liveRun.blockedReason).toContain('Injected read-only research connector unavailable')
    expect(body.artifact.kind).toBe('live-product-candidate-packet')
    expect(body.run.events.map((event) => event.type)).toEqual(expect.arrayContaining(['run.started', 'artifact.created', 'run.blocked']))
    expect(body.state.events.map((event) => event.type)).toEqual(expect.arrayContaining(['run.blocked']))
    expect(body.run.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('records a successful fake controlled-runner fixture without live side effects', async () => {
    setEtsyLiveResearchRunnerForTests((request, context) => Promise.resolve({
      runId: context.runId,
      status: 'completed',
      query: request.query,
      startedAt: new Date(context.startedAtMs).toISOString(),
      completedAt: new Date(context.startedAtMs + 10).toISOString(),
      candidates: [
        {
          candidateId: 'live-candidate-1',
          title: 'Gold Initial Pendant Gift Necklace',
          summary: 'Read-only public trend evidence for initial pendant gifts.',
          sourceUrls: ['https://www.etsy.com/listing/123/gold-initial-necklace', 'https://www.aliexpress.com/item/1005000000000000.html'],
          sourceDetails: [
            {
              kind: 'etsy',
              label: 'מתחרה',
              marketplace: 'Etsy',
              url: 'https://www.etsy.com/listing/123/gold-initial-necklace',
              title: 'Gold Initial Pendant Gift Necklace',
              priceText: '$38.00',
              salesText: '420 sales',
              tags: ['gold', 'initial', 'necklace'],
            },
            {
              kind: 'supplier',
              label: 'ספק',
              marketplace: 'AliExpress',
              url: 'https://www.aliexpress.com/item/1005000000000000.html',
              priceText: '$4.20',
            },
          ],
          evidenceIds: ['example-public-trend'],
          evidenceQuality: 'partial',
          score: 86,
          missingEvidence: ['supplier proof'],
          riskFlags: ['No personalization claim until variant truth exists.'],
          dataOrigin: 'live-readonly-research',
          suggestedNextStep: 'select_product',
        },
      ],
    }))

    const response = await scoutHandler({
      request: post({
        query: 'gold initial necklace gift for DolaroBoutique',
        maxCandidates: 3,
        mode: 'read-only-live-research',
      }),
    })
    const body = await response.json() as {
      liveRun: { status: string; candidates: Array<{ title: string; sourceUrls: Array<string>; sourceDetails?: Array<{ priceText?: string; salesText?: string; tags?: Array<string> }> }> }
      artifact: { kind: string; dataOrigin: string; sourceRecordIds: Array<string> }
      run: { events: Array<{ type: string }> }
      state: { events: Array<{ type: string }> }
      sharedRoomState?: { candidates: Array<{ title: string; sourceDetails?: Array<{ priceText?: string; salesText?: string; tags?: Array<string> }> }> }
      usageAllowed: boolean
      workerSpawnAllowed: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
    }

    expect(response.status).toBe(200)
    expect(body.liveRun.status).toBe('completed')
    expect(body.liveRun.candidates[0]).toMatchObject({
      title: 'Gold Initial Pendant Gift Necklace',
      sourceUrls: ['https://www.etsy.com/listing/123/gold-initial-necklace', 'https://www.aliexpress.com/item/1005000000000000.html'],
    })
    expect(body.liveRun.candidates[0].sourceDetails?.[0]).toMatchObject({ priceText: '$38.00', salesText: '420 sales', tags: ['gold', 'initial', 'necklace'] })
    expect(body.sharedRoomState?.candidates[0]).toMatchObject({ title: 'Gold Initial Pendant Gift Necklace' })
    expect(body.sharedRoomState?.candidates[0].sourceDetails?.[0]).toMatchObject({ priceText: '$38.00', salesText: '420 sales', tags: ['gold', 'initial', 'necklace'] })
    expect(body.artifact).toMatchObject({
      kind: 'live-product-candidate-packet',
      dataOrigin: 'live-readonly-research',
    })
    expect(body.artifact.sourceRecordIds).toContain('https://www.etsy.com/listing/123/gold-initial-necklace')
    expect(body.run.events.map((event) => event.type)).toEqual(expect.arrayContaining(['run.started', 'artifact.created', 'run.completed']))
    expect(body.state.events.length).toBeGreaterThanOrEqual(5)
    expect(body).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })

    const sharedResponse = await sharedRoomGetHandler({
      request: new Request('http://localhost/api/war-room/etsy-live/shared-room'),
    })
    const sharedBody = await sharedResponse.json() as { ok: boolean; empty: boolean; roomState: { candidates: Array<{ title: string }> } }
    expect(sharedResponse.status).toBe(200)
    expect(sharedBody.ok).toBe(true)
    expect(sharedBody.empty).toBe(false)
    expect(sharedBody.roomState.candidates[0]).toMatchObject({ title: 'Gold Initial Pendant Gift Necklace' })
  })
})

describe('GET/POST /api/war-room/etsy-live/shared-room', () => {
  it('saves a compact shared room state and supports reset', async () => {
    const roomState = createInitialEtsyRoomState(2_400)
    roomState.prompt = 'shared room route fixture'
    roomState.run.updatedAtMs = 2_450

    const saveResponse = await sharedRoomPostHandler({
      request: postSharedRoom({ roomState, reason: 'route test' }),
    })
    const saveBody = await saveResponse.json() as { ok: boolean; saved: boolean; empty: boolean; roomState: { prompt: string } }

    expect(saveResponse.status).toBe(200)
    expect(saveBody).toMatchObject({ ok: true, saved: true, empty: false })
    expect(saveBody.roomState.prompt).toBe('shared room route fixture')

    const resetResponse = await sharedRoomPostHandler({
      request: postSharedRoom({ reset: true, reason: 'route reset test' }),
    })
    const resetBody = await resetResponse.json() as { ok: boolean; saved: boolean; empty: boolean; roomState: { candidates: Array<unknown> } }

    expect(resetResponse.status).toBe(200)
    expect(resetBody).toMatchObject({ ok: true, saved: true, empty: true })
    expect(resetBody.roomState.candidates).toEqual([])
  })

  it('accepts V2 commands and returns 409 with the authoritative workspace for stale clients', async () => {
    const initialResponse = await sharedRoomGetHandler({
      request: new Request('http://localhost/api/war-room/etsy-live/shared-room'),
    })
    const initial = await initialResponse.json() as {
      workspaceState: {
        revision: number
        roomState: ReturnType<typeof createInitialEtsyRoomState>
        pipelineState: Record<string, unknown>
      }
    }
    const roomState = structuredClone(initial.workspaceState.roomState)
    roomState.prompt = 'V2 route command'
    const command = {
      type: 'replace_projections',
      commandId: 'route-v2-command',
      baseRevision: initial.workspaceState.revision,
      reason: 'Route V2 test',
      roomState,
      pipelineState: initial.workspaceState.pipelineState,
    }

    const appliedResponse = await sharedRoomPostHandler({ request: postSharedRoom({ command }) })
    const applied = await appliedResponse.json() as {
      ok: boolean
      commandStatus: string
      workspaceState: { revision: number; roomState: { prompt: string } }
    }
    const staleResponse = await sharedRoomPostHandler({
      request: postSharedRoom({ command: { ...command, commandId: 'route-stale-command' } }),
    })
    const stale = await staleResponse.json() as {
      ok: boolean
      commandStatus: string
      expectedRevision: number
      workspaceState: { revision: number; roomState: { prompt: string } }
    }
    const malformedResponse = await sharedRoomPostHandler({
      request: postSharedRoom({ command: { type: 'replace_projections', commandId: '' } }),
    })

    expect(appliedResponse.status).toBe(200)
    expect(applied).toMatchObject({
      ok: true,
      commandStatus: 'applied',
      workspaceState: { revision: 1, roomState: { prompt: 'V2 route command' } },
    })
    expect(staleResponse.status).toBe(409)
    expect(stale).toMatchObject({
      ok: false,
      commandStatus: 'conflict',
      expectedRevision: 1,
      workspaceState: { revision: 1, roomState: { prompt: 'V2 route command' } },
    })
    expect(malformedResponse.status).toBe(400)
  })
})

describe('GET /api/war-room/etsy-live/state', () => {
  it('returns latest live scout kernel state', async () => {
    setEtsyLiveResearchRunnerForTests((request, context) => Promise.resolve({
      runId: context.runId,
      status: 'completed',
      query: request.query,
      startedAt: new Date(context.startedAtMs).toISOString(),
      completedAt: new Date(context.startedAtMs + 10).toISOString(),
      candidates: [
        {
          candidateId: 'state-live-candidate-1',
          title: 'State Fixture Product',
          summary: 'Read-only state fixture.',
          sourceUrls: ['https://example.com/state-fixture'],
          evidenceIds: ['state-fixture'],
          evidenceQuality: 'partial',
          score: 72,
          missingEvidence: ['supplier proof'],
          riskFlags: ['fixture only'],
          dataOrigin: 'live-readonly-research',
          suggestedNextStep: 'select_product',
        },
      ],
    }))

    await scoutHandler({
      request: post({
        query: 'gold initial necklace gift for DolaroBoutique',
        mode: 'read-only-live-research',
      }),
    })

    const response = await stateHandler({
      request: new Request('http://localhost/api/war-room/etsy-live/state'),
    })
    const body = await response.json() as {
      ok: boolean
      runs: Array<{ artifacts: Array<{ kind: string }> }>
      safety: { usageAllowed: boolean; workerSpawnAllowed: boolean }
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.runs[0].artifacts[0].kind).toBe('live-product-candidate-packet')
    expect(body.safety).toMatchObject({ usageAllowed: false, workerSpawnAllowed: false })
  })
})
