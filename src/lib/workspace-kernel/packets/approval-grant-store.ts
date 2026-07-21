import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import {
  ApprovalGrantRecordSchema,
  consumeApprovalGrant,
  createApprovalGrantLedger,
  issueApprovalGrant,
} from './approval-grant'
import { canonicalizeWorkspacePacketContent, sha256Hex } from './canonical-json'
import { CostRiskLockPayloadSchema } from './domain/cost-risk-lock'
import { validateDeliveryActionContent } from './domain/delivery'
import type { ApprovalGrantRecord, IssueApprovalGrantInput } from './approval-grant'
import type { CostRiskLockPayload } from './domain/cost-risk-lock'
import type { UniversalPacketEnvelope } from './types'

const STORE_VERSION = 1 as const
const STORE_FILE_NAME = 'approval-grants-v1.json'
const LOCK_FILE_NAME = 'approval-grants-v1.lock'

const ApprovalGrantStoreSnapshotSchema = z.object({
  version: z.literal(STORE_VERSION),
  records: z.array(ApprovalGrantRecordSchema),
}).strict()

export type ApprovalGrantStoreSnapshot = z.infer<typeof ApprovalGrantStoreSnapshotSchema>

export type ApprovalGrantStoreOptions = {
  rootDir: string
  lockTimeoutMs?: number
  retryDelayMs?: number
}

export type AuthorizeDeliveryRequestInput = {
  deliveryRequestPacket: UniversalPacketEnvelope
  costRiskLockPacket: UniversalPacketEnvelope<CostRiskLockPayload>
  canonicalContent: unknown
  actualMinorUnits: number
  consumedAt: string
}

function storePath(options: ApprovalGrantStoreOptions) {
  return path.join(options.rootDir, STORE_FILE_NAME)
}

function lockPath(options: ApprovalGrantStoreOptions) {
  return path.join(options.rootDir, LOCK_FILE_NAME)
}

function emptySnapshot(): ApprovalGrantStoreSnapshot {
  return { version: STORE_VERSION, records: [] }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function readSnapshot(options: ApprovalGrantStoreOptions): Promise<ApprovalGrantStoreSnapshot> {
  try {
    const raw = await readFile(storePath(options), 'utf8')
    return ApprovalGrantStoreSnapshotSchema.parse(JSON.parse(raw))
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return emptySnapshot()
    throw error
  }
}

async function writeSnapshot(snapshot: ApprovalGrantStoreSnapshot, options: ApprovalGrantStoreOptions) {
  const parsed = ApprovalGrantStoreSnapshotSchema.parse(snapshot)
  await mkdir(options.rootDir, { recursive: true, mode: 0o700 })
  const temporaryPath = `${storePath(options)}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporaryPath, `${canonicalizeWorkspacePacketContent(parsed)}\n`, { mode: 0o600 })
  await rename(temporaryPath, storePath(options))
}

async function withStoreLock<T>(options: ApprovalGrantStoreOptions, operation: () => Promise<T>): Promise<T> {
  await mkdir(options.rootDir, { recursive: true, mode: 0o700 })
  const filePath = lockPath(options)
  const token = randomUUID()
  const deadline = Date.now() + (options.lockTimeoutMs ?? 5_000)
  const retryDelayMs = options.retryDelayMs ?? 10
  let handle: Awaited<ReturnType<typeof open>> | null = null
  while (!handle) {
    try {
      handle = await open(filePath, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify({ token, pid: process.pid })}\n`)
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error
      if (Date.now() >= deadline) throw new Error('Timed out waiting for ApprovalGrant store lock.')
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  try {
    outcome = { ok: true, value: await operation() }
  } catch (error) {
    outcome = { ok: false, error }
  }
  let releaseError: unknown = null
  try {
    await handle.close()
    let ownsLock = false
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8')) as { token?: unknown }
      ownsLock = value.token === token
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
    }
    if (!ownsLock) throw new Error('ApprovalGrant store lock ownership changed before release.')
    await unlink(filePath)
  } catch (error) {
    releaseError = error
  }
  if (!outcome.ok && releaseError) {
    throw new AggregateError([outcome.error, releaseError], 'ApprovalGrant store operation and lock release both failed.')
  }
  if (!outcome.ok) throw outcome.error
  if (releaseError) throw releaseError
  return outcome.value
}

export async function loadApprovalGrantStore(
  options: ApprovalGrantStoreOptions,
): Promise<ApprovalGrantStoreSnapshot> {
  return readSnapshot(options)
}

