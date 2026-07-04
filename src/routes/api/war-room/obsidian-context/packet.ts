import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {   livingV3RoomById, livingV3StationById } from '../../../../lib/war-room/living-v3/living-v3-contract'
import {
  WORKSPACE_KERNEL_SAFETY,
  applyWorkspaceKernelEventIngress,
  buildKernelAgentDisplayStates,
} from '../../../../lib/workspace-kernel'
import { workspaceKernelEventIngressFromObsidianContextPacket } from '../../../../lib/workspace-kernel/adapters/obsidian-context-ingress'
import { buildObsidianContextPacket } from '../../../../lib/workspace-kernel/obsidian-context'
import {
  loadWorkspaceKernelState,
  prepareWorkspaceKernelPersistedState,
  saveWorkspaceKernelState,
} from '../../../../lib/workspace-kernel/store'
import { isAuthenticated } from '../../../../server/auth-middleware'
import type {LivingV3RoomId, LivingV3StationId} from '../../../../lib/war-room/living-v3/living-v3-contract';

const noStoreHeaders = { 'cache-control': 'no-store' }

type ObsidianContextPacketRequestBody = {
  mission?: unknown
  targetRoomId?: unknown
  targetStationId?: unknown
  mode?: unknown
}

function bodyObject(body: unknown): ObsidianContextPacketRequestBody {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as ObsidianContextPacketRequestBody : {}
}

function safeString(value: unknown, max = 8_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeTarget(body: ObsidianContextPacketRequestBody) {
  const mode = safeString(body.mode, 40)
  const requestedRoomId = safeString(body.targetRoomId, 120)
  const roomId = requestedRoomId && livingV3RoomById(requestedRoomId as LivingV3RoomId)
    ? requestedRoomId as LivingV3RoomId
    : mode === 'command-room'
      ? 'olympus-command'
      : 'etsy-market-lab'
  const requestedStationId = safeString(body.targetStationId, 120)
  const station = requestedStationId ? livingV3StationById(requestedStationId as LivingV3StationId) : null
  const stationId = station && station.roomId === roomId
    ? station.id
    : roomId === 'etsy-market-lab'
      ? 'etsy-loki-product-hunt'
      : roomId === 'olympus-command'
        ? 'mission-router'
        : undefined
  return { roomId, stationId }
}

export const Route = createFileRoute('/api/war-room/obsidian-context/packet')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        let rawBody: unknown
        try {
          rawBody = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: noStoreHeaders })
        }

        const body = bodyObject(rawBody)
        const nowMs = Date.now()
        const target = safeTarget(body)
        const packet = await buildObsidianContextPacket({
          mission: safeString(body.mission, 1_200) || 'Attach scoped Obsidian context to the local Etsy workspace.',
          targetRoomId: target.roomId,
          targetStationId: target.stationId,
          nowMs,
        })
        const ingress = workspaceKernelEventIngressFromObsidianContextPacket(packet)
        const previous = await loadWorkspaceKernelState()
        const result = applyWorkspaceKernelEventIngress(ingress, previous, nowMs + 2)
        if (!result.ok) {
          const lockedActions = [...new Set([...result.lockedActions, ...packet.forbiddenActions])]
          return json({
            ok: false,
            packet,
            state: previous,
            stateVersion: previous.stateVersion,
            result,
            displayStates: buildKernelAgentDisplayStates(previous),
            localOnly: true,
            usageAllowed: false,
            workerSpawnAllowed: false,
            externalRequestsAllowed: false,
            liveActionsAllowed: false,
            writebackAllowed: false,
            lockedActions,
            safety: WORKSPACE_KERNEL_SAFETY,
            error: result.reason,
          }, { status: 400, headers: noStoreHeaders })
        }

        const nextState = prepareWorkspaceKernelPersistedState({
          previous,
          runs: result.state.runs,
          events: result.state.events,
          telemetry: result.telemetry,
        }, nowMs + 4)
        const saved = await saveWorkspaceKernelState(nextState, { nowMs: nowMs + 5 })
        const savedResult = { ...result, state: saved }
        const lockedActions = [...new Set([...savedResult.lockedActions, ...packet.forbiddenActions])]

        return json({
          ok: true,
          packet,
          state: saved,
          stateVersion: saved.stateVersion,
          result: savedResult,
          event: savedResult.event,
          run: savedResult.run,
          telemetry: savedResult.telemetry,
          displayStates: buildKernelAgentDisplayStates(saved),
          localOnly: true,
          usageAllowed: false,
          workerSpawnAllowed: false,
          externalRequestsAllowed: false,
          liveActionsAllowed: false,
          writebackAllowed: false,
          lockedActions,
          safety: WORKSPACE_KERNEL_SAFETY,
        }, { headers: noStoreHeaders })
      },
    },
  },
})
