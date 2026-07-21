import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { canonicalizeWorkspacePacketContent, sha256Hex } from './canonical-json'
import {
  authorizeDeliveryRequestWithApprovalGrantStore,
  issueApprovalGrantToStore,
  loadApprovalGrantStore,
} from './approval-grant-store'
import {
  validCostRiskLockPayloadFixture as validCostRiskLockPayload,
  validDeliveryRequestPayloadFixture as validDeliveryRequestPayload,
} from './test-fixtures'
import { createWorkspacePacket } from './factory'

const tempDirs: Array<string> = []

async function temporaryStore() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-approval-grant-store-'))
  tempDirs.push(rootDir)
  return { rootDir }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function fixture() {
  const canonicalContent = { text: 'Exact approved Discord status.' }
  const delivery = {
    ...validDeliveryRequestPayload(),
    action: {
      ...validDeliveryRequestPayload().action,
      contentHash: sha256Hex(canonicalizeWorkspacePacketContent(canonicalContent)),
    },
  }
  const canonicalScope = canonicalizeWorkspacePacketContent({
    destination: delivery.destination,
    account: delivery.account,
    action: delivery.action,
  })
  const costRiskPayload = {
    ...validCostRiskLockPayload(),
    executionPlanPacketId: delivery.executionPlanPacketId,
    action: {
      actionId: delivery.action.actionId,
      actionType: delivery.action.actionType,
      stage: 'send' as const,
      target: {
        system: delivery.account.system,
        accountId: delivery.account.accountId,
        resourceId: delivery.destination.targetId,
      },
      scope: {
        scopeId: 'scope-delivery-request-1',
        canonicalScope,
        scopeHash: sha256Hex(canonicalScope),
      },
    },
    cost: {
      currency: 'USD',
      maximumMinorUnits: 500,
      estimatedMinorUnits: 20,
      evidenceRefs: ['evidence://delivery/cost'],
    },
    riskClass: 'R3_EXTERNAL_WRITE' as const,
    riskReasons: ['External message send requires exact approval.'],
  }
  const costRiskLockPacket = createWorkspacePacket({
    packetId: 'packet-cost-risk-delivery-1', packetLineageId: 'lineage-cost-risk-delivery-1',
    createdAt: '2026-07-19T08:00:00.000Z', runId: 'run-delivery-1', schemaVersion: '1.0.0', packetType: 'cost-risk-lock',
    from: { roomId: 'olympus-command', agentId: 'hermes' }, to: { roomId: 'olympus-command', agentId: 'hermes' },
    sourceRefs: [costRiskPayload.executionPlanPacketId], evidenceRefs: costRiskPayload.cost.evidenceRefs,
    assumptions: [], missingFields: [], lockedActions: ['execute'],
    approval: { required: true, stage: 'send', grantId: delivery.approvalGrantId },
    acceptanceCriteria: [{ criterionId: 'exact-delivery-grant', description: 'Exact delivery grant.', required: true }],
    idempotencyKey: 'cost-risk:delivery:1', payload: costRiskPayload,
  })
  const deliveryRequestPacket = createWorkspacePacket({
    packetId: 'packet-delivery-request-1', packetLineageId: 'lineage-delivery-request-1',
    createdAt: '2026-07-19T08:06:00.000Z', runId: 'run-delivery-1', schemaVersion: '1.0.0', packetType: 'delivery-request',
    from: { roomId: 'olympus-command', agentId: 'hermes' }, to: { roomId: 'merchant-harbor', agentId: 'delivery-worker' },
    sourceRefs: [delivery.executionPlanPacketId, delivery.action.contentRef], evidenceRefs: [],
    assumptions: [], missingFields: [], lockedActions: [delivery.action.actionType],
    approval: { required: true, stage: 'send', grantId: delivery.approvalGrantId },
    acceptanceCriteria: [{ criterionId: 'exact-delivery', description: 'Exact delivery request.', required: true }],
    idempotencyKey: 'delivery-request:approval-store:1', payload: delivery,
  })
  return { canonicalContent, costRiskLockPacket, deliveryRequestPacket }
}

describe('durable ApprovalGrant store and Delivery authorization', () => {
  it('atomically consumes one persisted Grant exactly once under concurrent attempts', async () => {
    const store = await temporaryStore()
    const subject = fixture()
    await issueApprovalGrantToStore({
      grantId: subject.deliveryRequestPacket.approval.grantId ?? '',
      costRiskLockPacket: subject.costRiskLockPacket,
      issuedAt: '2026-07-19T08:05:00.000Z',
      expiresAt: '2026-07-19T08:15:00.000Z',
      issuedBy: 'workspace-server',
    }, store)
    const consume = () => authorizeDeliveryRequestWithApprovalGrantStore({
      deliveryRequestPacket: subject.deliveryRequestPacket,
      costRiskLockPacket: subject.costRiskLockPacket,
      canonicalContent: subject.canonicalContent,
      actualMinorUnits: 20,
      consumedAt: '2026-07-19T08:10:00.000Z',
    }, store)
    const results = await Promise.allSettled([consume(), consume()])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const loaded = await loadApprovalGrantStore(store)
    expect(loaded.records[0]).toMatchObject({ status: 'consumed', consumedAt: '2026-07-19T08:10:00.000Z' })
  })

  it('rejects content drift before consuming the persisted Grant', async () => {
    const store = await temporaryStore()
    const subject = fixture()
    await issueApprovalGrantToStore({
      grantId: subject.deliveryRequestPacket.approval.grantId ?? '',
      costRiskLockPacket: subject.costRiskLockPacket,
      issuedAt: '2026-07-19T08:05:00.000Z',
      expiresAt: '2026-07-19T08:15:00.000Z',
      issuedBy: 'workspace-server',
    }, store)
    await expect(authorizeDeliveryRequestWithApprovalGrantStore({
      deliveryRequestPacket: subject.deliveryRequestPacket,
      costRiskLockPacket: subject.costRiskLockPacket,
      canonicalContent: { text: 'Changed after approval.' },
      actualMinorUnits: 20,
      consumedAt: '2026-07-19T08:10:00.000Z',
    }, store)).rejects.toThrow(/content|hash/i)
    const loaded = await loadApprovalGrantStore(store)
    expect(loaded.records[0].status).toBe('issued')
  })

  it('never steals or deletes an existing lock based only on age', async () => {
    const store = await temporaryStore()
    const filePath = path.join(store.rootDir, 'approval-grants-v1.lock')
    const owner = { token: 'another-live-owner-token', pid: process.pid }
    await writeFile(filePath, `${JSON.stringify(owner)}\n`, 'utf8')
    const subject = fixture()
    await expect(issueApprovalGrantToStore({
      grantId: subject.deliveryRequestPacket.approval.grantId ?? '',
      costRiskLockPacket: subject.costRiskLockPacket,
      issuedAt: '2026-07-19T08:05:00.000Z',
      expiresAt: '2026-07-19T08:15:00.000Z',
      issuedBy: 'workspace-server',
    }, { ...store, lockTimeoutMs: 25, retryDelayMs: 5 })).rejects.toThrow(/timed out/i)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(owner)
  })
})
