import { describe, expect, it } from 'vitest'
import { routeWorkspaceActionToBlueprint } from '../router'
import {
  bindWorkspaceApprovalGrantToRun,
  createWorkspaceApprovalForRun,
  createWorkspaceRun,
  requestWorkspaceApproval,
  resolveWorkspaceKernelApproval,
} from '../reducer'
import {
  consumeApprovalGrant,
  createApprovalGrantLedger,
  issueApprovalGrant,
} from './approval-grant'
import { validCostRiskLockPayloadFixture as validCostRiskLockPayload } from './test-fixtures'
import { createWorkspacePacket, reviseWorkspacePacket } from './factory'
import type { ConsumeApprovalGrantInput } from './approval-grant'

function costRiskPacket(grantId = 'grant-server-1') {
  return createWorkspacePacket({
    packetId: 'packet-cost-risk-1',
    packetLineageId: 'lineage-cost-risk-1',
    createdAt: '2026-07-19T08:00:00.000Z',
    runId: 'run-cost-risk-1',
    schemaVersion: '1.0.0',
    packetType: 'cost-risk-lock',
    from: { roomId: 'olympus-command', agentId: 'hermes-command' },
    to: { roomId: 'olympus-command', agentId: 'hermes-command' },
    sourceRefs: ['packet-plan-cost-1'],
    evidenceRefs: ['evidence://etsy/listing-fee'],
    assumptions: [],
    missingFields: [],
    lockedActions: ['execute'],
    approval: { required: true, stage: 'publish', grantId },
    acceptanceCriteria: [
      { criterionId: 'cost-risk-exact', description: 'Exact action, target, scope, stage and cost are bound.', required: true },
    ],
    idempotencyKey: 'run-cost-risk-1:cost-risk-lock:1',
    payload: validCostRiskLockPayload(),
  })
}

function grantRequest(packet = costRiskPacket()) {
  return {
    grantId: packet.approval.grantId ?? '',
    costRiskLockPacket: packet,
    issuedAt: '2026-07-19T08:05:00.000Z',
    expiresAt: '2026-07-19T08:15:00.000Z',
    issuedBy: 'workspace-server' as const,
  }
}

function consumption(packet = costRiskPacket()) {
  return {
    grantId: packet.approval.grantId ?? '',
    costRiskLockPacket: packet,
    runId: packet.runId,
    actionId: packet.payload.action.actionId,
    actionType: packet.payload.action.actionType,
    stage: packet.payload.action.stage,
    target: packet.payload.action.target,
    scopeId: packet.payload.action.scope.scopeId,
    scopeHash: packet.payload.action.scope.scopeHash,
    currency: packet.payload.cost.currency,
    actualMinorUnits: 20,
    consumedAt: '2026-07-19T08:10:00.000Z',
  }
}

