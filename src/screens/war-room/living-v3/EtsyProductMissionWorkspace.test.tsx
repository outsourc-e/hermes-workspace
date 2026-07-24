/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { createInitialEtsyPipelineState, syncEtsyPipelineToExternalProduct } from '../../../lib/war-room/living-v3/etsy-pipeline'
import { migrateEtsyProductWorkspaceStateV2 } from '../../../lib/war-room/living-v3/etsy-product-model'
import { createInitialEtsyRoomState, selectEtsyCandidateLocal } from '../../../lib/war-room/living-v3/etsy-room-contracts'
import { EtsyProductMissionWorkspace } from './EtsyProductMissionWorkspace'
import type { EtsyRoomState } from '../../../lib/war-room/living-v3/etsy-room-contracts'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function actions() {
  return {
    onOpenOpportunityResearch: vi.fn(),
    onSelectStation: vi.fn(),
    onResetPipeline: vi.fn(),
    selectCandidate: vi.fn(),
    createTruthPacket: vi.fn(),
    setShotLabPreset: vi.fn(),
    setShotLabImageCount: vi.fn(),
    setShotLabSourceImageRequirements: vi.fn(),
    setShotLabVariantNotes: vi.fn(),
    createShotLabHandoffPacket: vi.fn(),
    createSeoPacket: vi.fn(),
    createDraftPayload: vi.fn(),
    createDraftApprovalPacket: vi.fn(),
    updateQaItemStatus: vi.fn(),
  }
}

function selectedRoomState(): EtsyRoomState {
  const room = createInitialEtsyRoomState(100)
  const candidate = {
    candidateId: 'candidate-1',
    packetId: 'packet-1',
    runId: room.run.runId,
    title: 'Modern Ceramic Cup',
    niche: 'ceramic drinkware',
    score: 82,
    sourceType: 'Smart intake local' as const,
    dataOrigin: 'smart-intake-local' as const,
    sourceRecordIds: ['source-1'],
    sourceDetails: [{
      kind: 'etsy' as const,
      label: 'Etsy reference',
      marketplace: 'Etsy',
      url: 'https://www.etsy.com/listing/1/cup',
      imageUrl: 'https://example.com/cup.jpg',
      localImageRef: '/war-room/etsy-product-media/cup.jpg',
      variantOptions: ['Capacity: 6 oz', 'Capacity: 8 oz'],
    }],
    imageRefs: ['/war-room/etsy-product-media/cup.jpg'],
    evidenceIds: ['evidence-1'],
    missingFields: [],
    riskNotes: [],
    nextHandoff: 'select_etsy_candidate_local' as const,
    selected: true,
  }
  return selectEtsyCandidateLocal({ ...room, candidates: [candidate] }, candidate.candidateId, 100)
}

function workspaceState(
  roomState: EtsyRoomState,
  pipelineState: ReturnType<typeof createInitialEtsyPipelineState>,
) {
  return migrateEtsyProductWorkspaceStateV2({ roomState, pipelineState, nowMs: 100 })
}

