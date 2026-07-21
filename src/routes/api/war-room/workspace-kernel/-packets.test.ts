import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { loadWorkspacePacketStore } from '../../../../lib/workspace-kernel/packets/packet-store'
import { Route as HandoffRoute } from './packet-handoff'
import { Route as PacketsRoute } from './packets'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type PacketsHandlers = typeof PacketsRoute & {
  options: { server: { handlers: {
    GET: (ctx: { request: Request }) => Promise<Response>
    POST: (ctx: { request: Request }) => Promise<Response>
  } } }
}

type HandoffHandlers = typeof HandoffRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}

const packetsHandlers = (PacketsRoute as PacketsHandlers).options.server.handlers
const handoffHandlers = (HandoffRoute as HandoffHandlers).options.server.handlers
const mockIsAuthenticated = vi.mocked(isAuthenticated)
let tempDirs: Array<string> = []

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function opportunityPayload() {
  return {
    researchBatchId: 'api-research-batch-1',
    candidate: {
      candidateId: 'api-candidate-1',
      kind: 'product' as const,
      title: 'Local API candidate',
      url: 'https://example.com/api-candidate',
      imageUrl: null,
    },
    observedMetrics: [{
      metricId: 'api-metric-1',
      label: 'Local evidence-linked metric',
      value: 1,
      unit: 'count',
      observedAt: '2026-07-18T20:00:00.000Z',
      sourceRef: 'local://brief/run-api-1',
      evidenceRef: null,
    }],
    scores: [{
      scoreId: 'api-score-1',
      label: 'Local score',
      value: 50,
      observedMetricIds: ['api-metric-1'],
      reason: 'Request-test score based on the linked local metric.',
    }],
    hypotheses: [],
    comparisonBasis: ['Single local API fixture.'],
    caveats: ['Request-test fixture only.'],
    hardBlocks: [],
    recommendation: 'watch' as const,
    oracleHandoffReason: 'Validate request-test evidence.',
  }
}

function packetInput(overrides: Record<string, unknown> = {}) {
  return {
    packetId: 'packet-api-1',
    packetLineageId: 'packet-api-1',
    createdAt: '2026-07-18T20:00:00.000Z',
    runId: 'run-api-1',
    schemaVersion: '1.0.0',
    packetType: 'opportunity',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: 'agora-opportunity', agentId: 'goblin' },
    sourceRefs: ['local://brief/run-api-1'],
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: ['external-action', 'publish', 'purchase'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'criterion-api-1', description: 'Packet validates locally.', required: true },
    ],
    idempotencyKey: 'run-api-1:opportunity:1',
    payload: opportunityPayload(),
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-packet-api-'))
  tempDirs.push(rootDir)
  process.env.WORKSPACE_PACKET_STORE_DIR = rootDir
})

