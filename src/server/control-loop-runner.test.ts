import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCostRouteWatchResult,
  buildJobboardCaretakerResult,
  buildMorningCommandResult,
  recordControlLoopRun,
} from './control-loop-runner'
import { getNovaFabricSnapshot } from './nova-fabric-store'

let tempDir = ''
let originalFabricFile: string | undefined

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-loop-'))
  originalFabricFile = process.env.NOVA_FABRIC_FILE
  process.env.NOVA_FABRIC_FILE = path.join(tempDir, 'nova-fabric.json')
})

afterEach(() => {
  if (originalFabricFile === undefined) delete process.env.NOVA_FABRIC_FILE
  else process.env.NOVA_FABRIC_FILE = originalFabricFile
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('buildCostRouteWatchResult', () => {
  it('flags route leaks from real analytics and stays dry-run', () => {
    const result = buildCostRouteWatchResult({
      analytics: {
        windowDays: 7,
        totalTokens: 5000,
        topModels: [
          { id: 'gpt-5.5', tokens: 4000, calls: 20, cost: 0, sessions: 3 },
          { id: 'claude-opus-4-8', tokens: 1000, calls: 5, cost: 3.4, sessions: 1 },
        ],
        estimatedCostUsd: 3.4,
        costLabel: '$3.40',
      },
    })
    expect(result.ok).toBe(true)
    expect(result.dryRun).toBe(true)
    expect(result.findings.some((entry) => /route leak/i.test(entry))).toBe(true)
    expect(result.refusals.length).toBeGreaterThan(0)
  })

  it('degrades honestly when analytics are unreadable', () => {
    const result = buildCostRouteWatchResult({ analytics: null })
    expect(result.ok).toBe(false)
    expect(result.summary).toMatch(/unavailable/i)
  })
})

describe('buildJobboardCaretakerResult', () => {
  it('triages stale and blocked cards without touching the board', () => {
    const result = buildJobboardCaretakerResult({
      jobBoard: {
        online: true,
        version: '2.0',
        stateKeys: 12,
        events: 4,
        taylorKanbanItems: 6,
        taylorKanban: {
          items: 6,
          open: 4,
          stale: 2,
          blockers: 1,
          topTitles: ['Order 1487 patches'],
        },
      },
    })
    expect(result.ok).toBe(true)
    expect(result.findings.some((entry) => /2 stale/i.test(entry))).toBe(true)
    expect(result.findings.some((entry) => /1 blocked/i.test(entry))).toBe(true)
    expect(
      result.refusals.some((entry) => /state\.json|write/i.test(entry)),
    ).toBe(true)
  })

  it('reports the board offline honestly', () => {
    const result = buildJobboardCaretakerResult({
      jobBoard: {
        online: false,
        version: null,
        stateKeys: 0,
        events: 0,
        taylorKanbanItems: 0,
        taylorKanban: null,
      },
    })
    expect(result.ok).toBe(false)
  })
})

describe('buildMorningCommandResult', () => {
  it('composes a morning brief from every real source it was given', () => {
    const result = buildMorningCommandResult({
      gatewayReachable: true,
      approvals: { pending: 2, actionable: 1, degraded: false },
      cron: { total: 4, failed: 1, paused: 0, nextRunAt: null },
      jobBoard: {
        online: true,
        version: '2.0',
        stateKeys: 3,
        events: 1,
        taylorKanbanItems: 2,
        taylorKanban: { items: 2, open: 2, stale: 0, blockers: 0, topTitles: [] },
      },
      googleConnected: false,
    })
    expect(result.ok).toBe(true)
    expect(result.findings.some((entry) => /2 .*waiting on taylor/i.test(entry))).toBe(true)
    expect(result.findings.some((entry) => /1 cron/i.test(entry))).toBe(true)
    expect(result.findings.some((entry) => /google/i.test(entry))).toBe(true)
    expect(result.refusals.some((entry) => /email|send/i.test(entry))).toBe(true)
  })
})

describe('recordControlLoopRun', () => {
  it('writes a work receipt for the dry run into the fabric', () => {
    const result = buildCostRouteWatchResult({ analytics: null })
    const receipt = recordControlLoopRun('cost-route-watch', result)
    expect(receipt.eventKind).toBe('work-receipt')
    const snapshot = getNovaFabricSnapshot()
    expect(
      snapshot.fabric.events.some(
        (event) =>
          event.id === receipt.id && event.title.includes('cost-route-watch'),
      ),
    ).toBe(true)
  })
})
