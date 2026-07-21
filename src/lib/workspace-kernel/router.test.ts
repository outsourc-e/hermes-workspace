import { describe, expect, it } from 'vitest'
import { routeWorkspaceActionToBlueprint } from './router'

describe('workspace kernel action router', () => {
  it('routes messy Etsy source intake to Smart Intake V2 and Odin station', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-etsy-messy',
      createdAtMs: 100,
      source: 'operator',
      intent: 'Find Dolaro products',
      summary: 'AliExpress links, Google Drive images, Google Sheet rows, local files, local images, and a freeform prompt.',
      input: {
        text: 'Find Dolaro jewelry products from AliExpress links, Google Drive images, Google Sheet rows, local files, and a freeform prompt.',
        urls: ['https://example.com/aliexpress-local-reference'],
        localPaths: ['/Users/mac/hermes-workspace/data/etsy-market-lab/imports/sample.csv'],
      },
    })

    expect(result.blueprint.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(result.blueprint.roomId).toBe('etsy-market-lab')
    expect(result.blueprint.stationId).toBe('etsy-loki-product-hunt')
    expect(result.artifactKind).toBe('product-candidate-packet')
    expect(result.safety).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('keeps messy Etsy intake primary even when downstream ShotLab and SEO are mentioned', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-etsy-downstream',
      createdAtMs: 100,
      source: 'operator',
      intent: 'Smart intake for Dolaro product research',
      summary: 'Find Dolaro jewelry products from AliExpress, Google Drive, Google Sheet, local files, and a freeform prompt, then stage the best candidate for ShotLab/SEO/draft approval.',
      input: { text: 'AliExpress Drive Sheet local image Dolaro ShotLab SEO draft approval' },
    })

    expect(result.blueprint.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(result.blueprint.stationId).toBe('etsy-loki-product-hunt')
  })

  it('routes CAD and 3D print work to Terra Forge with printer control locked', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-cad',
      createdAtMs: 101,
      source: 'ui',
      intent: 'Create an OpenSCAD STL print prep packet',
      summary: 'Build a STEP/STL design packet for a 3D print fixture.',
      input: { text: 'OpenSCAD, STL, STEP, slicer, G-code prep' },
    })

    expect(result.blueprint.blueprintId).toBe('cad-3d-print-design-v1')
    expect(result.blueprint.roomId).toBe('terra-forge')
    expect(result.blueprint.stationId).toBe('terra-modeling-studio')
    expect(result.artifactKind).toBe('cad-design-packet')
    expect(result.requiresApproval).toBe(true)
    expect(result.lockedActions.join(' ')).toContain('printer control')
  })

  it('routes DB and Obsidian catalog work to Poseidon in Atlantis Vault', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-vault',
      createdAtMs: 101,
      source: 'ui',
      intent: 'Audit Atlantis Vault',
      summary: 'Check DB and Obsidian catalog links without writing anything live.',
      input: { text: 'Atlantis Vault database audit obsidian catalog rejected candidates cleanup readback' },
    })

    expect(result.blueprint.blueprintId).toBe('atlantis-vault-governance-v1')
    expect(result.blueprint.roomId).toBe('atlantis-vault')
    expect(result.blueprint.stationId).toBe('atlantis-index')
    expect(result.artifactKind).toBe('data-vault-audit-packet')
    expect(result.requiresApproval).toBe(false)
    expect(result.lockedActions.join(' ')).toContain('database write without DLV approval')
    expect(result.readback).toContain('show only data-backed health cards')
  })

  it('routes daily news and content work to Gateway with delivery locked', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-news',
      createdAtMs: 102,
      source: 'ui',
      intent: 'Daily newspaper content packet',
      summary: 'Create a daily briefing and video content packet for Workspace readback.',
      input: { text: 'daily newspaper briefing content video' },
    })

    expect(result.blueprint.blueprintId).toBe('daily-news-content-v1')
    expect(result.blueprint.roomId).toBe('gateway-cockpit')
    expect(result.blueprint.stationId).toBe('gateway-console')
    expect(result.artifactKind).toBe('news-brief-packet')
    expect(result.requiresApproval).toBe(true)
    expect(result.lockedActions.join(' ')).toContain('Discord send')
  })

  it('keeps daily news primary when the prompt says not to send Discord', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-news-no-send',
      createdAtMs: 102,
      source: 'ui',
      intent: 'Daily news and content packet',
      summary: 'Create a local daily newspaper/content/video briefing packet for Workspace readback.',
      input: { text: 'Daily newspaper briefing content video packet for local readback. Do not send Discord.' },
    })

    expect(result.blueprint.blueprintId).toBe('daily-news-content-v1')
    expect(result.blueprint.stationId).toBe('gateway-console')
  })

  it('approval-gates live publish, upload, purchase, and message actions', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-live-risk',
      createdAtMs: 103,
      source: 'hermes',
      intent: 'Publish and purchase',
      summary: 'Upload the Etsy listing, publish it, pay for generation, purchase inventory, and send message to supplier.',
      input: { text: 'publish upload purchase pay send message supplier live listing' },
    })

    expect(result.blueprint.blueprintId).toBe('approval-gate-v1')
    expect(result.blueprint.roomId).toBe('olympus-command')
    expect(result.blueprint.stationId).toBe('approval-dais')
    expect(result.approvalStatus).toBe('waiting_operator')
    expect(result.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('honors explicit safe blueprint hints when valid', () => {
    const result = routeWorkspaceActionToBlueprint({
      actionId: 'action-explicit',
      createdAtMs: 104,
      source: 'operator',
      intent: 'status',
      summary: 'Give me a project checkpoint.',
      preferredBlueprintId: 'generic-project-status-v1',
      input: { text: 'AliExpress text should not override the explicit status blueprint.' },
    })

    expect(result.blueprint.blueprintId).toBe('generic-project-status-v1')
    expect(result.approvalStatus).toBe('not_required')
  })
})
