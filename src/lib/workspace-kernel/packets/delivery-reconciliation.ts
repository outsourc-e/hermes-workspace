import { z } from 'zod'
import { workspacePacketContentHash } from './canonical-json'
import {
  DeliveryReadbackPayloadSchema,
  validateDeliveryReadbackAgainstRequest,
} from './domain/delivery'
import type { UniversalPacketEnvelope } from './types'

const IdSchema = z.string().trim().min(1).max(256)
const RefSchema = z.string().trim().min(1).max(2_048)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const TimestampSchema = z.string().datetime({ offset: true })

export const DeliveryOutcomeReconciliationSchema = z.object({
  reconciliationId: IdSchema,
  deliveryReadbackPacketId: IdSchema,
  deliveryReadbackContentHash: Sha256Schema,
  deliveryRequestPacketId: IdSchema,
  requestId: IdSchema,
  conclusion: z.enum(['confirmed_delivered', 'confirmed_absent']),
  observedAt: TimestampSchema,
  authoritativeReadbackRef: RefSchema,
  externalHandle: IdSchema.nullable(),
  evidenceRefs: z.array(RefSchema).min(1).max(100),
}).strict().superRefine((record, context) => {
  if (record.conclusion === 'confirmed_delivered' && record.externalHandle === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['externalHandle'], message: 'Reconciled delivery requires the discovered external handle.' })
  }
  if (record.conclusion === 'confirmed_absent' && record.externalHandle !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['externalHandle'], message: 'Reconciled absence cannot contain a delivery handle.' })
  }
})

export type DeliveryOutcomeReconciliation = z.infer<typeof DeliveryOutcomeReconciliationSchema>
export type DeliveryOutcomeReconciliationInput = Pick<
  DeliveryOutcomeReconciliation,
  'reconciliationId' | 'conclusion' | 'observedAt' | 'authoritativeReadbackRef' | 'externalHandle' | 'evidenceRefs'
>

function parseReadbackPacket(packet: UniversalPacketEnvelope) {
  if (packet.packetType !== 'delivery-readback') throw new Error('Reconciliation requires a DeliveryReadback Packet.')
  if (workspacePacketContentHash(packet) !== packet.contentHash) throw new Error('DeliveryReadback Packet content hash is invalid.')
  return DeliveryReadbackPayloadSchema.parse(packet.payload)
}

export function createDeliveryOutcomeReconciliation(
  readbackPacket: UniversalPacketEnvelope,
  input: DeliveryOutcomeReconciliationInput,
): DeliveryOutcomeReconciliation {
  const readback = parseReadbackPacket(readbackPacket)
  if (readback.status !== 'unknown_outcome') throw new Error('Only unknown_outcome requires delivery reconciliation.')
  return DeliveryOutcomeReconciliationSchema.parse({
    ...input,
    deliveryReadbackPacketId: readbackPacket.packetId,
    deliveryReadbackContentHash: readbackPacket.contentHash,
    deliveryRequestPacketId: readback.deliveryRequestPacketId,
    requestId: readback.requestId,
  })
}

export function canRetryDelivery(
  readbackPacket: UniversalPacketEnvelope,
  reconciliations: ReadonlyArray<DeliveryOutcomeReconciliation>,
) {
  const readback = parseReadbackPacket(readbackPacket)
  if (readback.status === 'confirmed_delivered') return false
  if (readback.status === 'confirmed_absent' || readback.status === 'failed') return true
  const matching = reconciliations
    .map((record) => DeliveryOutcomeReconciliationSchema.parse(record))
    .filter((record) => (
      record.deliveryReadbackPacketId === readbackPacket.packetId
      && record.deliveryReadbackContentHash === readbackPacket.contentHash
    ))
  if (matching.length === 0) return false
  if (matching.length !== 1) throw new Error('Conflicting delivery reconciliation records block retry.')
  return matching[0].conclusion === 'confirmed_absent'
}

export function verifyDeliveryReadbackRefsForRun(
  runId: string,
  deliveryReadbackRefs: ReadonlyArray<string>,
  packets: ReadonlyArray<UniversalPacketEnvelope>,
  activePacketIds: ReadonlyArray<string>,
) {
  const missing: Array<string> = []
  const active = new Set(activePacketIds)
  const packetById = new Map(packets.map((packet) => [packet.packetId, packet]))
  if (new Set(deliveryReadbackRefs).size !== deliveryReadbackRefs.length) {
    missing.push('deliveryReadback:duplicateRef')
  }
  for (const ref of deliveryReadbackRefs) {
    if (!active.has(ref)) missing.push(`deliveryReadback:notActive:${ref}`)
  }
  for (const readbackId of deliveryReadbackRefs) {
    const readbackPacket = packetById.get(readbackId)
    if (!readbackPacket || readbackPacket.packetType !== 'delivery-readback' || readbackPacket.runId !== runId) {
      missing.push(`deliveryReadback:${readbackId}`)
      continue
    }
    try {
      if (workspacePacketContentHash(readbackPacket) !== readbackPacket.contentHash) throw new Error('readback hash')
      const readback = DeliveryReadbackPayloadSchema.parse(readbackPacket.payload)
      if (readback.status !== 'confirmed_delivered') {
        missing.push(`deliveryReadback:notConfirmed:${readbackId}`)
        continue
      }
      const requestPacket = packetById.get(readback.deliveryRequestPacketId)
      if (!requestPacket || requestPacket.runId !== runId) {
        missing.push(`deliveryRequest:${readback.deliveryRequestPacketId}`)
        continue
      }
      if (!active.has(requestPacket.packetId)) {
        missing.push(`deliveryRequest:notActive:${requestPacket.packetId}`)
        continue
      }
      validateDeliveryReadbackAgainstRequest(readback, requestPacket)
    } catch {
      missing.push(`deliveryReadback:invalid:${readbackId}`)
    }
  }
  return [...new Set(missing)]
}