export async function issueApprovalGrantToStore(
  input: IssueApprovalGrantInput,
  options: ApprovalGrantStoreOptions,
): Promise<ApprovalGrantRecord> {
  return withStoreLock(options, async () => {
    const snapshot = await readSnapshot(options)
    const issued = issueApprovalGrant(input)
    const existing = snapshot.records.find((record) => record.payload.grantId === issued.payload.grantId)
    if (existing) {
      if (canonicalizeWorkspacePacketContent(existing) === canonicalizeWorkspacePacketContent(issued)) return existing
      throw new Error(`ApprovalGrant ${issued.payload.grantId} already exists with different immutable content.`)
    }
    await writeSnapshot({ ...snapshot, records: [...snapshot.records, issued] }, options)
    return issued
  })
}

function assertDeliveryScopeBinding(
  deliveryRequestPacket: UniversalPacketEnvelope,
  costRiskLockPacket: UniversalPacketEnvelope<CostRiskLockPayload>,
  canonicalContent: unknown,
) {
  const request = validateDeliveryActionContent(deliveryRequestPacket, canonicalContent)
  const costRisk = CostRiskLockPayloadSchema.parse(costRiskLockPacket.payload)
  if (costRiskLockPacket.packetType !== 'cost-risk-lock') throw new Error('Delivery authorization requires a CostRiskLock Packet.')
  if (deliveryRequestPacket.runId !== costRiskLockPacket.runId) throw new Error('DeliveryRequest and CostRiskLock must belong to the same run.')
  if (request.executionPlanPacketId !== costRisk.executionPlanPacketId) throw new Error('DeliveryRequest and CostRiskLock execution plan do not match.')
  if (deliveryRequestPacket.approval.required !== true || deliveryRequestPacket.approval.grantId !== request.approvalGrantId) {
    throw new Error('DeliveryRequest envelope is not bound to its ApprovalGrant.')
  }
  if (deliveryRequestPacket.approval.stage !== costRisk.action.stage) throw new Error('DeliveryRequest approval stage does not match CostRiskLock.')
  if (request.action.actionId !== costRisk.action.actionId || request.action.actionType !== costRisk.action.actionType) {
    throw new Error('DeliveryRequest action does not match CostRiskLock.')
  }
  if (
    request.account.system !== costRisk.action.target.system
    || request.account.accountId !== costRisk.action.target.accountId
    || request.destination.targetId !== costRisk.action.target.resourceId
  ) throw new Error('DeliveryRequest target does not match CostRiskLock.')
  const canonicalScope = canonicalizeWorkspacePacketContent({
    destination: request.destination,
    account: request.account,
    action: request.action,
  })
  if (canonicalScope !== costRisk.action.scope.canonicalScope || sha256Hex(canonicalScope) !== costRisk.action.scope.scopeHash) {
    throw new Error('DeliveryRequest exact scope does not match CostRiskLock.')
  }
  return { request, costRisk }
}

export async function authorizeDeliveryRequestWithApprovalGrantStore(
  input: AuthorizeDeliveryRequestInput,
  options: ApprovalGrantStoreOptions,
): Promise<ApprovalGrantRecord> {
  const { request, costRisk } = assertDeliveryScopeBinding(
    input.deliveryRequestPacket,
    input.costRiskLockPacket,
    input.canonicalContent,
  )
  return withStoreLock(options, async () => {
    const snapshot = await readSnapshot(options)
    const grant = snapshot.records.find((record) => record.payload.grantId === request.approvalGrantId)
    if (!grant) throw new Error(`ApprovalGrant ${request.approvalGrantId} was not found in the durable store.`)
    const consumed = consumeApprovalGrant(createApprovalGrantLedger(snapshot.records), {
      grantId: request.approvalGrantId,
      costRiskLockPacket: input.costRiskLockPacket,
      runId: input.deliveryRequestPacket.runId,
      actionId: costRisk.action.actionId,
      actionType: costRisk.action.actionType,
      stage: costRisk.action.stage,
      target: costRisk.action.target,
      scopeId: costRisk.action.scope.scopeId,
      scopeHash: costRisk.action.scope.scopeHash,
      currency: costRisk.cost.currency,
      actualMinorUnits: input.actualMinorUnits,
      consumedAt: input.consumedAt,
    })
    await writeSnapshot({ ...snapshot, records: [...consumed.ledger.records] }, options)
    return consumed.record
  })
}
