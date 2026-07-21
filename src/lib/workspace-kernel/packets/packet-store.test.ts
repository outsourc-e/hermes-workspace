import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspacePacketIdempotencyConflictError, acknowledgeWorkspacePacket } from './ack'
import { createWorkspacePacket, reviseWorkspacePacket } from './factory'
import { createWorkspacePacketLifecycleEvent } from './lifecycle'
import {
  WorkspacePacketStoreConflictError,
  createEmptyWorkspacePacketStoreState,
  loadWorkspacePacketStore,
  persistWorkspacePacketStore,
  saveWorkspacePacketStore,
} from './packet-store'

import {
  sourceRefsForTestContext,
  validTestContextPayload,
} from './test-fixtures'

let tempDirs: Array<string> = []

async function tempStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'workspace-packet-store-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

function packet(options: {
  packetId?: string
  lineageId?: string
  revision?: number
  idempotencyKey?: string
  objective?: string
  createdAt?: string
} = {}) {
  const to = { roomId: 'agora-opportunity', agentId: 'goblin' }
  const payload = validTestContextPayload({
    mission: options.objective ?? 'Persist Packet.',
    receiver: to,
    stepId: 'step-packet-store',
  })
  const first = createWorkspacePacket({
    packetId: options.revision && options.revision > 1 ? 'packet-store-1' : (options.packetId ?? 'packet-store-1'),
    packetLineageId: options.lineageId ?? 'lineage-store-1',
    createdAt: options.createdAt ?? '2026-07-18T17:30:00.000Z',
    runId: 'run-store-1',
    schemaVersion: '1.0.0',
    packetType: 'context',
    from: { roomId: 'olympus-command', agentId: 'hermes-command' },
    to,
    sourceRefs: sourceRefsForTestContext(payload),
    evidenceRefs: [],
    assumptions: [],
    missingFields: [],
    lockedActions: [],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [],
    idempotencyKey: options.idempotencyKey ?? 'run-store-1:packet:1',
    payload,
  })
  if (!options.revision || options.revision === 1) return first
  if (options.revision !== 2) throw new Error('Packet store test helper only builds revisions 1 and 2.')
  return reviseWorkspacePacket(first, {
    packetId: options.packetId ?? 'packet-store-2',
    createdAt: options.createdAt ?? '2026-07-18T17:31:00.000Z',
    idempotencyKey: options.idempotencyKey ?? 'run-store-1:packet:2',
  })
}

function packetForRun(packetId: string, runId: string, createdAt: string) {
  const { contentHash: _contentHash, ...content } = packet()
  return createWorkspacePacket({
    ...content,
    packetId,
    packetLineageId: packetId,
    runId,
    createdAt,
    idempotencyKey: `idem:${packetId}`,
  })
}

function acknowledgedState(subject: ReturnType<typeof packet>) {
  const created = createWorkspacePacketLifecycleEvent(subject, [], {
    type: 'created', actor: subject.from, reason: null, payload: {},
  }, { eventId: `${subject.packetId}-created`, createdAt: '2026-07-18T17:30:00.000Z' })
  const ready = createWorkspacePacketLifecycleEvent(subject, [created], {
    type: 'ready', actor: subject.from, reason: null, payload: {},
  }, { eventId: `${subject.packetId}-ready`, createdAt: '2026-07-18T17:31:00.000Z' })
  const offered = createWorkspacePacketLifecycleEvent(subject, [created, ready], {
    type: 'offered', actor: subject.from, reason: null, payload: {},
  }, { eventId: `${subject.packetId}-offered`, createdAt: '2026-07-18T17:32:00.000Z' })
  const events = [created, ready, offered]
  const { ack, event } = acknowledgeWorkspacePacket(subject, events, {
    acceptedContentHash: subject.contentHash,
    receiver: subject.to,
    outcome: 'blocked',
    checkedCriteriaIds: [],
    missingFields: ['evidence'],
    evidenceRefs: [],
    reason: 'Evidence missing.',
  }, {
    ackId: `${subject.packetId}-ack`,
    eventId: `${subject.packetId}-blocked`,
    createdAt: '2026-07-18T17:33:00.000Z',
    supportedSchemaMajors: [1],
  })
  return { events: [...events, event], acks: [ack] }
}

