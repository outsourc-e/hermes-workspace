import { z } from 'zod'
import { getOracleLocalAluraSearch } from '../../../server/oracle-alura-local-search'
import {


  createOracleSignalPacket
} from '../living-v3/oracle-alura'
import { appendWarRoomEvent, listWarRoomEvents } from './event-store'
import {
  createWarRoomTask,
  dispatchWarRoomIntent,
  getWarRoomBodyState,
  requestWarRoomApproval,
} from './runtime'
import {
  freezeWarRoomAgents,
  getAgentConnectionState,
  setWarRoomAgentsLocalOnly,
} from './agent-connection-control'
import type {OracleAluraSearchResult, OracleSignalPacket} from '../living-v3/oracle-alura';
import type { AgentConnectionState } from './agent-connection-control'
import type { WarRoomBodyState, WarRoomEvent } from './domain'

export const RUN_ORACLE_SCOUT_LOCAL_INTENT_TYPE = 'run_oracle_scout_local' as const

const OptionalTextSchema = z.string().trim().min(1).max(240).optional()

export const RunOracleScoutLocalIntentSchema = z.object({
  type: z.literal(RUN_ORACLE_SCOUT_LOCAL_INTENT_TYPE),
  query: OptionalTextSchema,
  limit: z.number().int().min(1).max(12).optional(),
  runId: OptionalTextSchema,
  correlationId: OptionalTextSchema,
}).strict()

export type RunOracleScoutLocalIntent = z.infer<typeof RunOracleScoutLocalIntentSchema>

export type WarRoomIntentApiPayload = RunOracleScoutLocalIntent

export type OracleScoutLocalBridgeResult = {
  ok: boolean
  runId: string
  correlationId: string
  query: string
  sourceMode: 'alura_only'
  signalPacket?: OracleSignalPacket
  search?: OracleAluraSearchResult
  events: Array<WarRoomEvent>
  control: AgentConnectionState
  state: WarRoomBodyState
  error?: string
}

export function parseWarRoomIntentApiPayload(payload: unknown) {
  return RunOracleScoutLocalIntentSchema.safeParse(payload)
}

function bridgeRunId() {
  return `oracle-scout-local-${Date.now().toString(36)}`
}

function appendBridgeEvent(event: Parameters<typeof appendWarRoomEvent>[0]) {
  return appendWarRoomEvent({
    source: 'dispatcher',
    ...event,
  })
}

function latestRunEvents(runId: string) {
  return listWarRoomEvents().filter((event) => event.runId === runId)
}