describe('EtsyProductMissionWorkspace', () => {
  it('renders a truthful Product Packet Inbox instead of the legacy Etsy search surface', async () => {
    const handlers = actions()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <EtsyProductMissionWorkspace
          selectedStationId="etsy-loki-product-hunt"
          workspaceState={workspaceState(createInitialEtsyRoomState(100), createInitialEtsyPipelineState())}
          operatorLabel="Loki"
          operatorStatus="waiting"
          stationSurface={<div data-legacy-search-surface>Search products</div>}
          actions={handlers}
        />,
      )
    })

    expect(container.querySelector('[data-product-mission-workspace="v1"]')).toBeTruthy()
    expect(container.querySelector('[data-product-mission-list="v1"]')).toBeTruthy()
    expect(container.querySelector('[data-product-packet-inbox="v1"]')).toBeTruthy()
    expect(container.querySelector('[data-legacy-search-surface]')).toBeNull()
    expect(container.textContent).toContain('Product Mission List')
    expect(container.textContent).toContain('Waiting for an external product intake packet')
    expect(container.textContent).toContain('Manual stage start')
    expect(container.textContent).not.toContain('Search products')

    const researchButton = container.querySelector<HTMLButtonElement>('[data-open-research-lab="goblin-opportunity-room"]')
    expect(researchButton).toBeTruthy()
    await React.act(() => researchButton?.click())
    expect(handlers.onOpenOpportunityResearch).toHaveBeenCalledTimes(1)

    await React.act(() => root.unmount())
    document.body.removeChild(container)
  })

  it('starts only the requested next stage and keeps handoff manual', async () => {
    const handlers = actions()
    const roomState = selectedRoomState()
    const pipeline = syncEtsyPipelineToExternalProduct(createInitialEtsyPipelineState(), {
      candidateId: 'candidate-1',
      packetId: 'packet-1',
      title: 'Modern Ceramic Cup',
      niche: 'ceramic drinkware',
      signal: 'Selected local product packet',
      evidenceIds: ['evidence-1'],
      sourceRecordIds: ['source-1'],
      evidenceQuality: 'verified-local',
      dataOrigin: 'local-product-research',
      confidence: 82,
      sourceLabels: ['Local product packet'],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <EtsyProductMissionWorkspace
          selectedStationId="etsy-loki-product-hunt"
          workspaceState={workspaceState(roomState, pipeline)}
          operatorLabel="Loki"
          operatorStatus="waiting"
          stationSurface={null}
          actions={handlers}
        />,
      )
    })

    const startTruthButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent.trim().startsWith('Start Truth'))
    expect(startTruthButton).toBeTruthy()
    await React.act(() => startTruthButton?.click())

    expect(handlers.onSelectStation).toHaveBeenCalledWith('etsy-thor-source-truth')
    expect(handlers.createTruthPacket).toHaveBeenCalledTimes(1)
    expect(handlers.createShotLabHandoffPacket).not.toHaveBeenCalled()
    expect(handlers.createSeoPacket).not.toHaveBeenCalled()
    expect(handlers.createDraftPayload).not.toHaveBeenCalled()
    expect(handlers.createDraftApprovalPacket).not.toHaveBeenCalled()

    await React.act(() => root.unmount())
    document.body.removeChild(container)
  })

  it('renders local product media and persists visual shot-type and variant selections through existing draft setters', async () => {
    const handlers = actions()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <EtsyProductMissionWorkspace
          selectedStationId="etsy-thor-shotlab-prep"
          workspaceState={workspaceState(selectedRoomState(), createInitialEtsyPipelineState())}
          operatorLabel="Thor"
          operatorStatus="waiting"
          stationSurface={null}
          actions={handlers}
        />,
      )
    })

    const firstMediaPreview = container.querySelector<HTMLElement>('[data-media-slot="1"] .etsy-mission__media-preview')
    const localImage = firstMediaPreview?.querySelector<HTMLImageElement>('img[src="/war-room/etsy-product-media/cup.jpg"]')
    expect(localImage).toBeTruthy()
    await React.act(() => localImage?.dispatchEvent(new Event('error')))
    const remoteFallback = firstMediaPreview?.querySelector<HTMLImageElement>('img[src="https://example.com/cup.jpg"]')
    expect(remoteFallback).toBeTruthy()
    await React.act(() => remoteFallback?.dispatchEvent(new Event('error')))
    expect(firstMediaPreview?.querySelector('img')).toBeNull()
    expect(firstMediaPreview?.querySelector('svg')).toBeTruthy()
    expect(container.textContent).toContain('Capacity: 6 oz')
    expect(container.textContent).toContain('Capacity: 8 oz')

    const lifestyle = container.querySelector<HTMLButtonElement>('[data-shot-type="Lifestyle"]')
    const variant = container.querySelector<HTMLButtonElement>('[data-variant-option="Capacity: 8 oz"]')
    expect(lifestyle).toBeTruthy()
    expect(variant).toBeTruthy()
    await React.act(() => lifestyle?.click())
    await React.act(() => variant?.click())
    expect(handlers.setShotLabSourceImageRequirements).toHaveBeenCalled()
    expect(handlers.setShotLabVariantNotes).toHaveBeenCalled()

    await React.act(() => root.unmount())
    document.body.removeChild(container)
  })
})