describe('server-owned ApprovalGrant ledger', () => {
  it('issues only after the final CostRiskLock hash includes the preallocated grant ID', () => {
    const packet = costRiskPacket()
    const record = issueApprovalGrant(grantRequest(packet))
    expect(record.payload.costRiskLockPacketId).toBe(packet.packetId)
    expect(record.payload.costRiskLockContentHash).toBe(packet.contentHash)
    expect(record.payload.grantId).toBe(packet.approval.grantId)
    expect(record.status).toBe('issued')
  })

  it('atomically consumes an exact Grant once without enabling live execution', () => {
    const packet = costRiskPacket()
    const record = issueApprovalGrant(grantRequest(packet))
    const ledger = createApprovalGrantLedger([record])
    const consumed = consumeApprovalGrant(ledger, consumption(packet))
    expect(consumed.record.status).toBe('consumed')
    expect(consumed.record.consumedAt).toBe('2026-07-19T08:10:00.000Z')
    expect(consumed).not.toHaveProperty('liveActionsAllowed')
    expect(() => consumeApprovalGrant(consumed.ledger, consumption(packet))).toThrow(/consumed|one-time/i)
  })

  it.each([
    ['stage', { stage: 'draft_save' }],
    ['cost', { actualMinorUnits: 501 }],
    ['target', { target: { system: 'Etsy', accountId: 'OtherShop', resourceId: 'listing-1' } }],
    ['scope', { scopeId: 'other-scope' }],
  ])('rejects a mismatched %s', (_name, change) => {
    const packet = costRiskPacket()
    const ledger = createApprovalGrantLedger([issueApprovalGrant(grantRequest(packet))])
    expect(() => consumeApprovalGrant(
      ledger,
      { ...consumption(packet), ...change } as ConsumeApprovalGrantInput,
    )).toThrow(/grant|match|maximum|bind/i)
  })

  it.each([
    ['malformed', 'not-a-timestamp', /date|time|invalid/i],
    ['before issue', '2026-07-19T08:04:59.999Z', /active|issue/i],
    ['at expiry', '2026-07-19T08:15:00.000Z', /expired|expiry/i],
  ])('rejects consumption time %s through the public API', (_name, consumedAt, message) => {
    const packet = costRiskPacket()
    const ledger = createApprovalGrantLedger([issueApprovalGrant(grantRequest(packet))])
    expect(() => consumeApprovalGrant(ledger, {
      ...consumption(packet),
      consumedAt,
    })).toThrow(message)
  })

  it('allows consumption exactly at issue time and validates all caller-supplied ledger records', () => {
    const packet = costRiskPacket()
    const issued = issueApprovalGrant(grantRequest(packet))
    const consumed = consumeApprovalGrant(createApprovalGrantLedger([issued]), {
      ...consumption(packet),
      consumedAt: issued.payload.issuedAt,
    })
    expect(consumed.record.consumedAt).toBe(issued.payload.issuedAt)

    expect(() => createApprovalGrantLedger([{
      ...issued,
      payload: { ...issued.payload, issuedBy: 'browser-client' },
    } as never])).toThrow()
    expect(() => createApprovalGrantLedger([{
      ...issued,
      payload: { ...issued.payload, expiresAt: '2026-07-19T08:04:59.999Z' },
    }])).toThrow(/expiry|issue/i)
    expect(() => consumeApprovalGrant({
      records: [{ ...issued, consumedAt: 'not-a-timestamp' } as never],
    }, consumption(packet))).toThrow()
  })

  it('rejects expired Grants and invalidates a Grant when the CostRiskLock is revised', () => {
    const packet = costRiskPacket()
    const ledger = createApprovalGrantLedger([issueApprovalGrant(grantRequest(packet))])
    expect(() => consumeApprovalGrant(ledger, {
      ...consumption(packet),
      consumedAt: '2026-07-19T08:16:00.000Z',
    })).toThrow(/expired/i)

    const revision = reviseWorkspacePacket(packet, {
      packetId: 'packet-cost-risk-2',
      createdAt: '2026-07-19T08:06:00.000Z',
      idempotencyKey: 'run-cost-risk-1:cost-risk-lock:2',
      payload: { ...packet.payload, riskReasons: ['Revised risk reason.'] },
    })
    expect(() => consumeApprovalGrant(ledger, consumption(revision))).toThrow(/packet|hash|revision|bind/i)
  })

  it('keeps broad operator approval separate from a bound server Grant', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-bind-approval-grant',
      createdAtMs: 1_000,
      source: 'operator',
      intent: 'prepare one exact external action',
      summary: 'Prepare one exact external action without executing it.',
      riskClass: 'R4_COST_OR_ACCOUNT',
      requiresApproval: true,
      input: { text: 'Local approval staging only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 1_000, { runId: 'run-cost-risk-1' })
    const approval = createWorkspaceApprovalForRun(run, route.blueprint, 1_001)
    let state = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    state = resolveWorkspaceKernelApproval(state, approval.approvalId, 'approved', { nowMs: 1_002 })
    expect(state.runs[0].approvals[0].grantBinding).toBeUndefined()
    expect(state.runs[0].safety.liveActionsAllowed).toBe(false)

    const record = issueApprovalGrant(grantRequest())
    state = bindWorkspaceApprovalGrantToRun(state, approval.approvalId, 'packet-approval-grant-1', record, 1_003)
    expect(state.runs[0].approvals[0].grantBinding).toMatchObject({
      grantId: 'grant-server-1',
      approvalGrantPacketId: 'packet-approval-grant-1',
      costRiskLockPacketId: 'packet-cost-risk-1',
      status: 'issued',
    })
    expect(state.runs[0].status).toBe('blocked')
    expect(state.runs[0].safety.liveActionsAllowed).toBe(false)
  })

  it('rejects client-authored issuer labels and missing Envelope binding', () => {
    expect(() => issueApprovalGrant({
      ...grantRequest(),
      issuedBy: 'browser-client' as never,
    })).toThrow(/server/i)
    expect(() => issueApprovalGrant({
      ...grantRequest(costRiskPacket('different-grant')),
      grantId: 'grant-server-1',
    })).toThrow(/grant/i)
  })
})
