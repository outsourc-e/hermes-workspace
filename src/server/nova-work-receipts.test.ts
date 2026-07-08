import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getNovaFabricSnapshot,
  createNovaFabricReviewProposal,
} from './nova-fabric-store'
import {
  planWorkReceipts,
  recordBlockedExternalAction,
  scanAndRecordWorkReceipts,
  type WorkObservation,
  type WorkStateMarker,
} from './nova-work-receipts'

let tempDir = ''
let originalFabricFile: string | undefined
let originalMarkerFile: string | undefined

function markerFile(): string {
  return path.join(tempDir, 'nova-work-state.json')
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-work-'))
  originalFabricFile = process.env.NOVA_FABRIC_FILE
  originalMarkerFile = process.env.NOVA_WORK_STATE_FILE
  process.env.NOVA_FABRIC_FILE = path.join(tempDir, 'nova-fabric.json')
  process.env.NOVA_WORK_STATE_FILE = markerFile()
})

afterEach(() => {
  if (originalFabricFile === undefined) delete process.env.NOVA_FABRIC_FILE
  else process.env.NOVA_FABRIC_FILE = originalFabricFile
  if (originalMarkerFile === undefined) delete process.env.NOVA_WORK_STATE_FILE
  else process.env.NOVA_WORK_STATE_FILE = originalMarkerFile
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function observation(partial: Partial<WorkObservation> = {}): WorkObservation {
  return {
    timestamp: '2026-07-08T00:00:00.000Z',
    git: {
      branch: 'feature/nova-skin',
      headHash: 'abc1234',
      headSubject: 'feat(nova): test subject',
    },
    prUrl: null,
    vitest: null,
    buildMtimeMs: null,
    ...partial,
  }
}

function marker(partial: Partial<WorkStateMarker> = {}): WorkStateMarker {
  return {
    headHash: 'abc1234',
    prUrl: null,
    vitestMtimeMs: null,
    buildMtimeMs: null,
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...partial,
  }
}

describe('planWorkReceipts (pure)', () => {
  it('seeds the marker without emitting backfilled receipts on first run', () => {
    const plan = planWorkReceipts(observation(), null)
    expect(plan.receipts).toHaveLength(0)
    expect(plan.nextMarker.headHash).toBe('abc1234')
  })

  it('emits a commit receipt when HEAD changes', () => {
    const plan = planWorkReceipts(
      observation({
        git: {
          branch: 'feature/nova-skin',
          headHash: 'def5678',
          headSubject: 'feat(nova): new work',
        },
      }),
      marker(),
    )
    expect(plan.receipts).toHaveLength(1)
    const receipt = plan.receipts[0]
    expect(receipt.title).toContain('Commit detected')
    expect(receipt.eventKind).toBe('work-receipt')
    expect(receipt.verificationState).toBe('tool-verified')
    expect(
      receipt.receiptLinks?.some((link) => link.value === 'def5678'),
    ).toBe(true)
    expect(plan.nextMarker.headHash).toBe('def5678')
  })

  it('is idempotent when nothing changed', () => {
    const plan = planWorkReceipts(observation(), marker())
    expect(plan.receipts).toHaveLength(0)
  })

  it('emits a PR receipt when a PR URL first appears', () => {
    const url = 'https://github.com/goodmorningmrj/hermes-workspace/pull/709'
    const plan = planWorkReceipts(observation({ prUrl: url }), marker())
    expect(plan.receipts).toHaveLength(1)
    expect(plan.receipts[0].title).toContain('PR linked')
    expect(
      plan.receipts[0].receiptLinks?.some(
        (link) => link.kind === 'url' && link.value === url,
      ),
    ).toBe(true)
  })

  it('emits an honest failed test-run receipt', () => {
    const plan = planWorkReceipts(
      observation({
        vitest: { mtimeMs: 100, passed: 29, failed: 2, total: 31 },
      }),
      marker(),
    )
    expect(plan.receipts).toHaveLength(1)
    expect(plan.receipts[0].title).toContain('failed')
    expect(plan.receipts[0].summary).toContain('29/31')
  })

  it('emits a passing test-run receipt and does not repeat for same artifact', () => {
    const first = planWorkReceipts(
      observation({
        vitest: { mtimeMs: 100, passed: 31, failed: 0, total: 31 },
      }),
      marker(),
    )
    expect(first.receipts).toHaveLength(1)
    expect(first.receipts[0].title).toContain('Test run completed')
    const second = planWorkReceipts(
      observation({
        vitest: { mtimeMs: 100, passed: 31, failed: 0, total: 31 },
      }),
      first.nextMarker,
    )
    expect(second.receipts).toHaveLength(0)
  })

  it('emits a build receipt when the build artifact is newer', () => {
    const plan = planWorkReceipts(
      observation({ buildMtimeMs: 5000 }),
      marker({ buildMtimeMs: 1000 }),
    )
    expect(plan.receipts).toHaveLength(1)
    expect(plan.receipts[0].title).toContain('Build completed')
  })

  it('handles a null git read without emitting or corrupting the marker', () => {
    const plan = planWorkReceipts(observation({ git: null }), marker())
    expect(plan.receipts).toHaveLength(0)
    expect(plan.nextMarker.headHash).toBe('abc1234')
  })
})

describe('scanAndRecordWorkReceipts (integration)', () => {
  it('writes planned receipts into the fabric and persists the marker', () => {
    const first = scanAndRecordWorkReceipts(observation())
    expect(first.written).toHaveLength(0)
    const second = scanAndRecordWorkReceipts(
      observation({
        git: {
          branch: 'feature/nova-skin',
          headHash: 'fff9999',
          headSubject: 'feat(nova): another slice',
        },
      }),
    )
    expect(second.written).toHaveLength(1)
    const snapshot = getNovaFabricSnapshot()
    expect(
      snapshot.fabric.events.some((event) =>
        event.title.includes('Commit detected'),
      ),
    ).toBe(true)
    expect(fs.existsSync(markerFile())).toBe(true)
  })

  it('recovers from a corrupt marker file by reseeding', () => {
    fs.writeFileSync(markerFile(), '{not json', 'utf8')
    const result = scanAndRecordWorkReceipts(observation())
    expect(result.written).toHaveLength(0)
    expect(result.marker.headHash).toBe('abc1234')
  })
})

describe('recordBlockedExternalAction', () => {
  it('writes a boundary receipt with the target system', () => {
    const record = recordBlockedExternalAction({
      action: 'send customer email',
      reason: 'external sends require Taylor approval',
      target: 'gmail',
    })
    expect(record.eventKind).toBe('boundary')
    expect(record.riskLevel).toBe('high')
    expect(record.title).toContain('blocked')
    const snapshot = getNovaFabricSnapshot()
    expect(snapshot.fabric.events.some((e) => e.id === record.id)).toBe(true)
  })
})

describe('review proposal requested receipt', () => {
  it('creating a review proposal also writes an approval-requested event', () => {
    createNovaFabricReviewProposal({
      title: 'Test proposal',
      reason: 'because tests',
      targetType: 'nova-wants',
      targetId: 'want-123',
      proposedDiff: { status: 'approved' },
    })
    const snapshot = getNovaFabricSnapshot()
    const requested = snapshot.fabric.events.find((event) =>
      event.title.startsWith('Review requested:'),
    )
    expect(requested).toBeDefined()
    expect(requested?.eventKind).toBe('approval')
    expect(
      requested?.receiptLinks.some((link) => link.kind === 'receipt'),
    ).toBe(true)
  })
})
