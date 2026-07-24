import { livingV3TravelDurationForDistance } from './character-animation-timing'
import {
  LIVING_V3_WORLD_CONFIG,






  livingV3AgentById,
  livingV3RoomById,
  livingV3StationById
} from './living-v3-contract'
import { livingV3NavigationRouteDistance } from './living-v3-navigation'
import type {LivingV3AgentActivity, LivingV3AgentId, LivingV3BadgeKind, LivingV3Point, LivingV3RoomId, LivingV3StationId} from './living-v3-contract';

export type LivingV3TaskKind = 'work' | 'approval' | 'move' | 'rest' | 'roam' | 'talk'

export type LivingV3TaskIntent = {
  id: string
  agentId: LivingV3AgentId
  kind: LivingV3TaskKind
  label: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  from: { roomId: LivingV3RoomId; point: LivingV3Point }
  target: LivingV3Point
  createdAtMs: number
  travelDurationMs: number
  holdDurationMs: number
  badge: LivingV3BadgeKind
  packetLabel?: string | null
}

export type LivingV3Alert = {
  id: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  agentId?: LivingV3AgentId
  badge: LivingV3BadgeKind
  label: string
  createdAtMs: number
}

export type LivingV3ApprovalPacket = {
  id: string
  agentId: LivingV3AgentId
  stationId: LivingV3StationId
  label: string
  createdAtMs: number
  status: 'local-only' | 'waiting-operator'
}

export type LivingV3HermesAdapterState = {
  epochMs: number
  tasks: Array<LivingV3TaskIntent>
  alerts: Array<LivingV3Alert>
  approvals: Array<LivingV3ApprovalPacket>
}

type AssignTaskInput = {
  agentId: LivingV3AgentId
  kind: LivingV3TaskKind
  label: string
  roomId: LivingV3RoomId
  stationId?: LivingV3StationId
  from?: { roomId: LivingV3RoomId; point: LivingV3Point }
  target?: LivingV3Point
  badge?: LivingV3BadgeKind
  packetLabel?: string | null
}

type SetAgentStateInput = {
  agentId: LivingV3AgentId
  activity: Exclude<LivingV3AgentActivity, 'walking' | 'carrying'>
  label?: string
  roomId?: LivingV3RoomId
  point?: LivingV3Point
  stationId?: LivingV3StationId
}

function homeFor(agentId: LivingV3AgentId) {
  const agent = livingV3AgentById(agentId)
  if (!agent) throw new Error(`Unknown Living V3 agent: ${agentId}`)
  return agent.home
}

function targetFor(input: AssignTaskInput) {
  if (input.target) return input.target
  if (input.stationId) {
    const station = livingV3StationById(input.stationId)
    if (!station) throw new Error(`Unknown Living V3 station: ${input.stationId}`)
    return station.operatorSpot
  }
  return homeFor(input.agentId).point
}

function roomForStation(stationId: LivingV3StationId | undefined, fallback: LivingV3RoomId) {
  if (!stationId) return fallback
  return livingV3StationById(stationId)?.roomId ?? fallback
}

function durationFor(from: { roomId: LivingV3RoomId; point: LivingV3Point }, to: { roomId: LivingV3RoomId; point: LivingV3Point }) {
  const distance = livingV3NavigationRouteDistance(from, to)
  return livingV3TravelDurationForDistance(distance, { minMs: 1_400, maxMs: 18_000 })
}

export function assignLivingV3Task(state: LivingV3HermesAdapterState, input: AssignTaskInput, nowMs = Date.now()): LivingV3HermesAdapterState {
  const from = input.from ?? homeFor(input.agentId)
  const roomId = roomForStation(input.stationId, input.roomId)
  const target = targetFor({ ...input, roomId })
  const travelDurationMs = durationFor(from, { roomId, point: target })
  const task: LivingV3TaskIntent = {
    id: `${input.agentId}-${input.kind}-${nowMs}`,
    agentId: input.agentId,
    kind: input.kind,
    label: input.label,
    roomId,
    stationId: input.stationId,
    from,
    target,
    createdAtMs: nowMs,
    travelDurationMs,
    holdDurationMs: input.kind === 'rest' ? 90_000 : input.kind === 'roam' ? 14_000 : 60_000,
    badge: input.badge ?? (input.kind === 'approval' ? 'approval' : input.kind === 'rest' ? 'sleeping' : 'active-task'),
    packetLabel: input.packetLabel ?? null,
  }

  return {
    ...state,
    tasks: [...state.tasks.filter((candidate) => candidate.agentId !== input.agentId), task],
  }
}

export function moveLivingV3AgentToRoom(
  state: LivingV3HermesAdapterState,
  agentId: LivingV3AgentId,
  roomId: LivingV3RoomId,
  nowMs = Date.now(),
) {
  const room = livingV3RoomById(roomId)
  const target = roomId === 'pantheon-quarters' ? { x: 48, y: 68 } : { x: 50, y: 68 }
  return assignLivingV3Task(state, {
    agentId,
    kind: roomId === 'pantheon-quarters' ? 'rest' : 'move',
    label: room ? `Move to ${room.label}` : `Move to ${roomId}`,
    roomId,
    target,
    badge: roomId === 'pantheon-quarters' ? 'sleeping' : 'idle',
  }, nowMs)
}

