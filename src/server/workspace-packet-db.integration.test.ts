import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorkspacePacket } from '../lib/workspace-kernel/packets/factory'
import { createWorkspacePacketLifecycleEvent } from '../lib/workspace-kernel/packets/lifecycle'
import { resetWorkspaceCoreDbEnvCacheForTests } from './workspace-core-db'
import { mirrorWorkspacePacketStoreAfterLocalCommit } from './workspace-packet-db'
import type { WorkspacePacketStoreState } from '../lib/workspace-kernel/packets/packet-store'

function localState(): WorkspacePacketStoreState {
  const packet = createWorkspacePacket({
    packetId: 'packet-db-integration-1',
    packetLineageId: 'packet-db-integration-1',
    runId: 'run-db-integration-1',
    schemaVersion: '1.0.0',
    packetType: 'opportunity',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: 'agora-opportunity', agentId: 'goblin' },
    createdAt: '2026-07-20T16:20:00.000Z',
    sourceRefs: ['local://brief/run-db-integration-1'],
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: ['external-action', 'publish', 'purchase'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{ criterionId: 'criterion-db-integration-1', description: 'Local state is durable first.', required: true }],
    idempotencyKey: 'run-db-integration-1:opportunity:1',
    payload: {
      researchBatchId: 'research-db-integration-1',
      candidate: {
        candidateId: 'candidate-db-integration-1',
        kind: 'product',
        title: 'Local-first mirror candidate',
        url: 'https://example.com/local-first-candidate',
        imageUrl: null,
      },
      observedMetrics: [{
        metricId: 'metric-db-integration-1',
        label: 'Local count',
        value: 1,
        unit: 'count',
        observedAt: '2026-07-20T16:20:00.000Z',
        sourceRef: 'local://brief/run-db-integration-1',
        evidenceRef: null,
      }],
      scores: [{
        scoreId: 'score-db-integration-1',
        label: 'Local score',
        value: 50,
        observedMetricIds: ['metric-db-integration-1'],
        reason: 'Bound to one local metric.',
      }],
      hypotheses: [],
      comparisonBasis: ['One local integration fixture.'],
      caveats: ['No live Supabase dependency.'],
      hardBlocks: [],
      recommendation: 'watch',
      oracleHandoffReason: 'Prove local-first mirroring.',
    },
  })
  const event = createWorkspacePacketLifecycleEvent(packet, [], {
    type: 'created',
    actor: packet.from,
    reason: null,
    payload: {},
  }, {
    eventId: 'event-db-integration-created-1',
    createdAt: packet.createdAt,
  })
  return {
    schemaVersion: 'workspace-packet-store-v1',
    stateVersion: 'sha256:integration-state',
    updatedAtMs: Date.parse(packet.createdAt),
    activeRunIds: [packet.runId],
    packets: [packet],
    events: [event],
    acks: [],
  }
}

function enableMirror() {
  process.env.WORKSPACE_PACKET_SUPABASE_MIRROR_ENABLED = '1'
  process.env.WORKSPACE_KERNEL_SUPABASE_TEST = '1'
  process.env.WORKSPACE_DB_MODE = 'supabase'
  process.env.WORKSPACE_SUPABASE_URL = 'https://workspace-packets.test'
  process.env.WORKSPACE_SUPABASE_SECRET_KEY = 'sb_secret_packet_test_value'
  resetWorkspaceCoreDbEnvCacheForTests()
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ENV_KEYS = [
  'WORKSPACE_PACKET_SUPABASE_MIRROR_ENABLED',
  'WORKSPACE_KERNEL_SUPABASE_TEST',
  'WORKSPACE_DB_MODE',
  'WORKSPACE_SUPABASE_URL',
  'WORKSPACE_SUPABASE_SECRET_KEY',
] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  resetWorkspaceCoreDbEnvCacheForTests()
  vi.restoreAllMocks()
})

