import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInitialEtsyRoomState } from '../living-v3/etsy-room-contracts'
import { createInitialEtsyPipelineState } from '../living-v3/etsy-pipeline'
import { migrateEtsyProductWorkspaceStateV2 } from '../living-v3/etsy-product-model'
import {
  SHARED_ETSY_ROOM_CANDIDATE_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_EVENT_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_SOURCE_DETAIL_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT,
  applySharedEtsyProductWorkspaceCommand,
  compactSharedEtsyRoomState,
  loadSharedEtsyRoomStore,
  saveSharedEtsyRoomState,
} from './etsy-room-shared-store'
import type { EtsyProductCandidate, EtsyRoomEvent } from '../living-v3/etsy-room-contracts'

let tempDirs: Array<string> = []
let rootDir = ''

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), 'etsy-room-shared-store-'))
  tempDirs.push(rootDir)
})

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
  rootDir = ''
})

function candidate(index: number): EtsyProductCandidate {
  return {
    candidateId: `candidate-${index}`,
    packetId: 'packet-1',
    runId: 'run-1',
    title: `Candidate ${index}`,
    niche: 'test niche',
    score: index,
    sourceType: 'Live read-only research',
    dataOrigin: 'live-readonly-research',
    sourceRecordIds: Array.from({ length: 20 }, (_, itemIndex) => `https://example.com/${index}/${itemIndex}`),
    imageRefs: Array.from({ length: 3 }, (_, itemIndex) => `https://example.com/image/${index}/${itemIndex}.jpg`),
    thumbnailRef: `https://example.com/image/${index}/0.jpg`,
    sourceDetails: Array.from({ length: 12 }, (_, itemIndex) => ({
      kind: itemIndex === 0 ? 'etsy' : 'supplier',
      label: `source ${itemIndex}`,
      marketplace: itemIndex === 0 ? 'Etsy' : 'AliExpress',
      url: `https://example.com/detail/${index}/${itemIndex}`,
      imageUrl: `https://example.com/image/${index}/${itemIndex}.jpg`,
      priceText: `$${itemIndex}`,
      salesText: `${itemIndex * 10} sales`,
      tags: Array.from({ length: 20 }, (_tag, tagIndex) => `tag-${tagIndex}`),
    })),
    evidenceIds: Array.from({ length: 20 }, (_, itemIndex) => `evidence-${itemIndex}`),
    missingFields: Array.from({ length: 20 }, (_, itemIndex) => `missing-${itemIndex}`),
    riskNotes: Array.from({ length: 20 }, (_, itemIndex) => `risk-${itemIndex}`),
    nextHandoff: 'select_etsy_candidate_local',
    selected: false,
  }
}

function event(index: number): EtsyRoomEvent {
  return {
    eventId: `event-${index}`,
    type: 'etsy.candidates.ready',
    runId: 'run-1',
    stage: 'candidates_ready',
    createdAtMs: index,
    readback: `event ${index}`,
    payload: {
      candidateIds: ['candidate-1'],
      raw: 'x'.repeat(3_000),
    },
  }
}

