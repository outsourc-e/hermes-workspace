import { describe, expect, it } from 'vitest'
import { createWorkspacePacket } from './factory'
import {
  canRetryDelivery,
  createDeliveryOutcomeReconciliation,
  verifyDeliveryReadbackRefsForRun,
} from './delivery-reconciliation'
import {
  validDeliveryReadbackPayloadFixture as validDeliveryReadbackPayload,
  validDeliveryRequestPayloadFixture as validDeliveryRequestPayload,
} from './test-fixtures'

function requestPacket() {
  return createWorkspacePacket({
    packetId: 'packet-delivery-request-1', packetLineageId: 'lineage-delivery-request-1',
    createdAt: '2026-07-19T08:00:00.000Z', runId: 'run-delivery-1', schemaVersion: '1.0.0', packetType: 'delivery-request',
    from: { roomId: 'olympus-command', agentId: 'hermes' }, to: { roomId: 'merchant-harbor', agentId: 'delivery-worker' },
    sourceRefs: ['packet-plan-delivery-1', 'artifact://message/status-1'], evidenceRefs: [], assumptions: [], missingFields: [], lockedActions: ['send_message'],
    approval: { required: true, stage: 'send', grantId: 'grant-delivery-1' },
    acceptanceCriteria: [{ criterionId: 'delivery-confirmed', description: 'Read back exact delivery.', required: true }],
    idempotencyKey: 'delivery-request:1', payload: validDeliveryRequestPayload(),
  })
}

function readbackPacket(status: 'confirmed_delivered' | 'unknown_outcome' = 'confirmed_delivered') {
  const request = requestPacket()
  const valid = validDeliveryReadbackPayload(request)
  return createWorkspacePacket({
    packetId: `packet-delivery-readback-${status}`, packetLineageId: `lineage-delivery-readback-${status}`,
    createdAt: '2026-07-19T08:00:10.000Z', runId: request.runId, schemaVersion: '1.0.0', packetType: 'delivery-readback',
    from: request.to, to: request.from, sourceRefs: [request.packetId], evidenceRefs: valid.evidenceRefs,
    assumptions: [], missingFields: [], lockedActions: status === 'unknown_outcome' ? ['delivery.retry'] : [],
    approval: { required: false, stage: null, grantId: null },
    acceptanceCriteria: [{ criterionId: 'readback-bound', description: 'Bind exact request.', required: true }],
    idempotencyKey: `delivery-readback:${status}`,
    payload: status === 'confirmed_delivered' ? valid : {
      ...valid,
      status,
      externalHandle: null,
      authoritativeReadbackRef: null,
      retryLock: true,
    },
  })
}

describe('Delivery reconciliation', () => {
  it('blocks retry for unknown_outcome until authoritative absence is reconciled', () => {
    const readback = readbackPacket('unknown_outcome')
    expect(canRetryDelivery(readback, [])).toBe(false)
    const absent = createDeliveryOutcomeReconciliation(readback, {
      reconciliationId: 'reconciliation-absent-1',
      conclusion: 'confirmed_absent',
      observedAt: '2026-07-19T08:01:00.000Z',
      authoritativeReadbackRef: 'discord://channel-123/query-at-0801',
      externalHandle: null,
      evidenceRefs: ['evidence://discord-absence-query'],
    })
    expect(canRetryDelivery(readback, [absent])).toBe(true)
  })

  it('keeps retry locked when reconciliation discovers a delivered side effect', () => {
    const readback = readbackPacket('unknown_outcome')
    const delivered = createDeliveryOutcomeReconciliation(readback, {
      reconciliationId: 'reconciliation-delivered-1',
      conclusion: 'confirmed_delivered',
      observedAt: '2026-07-19T08:01:00.000Z',
      authoritativeReadbackRef: 'discord://channel-123/message-789',
      externalHandle: 'discord-message-789',
      evidenceRefs: ['evidence://discord-message-789'],
    })
    expect(canRetryDelivery(readback, [delivered])).toBe(false)
    expect(() => canRetryDelivery(readback, [delivered, { ...delivered, reconciliationId: 'conflict', conclusion: 'confirmed_absent', externalHandle: null }])).toThrow(/conflict/i)
  })

  it('rejects fake IDs, unknown outcomes and unbound request/readback pairs as completion proof', () => {
    const request = requestPacket()
    const delivered = readbackPacket('confirmed_delivered')
    const unknown = readbackPacket('unknown_outcome')
    expect(verifyDeliveryReadbackRefsForRun('run-delivery-1', ['fake-readback'], [request, delivered], [request.packetId, delivered.packetId])).toContain('deliveryReadback:fake-readback')
    expect(verifyDeliveryReadbackRefsForRun('run-delivery-1', [unknown.packetId], [request, unknown], [request.packetId, unknown.packetId])).toContain(`deliveryReadback:notConfirmed:${unknown.packetId}`)
    expect(verifyDeliveryReadbackRefsForRun('run-delivery-1', [delivered.packetId], [request, delivered], [request.packetId, delivered.packetId])).toEqual([])
    expect(verifyDeliveryReadbackRefsForRun('run-delivery-1', [delivered.packetId], [request, delivered], [delivered.packetId])).toContain(`deliveryRequest:notActive:${request.packetId}`)
  })
})
