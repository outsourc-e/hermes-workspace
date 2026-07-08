import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendNovaFabricEvent,
  createNovaFabricReviewProposal,
  createNovaSelfStateVersion,
  getNovaFabricSnapshot,
  proposeNovaSelfStateChange,
  updateNovaFabricReviewStatus,
} from './nova-fabric-store'

let tempDir = ''
let originalFile: string | undefined

function fabricFile(): string {
  return path.join(tempDir, 'nova-fabric.json')
}

function backupFile(): string {
  return path.join(tempDir, 'nova-fabric.backup.json')
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-fabric-'))
  originalFile = process.env.NOVA_FABRIC_FILE
  process.env.NOVA_FABRIC_FILE = fabricFile()
})

afterEach(() => {
  if (originalFile === undefined) {
    delete process.env.NOVA_FABRIC_FILE
  } else {
    process.env.NOVA_FABRIC_FILE = originalFile
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('nova fabric store', () => {
  it('seeds once from the Nova/Mycelia continuity receipt', () => {
    const first = getNovaFabricSnapshot()
    expect(first.ok).toBe(true)
    expect(first.fabric?.events.map((event) => event.id)).toContain(
      'event-continuity-spine',
    )
    expect(first.fabric?.selfState.map((record) => record.id)).toContain(
      'self-protected-state-v1',
    )
    expect(first.fabric?.sourceMap.map((record) => record.policy)).toContain(
      'approved-endpoint-only',
    )

    const raw = JSON.parse(fs.readFileSync(fabricFile(), 'utf-8'))
    raw.events.push({
      ...raw.events[0],
      id: 'event-human-kept',
      title: 'Human kept event',
    })
    fs.writeFileSync(fabricFile(), `${JSON.stringify(raw, null, 2)}\n`, 'utf-8')

    const second = getNovaFabricSnapshot()
    expect(
      second.fabric?.events.filter((event) => event.id === 'event-human-kept'),
    ).toHaveLength(1)
    expect(
      second.fabric?.events.filter(
        (event) => event.id === 'event-continuity-spine',
      ),
    ).toHaveLength(1)
  })

  it('persists reloads and creates a backup before writes', () => {
    appendNovaFabricEvent({
      title: 'Verifier event',
      summary: 'This event proves persistence reload.',
      verificationState: 'tool-verified',
    })

    expect(fs.existsSync(backupFile())).toBe(true)
    const reloaded = getNovaFabricSnapshot()
    expect(
      reloaded.fabric?.events.some((event) => event.title === 'Verifier event'),
    ).toBe(true)
  })

  it('keeps events append-only through public operations', () => {
    const before = getNovaFabricSnapshot()
    const initialCount = before.fabric?.events.length ?? 0
    appendNovaFabricEvent({
      title: 'Append-only check',
      summary: 'No existing event is edited by append.',
    })
    const after = getNovaFabricSnapshot()

    expect(after.fabric?.events.length).toBe(initialCount + 1)
    expect(after.fabric?.events[0].id).toBe(before.fabric?.events[0].id)
  })

  it('returns degraded state for corrupted JSON without resetting the file', () => {
    fs.mkdirSync(tempDir, { recursive: true })
    fs.writeFileSync(fabricFile(), '{not valid json', 'utf-8')

    const snapshot = getNovaFabricSnapshot()

    expect(snapshot.ok).toBe(false)
    expect(snapshot.degraded).toBe(true)
    expect(snapshot.warning).toContain('Fabric degraded')
    expect(fs.readFileSync(fabricFile(), 'utf-8')).toBe('{not valid json')
  })

  it('creates review proposals for risky self-state changes', () => {
    const review = proposeNovaSelfStateChange(
      'self-protected-state-v1',
      { body: 'Change protected self-state.' },
      'Taylor needs to review identity-bearing state.',
    )

    expect(review.status).toBe('pending')
    expect(review.targetType).toBe('self-state')
    expect(review.approvalLevel).toBe('explicit-approval')
  })

  it('versions self-state only when Taylor approved', () => {
    const blocked = createNovaSelfStateVersion(
      'self-protected-state-v1',
      'A proposed body without approval.',
      'No approval supplied.',
    )
    expect(blocked.kind).toBe('review')

    const review = proposeNovaSelfStateChange(
      'self-protected-state-v1',
      { body: 'Taylor-approved protected self-state body.' },
      'Approval review for version test.',
    )
    const approvedReview = updateNovaFabricReviewStatus(review.id, 'approved')
    expect(approvedReview?.status).toBe('approved')

    const approved = createNovaSelfStateVersion(
      'self-protected-state-v1',
      'Taylor-approved protected self-state body.',
      'Approved during test.',
      review.id,
    )
    expect(approved.kind).toBe('version')
    if (approved.kind === 'version') {
      expect(approved.record.version).toBe(2)
      expect(approved.record.previousRecordId).toBe('self-protected-state-v1')
      expect(approved.record.verificationState).toBe('taylor-approved')
      expect(approved.record.receiptLinks.map((link) => link.value)).toContain(
        review.id,
      )
    }
  })

  it('tracks source-map policies and seeded records as draft or inferred', () => {
    const snapshot = getNovaFabricSnapshot()
    const policies = new Set(
      snapshot.fabric?.sourceMap.map((record) => record.policy),
    )
    expect(policies.has('local-writable')).toBe(true)
    expect(policies.has('read-only')).toBe(true)
    expect(policies.has('propose-only')).toBe(true)
    expect(policies.has('approved-endpoint-only')).toBe(true)
    expect(policies.has('external-approval-required')).toBe(true)

    const states = new Set([
      ...(snapshot.fabric?.events.map((record) => record.verificationState) ??
        []),
      ...(snapshot.fabric?.selfState.map(
        (record) => record.verificationState,
      ) ?? []),
    ])
    expect(states.has('inferred')).toBe(true)
    expect(states.has('draft')).toBe(true)
  })

  it('allows safe review queue status updates only on review records', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Review queue status',
      reason: 'Test review status update.',
      targetType: 'nova-wants',
      targetId: 'continuity-spine',
      proposedDiff: { status: 'approved' },
    })

    const updated = updateNovaFabricReviewStatus(review.id, 'parked')
    expect(updated?.status).toBe('parked')
  })

  it('writes an approval receipt event when a review status changes', () => {
    const review = createNovaFabricReviewProposal({
      title: 'Approve risky want',
      reason: 'Taylor approved the protected action.',
      targetType: 'nova-wants',
      targetId: 'want-protected-action',
      proposedDiff: { status: 'done' },
    })

    const updated = updateNovaFabricReviewStatus(review.id, 'approved')
    expect(updated?.status).toBe('approved')

    const snapshot = getNovaFabricSnapshot()
    const receipt = snapshot.fabric?.events.find((event) =>
      event.receiptLinks.some((link) => link.value === review.id),
    )

    expect(receipt).toMatchObject({
      eventKind: 'approval',
      verificationState: 'taylor-approved',
      approvalLevel: 'explicit-approval',
      riskLevel: review.riskLevel,
    })
    expect(receipt?.summary).toContain('Approve risky want')
    expect(receipt?.summary).toContain('approved')
  })
})