export function setLivingV3AgentState(
  state: LivingV3HermesAdapterState,
  input: SetAgentStateInput,
  nowMs = Date.now(),
): LivingV3HermesAdapterState {
  if (input.activity === 'idle') {
    return {
      ...state,
      tasks: state.tasks.filter((task) => task.agentId !== input.agentId),
    }
  }

  const home = homeFor(input.agentId)
  const roomId = input.roomId ?? roomForStation(input.stationId, home.roomId)
  const target = input.point ?? (input.stationId ? livingV3StationById(input.stationId)?.operatorSpot : home.point) ?? home.point
  const kind: LivingV3TaskKind = input.activity === 'sleeping' ? 'rest' : input.activity === 'waiting-approval' ? 'approval' : 'work'
  const badge: LivingV3BadgeKind = input.activity === 'sleeping' ? 'sleeping' : input.activity === 'waiting-approval' ? 'approval' : 'active-task'
  const task: LivingV3TaskIntent = {
    id: `${input.agentId}-state-${nowMs}`,
    agentId: input.agentId,
    kind,
    label: input.label ?? input.activity,
    roomId,
    stationId: input.stationId,
    from: { roomId, point: target },
    target,
    createdAtMs: nowMs,
    travelDurationMs: 1,
    holdDurationMs: input.activity === 'sleeping' ? 90_000 : 60_000,
    badge,
    packetLabel: null,
  }

  return {
    ...state,
    tasks: [...state.tasks.filter((candidate) => candidate.agentId !== input.agentId), task],
  }
}

export function raiseLivingV3Alert(
  state: LivingV3HermesAdapterState,
  input: Omit<LivingV3Alert, 'id' | 'createdAtMs'>,
  nowMs = Date.now(),
): LivingV3HermesAdapterState {
  return {
    ...state,
    alerts: [
      { ...input, id: `alert-${nowMs}`, createdAtMs: nowMs },
      ...state.alerts,
    ].slice(0, 12),
  }
}

export function createLivingV3ApprovalPacket(
  state: LivingV3HermesAdapterState,
  input: Omit<LivingV3ApprovalPacket, 'id' | 'createdAtMs' | 'status'>,
  nowMs = Date.now(),
): LivingV3HermesAdapterState {
  return {
    ...state,
    approvals: [
      { ...input, id: `approval-${nowMs}`, createdAtMs: nowMs, status: 'waiting-operator' as const },
      ...state.approvals,
    ].slice(0, 12),
  }
}

export function createInitialLivingV3HermesState(nowMs = Date.now()): LivingV3HermesAdapterState {
  let state: LivingV3HermesAdapterState = {
    epochMs: nowMs,
    tasks: [],
    alerts: [
      {
        id: 'alert-live-approval-lock',
        roomId: 'olympus-command',
        stationId: 'mission-router',
        agentId: 'hermes',
        badge: 'approval',
        label: 'Live external action gate locked',
        createdAtMs: nowMs,
      },
    ],
    approvals: [],
  }

  state = assignLivingV3Task(state, {
    agentId: 'heimdall',
    kind: 'work',
    label: 'Heimdall guards the shop-first product search gates',
    roomId: 'oracle-signals',
    stationId: 'oracle-signal-basin',
    badge: 'active-task',
    packetLabel: 'Shop-first gate',
  }, nowMs + 120)


  state = assignLivingV3Task(state, {
    agentId: 'terra',
    kind: 'work',
    label: 'Terra shapes 3D modeling and print-control surfaces',
    roomId: 'terra-forge',
    stationId: 'terra-modeling-studio',
    badge: 'active-task',
    packetLabel: '3D forge',
  }, nowMs + 150)

  state = assignLivingV3Task(state, {
    agentId: 'poseidon',
    kind: 'work',
    label: 'Poseidon audits DB and Obsidian catalog health in Atlantis Vault',
    roomId: 'atlantis-vault',
    stationId: 'atlantis-index',
    badge: 'active-task',
    packetLabel: 'Vault index',
  }, nowMs + 165)

  state = assignLivingV3Task(state, {
    agentId: 'loki',
    kind: 'work',
    label: 'Loki hunts product angles',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    badge: 'active-task',
    packetLabel: 'Loki search',
  }, nowMs + 180)
  state = assignLivingV3Task(state, {
    agentId: 'thor',
    kind: 'work',
    label: 'Thor forges local prep packets',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-thor-seo-metrics',
    badge: 'active-task',
    packetLabel: 'Thor forge',
  }, nowMs + 360)
  state = assignLivingV3Task(state, {
    agentId: 'odin',
    kind: 'approval',
    label: 'Odin holds the approval throne',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-odin-draft-approval',
    badge: 'approval',
    packetLabel: 'Odin approval',
  }, nowMs + 540)

  return createLivingV3ApprovalPacket(state, {
    agentId: 'hermes',
    stationId: 'mission-router',
    label: 'Live external actions remain locked',
  }, nowMs + 900)
}

export const livingV3HermesAdapter = {
  world: LIVING_V3_WORLD_CONFIG,
  assignTask: assignLivingV3Task,
  setAgentState: setLivingV3AgentState,
  moveAgentToRoom: moveLivingV3AgentToRoom,
  raiseAlert: raiseLivingV3Alert,
  createApprovalPacket: createLivingV3ApprovalPacket,
}
