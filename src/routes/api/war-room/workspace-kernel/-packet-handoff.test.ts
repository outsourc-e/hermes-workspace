import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { workspacePacketContentHash } from '../../../../lib/workspace-kernel/packets/canonical-json'
import { createWorkspacePacket } from '../../../../lib/workspace-kernel/packets/factory'
import { parseWorkspacePacket } from '../../../../lib/workspace-kernel/packets/schemas'
import { persistWorkspacePacketStore } from '../../../../lib/workspace-kernel/packets/packet-store'
import { Route as HandoffRoute } from './packet-handoff'
import { Route as PacketsRoute } from './packets'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

type PacketsHandlers = typeof PacketsRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}
type HandoffHandlers = typeof HandoffRoute & {
  options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } }
}

const packetsHandlers = (PacketsRoute as PacketsHandlers).options.server.handlers
const handoffHandlers = (HandoffRoute as HandoffHandlers).options.server.handlers
const mockIsAuthenticated = vi.mocked(isAuthenticated)
let tempDirs: Array<string> = []

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function opportunityPayload() {
  return {
    researchBatchId: 'handoff-research-batch-1',
    candidate: {
      candidateId: 'handoff-candidate-1',
      kind: 'product' as const,
      title: 'Local handoff candidate',
      url: 'https://example.com/handoff-candidate',
      imageUrl: null,
    },
    observedMetrics: [{
      metricId: 'handoff-metric-1',
      label: 'Local handoff metric',
      value: 1,
      unit: 'count',
      observedAt: '2026-07-18T20:10:00.000Z',
      sourceRef: 'local://brief/run-handoff-1',
      evidenceRef: 'local://evidence/1',
    }],
    scores: [{
      scoreId: 'handoff-score-1',
      label: 'Local handoff score',
      value: 50,
      observedMetricIds: ['handoff-metric-1'],
      reason: 'Request-test score based on linked local evidence.',
    }],
    hypotheses: [],
    comparisonBasis: ['Single local handoff fixture.'],
    caveats: ['Request-test fixture only.'],
    hardBlocks: [],
    recommendation: 'watch' as const,
    oracleHandoffReason: 'Verify exact receiver semantics.',
  }
}

function packetInput(overrides: Record<string, unknown> = {}) {
  return {
    packetId: 'packet-handoff-1',
    packetLineageId: 'packet-handoff-1',
    createdAt: '2026-07-18T20:10:00.000Z',
    runId: 'run-handoff-1',
    schemaVersion: '1.0.0',
    packetType: 'opportunity',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: 'agora-opportunity', agentId: 'goblin' },
    sourceRefs: ['local://brief/run-handoff-1'],
    evidenceRefs: ['local://evidence/1'],
    assumptions: [],
    missingFields: [],
    lockedActions: ['external-action', 'publish', 'purchase'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [
      { criterionId: 'criterion-handoff-1', description: 'Receiver verifies local evidence.', required: true },
    ],
    idempotencyKey: 'run-handoff-1:opportunity:1',
    payload: opportunityPayload(),
    ...overrides,
  }
}

async function createPacket(input = packetInput()) {
  return packetsHandlers.POST({
    request: post('http://localhost/api/war-room/workspace-kernel/packets', {
      action: 'create',
      packet: input,
    }),
  })
}

async function persistHistoricalRetiredPacket() {
  const active = createWorkspacePacket({
    ...packetInput({
      packetId: 'packet-retired-history',
      packetLineageId: 'packet-retired-history',
      idempotencyKey: 'run-handoff-1:opportunity:retired-history',
    }),
    packetType: 'opportunity' as const,
  })
  const { contentHash: _activeHash, ...activeContent } = active
  const historicalContent = {
    ...activeContent,
    to: { roomId: 'gateway-cockpit', agentId: 'signal-runner' },
  }
  const packet = parseWorkspacePacket({
    ...historicalContent,
    contentHash: workspacePacketContentHash(historicalContent),
  })
  await persistWorkspacePacketStore({ packets: [packet] })
  return packet
}

