import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildEtsyOpsRoomState,
  classifyEtsyOpsAction,
  getEtsyOpsMediaRoots,
  isAllowedEtsyOpsMediaPath,
  scanEtsyOpsMediaSources,
} from '../war-room-etsy-ops'

describe('War Room Etsy Ops server policy', () => {
  it('classifies live marketplace and supplier intents as manual approval packets', () => {
    expect(classifyEtsyOpsAction('simulate-live-publish')).toMatchObject({
      actionId: 'simulate-live-publish',
      riskClass: 'approval-required',
      mode: 'manual-approval-packet',
      liveExternalMutation: false,
      createsKanbanCard: true,
      targetSystem: 'etsy-shop',
    })
    expect(classifyEtsyOpsAction('message-supplier')).toMatchObject({
      riskClass: 'approval-required',
      mode: 'manual-approval-packet',
      liveExternalMutation: false,
      targetSystem: 'supplier-marketplace',
    })
  })

  it('keeps local/read-only actions separated from live external actions', () => {
    expect(classifyEtsyOpsAction('inspect-product')).toMatchObject({
      riskClass: 'read-only',
      mode: 'read-only-preview',
      liveExternalMutation: false,
      createsKanbanCard: false,
    })
    expect(classifyEtsyOpsAction('prepare-listing-draft')).toMatchObject({
      riskClass: 'local-write',
      mode: 'safe-local-write',
      targetSystem: 'workspace-local',
      liveExternalMutation: false,
      createsKanbanCard: true,
    })
    expect(classifyEtsyOpsAction('agent-chat-note')).toMatchObject({
      riskClass: 'local-write',
      mode: 'safe-local-write',
      targetSystem: 'workspace-local',
      liveExternalMutation: false,
      createsKanbanCard: true,
    })
  })

  it('returns the V2 living room state with Hermes-safe agents', () => {
    const state = buildEtsyOpsRoomState('/definitely-missing-hermes-workspace-root')

    expect(state.mode).toBe('etsy-ops-room-v2')
    expect(state.plugin.safety.liveExternalMutation).toBe(false)
    expect(state.agents).toHaveLength(3)
    for (const agent of state.agents) expect(agent.chat.modelProfileId).toBe('chatgpt-5.5')
    expect(state.agents.every((agent) => agent.animation.targetFrames === 96)).toBe(true)
  })

  it('allows previews only under approved media roots', () => {
    const roots = [{ id: 'test', label: 'Test', purpose: 'test', rootPath: '/tmp/hermes-etsy-media' }]

    expect(isAllowedEtsyOpsMediaPath('/tmp/hermes-etsy-media/product.png', roots)).toBe(true)
    expect(isAllowedEtsyOpsMediaPath('/tmp/hermes-etsy-media/nested/product.png', roots)).toBe(true)
    expect(isAllowedEtsyOpsMediaPath('/tmp/hermes-etsy-media-evil/product.png', roots)).toBe(false)
    expect(isAllowedEtsyOpsMediaPath('/etc/passwd', roots)).toBe(false)
  })

  it('declares deterministic default media sources including the optional operator media folders', () => {
    const roots = getEtsyOpsMediaRoots('/workspace', '/home/dlv')

    expect(roots.map((root) => root.id)).toEqual(expect.arrayContaining([
      'product-research',
      'product-intelligence-db',
      'operator-pictures',
      'operator-downloads',
    ]))
    expect(roots.find((root) => root.id === 'operator-pictures')?.rootPath).toBe(path.join('/home/dlv', 'Pictures', 'Hermes Etsy Media'))
  })

  it('reports missing media roots as an honest empty state instead of fake product images', () => {
    const scan = scanEtsyOpsMediaSources('/definitely-missing-hermes-workspace-root')

    expect(scan.sources.length).toBeGreaterThan(0)
    expect(scan.sources.some((source) => source.id === 'operator-pictures' && source.exists === false)).toBe(true)
    expect(scan.images.every((image) => image.kind === 'image')).toBe(true)
  })
})