describe('shared Etsy room store', () => {
  it('starts empty with a retention policy and no file storage', async () => {
    const store = await loadSharedEtsyRoomStore({ rootDir, nowMs: 1_000 })

    expect(store.empty).toBe(true)
    expect(store.retention).toMatchObject({
      storesFiles: false,
      hardWorkspaceLimit: false,
      filterMode: 'filter-first-soft-safety',
      candidateSoftSafetyLimit: SHARED_ETSY_ROOM_CANDIDATE_SOFT_SAFETY_LIMIT,
      eventSoftSafetyLimit: SHARED_ETSY_ROOM_EVENT_SOFT_SAFETY_LIMIT,
    })
    expect(store.roomState.candidates).toEqual([])
  })

  it('compacts candidates, events, links, and source details before saving', async () => {
    const state = createInitialEtsyRoomState(2_000)
    const candidates = Array.from({ length: 40 }, (_, index) => candidate(index))
    candidates[35].selected = true
    state.candidates = candidates
    state.selectedCandidateId = 'candidate-35'
    state.events = Array.from({ length: 120 }, (_, index) => event(index))
    state.prompt = 'gold initial necklace'
    state.run.updatedAtMs = 2_500

    const saved = await saveSharedEtsyRoomState(state, { rootDir, nowMs: 2_600, source: 'test', reason: 'unit test' })

    expect(saved.saved).toBe(true)
    expect(saved.empty).toBe(false)
    expect(saved.roomState.candidates).toHaveLength(40)
    expect(saved.roomState.candidates[0].candidateId).toBe('candidate-35')
    expect(saved.roomState.candidates[0].sourceRecordIds).toHaveLength(20)
    expect(SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT).toBeGreaterThan(20)
    expect(saved.roomState.candidates[0].sourceDetails).toHaveLength(12)
    expect(SHARED_ETSY_ROOM_SOURCE_DETAIL_SOFT_SAFETY_LIMIT).toBeGreaterThan(12)
    expect(saved.roomState.candidates[0].sourceDetails?.[0].tags).toHaveLength(20)
    expect(SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT).toBeGreaterThan(20)
    expect(saved.roomState.events).toHaveLength(120)
    expect(saved.roomState.events[0].eventId).toBe('event-0')
    expect(saved.roomState.events[0].payload).toMatchObject({ truncated: true })
  })

  it('does not overwrite a newer shared room state with an older browser copy', async () => {
    const newer = createInitialEtsyRoomState(3_000)
    newer.prompt = 'newer state'
    newer.run.updatedAtMs = 3_500
    await saveSharedEtsyRoomState(newer, { rootDir, nowMs: 3_600, source: 'test' })

    const older = createInitialEtsyRoomState(2_000)
    older.prompt = 'older state'
    older.run.updatedAtMs = 2_500
    const result = await saveSharedEtsyRoomState(older, { rootDir, nowMs: 3_700, source: 'test' })

    expect(result.saved).toBe(false)
    expect(result.skippedReason).toBe('existing-shared-room-state-is-newer')
    expect(result.roomState.prompt).toBe('newer state')
  })

  it('serializes concurrent writes and keeps the newest room state', async () => {
    const older = createInitialEtsyRoomState(4_000)
    older.prompt = 'older concurrent state'
    older.run.updatedAtMs = 4_100
    const newer = createInitialEtsyRoomState(4_000)
    newer.prompt = 'newer concurrent state'
    newer.run.updatedAtMs = 4_200

    await Promise.all([
      saveSharedEtsyRoomState(older, { rootDir, nowMs: 4_300, source: 'test' }),
      saveSharedEtsyRoomState(newer, { rootDir, nowMs: 4_301, source: 'test' }),
    ])

    const saved = await loadSharedEtsyRoomStore({ rootDir, nowMs: 4_400 })
    expect(saved.roomState.prompt).toBe('newer concurrent state')
    expect(saved.roomState.run.updatedAtMs).toBe(4_200)
  })

  it('can compact without writing for route/UI previews', () => {
    const state = createInitialEtsyRoomState(4_000)
    state.prompt = 'compact only'
    state.candidates = Array.from({ length: 32 }, (_, index) => candidate(index))

    const compacted = compactSharedEtsyRoomState(state, 4_100)

    expect(compacted.candidates).toHaveLength(32)
    expect(compacted.run.usageAllowed).toBe(false)
    expect(compacted.run.workerSpawnAllowed).toBe(false)
  })

  it('migrates a persisted V1 room document into the V2 canonical workspace on read', async () => {
    const roomState = createInitialEtsyRoomState(5_000)
    roomState.prompt = 'legacy V1 room prompt'
    roomState.run.updatedAtMs = 5_100
    await writeFile(path.join(rootDir, 'shared-room-state.json'), JSON.stringify({
      schemaVersion: 'war-room-etsy-shared-room-v1',
      updatedAtMs: 5_200,
      stateVersion: 'war-room-etsy-shared-room-v1:5200',
      source: 'ui',
      empty: false,
      roomState,
    }))

    const store = await loadSharedEtsyRoomStore({ rootDir, nowMs: 5_300 })

    expect(store.schemaVersion).toBe('war-room-etsy-product-workspace-v2')
    expect(store.workspaceState.schemaVersion).toBe('etsy-product-workspace-v2')
    expect(store.workspaceState.revision).toBe(0)
    expect(store.workspaceState.roomState.prompt).toBe('legacy V1 room prompt')
    expect(store.roomState).toEqual(store.workspaceState.roomState)
  })

  it('applies a CAS command once, returns an idempotent replay, and preserves the revision', async () => {
    const workspace = migrateEtsyProductWorkspaceStateV2({
      roomState: createInitialEtsyRoomState(6_000),
      pipelineState: createInitialEtsyPipelineState(),
      nowMs: 6_000,
    })
    const nextRoom = structuredClone(workspace.roomState)
    nextRoom.prompt = 'CAS write'
    const command = {
      type: 'replace_projections' as const,
      commandId: 'cas-write-once',
      baseRevision: 0,
      reason: 'CAS write test',
      roomState: nextRoom,
      pipelineState: workspace.pipelineState,
    }

    const applied = await applySharedEtsyProductWorkspaceCommand(command, { rootDir, nowMs: 6_100, source: 'test' })
    const replayed = await applySharedEtsyProductWorkspaceCommand(command, { rootDir, nowMs: 6_200, source: 'test' })
    const loaded = await loadSharedEtsyRoomStore({ rootDir, nowMs: 6_300 })

    expect(applied.commandStatus).toBe('applied')
    expect(applied.saved).toBe(true)
    expect(applied.workspaceState.revision).toBe(1)
    expect(replayed.commandStatus).toBe('replayed')
    expect(replayed.saved).toBe(false)
    expect(loaded.workspaceState.revision).toBe(1)
    expect(loaded.workspaceState.roomState.prompt).toBe('CAS write')
  })

  it('rejects the second of two concurrent clients writing the same base revision', async () => {
    const initial = await loadSharedEtsyRoomStore({ rootDir, nowMs: 7_000 })
    const firstRoom = structuredClone(initial.workspaceState.roomState)
    firstRoom.prompt = 'first client won'
    const secondRoom = structuredClone(initial.workspaceState.roomState)
    secondRoom.prompt = 'stale second client'
    const command = (commandId: string, roomState: typeof firstRoom) => ({
      type: 'replace_projections' as const,
      commandId,
      baseRevision: initial.workspaceState.revision,
      reason: commandId,
      roomState,
      pipelineState: initial.workspaceState.pipelineState,
    })

    const [first, second] = await Promise.all([
      applySharedEtsyProductWorkspaceCommand(command('client-one', firstRoom), { rootDir, nowMs: 7_100, source: 'test' }),
      applySharedEtsyProductWorkspaceCommand(command('client-two', secondRoom), { rootDir, nowMs: 7_101, source: 'test' }),
    ])
    const loaded = await loadSharedEtsyRoomStore({ rootDir, nowMs: 7_200 })

    expect(first.commandStatus).toBe('applied')
    expect(second.commandStatus).toBe('conflict')
    expect(second.expectedRevision).toBe(1)
    expect(loaded.workspaceState.revision).toBe(1)
    expect(loaded.workspaceState.roomState.prompt).toBe('first client won')
  })
})
