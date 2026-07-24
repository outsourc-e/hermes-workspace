import { livingV3AgentById } from '../living-v3/living-v3-contract'
import { capabilityForIntentType, listWarRoomCapabilities } from './capabilities'
import { getAgentConnectionState } from './agent-connection-control'
import { appendWarRoomEvent } from './event-store'
import { DEFAULT_SAFETY_LOCKS } from './safety'
import type {
  AgentIntent,
  SafetyLock,
  WarRoomAgentId,
  WarRoomCorrelationId,
  WarRoomEventSource,
  WarRoomRunId,
} from './domain'

export type WarRoomUsageGuardInput = {
  agentId?: WarRoomAgentId
  intentType?: AgentIntent['type']
  requestedAction: string
  runId?: WarRoomRunId
  correlationId?: WarRoomCorrelationId
  source?: WarRoomEventSource
  explicitOperatorApproval?: boolean
  requiredCapability?: ReturnType<typeof capabilityForIntentType>
}

export type WarRoomUsageGuardResult =
  | { ok: true; safetyLocks: SafetyLock }
  | { ok: false; reason: string; blockedAction: string; safetyLocks: SafetyLock }

const LIVE_ACTION_PATTERN = /\b(etsy|supplier|paid|discord|purchase|publish|account|delete|external|live|send\s+message|message\s+supplier|buy|checkout|charge|generation)\b/i

function appendUsageBlockedEvent(input: WarRoomUsageGuardInput, reason: string, blockedAction: string) {
  appendWarRoomEvent({
    type: 'agent.connection.blocked',
    createdAtMs: Date.now(),
    agentId: input.agentId,
    source: input.source ?? 'dispatcher',
    status: 'blocked',
    runId: input.runId,
    correlationId: input.correlationId,
    payload: {
      reason,
      blockedAction,
      intentType: input.intentType,
      requestedAction: input.requestedAction,
      safetyLocks: DEFAULT_SAFETY_LOCKS,
    },
  })
}

function block(input: WarRoomUsageGuardInput, reason: string): WarRoomUsageGuardResult {
  const blockedAction = input.requestedAction
  appendUsageBlockedEvent(input, reason, blockedAction)
  return { ok: false, reason, blockedAction, safetyLocks: DEFAULT_SAFETY_LOCKS }
}

export function assertWarRoomUsageAllowed(input: WarRoomUsageGuardInput): WarRoomUsageGuardResult {
  const action = input.requestedAction.trim()
  if (!action) {
    return block(input, 'Missing requestedAction for usage-consuming dispatch.')
  }

  const state = getAgentConnectionState()
  if (state.frozen || state.mode === 'frozen') {
    return block(input, state.reason || 'Agents are frozen; worker usage is blocked.')
  }
  if (!state.usageAllowed) {
    return block(input, `Agent connection mode ${state.mode} does not allow usage-consuming worker dispatch.`)
  }
  if (!input.runId || !input.correlationId) {
    return block(input, 'Usage-consuming dispatch requires runId and correlationId.')
  }
  if (LIVE_ACTION_PATTERN.test(action)) {
    return block(input, 'Live/external action keywords are blocked by the War Room safety spine.')
  }
  if (!input.explicitOperatorApproval) {
    return block(input, 'Usage-consuming dispatch requires explicit local operator approval.')
  }

  if (input.agentId && input.intentType) {
    const agent = livingV3AgentById(input.agentId)
    if (!agent) {
      return block(input, `Unknown agentId: ${input.agentId}`)
    }
    const required = input.requiredCapability ?? capabilityForIntentType(input.intentType)
    const capabilities = listWarRoomCapabilities()[input.agentId]
    if (!capabilities.includes(required)) {
      return block(input, `${agent.label} cannot perform ${required}.`)
    }
  }

  return { ok: true, safetyLocks: DEFAULT_SAFETY_LOCKS }
}
