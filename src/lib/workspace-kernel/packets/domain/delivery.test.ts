import { describe, expect, it } from 'vitest'
import { createWorkspacePacket } from '../factory'
import {
  DeliveryReadbackPayloadSchema,
  DeliveryRequestPayloadSchema,
  validateDeliveryReadbackAgainstRequest,
} from './delivery'
import type { UniversalPacketEnvelope } from '../types'

export function validDeliveryRequestPayload() {
  return {
    contractVersion: 'delivery-request-v1' as const,
    executionPlanPacketId: 'packet-plan-delivery-1',
    stepId: 'step-deliver-discord',
    requestId: 'delivery-request-1',
    destination: {
      channel: 'discord' as const,
      targetId: 'channel-123',
      addressLabel: '#workspace',
    },
    account: {
      system: 'discord',
      accountId: 'hermes-bot',
    },
    action: {
      actionId: 'action-send-status',
      actionType: 'send_message',
      contentRef: 'artifact://message/status-1',
      contentHash: 'a'.repeat(64),
    },
    approvalGrantId: 'grant-delivery-1',
    batch: null,
    deliveryLocked: true as const,
  }
}

function requestPacket() {
  return createWorkspacePacket({
    packetId: 'packet-delivery-request-1',
    packetLineageId: 'lineage-delivery-request-1',
    createdAt: '2026-07-19T08:00:00.000Z',
    runId: 'run-delivery-1',
    schemaVersion: '1.0.0',
    packetType: 'delivery-request',
    from: { roomId: 'olympus-command', agentId: 'hermes' },
    to: { roomId: 'merchant-harbor', agentId: 'delivery-worker' },
    sourceRefs: ['packet-plan-delivery-1', 'artifact://message/status-1'],
    evidenceRefs: [], assumptions: [], missingFields: [],
    lockedActions: ['send_message'],
    approval: { required: true, stage: 'send', grantId: 'grant-delivery-1' },
    acceptanceCriteria: [{ criterionId: 'delivery-confirmed', description: 'Read back exact delivery.', required: true }],
    idempotencyKey: 'delivery-request:1',
    payload: validDeliveryRequestPayload(),
  })
}

export function validDeliveryReadbackPayload(
  packet: Pick<UniversalPacketEnvelope, 'packetId' | 'contentHash'> = requestPacket(),
) {
  const request = validDeliveryRequestPayload()
  return {
    contractVersion: 'delivery-readback-v1' as const,
    deliveryRequestPacketId: packet.packetId,
    deliveryRequestContentHash: packet.contentHash,
    requestId: request.requestId,
    destination: request.destination,
    account: request.account,
    action: request.action,
    status: 'confirmed_delivered' as const,
    externalHandle: 'discord-message-456',
    authoritativeReadbackRef: 'discord://channel-123/message-456',
    evidenceRefs: ['evidence://discord-readback-456'],
    observedAt: '2026-07-19T08:00:10.000Z',
    retryLock: true,
  }
}

describe('Delivery request/readback contracts', () => {
  it('binds one destination, account and action to exact request Packet content', () => {
    const request = requestPacket()
    expect(DeliveryRequestPayloadSchema.parse(request.payload)).toEqual(validDeliveryRequestPayload())
    expect(validateDeliveryReadbackAgainstRequest(validDeliveryReadbackPayload(request), request).status).toBe('confirmed_delivered')
  })

  it('rejects destination, account, action or request hash drift', () => {
    const request = requestPacket()
    const readback = validDeliveryReadbackPayload(request)
    expect(() => validateDeliveryReadbackAgainstRequest({
      ...readback,
      destination: { ...readback.destination, targetId: 'channel-other' },
    }, request)).toThrow(/match|bind/i)
    expect(() => validateDeliveryReadbackAgainstRequest({
      ...readback,
      deliveryRequestContentHash: 'f'.repeat(64),
    }, request)).toThrow(/hash/i)
  })

  it('requires positive authoritative proof for confirmed delivery', () => {
    const readback = validDeliveryReadbackPayload()
    expect(DeliveryReadbackPayloadSchema.safeParse({
      ...readback,
      externalHandle: null,
      authoritativeReadbackRef: null,
      evidenceRefs: [],
    }).success).toBe(false)
  })

  it('forces unknown_outcome to retain the retry lock', () => {
    const readback = validDeliveryReadbackPayload()
    expect(DeliveryReadbackPayloadSchema.safeParse({
      ...readback,
      status: 'unknown_outcome',
      externalHandle: null,
      authoritativeReadbackRef: null,
      retryLock: true,
    }).success).toBe(true)
    expect(DeliveryReadbackPayloadSchema.safeParse({
      ...readback,
      status: 'unknown_outcome',
      externalHandle: null,
      authoritativeReadbackRef: null,
      retryLock: false,
    }).success).toBe(false)
  })
})