afterEach(async () => {
  delete process.env.WORKSPACE_PACKET_STORE_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('/api/war-room/workspace-kernel/packets', () => {
  it('requires auth and rejects malformed or oversized JSON with no-store responses', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const unauthorized = await packetsHandlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/packets?packetId=packet-api-1'),
    })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')

    mockIsAuthenticated.mockReturnValue(true)
    const malformed = await packetsHandlers.POST({
      request: new Request('http://localhost/api/war-room/workspace-kernel/packets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    })
    expect(malformed.status).toBe(400)

    const oversized = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {}, { 'content-length': '300000' }),
    })
    expect(oversized.status).toBe(413)
    expect(oversized.headers.get('cache-control')).toBe('no-store')
  })

  it('creates, replays and reads a validated local Packet by ID', async () => {
    const requestBody = { action: 'create', packet: packetInput() }
    const created = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', requestBody),
    })
    const createdBody = await created.json() as {
      ok: boolean
      result: {
        packet: { packetId: string; contentHash: string }
        status: string
        replayed: boolean
        persistence: { provider: string; status: string; stateVersion: string }
      }
      localOnly: boolean
      usageAllowed: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
    }

    expect(created.status).toBe(201)
    expect(created.headers.get('cache-control')).toBe('no-store')
    expect(createdBody.ok).toBe(true)
    expect(createdBody.result.packet.packetId).toBe('packet-api-1')
    expect(createdBody.result.packet.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(createdBody.result).toMatchObject({
      status: 'draft',
      replayed: false,
      persistence: {
        provider: 'local-file',
        status: 'fallback',
        stateVersion: expect.any(String),
      },
    })
    expect(createdBody).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })

    const replay = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', requestBody),
    })
    const replayBody = await replay.json() as { result: { packet: { contentHash: string }; replayed: boolean } }
    expect(replay.status).toBe(200)
    expect(replayBody.result.replayed).toBe(true)
    expect(replayBody.result.packet.contentHash).toBe(createdBody.result.packet.contentHash)

    const read = await packetsHandlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/packets?packetId=packet-api-1'),
    })
    const readBody = await read.json() as { ok: boolean; result: { packet: { packetId: string }; status: string } }
    expect(read.status).toBe(200)
    expect(readBody).toMatchObject({ ok: true, result: { packet: { packetId: 'packet-api-1' }, status: 'draft' } })
  })

  it('creates directly to ready, reads by runId and leaves the store unchanged on GET', async () => {
    const created = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'create',
        initialStatus: 'ready',
        packet: packetInput(),
      }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ result: { status: 'ready' } })

    const before = await loadWorkspacePacketStore()
    expect(before.ok).toBe(true)
    const read = await packetsHandlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/packets?runId=run-api-1'),
    })
    const body = await read.json() as { result: { runId: string; packets: Array<{ packet: { packetId: string }; status: string }> } }
    expect(read.status).toBe(200)
    expect(body.result).toMatchObject({
      runId: 'run-api-1',
      packets: [{ packet: { packetId: 'packet-api-1' }, status: 'ready' }],
    })
    const after = await loadWorkspacePacketStore()
    expect(after).toEqual(before)
  })

  it('rejects unknown request and Packet fields instead of silently stripping them', async () => {
    const unknownRequestField = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'create',
        packet: packetInput(),
        surprise: true,
      }),
    })
    expect(unknownRequestField.status).toBe(400)

    const unknownPacketField = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'create',
        packet: packetInput({ surprise: true }),
      }),
    })
    expect(unknownPacketField.status).toBe(400)
  })

  it('returns 409 when an idempotency key is reused for different content and 404 for missing IDs', async () => {
    await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'create',
        packet: packetInput(),
      }),
    })
    const conflict = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'create',
        packet: packetInput({
          payload: {
            ...opportunityPayload(),
            caveats: ['Different content with the same idempotency key.'],
          },
        }),
      }),
    })
    const conflictBody = await conflict.json() as { ok: boolean; code: string; error: string }
    expect(conflict.status).toBe(409)
    expect(conflictBody).toMatchObject({ ok: false, code: 'WORKSPACE_PACKET_IDEMPOTENCY_CONFLICT' })
    expect(conflictBody.error).not.toContain('/Users/')

    const missing = await packetsHandlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/packets?packetId=missing'),
    })
    expect(missing.status).toBe(404)
  })

  it('creates a new immutable revision only after the previous Packet is offered', async () => {
    await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'create',
        packet: packetInput(),
      }),
    })
    const offered = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', {
        action: 'offer',
        packetId: 'packet-api-1',
        actor: { roomId: 'olympus-command', agentId: 'hermes' },
        createdAt: '2026-07-18T20:01:00.000Z',
      }),
    })
    expect(offered.status).toBe(200)

    const revised = await packetsHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packets', {
        action: 'revise',
        previousPacketId: 'packet-api-1',
        reason: 'Correct local evidence references.',
        revision: {
          packetId: 'packet-api-2',
          createdAt: '2026-07-18T20:02:00.000Z',
          idempotencyKey: 'run-api-1:opportunity:2',
          evidenceRefs: ['local://evidence/corrected'],
        },
      }),
    })
    const revisedBody = await revised.json() as {
      ok: boolean
      result: { packet: { packetId: string; packetLineageId: string; revision: number; supersedesPacketId: string | null } }
    }
    expect(revised.status).toBe(201)
    expect(revisedBody.result.packet).toMatchObject({
      packetId: 'packet-api-2',
      packetLineageId: 'packet-api-1',
      revision: 2,
      supersedesPacketId: 'packet-api-1',
    })

    const previous = await packetsHandlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/packets?packetId=packet-api-1'),
    })
    const previousBody = await previous.json() as { result: { status: string } }
    expect(previousBody.result.status).toBe('superseded')
  })
})
