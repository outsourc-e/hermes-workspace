import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { ETSY_MARKET_LAB_STATION_OPERATOR_IDS } from '../living-v3/etsy-station-apps'
import { buildEtsyDraftPreview, createEtsyDraftApprovalPacket, createEtsyProductSearchPacket, createInitialEtsyPipelineState, sendEtsyCandidateToThoth } from '../living-v3/etsy-pipeline'
import {
  parseWarRoomIntentApiPayload,
  runOracleScoutLocalBridge,
} from './oracle-scout-event-bridge'
import {
  parseEtsyRoomIntentApiPayload,
  resetEtsyRoomBridgeStateForDev,
  runEtsyRoomLocalIntentBridge,
} from './etsy-room-event-bridge'
import {
  getAgentConnectionState,
  getWarRoomBodyState,
  listWarRoomEvents,
  resetWarRoomBodyRuntimeForDev,
  runControlledAgentOneShot,
  setWarRoomAgentsLocalOnly,
} from './index'

function makeAluraFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-alura-bridge-'))
  fs.writeFileSync(path.join(dir, 'alura-raw-latest.json'), JSON.stringify({
    keywordResults: [
      {
        keyword: 'gold initial necklace',
        overview: {
          data: {
            results: {
              keyword_id: 'kw-gold-initial-necklace',
              keyword: 'gold initial necklace',
              keyword_score: 91,
              etsy_volume_mo: 1450,
              competing_listings: 620,
              sales: 42,
              avg_sales: 8,
              revenue: 3200,
              avg_revenue: 210,
              views: 7600,
              avg_price_usd: 28,
              competition_level: 'Medium',
            },
          },
        },
      },
    ],
  }), 'utf8')
  return dir
}

function makeOracleSignalPacket(nowMs = 93_000) {
  return {
    packetId: `oracle-signal-gold-initial-${nowMs}`,
    selectedKeyword: 'gold initial necklace',
    createdAtMs: nowMs,
    sourceMode: 'alura_only' as const,
    metrics: {
      keyword: 'gold initial necklace',
      keywordScore: 91,
      searchVolume: 1450,
      sales: 42,
      avgSales: 8,
      revenue: 1176,
      avgRevenue: 224,
      views: 8100,
      competition: 620,
      competitionLevel: 'medium' as const,
      avgPrice: 28,
    },
    sourceFile: 'alura-raw-latest.json',
    sourceFilesUsed: ['alura-raw-latest.json'],
    evidenceIds: ['kw-gold-initial-necklace', 'etsy-volume-1450', 'sales-42', 'avg-price-28'],
    missingFields: [],
    dataOrigin: 'local-alura-cache' as const,
    status: 'local_signal_ready' as const,
  }
}