async function offerPacket(packetId = 'packet-handoff-1') {
  return handoffHandlers.POST({
    request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', {
      action: 'offer',
      packetId,
      actor: { roomId: 'olympus-command', agentId: 'hermes' },
      createdAt: '2026-07-18T20:11:00.000Z',
    }),
  })
}

function acceptedAck(overrides: Record<string, unknown> = {}) {
  return {
    action: 'ack',
    packetId: 'packet-handoff-1',
    ackId: 'ack-handoff-1',
    eventId: 'event-ack-handoff-1',
    createdAt: '2026-07-18T20:12:00.000Z',
    receiver: { roomId: 'agora-opportunity', agentId: 'goblin' },
    outcome: 'accepted',
    checkedCriteriaIds: ['criterion-handoff-1'],
    missingFields: [],
    evidenceRefs: ['local://evidence/1'],
    reason: null,
    acceptedContentHash: '',
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-packet-handoff-api-'))
  tempDirs.push(rootDir)
  process.env.WORKSPACE_PACKET_STORE_DIR = rootDir
})

afterEach(async () => {
  delete process.env.WORKSPACE_PACKET_STORE_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('/api/war-room/workspace-kernel/packet-handoff', () => {
  it('requires auth and returns 404 for unknown Packet IDs', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const unauthorized = await offerPacket()
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')

    mockIsAuthenticated.mockReturnValue(true)
    const missing = await offerPacket('missing-packet')
    expect(missing.status).toBe(404)
  })

  it('rejects unknown handoff fields instead of silently stripping them', async () => {
    await createPacket()
    const unknownRequestField = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', {
        action: 'offer',
        packetId: 'packet-handoff-1',
        actor: { roomId: 'olympus-command', agentId: 'hermes' },
        surprise: true,
      }),
    })
    expect(unknownRequestField.status).toBe(400)

    const unknownEndpointField = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', {
        action: 'offer',
        packetId: 'packet-handoff-1',
        actor: { roomId: 'olympus-command', agentId: 'hermes', surprise: true },
      }),
    })
    expect(unknownEndpointField.status).toBe(400)
  })

  it('blocks retired aliases on Packet creation and historical offer/ACK boundaries', async () => {
    const createResponse = await createPacket(packetInput({
      packetId: 'packet-retired-create',
      packetLineageId: 'packet-retired-create',
      idempotencyKey: 'run-handoff-1:opportunity:retired-create',
      to: { roomId: 'gateway-cockpit', agentId: 'signal-runner' },
    }))
    const createBody = await createResponse.json() as { error: string }
    expect(createResponse.status).toBe(400)
    expect(createBody.error).toContain('Retired agent alias signal-runner')

    const historical = await persistHistoricalRetiredPacket()
    const offerResponse = await offerPacket(historical.packetId)
    const offerBody = await offerResponse.json() as { error: string }
    expect(offerResponse.status).toBe(400)
    expect(offerBody.error).toContain('Retired agent alias signal-runner')

    const ackResponse = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        packetId: historical.packetId,
        ackId: 'ack-retired-history',
        eventId: 'event-retired-history',
        receiver: historical.to,
        acceptedContentHash: historical.contentHash,
      })),
    })
    const ackBody = await ackResponse.json() as { error: string }
    expect(ackResponse.status).toBe(400)
    expect(ackBody.error).toContain('Retired agent alias signal-runner')
  })

  it('offers a Packet once and replays the same offered state without duplicate events', async () => {
    await createPacket()
    const first = await offerPacket()
    const firstBody = await first.json() as {
      ok: boolean
      result: {
        status: string
        replayed: boolean
        events: Array<{ type: string }>
        persistence: { provider: string; status: string; stateVersion: string }
      }
      localOnly: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
    }
    expect(first.status).toBe(200)
    expect(firstBody.result.status).toBe('offered')
    expect(firstBody.result.replayed).toBe(false)
    expect(firstBody.result.events.map((event) => event.type)).toEqual(['created', 'ready', 'offered'])
    expect(firstBody.result).toMatchObject({
      persistence: {
        provider: 'local-file',
        status: 'fallback',
        stateVersion: expect.any(String),
      },
    })
    expect(firstBody).toMatchObject({ localOnly: true, externalRequestsAllowed: false, liveActionsAllowed: false })

    const replay = await offerPacket()
    const replayBody = await replay.json() as { result: { status: string; replayed: boolean; events: Array<{ type: string }> } }
    expect(replay.status).toBe(200)
    expect(replayBody.result).toMatchObject({ status: 'offered', replayed: true })
    expect(replayBody.result.events.map((event) => event.type)).toEqual(['created', 'ready', 'offered'])
  })

  it('accepts an exact receiver ACK only when hash and required criteria match', async () => {
    const created = await createPacket()
    const createdBody = await created.json() as { result: { packet: { contentHash: string } } }
    await offerPacket()

    const response = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        acceptedContentHash: createdBody.result.packet.contentHash,
      })),
    })
    const body = await response.json() as {
      ok: boolean
      result: { status: string; replayed: boolean; ack: { ackId: string; outcome: string; acceptedContentHash: string } }
    }
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      result: {
        status: 'accepted',
        replayed: false,
        ack: {
          ackId: 'ack-handoff-1',
          outcome: 'accepted',
          acceptedContentHash: createdBody.result.packet.contentHash,
        },
      },
    })

    const replay = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        acceptedContentHash: createdBody.result.packet.contentHash,
      })),
    })
    const replayBody = await replay.json() as { result: { replayed: boolean; ack: { ackId: string } } }
    expect(replay.status).toBe(200)
    expect(replayBody.result).toMatchObject({ replayed: true, ack: { ackId: 'ack-handoff-1' } })
  })

  it('rejects wrong receivers, hash mismatches and unchecked required criteria', async () => {
    const created = await createPacket()
    const createdBody = await created.json() as { result: { packet: { contentHash: string } } }
    await offerPacket()

    const wrongReceiver = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        ackId: 'ack-wrong-receiver',
        eventId: 'event-wrong-receiver',
        receiver: { roomId: 'oracle-signals', agentId: 'oracle' },
        acceptedContentHash: createdBody.result.packet.contentHash,
      })),
    })
    expect(wrongReceiver.status).toBe(400)

    const wrongHash = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        ackId: 'ack-wrong-hash',
        eventId: 'event-wrong-hash',
        acceptedContentHash: '0'.repeat(64),
      })),
    })
    expect(wrongHash.status).toBe(400)

    const unchecked = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        ackId: 'ack-unchecked',
        eventId: 'event-unchecked',
        acceptedContentHash: createdBody.result.packet.contentHash,
        checkedCriteriaIds: [],
      })),
    })
    expect(unchecked.status).toBe(400)
  })

  it('turns an unsupported schema Major into a blocked ACK instead of accepting it', async () => {
    const created = await createPacket(packetInput({
      packetId: 'packet-schema-2',
      packetLineageId: 'packet-schema-2',
      schemaVersion: '2.0.0',
      idempotencyKey: 'run-handoff-1:opportunity:schema-2',
    }))
    const createdBody = await created.json() as { result: { packet: { contentHash: string } } }
    await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', {
        action: 'offer',
        packetId: 'packet-schema-2',
        actor: { roomId: 'olympus-command', agentId: 'hermes' },
        createdAt: '2026-07-18T20:13:00.000Z',
      }),
    })

    const response = await handoffHandlers.POST({
      request: post('http://localhost/api/war-room/workspace-kernel/packet-handoff', acceptedAck({
        packetId: 'packet-schema-2',
        ackId: 'ack-schema-2',
        eventId: 'event-ack-schema-2',
        createdAt: '2026-07-18T20:14:00.000Z',
        acceptedContentHash: createdBody.result.packet.contentHash,
      })),
    })
    const body = await response.json() as {
      result: { status: string; ack: { outcome: string; reason: string; missingFields: Array<string> } }
    }
    expect(response.status).toBe(200)
    expect(body.result.status).toBe('blocked')
    expect(body.result.ack.outcome).toBe('blocked')
    expect(body.result.ack.reason).toContain('Unsupported schema Major 2')
    expect(body.result.ack.missingFields).toContain('schemaVersion')
  })
})
