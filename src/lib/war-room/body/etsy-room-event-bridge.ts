import { z } from 'zod'
import {



  createInitialEtsyRoomState,
  reduceEtsyRoomLocalIntent
} from '../living-v3/etsy-room-contracts'
import { appendWarRoomEvent, listWarRoomEvents } from './event-store'
import { freezeWarRoomAgents, getAgentConnectionState, setWarRoomAgentsLocalOnly } from './agent-connection-control'
import { getWarRoomBodyState, requestWarRoomApproval } from './runtime'
import type {EtsyRoomEvent, EtsyRoomLocalIntent, EtsyRoomState} from '../living-v3/etsy-room-contracts';
import type { AgentConnectionState } from './agent-connection-control'
import type { WarRoomBodyState, WarRoomEvent } from './domain'

const OptionalTextSchema = z.string().trim().min(1).max(1200).optional()

const OracleSignalPacketSchema = z.object({
  packetId: z.string().trim().min(1),
  selectedKeyword: z.string().trim().min(1),
  createdAtMs: z.number(),
  sourceMode: z.literal('alura_only').or(z.literal('alura_plus_product_research')).or(z.literal('seo_graph_optional')),
  metrics: z.record(z.string(), z.unknown()),
  sourceFile: z.string(),
  sourceFilesUsed: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  missingFields: z.array(z.string()),
  dataOrigin: z.literal('local-alura-cache'),
  status: z.literal('local_signal_ready'),
}).passthrough()

const ScoutWorkerCandidateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  niche: z.string().trim().min(1).max(160),
  score: z.number().min(0).max(100).nullable().optional(),
  sourceUrls: z.array(z.string().trim().min(1).max(500)).max(8).optional(),
  evidence: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
  missingFields: z.array(z.string().trim().min(1).max(180)).max(12).optional(),
  riskNotes: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
}).strict()

export const EtsyRoomIntentApiPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prepare_product_scout_packet_local'),
    prompt: z.string().trim().min(1).max(600),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
    oracleSignalPacket: OracleSignalPacketSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('apply_product_scout_worker_packet_local'),
    prompt: z.string().trim().min(1).max(600),
    workerRunId: z.string().trim().min(1).max(160),
    workerSummary: z.string().trim().min(1).max(700),
    candidates: z.array(ScoutWorkerCandidateSchema).min(1).max(5),
    evidenceIds: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
    sourceRecordIds: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    missingFields: z.array(z.string().trim().min(1).max(180)).max(20).optional(),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
  z.object({
    type: z.literal('select_etsy_candidate_local'),
    candidateId: z.string().trim().min(1).max(240),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
  z.object({
    type: z.literal('reject_etsy_candidate_local'),
    candidateId: z.string().trim().min(1).max(240),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
  z.object({
    type: z.literal('create_shotlab_handoff_local'),
    preset: z.enum(['Boutique Premium', 'Minimalist Zen', 'Earthy Organic']).optional(),
    imageCount: z.number().int().min(1).max(12).optional(),
    sourceImageRequirements: OptionalTextSchema,
    variantNotes: OptionalTextSchema,
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
  z.object({
    type: z.literal('create_seo_packet_local'),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
  z.object({
    type: z.literal('create_draft_payload_local'),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
  z.object({
    type: z.literal('request_dlv_approval_local'),
    runId: OptionalTextSchema,
    correlationId: OptionalTextSchema,
  }).strict(),
])

export type EtsyRoomIntentApiPayload = z.infer<typeof EtsyRoomIntentApiPayloadSchema>

export type EtsyRoomLocalBridgeResult = {
  ok: boolean
  runId: string
  correlationId: string
  etsyRoomState: EtsyRoomState
  events: Array<WarRoomEvent>
  control: AgentConnectionState
  state: WarRoomBodyState
  error?: string
}

let etsyRoomBridgeState: EtsyRoomState = createInitialEtsyRoomState(120_000)

export function parseEtsyRoomIntentApiPayload(payload: unknown) {
  return EtsyRoomIntentApiPayloadSchema.safeParse(payload)
}

export function resetEtsyRoomBridgeStateForDev(nowMs = 120_000) {
  etsyRoomBridgeState = createInitialEtsyRoomState(nowMs)
  return etsyRoomBridgeState
}

export function getEtsyRoomBridgeState() {
  return etsyRoomBridgeState
}

function bridgeRunId() {
  return `etsy-room-local-${Date.now().toString(36)}`
}

function latestRunEvents(runId: string) {
  return listWarRoomEvents().filter((event) => event.runId === runId)
}

function appendEtsyRoomEvent(event: EtsyRoomEvent, correlationId: string) {
  return appendWarRoomEvent({
    type: event.type,
    roomId: 'etsy-market-lab',
    stationId: event.stationId,
    packetId: event.packetId,
    runId: event.runId,
    correlationId,
    source: 'dispatcher',
    status: event.type === 'etsy.approval.requested' ? 'waiting_approval' : 'completed',
    createdAtMs: event.createdAtMs,
    payload: {
      readback: event.readback,
      etsyStage: event.stage,
      ...(event.payload ?? {}),
    },
  })
}

function newEvents(previous: EtsyRoomState, next: EtsyRoomState) {
  const previousIds = new Set(previous.events.map((event) => event.eventId))
  return next.events.filter((event) => !previousIds.has(event.eventId))
}

export async function runEtsyRoomLocalIntentBridge(
  input: EtsyRoomIntentApiPayload & { nowMs?: number },
): Promise<EtsyRoomLocalBridgeResult> {
  const runId = input.runId ?? etsyRoomBridgeState.run.runId ?? bridgeRunId()
  const correlationId = input.correlationId ?? `${runId}-${input.type}`
  let clock = input.nowMs ?? Date.now()
  const tick = () => {
    clock += 1
    return clock
  }

  try {
    setWarRoomAgentsLocalOnly({
      reason: 'Etsy Market Lab local room intent started; workers and usage remain blocked.',
      updatedBy: 'ui',
      runId,
    }, tick())

    const previous = etsyRoomBridgeState
    const normalizedIntent: EtsyRoomLocalIntent = {
      ...input,
      runId,
      correlationId,
    } as EtsyRoomLocalIntent
    const next = reduceEtsyRoomLocalIntent(previous, normalizedIntent, tick())
    etsyRoomBridgeState = next
    for (const event of newEvents(previous, next)) {
      appendEtsyRoomEvent(event, correlationId)
    }

    if (next.approvalPacket && input.type === 'request_dlv_approval_local') {
      requestWarRoomApproval({
        agentId: 'odin',
        roomId: 'etsy-market-lab',
        stationId: 'etsy-odin-draft-approval',
        reason: `DLV approval packet waiting for ${next.approvalPacket.selectedProductTitle}.`,
        evidence: next.approvalPacket.evidenceIds.slice(0, 6).map((evidenceId) => ({
          evidenceId,
          label: evidenceId,
          kind: 'metric',
        })),
        riskLevel: next.approvalPacket.missingBlockers.length ? 'medium' : 'low',
        requestedAction: 'Review local Etsy draft payload',
        allowedAction: 'Approve local-only packet state',
        lockedAction: next.approvalPacket.lockedActions.join(', '),
        source: 'dispatcher',
        runId,
        correlationId,
      }, tick())
    }

    freezeWarRoomAgents({
      reason: 'Etsy Market Lab local room intent finished; agents frozen fail-closed.',
      updatedBy: 'system',
      runId,
    }, tick())

    return {
      ok: true,
      runId,
      correlationId,
      etsyRoomState: etsyRoomBridgeState,
      events: latestRunEvents(runId),
      control: getAgentConnectionState(),
      state: getWarRoomBodyState(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendWarRoomEvent({
      type: 'run.failed',
      roomId: 'etsy-market-lab',
      runId,
      correlationId,
      source: 'dispatcher',
      status: 'failed',
      error: message,
      createdAtMs: tick(),
      payload: { intentType: input.type, error: message },
    })
    freezeWarRoomAgents({
      reason: 'Etsy Market Lab local room intent failed; agents frozen fail-closed.',
      updatedBy: 'system',
      runId,
    }, tick())
    return {
      ok: false,
      runId,
      correlationId,
      etsyRoomState: etsyRoomBridgeState,
      events: latestRunEvents(runId),
      control: getAgentConnectionState(),
      state: getWarRoomBodyState(),
      error: message,
    }
  }
}