describe('Oracle Scout local event bridge', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(90_000)
    resetEtsyRoomBridgeStateForDev(90_000)
  })

  it('keeps default and local-only agent control non-usage and non-spawning', () => {
    expect(getAgentConnectionState()).toMatchObject({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })

    setWarRoomAgentsLocalOnly({ updatedBy: 'test' }, 90_100)
    expect(getAgentConnectionState()).toMatchObject({
      mode: 'local_only',
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
  })

  it('rejects unsupported intent payloads at the API parser boundary', () => {
    expect(parseWarRoomIntentApiPayload({ type: 'run_oracle_scout_local', query: 'gold initial necklace' }).success).toBe(true)
    expect(parseEtsyRoomIntentApiPayload({ type: 'prepare_product_scout_packet_local', prompt: 'find gold initial necklace opportunities' }).success).toBe(true)
    expect(parseWarRoomIntentApiPayload({ type: 'say', agentId: 'oracle', text: 'hello' }).success).toBe(false)
    expect(parseEtsyRoomIntentApiPayload({ type: 'say', agentId: 'oracle', text: 'hello' }).success).toBe(false)
    expect(parseWarRoomIntentApiPayload({ type: 'publish_etsy', listingId: 'live' }).success).toBe(false)
  })

  it('runs Etsy room local intents as append-only events and returns frozen', async () => {
    let result = await runEtsyRoomLocalIntentBridge({
      type: 'prepare_product_scout_packet_local',
      prompt: 'find gold initial necklace opportunities',
      runId: 'etsy-local-test-run',
      correlationId: 'etsy-local-test-corr',
      nowMs: 93_000,
      oracleSignalPacket: makeOracleSignalPacket(93_000),
    })
    expect(result.ok).toBe(true)
    expect(result.etsyRoomState.stage).toBe('candidates_ready')
    expect(result.control).toMatchObject({ mode: 'frozen', usageAllowed: false, workerSpawnAllowed: false })

    const candidateId = result.etsyRoomState.candidates[0].candidateId
    result = await runEtsyRoomLocalIntentBridge({
      type: 'select_etsy_candidate_local',
      candidateId,
      runId: 'etsy-local-test-run',
      correlationId: 'etsy-local-test-corr',
      nowMs: 93_100,
    })
    expect(result.etsyRoomState.selectedProductPacket?.selectedCandidateId).toBe(candidateId)

    result = await runEtsyRoomLocalIntentBridge({
      type: 'create_shotlab_handoff_local',
      runId: 'etsy-local-test-run',
      correlationId: 'etsy-local-test-corr',
      nowMs: 93_200,
    })
    expect(result.etsyRoomState.shotLabHandoffPacket?.lockedActions).toContain('ShotLab/paid generation')

    result = await runEtsyRoomLocalIntentBridge({
      type: 'create_seo_packet_local',
      runId: 'etsy-local-test-run',
      correlationId: 'etsy-local-test-corr',
      nowMs: 93_300,
    })
    expect(result.etsyRoomState.seoPacket?.missingKeywordMetrics).toContain('search volume missing from safe local SEO source')

    result = await runEtsyRoomLocalIntentBridge({
      type: 'create_draft_payload_local',
      runId: 'etsy-local-test-run',
      correlationId: 'etsy-local-test-corr',
      nowMs: 93_400,
    })
    expect(result.etsyRoomState.draftPayload?.lockedActions).toEqual(expect.arrayContaining(['Etsy upload draft', 'Etsy publish']))

    result = await runEtsyRoomLocalIntentBridge({
      type: 'request_dlv_approval_local',
      runId: 'etsy-local-test-run',
      correlationId: 'etsy-local-test-corr',
      nowMs: 93_500,
    })
    expect(result.etsyRoomState.approvalPacket?.approvalStatus).toBe('waiting_operator')
    expect(getAgentConnectionState()).toMatchObject({ mode: 'frozen', usageAllowed: false, workerSpawnAllowed: false })

    const eventTypes = listWarRoomEvents().map((event) => event.type)
    expect(eventTypes).toEqual(expect.arrayContaining([
      'etsy.scout.request.created',
      'etsy.candidates.ready',
      'etsy.candidate.selected',
      'etsy.shotlab.packet.created',
      'etsy.seo.packet.created',
      'etsy.draft.payload.created',
      'etsy.approval.requested',
      'approval.requested',
      'control.frozen',
    ]))
  })

  it('runs Oracle Scout through local typed events, alura_only source mode, and returns frozen', async () => {
    const result = await runOracleScoutLocalBridge({
      type: 'run_oracle_scout_local',
      query: 'gold initial necklace',
      runId: 'oracle-local-test-run',
      correlationId: 'oracle-local-test-corr',
      baseDir: makeAluraFixtureDir(),
      nowMs: 91_000,
    })

    expect(result.ok).toBe(true)
    expect(result.sourceMode).toBe('alura_only')
    expect(result.signalPacket).toMatchObject({
      selectedKeyword: 'gold initial necklace',
      dataOrigin: 'local-alura-cache',
      sourceMode: 'alura_only',
      status: 'local_signal_ready',
    })
    expect(result.control).toMatchObject({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
    expect(getAgentConnectionState().mode).toBe('frozen')

    const eventTypes = listWarRoomEvents().map((event) => event.type)
    expect(eventTypes).toEqual(expect.arrayContaining([
      'control.local_only',
      'agent.move.started',
      'agent.work.started',
      'oracle.local_alura_search.started',
      'oracle.local_alura_search.completed',
      'packet.created',
      'packet.sent',
      'etsy.signal.received',
      'approval.requested',
      'agent.work.completed',
      'control.frozen',
    ]))
    expect(listWarRoomEvents().find((event) => event.type === 'oracle.local_alura_search.started')?.payload).toMatchObject({
      sourceMode: 'alura_only',
    })
    expect(getWarRoomBodyState().safetyLocks.liveEtsyEnabled).toBe(false)
  })

  it('keeps controlled agent dry-run path blocked without process spawning', async () => {
    const result = await runControlledAgentOneShot({ agentId: 'athena', runId: 'no-spawn-test', dryRun: true })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected dry-run to return blocked result')
    expect(result.error).toContain('no process was spawned')
    expect(result.output?.blockedActions).toEqual(expect.arrayContaining(['child_process', 'Hermes CLI']))
  })

  it('keeps Etsy operators and draft actions local-only locked', () => {
    expect(Object.values(ETSY_MARKET_LAB_STATION_OPERATOR_IDS)).not.toContain('julius')
    let state = createEtsyProductSearchPacket(createInitialEtsyPipelineState(), {
      requestText: 'gold initial necklace',
      mode: 'exact',
      nowMs: 92_000,
      oracleSignalPacket: makeOracleSignalPacket(92_000),
    })
    state = sendEtsyCandidateToThoth(state, state.candidates[0].candidateId, 92_100)
    const draftPreview = buildEtsyDraftPreview(state, 92_200)
    expect(draftPreview?.evidenceSummary.lockedLiveActions).toEqual(expect.arrayContaining([
      'Etsy upload',
      'Etsy publish',
    ]))
    state = createEtsyDraftApprovalPacket(state, 92_300)
    expect(state.draftApprovalPacket?.status).toBe('waiting_operator')
  })
})
