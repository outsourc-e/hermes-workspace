import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorkspacePacket } from '../lib/workspace-kernel/packets/factory'
import { createWorkspacePacketLifecycleEvent } from '../lib/workspace-kernel/packets/lifecycle'
import { resetWorkspaceCoreDbEnvCacheForTests } from './workspace-core-db'
import {
  mirrorWorkspacePacketStoreAfterLocalCommit,
  workspacePacketMirrorRows,
} from './workspace-packet-db'
import type { WorkspacePacketStoreState } from '../lib/workspace-kernel/packets/packet-store'

function packet() {
  return createWorkspacePacket({
    packetId: 'packet-db-1',
    packetLineageId: 'packet-db-1',
    runId: 'run-db-1',
    schemaVersion: '1.0.0',
    packetType: 'opportunity',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: 'agora-opportunity', agentId: 'goblin' },
    createdAt: '2026-07-20T16:00:00.000Z',
    sourceRefs: ['local://brief/run-db-1'],
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: ['external-action', 'publish', 'purchase'],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{
      criterionId: 'criterion-db-1',
      description: 'Packet validates before database mirroring.',
      required: true,
    }],
    idempotencyKey: 'run-db-1:opportunity:1',
    payload: {
      researchBatchId: 'research-db-1',
      candidate: {
        candidateId: 'candidate-db-1',
        kind: 'product',
        title: 'Local DB mirror candidate',
        url: 'https://example.com/local-db-candidate',
        imageUrl: null,
      },
      observedMetrics: [{
        metricId: 'metric-db-1',
        label: 'Local count',
        value: 1,
        unit: 'count',
        observedAt: '2026-07-20T16:00:00.000Z',
        sourceRef: 'local://brief/run-db-1',
        evidenceRef: null,
      }],
      scores: [{
        scoreId: 'score-db-1',
        label: 'Local score',
        value: 50,
        observedMetricIds: ['metric-db-1'],
        reason: 'Bound to the local metric.',
      }],
      hypotheses: [],
      comparisonBasis: ['One local fixture.'],
      caveats: ['Test fixture only.'],
      hardBlocks: [],
      recommendation: 'watch',
      oracleHandoffReason: 'Verify local DB mirror behavior.',
    },
  })
}

function state(): WorkspacePacketStoreState {
  const subject = packet()
  const created = createWorkspacePacketLifecycleEvent(subject, [], {
    type: 'created',
    actor: subject.from,
    reason: null,
    payload: {},
  }, {
    eventId: 'event-db-created-1',
    createdAt: subject.createdAt,
  })
  return {
    schemaVersion: 'workspace-packet-store-v1',
    stateVersion: 'sha256:test-db-state',
    updatedAtMs: Date.parse(subject.createdAt),
    activeRunIds: [subject.runId],
    packets: [subject],
    events: [created],
    acks: [],
  }
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

describe('Workspace Packet Supabase foundation', () => {
  it('defines only additive first-class Packet tables with RLS and service-role grants', () => {
    const sql = readFileSync(path.join(
      process.cwd(),
      'supabase/migrations/20260718200627_workspace_packet_contracts_v1.sql',
    ), 'utf8')

    expect(sql).toContain('create table if not exists workspace_core.schema_versions')
    for (const table of ['packets', 'packet_lifecycle_events', 'handoff_acks', 'approval_grants']) {
      expect(sql).toContain(`create table if not exists workspace_core.${table}`)
    }
    for (const table of ['schema_versions', 'packets', 'packet_lifecycle_events', 'handoff_acks', 'approval_grants']) {
      expect(sql).toContain(`alter table workspace_core.${table} enable row level security`)
      expect(sql).toContain(`revoke all on workspace_core.${table} from anon, authenticated`)
      expect(sql).toMatch(new RegExp(`grant select, insert, update on workspace_core\\.${table} to service_role`))
    }
    expect(sql).toContain('unique (packet_lineage_id, revision)')
    expect(sql).toContain('idempotency_key text not null unique')
    expect(sql).toContain('prevent_packet_content_mutation')
    expect(sql).toContain('constraint approval_grants_record_binding_check')
    expect(sql).toContain("old.grant_record - 'status' - 'consumedAt'")
    expect(sql).toContain("old.status in ('consumed', 'revoked')")
    expect(sql).not.toMatch(/drop\s+table|delete\s+from|truncate\s+/i)
    expect(sql).not.toMatch(/workspace_handoffs\s+(?:set|add|drop|alter|update|delete)/i)
    expect(sql).not.toMatch(/create\s+policy/i)
  })

  it('maps only strictly valid, content-bound local state to deterministic DB rows', () => {
    const local = state()
    const rows = workspacePacketMirrorRows(local)
    expect(rows.packets).toHaveLength(1)
    expect(rows.packets[0]).toMatchObject({
      packet_id: 'packet-db-1',
      packet_lineage_id: 'packet-db-1',
      revision: 1,
      run_id: 'run-db-1',
      idempotency_key: 'run-db-1:opportunity:1',
      content_hash: local.packets[0].contentHash,
      envelope: local.packets[0],
    })
    expect(rows.events).toMatchObject([{ event_id: 'event-db-created-1', packet_id: 'packet-db-1' }])
  })

  it('rejects Packet content drift before any database request', () => {
    const local = state()
    const tampered = {
      ...local,
      packets: [{
        ...local.packets[0],
        assumptions: ['changed after hashing'],
      }],
    }
    expect(() => workspacePacketMirrorRows(tampered)).toThrow(/strict mirror validation/i)
  })

  it('defaults to truthful local-only fallback and performs zero fetch calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const local = state()
    const result = await mirrorWorkspacePacketStoreAfterLocalCommit(local)

    expect(result.state).toBe(local)
    expect(result.persistence).toMatchObject({
      provider: 'local-file',
      enabled: false,
      liveSource: false,
      writebackAllowed: false,
      status: 'fallback',
      packetCount: 1,
      eventCount: 1,
      ackCount: 0,
      grantCount: 0,
      stateVersion: local.stateVersion,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