describe('Workspace Packet local-first Supabase mirror', () => {
  it('upserts deterministic rows and verifies exact Packet hash readback on replay', async () => {
    enableMirror()
    // eslint-disable-next-line @typescript-eslint/require-await -- Fetch requires a Promise; this fake is deterministic.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>
      if (String(_input).includes('/packets?')) {
        return response(body.map((row) => ({
          packet_id: row.packet_id,
          idempotency_key: row.idempotency_key,
          content_hash: row.content_hash,
          envelope: row.envelope,
        })))
      }
      if (String(_input).includes('/packet_lifecycle_events?')) {
        return response(body.map((row) => ({ event_id: row.event_id, event_record: row.event_record })))
      }
      throw new Error(`Unexpected mirror table: ${String(_input)}`)
    })
    const local = localState()

    const first = await mirrorWorkspacePacketStoreAfterLocalCommit(local)
    const replay = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(first.state).toBe(local)
    expect(replay.state).toBe(local)
    expect(first.persistence).toMatchObject({
      provider: 'supabase',
      enabled: true,
      status: 'connected',
      packetCount: 1,
      eventCount: 1,
      stateVersion: local.stateVersion,
    })
    expect(replay.persistence.status).toBe('connected')
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe(fetchSpy.mock.calls[2]?.[1]?.body)
    expect(fetchSpy.mock.calls[1]?.[1]?.body).toBe(fetchSpy.mock.calls[3]?.[1]?.body)
  })

  it('surfaces an idempotency conflict without replacing or erasing local Packet state', async () => {
    enableMirror()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
      code: '23505',
      message: 'duplicate idempotency key sb_secret_packet_test_value',
    }, 409))
    const local = localState()

    const result = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(result.state).toBe(local)
    expect(result.state.packets).toHaveLength(1)
    expect(result.persistence).toMatchObject({
      provider: 'local-file',
      status: 'conflict',
      packetCount: 1,
      stateVersion: local.stateVersion,
    })
    expect(result.persistence.error).not.toContain('sb_secret_packet_test_value')
    expect(result.persistence.error).toContain('[SUPABASE_KEY_REDACTED]')
  })

  it('keeps local state authoritative when Supabase is unavailable', async () => {
    enableMirror()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
    const local = localState()

    const result = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(result.state).toBe(local)
    expect(result.persistence).toMatchObject({
      provider: 'local-file',
      enabled: false,
      liveSource: false,
      writebackAllowed: false,
      status: 'error',
      packetCount: 1,
      readback: expect.stringContaining('local Packet state remains authoritative'),
    })
  })

  it('fails the mirror closed on divergent Supabase Packet readback while preserving local state', async () => {
    enableMirror()
    // eslint-disable-next-line @typescript-eslint/require-await -- Fetch requires a Promise; this fake is deterministic.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>
      if (String(_input).includes('/packets?')) {
        return response(body.map((row) => ({
          packet_id: row.packet_id,
          idempotency_key: row.idempotency_key,
          content_hash: '0'.repeat(64),
          envelope: row.envelope,
        })))
      }
      return response([])
    })
    const local = localState()

    const result = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(result.state).toBe(local)
    expect(result.persistence.status).toBe('error')
    expect(result.persistence.readback).toContain('local Packet state remains authoritative')
  })

  it('fails closed when the returned Packet envelope diverges but keeps declared IDs and hashes', async () => {
    enableMirror()
    // eslint-disable-next-line @typescript-eslint/require-await -- Fetch requires a Promise; this fake is deterministic.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>
      if (String(_input).includes('/packets?')) {
        return response(body.map((row) => ({
          packet_id: row.packet_id,
          idempotency_key: row.idempotency_key,
          content_hash: row.content_hash,
          envelope: {
            ...(row.envelope as Record<string, unknown>),
            assumptions: ['forged mirror assumption'],
          },
        })))
      }
      return response([])
    })
    const local = localState()

    const result = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(result.state).toBe(local)
    expect(result.persistence.status).toBe('error')
    expect(result.persistence.readback).toContain('local Packet state remains authoritative')
  })

  it('fails the mirror closed on divergent lifecycle-event readback while preserving local state', async () => {
    enableMirror()
    // eslint-disable-next-line @typescript-eslint/require-await -- Fetch requires a Promise; this fake is deterministic.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '[]')) as Array<Record<string, unknown>>
      if (String(_input).includes('/packets?')) {
        return response(body.map((row) => ({
          packet_id: row.packet_id,
          idempotency_key: row.idempotency_key,
          content_hash: row.content_hash,
          envelope: row.envelope,
        })))
      }
      if (String(_input).includes('/packet_lifecycle_events?')) {
        return response(body.map((row) => ({
          event_id: row.event_id,
          event_record: { ...(row.event_record as Record<string, unknown>), reason: 'forged mirror readback' },
        })))
      }
      throw new Error(`Unexpected mirror table: ${String(_input)}`)
    })
    const local = localState()

    const result = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(result.state).toBe(local)
    expect(result.persistence.status).toBe('error')
    expect(result.persistence.readback).toContain('local Packet state remains authoritative')
  })
})
