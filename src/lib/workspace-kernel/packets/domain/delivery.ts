import { z } from 'zod'
import {
  canonicalizeWorkspacePacketContent,
  sha256Hex,
  workspacePacketContentHash,
} from '../canonical-json'
import type { UniversalPacketEnvelope } from '../types'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(2_048)
const RefSchema = z.string().trim().min(1).max(2_048)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const TimestampSchema = z.string().datetime({ offset: true })

export const DeliveryDestinationSchema = z.object({
  channel: z.enum(['email', 'discord', 'telegram', 'etsy', 'webhook', 'other']),
  targetId: IdSchema,
  addressLabel: TextSchema,
}).strict()

export const DeliveryAccountSchema = z.object({
  system: IdSchema,
  accountId: IdSchema,
}).strict()

export const DeliveryActionSchema = z.object({
  actionId: IdSchema,
  actionType: IdSchema,
  contentRef: RefSchema,
  contentHash: Sha256Schema,
}).strict()

export const DeliveryRequestPayloadSchema = z.object({
  contractVersion: z.literal('delivery-request-v1'),
  executionPlanPacketId: IdSchema,
  stepId: IdSchema,
  requestId: IdSchema,
  destination: DeliveryDestinationSchema,
  account: DeliveryAccountSchema,
  action: DeliveryActionSchema,
  approvalGrantId: IdSchema,
  batch: z.object({
    batchId: IdSchema,
    ordinal: z.number().int().positive(),
    total: z.number().int().positive(),
  }).strict().nullable(),
  deliveryLocked: z.literal(true),
}).strict().superRefine((request, context) => {
  if (request.batch && request.batch.ordinal > request.batch.total) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['batch', 'ordinal'], message: 'Batch ordinal cannot exceed batch total.' })
  }
})

export const DeliveryReadbackPayloadSchema = z.object({
  contractVersion: z.literal('delivery-readback-v1'),
  deliveryRequestPacketId: IdSchema,
  deliveryRequestContentHash: Sha256Schema,
  requestId: IdSchema,
  destination: DeliveryDestinationSchema,
  account: DeliveryAccountSchema,
  action: DeliveryActionSchema,
  status: z.enum(['confirmed_delivered', 'confirmed_absent', 'failed', 'unknown_outcome']),
  externalHandle: IdSchema.nullable(),
  authoritativeReadbackRef: RefSchema.nullable(),
  evidenceRefs: z.array(RefSchema).min(1).max(100),
  observedAt: TimestampSchema,
  retryLock: z.boolean(),
}).strict().superRefine((readback, context) => {
  if (readback.status === 'confirmed_delivered') {
    if (readback.externalHandle === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['externalHandle'], message: 'Confirmed delivery requires an external handle.' })
    }
    if (readback.authoritativeReadbackRef === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['authoritativeReadbackRef'], message: 'Confirmed delivery requires authoritative readback.' })
    }
    if (!readback.retryLock) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['retryLock'], message: 'Confirmed delivery must lock retry.' })
    }
  }
  if (readback.status === 'confirmed_absent') {
    if (readback.externalHandle !== null || readback.authoritativeReadbackRef === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['authoritativeReadbackRef'], message: 'Confirmed absence requires authoritative absence readback and no delivery handle.' })
    }
    if (readback.retryLock) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['retryLock'], message: 'Authoritatively confirmed absence may release retry.' })
    }
  }
  if (readback.status === 'failed') {
    if (readback.externalHandle !== null || readback.retryLock) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'A confirmed failure has no delivery handle and does not lock a safe retry.' })
    }
  }
  if (readback.status === 'unknown_outcome') {
    if (readback.externalHandle !== null || !readback.retryLock) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['retryLock'], message: 'unknown_outcome must retain retry lock until reconciliation.' })
    }
  }
})

export type DeliveryRequestPayload = z.infer<typeof DeliveryRequestPayloadSchema>
export type DeliveryReadbackPayload = z.infer<typeof DeliveryReadbackPayloadSchema>

function sameCanonicalValue(left: unknown, right: unknown) {
  return canonicalizeWorkspacePacketContent(left) === canonicalizeWorkspacePacketContent(right)
}

export function validateDeliveryActionContent(
  requestPacket: UniversalPacketEnvelope,
  canonicalContent: unknown,
): DeliveryRequestPayload {
  if (requestPacket.packetType !== 'delivery-request') throw new Error('Delivery content must bind a DeliveryRequest Packet.')
  if (workspacePacketContentHash(requestPacket) !== requestPacket.contentHash) {
    throw new Error('DeliveryRequest Packet content hash is invalid.')
  }
  const request = DeliveryRequestPayloadSchema.parse(requestPacket.payload)
  const actualContentHash = sha256Hex(canonicalizeWorkspacePacketContent(canonicalContent))
  if (actualContentHash !== request.action.contentHash) {
    throw new Error('Delivery action content hash does not match the exact approved content.')
  }
  return request
}

export function validateDeliveryReadbackAgainstRequest(
  readbackInput: unknown,
  requestPacket: UniversalPacketEnvelope,
): DeliveryReadbackPayload {
  if (requestPacket.packetType !== 'delivery-request') throw new Error('Delivery readback must bind a DeliveryRequest Packet.')
  if (workspacePacketContentHash(requestPacket) !== requestPacket.contentHash) {
    throw new Error('DeliveryRequest Packet content hash is invalid.')
  }
  const request = DeliveryRequestPayloadSchema.parse(requestPacket.payload)
  const readback = DeliveryReadbackPayloadSchema.parse(readbackInput)
  if (readback.deliveryRequestPacketId !== requestPacket.packetId) throw new Error('Delivery readback request Packet ID does not match.')
  if (readback.deliveryRequestContentHash !== requestPacket.contentHash) throw new Error('Delivery readback request content hash does not match.')
  if (readback.requestId !== request.requestId) throw new Error('Delivery readback request ID does not match.')
  if (!sameCanonicalValue(readback.destination, request.destination)) throw new Error('Delivery readback destination does not match the request.')
  if (!sameCanonicalValue(readback.account, request.account)) throw new Error('Delivery readback account does not match the request.')
  if (!sameCanonicalValue(readback.action, request.action)) throw new Error('Delivery readback action does not match the request.')
  return readback
}
