import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInitialEtsyRoomState } from '../living-v3/etsy-room-contracts'
import type { EtsyProductCandidate, EtsyRoomEvent } from '../living-v3/etsy-room-contracts'
import {
  SHARED_ETSY_ROOM_CANDIDATE_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_EVENT_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_SOURCE_DETAIL_SOFT_SAFETY_LIMIT,
  SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT,
  compactSharedEtsyRoomState,
  loadSharedEtsyRoomStore,
  saveSharedEtsyRoomState,
} from './etsy-room-shared-store'

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
      tags: Array.from({ length: 20 }, (_, tagIndex) => `tag-${tagIndex}`),
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

  it('can compact without writing for route/UI previews', () => {
    const state = createInitialEtsyRoomState(4_000)
    state.prompt = 'compact only'
    state.candidates = Array.from({ length: 32 }, (_, index) => candidate(index))

    const compacted = compactSharedEtsyRoomState(state, 4_100)

    expect(compacted.candidates).toHaveLength(32)
    expect(compacted.run.usageAllowed).toBe(false)
    expect(compacted.run.workerSpawnAllowed).toBe(false)
  })
})
