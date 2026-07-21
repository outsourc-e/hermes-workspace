import { z } from 'zod'
import { canonicalizeWorkspacePacketContent, workspacePacketContentHash } from './canonical-json'
import {
  CostRiskActionTargetSchema,
  CostRiskLockPayloadSchema,
  CostRiskStageSchema,
} from './domain/cost-risk-lock'
import type { UniversalPacketEnvelope } from './types'
import type { CostRiskActionTarget, CostRiskLockPayload, CostRiskStage } from './domain/cost-risk-lock'

const IdSchema = z.string().trim().min(1).max(256)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const TimestampSchema = z.string().datetime({ offset: true })

export const ApprovalGrantPayloadSchema = z.object({
  contractVersion: z.literal('approval-grant-v1'),
  grantId: IdSchema,
  runId: IdSchema,
  costRiskLockPacketId: IdSchema,
  costRiskLockContentHash: Sha256Schema,
  actionId: IdSchema,
  actionType: IdSchema,
  stage: CostRiskStageSchema,
  target: CostRiskActionTargetSchema,
  scopeId: IdSchema,
  scopeHash: Sha256Schema,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  maximumMinorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  issuedBy: z.literal('workspace-server'),
}).strict().superRefine((grant, context) => {
  if (Date.parse(grant.expiresAt) <= Date.parse(grant.issuedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'ApprovalGrant expiry must be later than issue time.' })
  }
})

export type ApprovalGrantPayload = z.infer<typeof ApprovalGrantPayloadSchema>
export const ApprovalGrantRecordSchema = z.object({
  payload: ApprovalGrantPayloadSchema,
  status: z.enum(['issued', 'consumed', 'revoked']),
  consumedAt: TimestampSchema.nullable(),
}).strict().superRefine((record, context) => {
  if (Date.parse(record.payload.expiresAt) <= Date.parse(record.payload.issuedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['payload', 'expiresAt'], message: 'Grant expiry must be after issue time.' })
  }
  if (record.status === 'consumed' && record.consumedAt === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['consumedAt'], message: 'Consumed Grant requires consumedAt.' })
  }
  if (record.status !== 'consumed' && record.consumedAt !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['consumedAt'], message: `${record.status} Grant cannot have consumedAt.` })
  }
  if (record.consumedAt !== null) {
    const consumedAtMs = Date.parse(record.consumedAt)
    if (consumedAtMs < Date.parse(record.payload.issuedAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['consumedAt'], message: 'Grant cannot be consumed before issue time.' })
    }
    if (consumedAtMs >= Date.parse(record.payload.expiresAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['consumedAt'], message: 'Grant cannot be consumed at or after expiry.' })
    }
  }
})
export type ApprovalGrantRecord = z.infer<typeof ApprovalGrantRecordSchema>
export type ApprovalGrantLedger = {
  records: ReadonlyArray<ApprovalGrantRecord>
}

export type IssueApprovalGrantInput = {
  grantId: string
  costRiskLockPacket: UniversalPacketEnvelope<CostRiskLockPayload>
  issuedAt: string
  expiresAt: string
  issuedBy: string
}

export type ConsumeApprovalGrantInput = {
  grantId: string
  costRiskLockPacket: UniversalPacketEnvelope<CostRiskLockPayload>
  runId: string
  actionId: string
  actionType: string
  stage: CostRiskStage
  target: CostRiskActionTarget
  scopeId: string
  scopeHash: string
  currency: string
  actualMinorUnits: number
  consumedAt: string
}

function assertCurrentCostRiskPacket(packet: UniversalPacketEnvelope<CostRiskLockPayload>) {
  if (packet.packetType !== 'cost-risk-lock') throw new Error('ApprovalGrant requires a CostRiskLock Packet.')
  if (workspacePacketContentHash(packet) !== packet.contentHash) throw new Error('CostRiskLock Packet hash is invalid.')
  const payload = CostRiskLockPayloadSchema.parse(packet.payload)
  if (payload.readiness !== 'ready') throw new Error('ApprovalGrant cannot bind a blocked CostRiskLock Packet.')
  if (!packet.approval.required || !packet.approval.grantId) {
    throw new Error('CostRiskLock Packet must contain the preallocated ApprovalGrant ID.')
  }
  if (packet.approval.stage !== payload.action.stage) {
    throw new Error('Envelope approval stage must match the exact CostRiskLock action stage.')
  }
  return payload
}