async function rewriteCommittedStateVersion(rootDir: string, version: string) {
  const snapshotPath = path.join(rootDir, 'packets-v1.json')
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  snapshot.stateVersion = version
  await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`, 'utf8')
  for (const name of ['packet-events-v1.jsonl', 'handoff-acks-v1.jsonl']) {
    const filePath = path.join(rootDir, name)
    const rows = (await readFile(filePath, 'utf8')).trim().split('\n').map((row) => JSON.parse(row))
    rows[0].stateVersion = version
    await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
  }
}

describe('atomic Workspace Packet store', () => {
  it('loads an explicit empty V1 state when no snapshot exists', async () => {
    const rootDir = await tempStore()
    const loaded = await loadWorkspacePacketStore({ rootDir, nowMs: 100 })

    expect(loaded).toEqual({
      ok: true,
      state: createEmptyWorkspacePacketStoreState(100),
    })
  })

  it('atomically saves and reads Packets plus JSONL lifecycle/ACK readbacks', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    const state = {
      ...createEmptyWorkspacePacketStoreState(100),
      packets: [subject],
      events: acknowledgment.events,
      acks: acknowledgment.acks,
    }

    const saved = await saveWorkspacePacketStore(state, { rootDir, nowMs: 101 })
    const loaded = await loadWorkspacePacketStore({ rootDir, nowMs: 102 })
    const eventsJsonl = await readFile(path.join(rootDir, 'packet-events-v1.jsonl'), 'utf8')
    const acksJsonl = await readFile(path.join(rootDir, 'handoff-acks-v1.jsonl'), 'utf8')

    expect(saved.schemaVersion).toBe('workspace-packet-store-v1')
    expect(saved.stateVersion).toMatch(/^workspace-packet-store-v1:sha256:[a-f0-9]{64}$/)
    expect(loaded).toMatchObject({ ok: true, state: { packets: [{ packetId: subject.packetId }] } })
    const eventRows = eventsJsonl.trim().split('\n').map((row) => JSON.parse(row))
    const ackRows = acksJsonl.trim().split('\n').map((row) => JSON.parse(row))
    expect(eventRows[0]).toMatchObject({ contractVersion: 'workspace-packet-sidecar-v1', stateVersion: saved.stateVersion })
    expect(ackRows[0]).toMatchObject({ contractVersion: 'workspace-packet-sidecar-v1', stateVersion: saved.stateVersion })
    expect(eventRows.slice(1)).toHaveLength(4)
    expect(ackRows.slice(1)).toHaveLength(1)
  })

  it('replays identical idempotent content and rejects conflicting content', async () => {
    const rootDir = await tempStore()
    const first = packet()
    const initial = await persistWorkspacePacketStore({ packets: [first] }, { rootDir, nowMs: 200 })
    const replay = await persistWorkspacePacketStore({ packets: [first] }, { rootDir, nowMs: 201 })

    expect(initial.packets).toHaveLength(1)
    expect(replay.packets).toHaveLength(1)

    const conflict = packet({
      packetId: 'packet-store-conflict',
      idempotencyKey: first.idempotencyKey,
      objective: 'Different content under the same idempotency key.',
    })
    await expect(persistWorkspacePacketStore({ packets: [conflict] }, { rootDir, nowMs: 202 }))
      .rejects.toBeInstanceOf(WorkspacePacketIdempotencyConflictError)
  })

  it('rejects duplicate lineage/revision with a different Packet ID', async () => {
    const rootDir = await tempStore()
    await persistWorkspacePacketStore({ packets: [packet()] }, { rootDir, nowMs: 300 })

    await expect(persistWorkspacePacketStore({
      packets: [packet({ packetId: 'packet-store-other', idempotencyKey: 'other-key' })],
    }, { rootDir, nowMs: 301 })).rejects.toBeInstanceOf(WorkspacePacketStoreConflictError)
  })

  it('rejects revision gaps and missing or cross-lineage parents', async () => {
    const rootDir = await tempStore()
    const child = packet({
      packetId: 'packet-store-2',
      revision: 2,
      idempotencyKey: 'run-store-1:packet:2',
    })
    await expect(persistWorkspacePacketStore({ packets: [child] }, { rootDir, nowMs: 350 }))
      .rejects.toThrow(/missing parent/i)

    const unrelatedParent = packet({
      packetId: 'packet-other-parent',
      lineageId: 'lineage-other',
      idempotencyKey: 'other-parent-key',
    })
    await expect(persistWorkspacePacketStore({
      packets: [unrelatedParent, child],
    }, { rootDir, nowMs: 351 })).rejects.toThrow(/missing parent|same lineage/i)
  })

  it('serializes concurrent read-merge-write operations without losing either Packet', async () => {
    const rootDir = await tempStore()
    const left = packet({ packetId: 'packet-concurrent-left', lineageId: 'lineage-left', idempotencyKey: 'key-left' })
    const right = packet({ packetId: 'packet-concurrent-right', lineageId: 'lineage-right', idempotencyKey: 'key-right' })
    await Promise.all([
      persistWorkspacePacketStore({ packets: [left] }, { rootDir, nowMs: 360 }),
      persistWorkspacePacketStore({ packets: [right] }, { rootDir, nowMs: 361 }),
    ])
    const loaded = await loadWorkspacePacketStore({ rootDir, nowMs: 362 })
    expect(loaded).toMatchObject({ ok: true })
    if (!loaded.ok) throw new Error(loaded.diagnostic.message)
    expect(loaded.state.packets.map((candidate) => candidate.packetId).sort()).toEqual([
      left.packetId,
      right.packetId,
    ].sort())
  })

  it('rejects ACK-required lifecycle events without an exact persisted ACK binding', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    const blocked = acknowledgment.events.at(-1)
    if (!blocked) throw new Error('Expected blocked lifecycle event fixture.')
    const forged = { ...blocked, payload: { ...blocked.payload, ackId: 'missing-ack' } }
    await expect(persistWorkspacePacketStore({
      packets: [subject],
      events: [...acknowledgment.events.slice(0, -1), forged],
      acks: [],
    }, { rootDir, nowMs: 370 })).rejects.toThrow(/missing Handoff ACK/i)
  })

  it('rejects persisted ACKs without an exact lifecycle event binding', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    await expect(persistWorkspacePacketStore({
      packets: [subject],
      events: acknowledgment.events.slice(0, -1),
      acks: acknowledgment.acks,
    }, { rootDir, nowMs: 371 })).rejects.toThrow(/no matching lifecycle event/i)
  })

  it('returns a blocked diagnostic for corrupt state and refuses to overwrite it', async () => {
    const rootDir = await tempStore()
    const snapshotPath = path.join(rootDir, 'packets-v1.json')
    await writeFile(snapshotPath, '{', 'utf8')

    const loaded = await loadWorkspacePacketStore({ rootDir, nowMs: 400 })
    expect(loaded).toMatchObject({
      ok: false,
      diagnostic: { code: 'CORRUPT_PACKET_STORE', path: snapshotPath },
    })
    await expect(persistWorkspacePacketStore({ packets: [packet()] }, { rootDir, nowMs: 401 }))
      .rejects.toThrow(/corrupt/i)
    expect(await readFile(snapshotPath, 'utf8')).toBe('{')
  })

  it.each(['checkedCriteriaIds', 'missingFields', 'evidenceRefs'] as const)(
    'fails closed when persisted ACK %s contains non-string evidence',
    async (field) => {
      const rootDir = await tempStore()
      const subject = packet()
      const acknowledgment = acknowledgedState(subject)
      await saveWorkspacePacketStore({
        ...createEmptyWorkspacePacketStoreState(450),
        packets: [subject],
        events: acknowledgment.events,
        acks: acknowledgment.acks,
      }, { rootDir, nowMs: 451 })

      const snapshotPath = path.join(rootDir, 'packets-v1.json')
      const raw = JSON.parse(await readFile(snapshotPath, 'utf8'))
      raw.acks[0][field] = [42]
      await writeFile(snapshotPath, `${JSON.stringify(raw)}\n`, 'utf8')

      expect(await loadWorkspacePacketStore({ rootDir, nowMs: 452 })).toMatchObject({
        ok: false,
        diagnostic: { code: 'CORRUPT_PACKET_STORE' },
      })
    },
  )

  it.each(['checkedCriteriaIds', 'missingFields', 'evidenceRefs'] as const)(
    'rejects sparse ACK %s arrays before committing them',
    async (field) => {
      const rootDir = await tempStore()
      const subject = packet()
      const acknowledgment = acknowledgedState(subject)
      const sparseAck = {
        ...acknowledgment.acks[0],
        [field]: new Array<string>(1),
      }

      await expect(persistWorkspacePacketStore({
        packets: [subject],
        events: acknowledgment.events,
        acks: [sparseAck],
      }, { rootDir, nowMs: 455 })).rejects.toThrow(/Invalid Handoff ACK/i)
    },
  )

  it.each([
    ['malformed', 'workspace-packet-store-v1:451:arbitrary'],
    ['content-unbound', `workspace-packet-store-v1:sha256:${'a'.repeat(64)}`],
  ])('fails closed when snapshot and both sidecars share a %s stateVersion', async (_kind, version) => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    await saveWorkspacePacketStore({
      ...createEmptyWorkspacePacketStoreState(460),
      packets: [subject],
      events: acknowledgment.events,
      acks: acknowledgment.acks,
    }, { rootDir, nowMs: 461 })

    await rewriteCommittedStateVersion(rootDir, version)

    expect(await loadWorkspacePacketStore({ rootDir, nowMs: 462 })).toMatchObject({
      ok: false,
      diagnostic: {
        code: 'CORRUPT_PACKET_STORE',
        message: expect.stringMatching(/stateVersion.*canonical content/i),
      },
    })
  })

  it('fails closed when a committed JSONL sidecar diverges from its snapshot', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    await saveWorkspacePacketStore({
      ...createEmptyWorkspacePacketStoreState(475),
      packets: [subject],
      events: acknowledgment.events,
      acks: acknowledgment.acks,
    }, { rootDir, nowMs: 476 })
    const filePath = path.join(rootDir, 'packet-events-v1.jsonl')
    const rows = (await readFile(filePath, 'utf8')).trim().split('\n').map((row) => JSON.parse(row))
    rows[1].actorRoomId = 'tampered-room'
    await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
    expect(await loadWorkspacePacketStore({ rootDir, nowMs: 477 })).toMatchObject({
      ok: false,
      diagnostic: { code: 'CORRUPT_PACKET_STORE' },
    })
  })

  it('fails closed when a committed JSONL sidecar has a stale stateVersion', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    await saveWorkspacePacketStore({
      ...createEmptyWorkspacePacketStoreState(480),
      packets: [subject],
      events: acknowledgment.events,
      acks: acknowledgment.acks,
    }, { rootDir, nowMs: 481 })
    const filePath = path.join(rootDir, 'packet-events-v1.jsonl')
    const rows = (await readFile(filePath, 'utf8')).trim().split('\n').map((row) => JSON.parse(row))
    rows[0].stateVersion = 'workspace-packet-store-v1:1:stale'
    await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')

    expect(await loadWorkspacePacketStore({ rootDir, nowMs: 482 })).toMatchObject({
      ok: false,
      diagnostic: { code: 'CORRUPT_PACKET_STORE' },
    })
  })

  it('fails closed when a committed JSONL sidecar has a future stateVersion', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    await saveWorkspacePacketStore({
      ...createEmptyWorkspacePacketStoreState(485),
      packets: [subject],
      events: acknowledgment.events,
      acks: acknowledgment.acks,
    }, { rootDir, nowMs: 486 })
    const filePath = path.join(rootDir, 'handoff-acks-v1.jsonl')
    const rows = (await readFile(filePath, 'utf8')).trim().split('\n').map((row) => JSON.parse(row))
    rows[0].stateVersion = 'workspace-packet-store-v1:9999999999999:future'
    await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')

    expect(await loadWorkspacePacketStore({ rootDir, nowMs: 487 })).toMatchObject({
      ok: false,
      diagnostic: { code: 'CORRUPT_PACKET_STORE' },
    })
  })

  it('fails closed after an interrupted commit writes both sidecars before the snapshot', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    const acknowledgment = acknowledgedState(subject)
    await saveWorkspacePacketStore({
      ...createEmptyWorkspacePacketStoreState(490),
      packets: [subject],
      events: acknowledgment.events,
      acks: acknowledgment.acks,
    }, { rootDir, nowMs: 491 })
    for (const name of ['packet-events-v1.jsonl', 'handoff-acks-v1.jsonl']) {
      const filePath = path.join(rootDir, name)
      const rows = (await readFile(filePath, 'utf8')).trim().split('\n').map((row) => JSON.parse(row))
      rows[0].stateVersion = 'workspace-packet-store-v1:9999999999999:interrupted-commit'
      await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
    }

    expect(await loadWorkspacePacketStore({ rootDir, nowMs: 492 })).toMatchObject({
      ok: false,
      diagnostic: { code: 'CORRUPT_PACKET_STORE' },
    })
  })

  it('ignores an interrupted temp file and keeps the last good snapshot', async () => {
    const rootDir = await tempStore()
    const subject = packet()
    await persistWorkspacePacketStore({ packets: [subject] }, { rootDir, nowMs: 500 })
    await writeFile(path.join(rootDir, 'packets-v1.json.interrupted.tmp'), '{', 'utf8')

    const loaded = await loadWorkspacePacketStore({ rootDir, nowMs: 501 })
    expect(loaded).toMatchObject({ ok: true, state: { packets: [{ packetId: subject.packetId }] } })
  })

  it('never drops a Packet referenced by an active Run during retention', async () => {
    const rootDir = await tempStore()
    const activeOld = packet({ packetId: 'packet-active-old', idempotencyKey: 'key-active', createdAt: '2026-07-18T17:00:00.000Z' })
    const newer = packet({ packetId: 'packet-newer', lineageId: 'lineage-newer', idempotencyKey: 'key-newer', createdAt: '2026-07-18T18:00:00.000Z' })
    const newest = packet({ packetId: 'packet-newest', lineageId: 'lineage-newest', idempotencyKey: 'key-newest', createdAt: '2026-07-18T19:00:00.000Z' })

    await persistWorkspacePacketStore({
      packets: [activeOld, newer, newest],
    }, { rootDir, nowMs: 600, maxPackets: 3 })

    const state = await persistWorkspacePacketStore({
      activePacketIds: [activeOld.packetId],
    }, { rootDir, nowMs: 601, maxPackets: 2 })

    expect(state.packets.map((item) => item.packetId).sort()).toEqual([
      activeOld.packetId,
      newest.packetId,
    ].sort())
  })

  it('persists active Run linkage across reloads and caller omissions until explicit deactivation', async () => {
    const rootDir = await tempStore()
    const active = packetForRun('packet-durable-active', 'run-durable-active', '2026-07-18T17:00:00.000Z')
    const inactive = packetForRun('packet-inactive-newer', 'run-inactive-newer', '2026-07-18T19:00:00.000Z')

    await persistWorkspacePacketStore({
      packets: [active],
      activateRunIds: [active.runId],
    }, { rootDir, nowMs: 605, maxPackets: 1 })
    const restarted = await loadWorkspacePacketStore({ rootDir, nowMs: 606, maxPackets: 1 })
    expect(restarted).toMatchObject({
      ok: true,
      state: { activeRunIds: [active.runId], packets: [{ packetId: active.packetId }] },
    })

    const retained = await persistWorkspacePacketStore({ packets: [inactive] }, {
      rootDir,
      nowMs: 607,
      maxPackets: 1,
    })
    expect(retained.activeRunIds).toEqual([active.runId])
    expect(retained.packets.map((item) => item.packetId)).toEqual([active.packetId])

    const deactivated = await persistWorkspacePacketStore({
      packets: [inactive],
      deactivateRunIds: [active.runId],
    }, { rootDir, nowMs: 608, maxPackets: 1 })
    expect(deactivated.activeRunIds).toEqual([])
    expect(deactivated.packets.map((item) => item.packetId)).toEqual([inactive.packetId])
  })

  it('retains the complete revision ancestry for an active Packet even above the soft cap', async () => {
    const rootDir = await tempStore()
    const parent = packet()
    const child = packet({
      packetId: 'packet-store-2',
      revision: 2,
      idempotencyKey: 'run-store-1:packet:2',
    })
    await persistWorkspacePacketStore({ packets: [parent, child] }, { rootDir, nowMs: 610, maxPackets: 2 })
    const state = await persistWorkspacePacketStore({
      activePacketIds: [child.packetId],
    }, { rootDir, nowMs: 611, maxPackets: 1 })
    expect(state.packets.map((item) => item.packetId)).toEqual([parent.packetId, child.packetId])
  })
})
