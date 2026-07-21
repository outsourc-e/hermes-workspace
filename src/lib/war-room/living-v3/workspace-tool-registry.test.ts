import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_TOOL_REGISTRY,
  recommendWorkspaceTool,
  routeWorkspaceToolIntent,
} from './workspace-tool-registry'

describe('Workspace tools-first registry', () => {
  it('seeds the Batch 1 tool contracts with locked live actions', () => {
    expect(WORKSPACE_TOOL_REGISTRY.map((tool) => tool.id)).toEqual([
      'command-room-manager',
      'etsy-research-lab',
      'smart-intake-v2',
      'etsy-sheet-intake',
      'etsy-product-gallery',
      'shotlab-handoff',
      'seo-workbench',
      'approval-inbox',
      'daily-news-board',
    ])
    expect(WORKSPACE_TOOL_REGISTRY.every((tool) => tool.lockedActions.includes('Etsy publish'))).toBe(true)
    expect(WORKSPACE_TOOL_REGISTRY.find((tool) => tool.id === 'daily-news-board')?.status).toBe('partial')
  })

  it('routes messy mixed source missions to Smart Intake V2', () => {
    const recommendation = recommendWorkspaceTool('Paste AliExpress links, Google Drive folders, local images, and a freeform prompt')
    expect(recommendation.decision).toBe('use_existing_tool')
    expect(recommendation.toolId).toBe('smart-intake-v2')
    expect(recommendation.safety.usageAllowed).toBe(false)
    expect(recommendation.safety.workerSpawnAllowed).toBe(false)
  })

  it('routes product, shop, and meta-analysis research into the Research Lab', () => {
    const recommendation = recommendWorkspaceTool('מחקר חנות עמוק ומטא אנליזה של כמה חנויות Etsy')
    expect(recommendation.decision).toBe('use_existing_tool')
    expect(recommendation.toolId).toBe('etsy-research-lab')

    const route = routeWorkspaceToolIntent('Deep shop research with a comparative meta analysis', 321)
    expect(route.target).toMatchObject({
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      surfaceId: 'etsy-scout',
      action: 'open_odin_scout',
    })
    expect(route.stationHandoff.status).toBe('ready')
  })

  it('routes sheet/product requests to the existing Sheet Intake surface', () => {
    const recommendation = recommendWorkspaceTool('Import a CSV and show product gallery dossiers')
    expect(recommendation.decision).toBe('use_existing_tool')
    expect(recommendation.toolId).toBe('etsy-sheet-intake')
    expect(recommendation.safety.usageAllowed).toBe(false)
    expect(recommendation.safety.workerSpawnAllowed).toBe(false)
  })

  it('keeps hidden workers as blocked future recommendations', () => {
    const recommendation = recommendWorkspaceTool('Create an agent worker for sorting products')
    expect(recommendation.decision).toBe('create_hidden_worker')
    expect(recommendation.blocked).toContain('hidden worker creation is blocked until an approved controlled runner is explicitly connected')
  })

  it('builds a typed local route into the existing Smart Intake station', () => {
    const route = routeWorkspaceToolIntent('Find products from AliExpress links, Drive images, and a messy prompt', 123)
    expect(route.routeId).toContain('tool-route-123')
    expect(route.recommendation.toolId).toBe('smart-intake-v2')
    expect(route.target).toMatchObject({
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      surfaceId: 'smart-intake',
      action: 'open_and_prefill_smart_intake',
    })
    expect(route.stationHandoff.status).toBe('ready')
    expect(route.safety).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('blocks hidden worker routing instead of spawning a new swarm', () => {
    const route = routeWorkspaceToolIntent('Create agents and a worker swarm for sorting products', 456)
    expect(route.recommendation.decision).toBe('create_hidden_worker')
    expect(route.target.action).toBe('blocked_hidden_worker')
    expect(route.target.stationId).toBe('mission-router')
    expect(route.stationHandoff.status).toBe('blocked')
    expect(route.safety.workerSpawnAllowed).toBe(false)
  })

  it('routes daily news to the core Gateway board instead of a future room', () => {
    const route = routeWorkspaceToolIntent('Prepare the daily news bulletin preview', 789)
    expect(route.recommendation.toolId).toBe('daily-news-board')
    expect(route.recommendation.decision).toBe('improve_existing_tool')
    expect(route.target).toMatchObject({
      roomId: 'gateway-cockpit',
      stationId: 'gateway-console',
      surfaceId: 'daily-news-board',
      action: 'open_daily_news_board',
    })
    expect(route.stationHandoff.status).toBe('partial')
  })
})