export function issueApprovalGrant(input: IssueApprovalGrantInput): ApprovalGrantRecord {
  if (input.issuedBy !== 'workspace-server') throw new Error('ApprovalGrant may only be issued by the workspace server.')
  const costRisk = assertCurrentCostRiskPacket(input.costRiskLockPacket)
  if (input.grantId !== input.costRiskLockPacket.approval.grantId) {
    throw new Error('ApprovalGrant ID must match the preallocated Envelope grant ID.')
  }
  const payload = ApprovalGrantPayloadSchema.parse({
    contractVersion: 'approval-grant-v1',
    grantId: input.grantId,
    runId: input.costRiskLockPacket.runId,
    costRiskLockPacketId: input.costRiskLockPacket.packetId,
    costRiskLockContentHash: input.costRiskLockPacket.contentHash,
    actionId: costRisk.action.actionId,
    actionType: costRisk.action.actionType,
    stage: costRisk.action.stage,
    target: costRisk.action.target,
    scopeId: costRisk.action.scope.scopeId,
    scopeHash: costRisk.action.scope.scopeHash,
    currency: costRisk.cost.currency,
    maximumMinorUnits: costRisk.cost.maximumMinorUnits,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    issuedBy: input.issuedBy,
  })
  return Object.freeze({ payload: Object.freeze(payload), status: 'issued' as const, consumedAt: null })
}

export function createApprovalGrantLedger(records: ReadonlyArray<ApprovalGrantRecord> = []): ApprovalGrantLedger {
  const parsedRecords = records.map((record) => ApprovalGrantRecordSchema.parse(record))
  const grantIds = parsedRecords.map((record) => record.payload.grantId)
  if (new Set(grantIds).size !== grantIds.length) throw new Error('ApprovalGrant ledger contains duplicate Grant IDs.')
  return Object.freeze({ records: Object.freeze(parsedRecords.map((record) => Object.freeze({
    ...record,
    payload: Object.freeze(record.payload),
  }))) })
}

function exactMatch(left: unknown, right: unknown) {
  return canonicalizeWorkspacePacketContent(left) === canonicalizeWorkspacePacketContent(right)
}

function assertBoundConsumption(record: ApprovalGrantRecord, input: ConsumeApprovalGrantInput) {
  const grant = record.payload
  const packet = input.costRiskLockPacket
  const costRisk = assertCurrentCostRiskPacket(packet)
  const consumedAt = TimestampSchema.parse(input.consumedAt)
  const consumedAtMs = Date.parse(consumedAt)
  if (record.status !== 'issued') throw new Error(`ApprovalGrant is ${record.status}; one-time use is exhausted.`)
  if (consumedAtMs < Date.parse(grant.issuedAt)) throw new Error('ApprovalGrant is not active yet.')
  if (consumedAtMs >= Date.parse(grant.expiresAt)) throw new Error('ApprovalGrant is expired.')
  if (packet.packetId !== grant.costRiskLockPacketId || packet.contentHash !== grant.costRiskLockContentHash) {
    throw new Error('ApprovalGrant does not bind this CostRiskLock Packet revision/hash.')
  }
  if (packet.approval.grantId !== grant.grantId) throw new Error('CostRiskLock Envelope does not bind this Grant.')
  const exactPairs: Array<[unknown, unknown]> = [
    [input.runId, grant.runId],
    [input.actionId, grant.actionId],
    [input.actionType, grant.actionType],
    [input.stage, grant.stage],
    [input.target, grant.target],
    [input.scopeId, grant.scopeId],
    [input.scopeHash, grant.scopeHash],
    [input.currency, grant.currency],
    [costRisk.action.actionId, grant.actionId],
    [costRisk.action.target, grant.target],
    [costRisk.action.scope.scopeHash, grant.scopeHash],
  ]
  if (exactPairs.some(([actual, expected]) => !exactMatch(actual, expected))) {
    throw new Error('ApprovalGrant consumption does not match its exact action/target/scope/stage binding.')
  }
  if (!Number.isSafeInteger(input.actualMinorUnits) || input.actualMinorUnits < 0) {
    throw new Error('ApprovalGrant actual cost must be non-negative integer minor units.')
  }
  if (input.actualMinorUnits > grant.maximumMinorUnits) {
    throw new Error('ApprovalGrant maximum cost would be exceeded.')
  }
  return consumedAt
}

export function consumeApprovalGrant(
  ledger: ApprovalGrantLedger,
  input: ConsumeApprovalGrantInput,
): { ledger: ApprovalGrantLedger; record: ApprovalGrantRecord } {
  const validatedLedger = createApprovalGrantLedger(ledger.records)
  const index = validatedLedger.records.findIndex((record) => record.payload.grantId === input.grantId)
  if (index < 0) throw new Error('ApprovalGrant is unknown to the server ledger.')
  const current = validatedLedger.records[index]
  const consumedAt = assertBoundConsumption(current, input)
  const record: ApprovalGrantRecord = Object.freeze({
    payload: current.payload,
    status: 'consumed',
    consumedAt,
  })
  const records = validatedLedger.records.map((candidate, candidateIndex) => candidateIndex === index ? record : candidate)
  return { ledger: createApprovalGrantLedger(records), record }
}
