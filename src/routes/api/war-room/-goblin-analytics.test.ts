import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { getGoblinAnalyticsSnapshot } from '../../../server/goblin-analytics-data'

describe('Goblin Analytics API contract', () => {
  it('returns an empty read-only snapshot without fake shops/products', () => {
    const snapshot = getGoblinAnalyticsSnapshot({ nowMs: 1_788_000_000_000 })

    expect(snapshot.ok).toBe(true)
    expect(snapshot.schemaVersion).toBe('goblin-analytics-v1')
    expect(snapshot.generatedAtMs).toBe(1_788_000_000_000)
    expect(snapshot.freshness.state).toBe('empty')
    expect(snapshot.freshness.lastUpdatedMs).toBeNull()
    expect(snapshot.counts).toEqual({
      confirmedGoblins: 0,
      goblinCandidates: 0,
      attackNow: 0,
      newSignals: 0,
      caveats: 0,
      hardBlocks: 0,
    })
    expect(snapshot.database).toMatchObject({
      provider: 'none',
      workspaceFoundation: true,
      coreSchema: 'workspace_core',
      moduleSchema: 'goblin_analytics',
      readModel: 'server-rest',
      liveSource: false,
    })
    expect(snapshot.database.futureWorkspaceModules).toContain('daily-news')
    expect(snapshot.database.futureWorkspaceModules).toContain('approvals')
    expect(snapshot.shops).toEqual([])
    expect(snapshot.products).toEqual([])
    expect(snapshot.changeFeed).toEqual([])
    expect(snapshot.safety).toMatchObject({
      localOnly: true,
      readOnly: true,
      getOnly: true,
      noEtsyWrites: true,
      noSupplierMessages: true,
      noGeneratedProductImages: true,
      liveActionsAllowed: false,
      externalRequestsAllowed: false,
      writebackAllowed: false,
    })
  })

  it('exposes only GET in the route file during v1 read-only stage', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const routeSource = readFileSync(path.join(dir, 'goblin-analytics.ts'), 'utf8')

    expect(routeSource).toContain("createFileRoute('/api/war-room/goblin-analytics')")
    expect(routeSource).toContain('GET: async')
    expect(routeSource).toContain('getGoblinAnalyticsSnapshotForApi')
    expect(routeSource).not.toContain('POST:')
    expect(routeSource).not.toContain('PUT:')
    expect(routeSource).not.toContain('PATCH:')
    expect(routeSource).not.toContain('DELETE:')
  })
})