export function runOracleScoutLocalBridge(input: RunOracleScoutLocalIntent & { baseDir?: string; nowMs?: number }): Promise<OracleScoutLocalBridgeResult> {
  const runId = input.runId ?? bridgeRunId()
  const correlationId = input.correlationId ?? `${runId}-oracle-local-alura`
  const query = input.query?.trim() || 'gold initial necklace'
  const limit = input.limit ?? 8
  let clock = input.nowMs ?? Date.now()
  const tick = () => {
    clock += 1
    return clock
  }
  let search: OracleAluraSearchResult | undefined
  let signalPacket: OracleSignalPacket | undefined

  try {
    setWarRoomAgentsLocalOnly({
      reason: 'Oracle Scout local event bridge started; workers and usage remain blocked.',
      updatedBy: 'ui',
      runId,
    }, tick())

    appendBridgeEvent({
      type: 'agent.move.started',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      runId,
      correlationId,
      status: 'in_progress',
      createdAtMs: tick(),
      payload: { label: 'Oracle Scout moving to local signal basin' },
    })
    dispatchWarRoomIntent({
      type: 'move_to_station',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      source: 'dispatcher',
      runId,
      correlationId: `${correlationId}-move`,
    }, tick())

    const task = createWarRoomTask({
      taskId: `${runId}-task`,
      label: `Oracle local Alura cache search: ${query}`,
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      assignedAgentId: 'oracle',
      runId,
      correlationId,
      source: 'dispatcher',
    }, tick())

    appendBridgeEvent({
      type: 'agent.work.started',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      runId,
      correlationId,
      status: 'in_progress',
      createdAtMs: tick(),
      payload: { label: 'Oracle Scout reading local Alura cache' },
    })
    dispatchWarRoomIntent({
      type: 'work_at_station',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      source: 'dispatcher',
      runId,
      correlationId: `${correlationId}-work`,
    }, tick())

    appendBridgeEvent({
      type: 'oracle.local_alura_search.started',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      runId,
      correlationId,
      status: 'in_progress',
      createdAtMs: tick(),
      payload: { query, sourceMode: 'alura_only' },
    })

    search = getOracleLocalAluraSearch({
      q: query,
      limit,
      sourceMode: 'alura_only',
      baseDir: input.baseDir,
    })
    const topKeyword = search.keywordResults.at(0)
    if (!search.ok || !topKeyword) {
      throw new Error(search.error ?? 'Oracle local Alura search found no local cache match.')
    }
    signalPacket = createOracleSignalPacket(search, topKeyword, tick())

    appendBridgeEvent({
      type: 'oracle.local_alura_search.completed',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      runId,
      correlationId,
      status: 'completed',
      createdAtMs: tick(),
      payload: {
        query,
        sourceMode: 'alura_only',
        sourceFilesUsed: search.sourceFilesUsed,
        keywordResults: search.keywordResults.length,
        listingResults: search.listingResults.length,
        selectedKeyword: topKeyword.keyword,
        missingFields: topKeyword.missingFields,
      },
    })

    appendBridgeEvent({
      type: 'packet.created',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      packetId: signalPacket.packetId,
      runId,
      correlationId,
      status: 'completed',
      createdAtMs: tick(),
      payload: { signalPacket },
    })
    appendBridgeEvent({
      type: 'packet.sent',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      packetId: signalPacket.packetId,
      runId,
      correlationId,
      status: 'completed',
      createdAtMs: tick(),
      payload: {
        fromRoomId: 'oracle-signals',
        fromStationId: 'oracle-signal-basin',
        toRoomId: 'etsy-market-lab',
        toStationId: 'etsy-loki-product-hunt',
        signalPacket,
      },
    })
    appendBridgeEvent({
      type: 'etsy.signal.received',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      packetId: signalPacket.packetId,
      runId,
      correlationId,
      status: 'completed',
      createdAtMs: tick(),
      payload: {
        fromRoomId: 'oracle-signals',
        signalPacket,
        readback: `Etsy Market Lab received Oracle signal: ${signalPacket.selectedKeyword}`,
      },
    })

    requestWarRoomApproval({
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      reason: `Oracle Scout created a local Alura signal for "${signalPacket.selectedKeyword}". Review before any downstream live action.`,
      evidence: signalPacket.evidenceIds.slice(0, 8).map((evidenceId) => ({
        evidenceId,
        label: evidenceId,
        kind: 'metric',
      })),
      riskLevel: 'low',
      requestedAction: 'Review local Oracle signal packet',
      allowedAction: 'Use local signal in Etsy Market Lab only',
      lockedAction: 'Live Alura/Etsy/Ali/Sheets/ShotLab/worker usage',
      source: 'dispatcher',
      runId,
      correlationId,
    }, tick())

    appendBridgeEvent({
      type: 'agent.work.completed',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      taskId: task.taskId,
      runId,
      correlationId,
      status: 'completed',
      createdAtMs: tick(),
      payload: {
        label: 'Oracle Scout completed local-only signal bridge',
        packetId: signalPacket.packetId,
      },
    })

    freezeWarRoomAgents({
      reason: 'Oracle Scout local bridge finished; agents frozen fail-closed.',
      updatedBy: 'system',
      runId,
    }, tick())

    return Promise.resolve({
      ok: true,
      runId,
      correlationId,
      query,
      sourceMode: 'alura_only',
      signalPacket,
      search,
      events: latestRunEvents(runId),
      control: getAgentConnectionState(),
      state: getWarRoomBodyState(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendBridgeEvent({
      type: 'run.failed',
      agentId: 'oracle',
      roomId: 'oracle-signals',
      stationId: 'oracle-signal-basin',
      runId,
      correlationId,
      status: 'failed',
      error: message,
      createdAtMs: tick(),
      payload: { query, sourceMode: 'alura_only', error: message },
    })
    freezeWarRoomAgents({
      reason: 'Oracle Scout local bridge failed; agents frozen fail-closed.',
      updatedBy: 'system',
      runId,
    }, tick())

    return Promise.resolve({
      ok: false,
      runId,
      correlationId,
      query,
      sourceMode: 'alura_only',
      search,
      events: latestRunEvents(runId),
      control: getAgentConnectionState(),
      state: getWarRoomBodyState(),
      error: message,
    })
  }
}
