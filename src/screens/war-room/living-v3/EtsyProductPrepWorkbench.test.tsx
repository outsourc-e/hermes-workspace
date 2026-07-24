// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { createInitialEtsyPipelineState } from '../../../lib/war-room/living-v3/etsy-pipeline'
import {
  createDraftPayloadLocal,
  createInitialEtsyRoomState,
  createSeoPacketLocal,
  createShotLabHandoffLocal,
  prepareProductScoutPacketLocal,
  selectEtsyCandidateLocal,
} from '../../../lib/war-room/living-v3/etsy-room-contracts'
import { EtsyProductPrepWorkbench } from './EtsyProductPrepWorkbench'
import type { OracleSignalPacket } from '../../../lib/war-room/living-v3/oracle-alura'
import type { ResearchMissionPacket } from '../../../lib/war-room/living-v3/research-atlas-contract'
import type { EtsyProductPrepWorkbenchActions, EtsyProductPrepWorkbenchProps } from './EtsyProductPrepWorkbench'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const oracleSignalFixture: OracleSignalPacket = {
  packetId: 'oracle-signal-gold-bow-necklace',
  selectedKeyword: 'gold bow necklace',
  createdAtMs: 990,
  sourceMode: 'alura_only',
  metrics: {
    keyword: 'gold bow necklace',
    keywordScore: 88,
    searchVolume: 1200,
    competition: 24000,
    sales: null,
    avgSales: null,
    revenue: null,
    avgRevenue: null,
    views: null,
    avgPrice: 32,
    competitionLevel: 'medium',
  },
  sourceFile: 'alura-bow-necklace.json',
  sourceFilesUsed: ['alura-bow-necklace.json'],
  evidenceIds: ['alura-bow-necklace:keyword'],
  missingFields: ['supplier proof', 'source product images'],
  dataOrigin: 'local-alura-cache',
  status: 'local_signal_ready',
}

const researchMissionFixture: ResearchMissionPacket = {
  schemaVersion: 'war-room-research-mission-v1',
  missionId: 'research-shop-fixture',
  createdAtMs: 1_060,
  status: 'staged',
  targetType: 'shop',
  target: 'NewShop',
  depth: 'deep',
  modules: ['official-shop', 'supplier-visual', 'risk'],
  notes: 'Local fixture',
  owner: { agentId: 'loki', roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt' },
  outputs: ['workbook'],
  steps: [{ id: 'research', label: 'Research', state: 'pending' }],
  safety: {
    localOnly: true,
    externalResearchStarted: false,
    noMarketplaceWrites: true,
    noSupplierMessages: true,
    approvalRequiredForSideEffects: true,
  },
}

function createReadyRoomState() {
  let state = createInitialEtsyRoomState(1_000)
  state = prepareProductScoutPacketLocal(state, { prompt: 'gold bow necklace', oracleSignalPacket: oracleSignalFixture, nowMs: 1_010 })
  state = selectEtsyCandidateLocal(state, state.candidates[0].candidateId, 1_020)
  state = createShotLabHandoffLocal(state, { ...state.shotLabDraft, nowMs: 1_030 })
  state = createSeoPacketLocal(state, 1_040)
  state = createDraftPayloadLocal(state, 1_050)
  return state
}

function createActions(): EtsyProductPrepWorkbenchActions {
  return {
    updateSearchInput: vi.fn(),
    updateSearchMode: vi.fn(),
    createSearchPacket: vi.fn(),
    prepareScoutPacket: vi.fn(),
    runScoutWorker: vi.fn(),
    runLiveScout: vi.fn(),
    selectCandidate: vi.fn(),
    addCandidateToVisualBoard: vi.fn(),
    rejectCandidate: vi.fn(),
    setShotLabPreset: vi.fn(),
    setShotLabImageCount: vi.fn(),
    setShotLabSourceImageRequirements: vi.fn(),
    setShotLabVariantNotes: vi.fn(),
    createShotLabHandoffPacket: vi.fn(),
    createSeoPacket: vi.fn(),
    createDraftPayload: vi.fn(),
    createDraftApprovalPacket: vi.fn(),
  }
}

async function renderWorkbench(overrides: Partial<EtsyProductPrepWorkbenchProps> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const roomState = overrides.roomState ?? createReadyRoomState()
  const pipeline = overrides.pipeline ?? { ...createInitialEtsyPipelineState(), searchInput: 'gold bow necklace' }
  const actions = overrides.actions ?? createActions()
  await React.act(async () => {
    root.render(
      <EtsyProductPrepWorkbench
        pipeline={pipeline}
        roomState={roomState}
        liveScout={overrides.liveScout ?? {
          status: 'blocked',
          error: 'Live read-only research connector is not enabled.',
          receipt: 'Live read-only research connector is not enabled.',
        }}
        evidenceLoading={overrides.evidenceLoading ?? false}
        actions={actions}
      />,
    )
  })
  return {
    container,
    roomState,
    actions,
    unmount: async () => {
      await React.act(async () => root.unmount())
      document.body.removeChild(container)
    },
  }
}

function query(container: HTMLElement, selector: string) {
  const element = container.querySelector(selector)
  expect(element).toBeTruthy()
  return element as HTMLElement
}

function buttonNamed(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent.trim() === label)
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

async function click(element: HTMLElement) {
  await React.act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('EtsyProductPrepWorkbench', () => {
  it('renders practical workbench surfaces with proof collapsed by default', async () => {
    const roomState = { ...createReadyRoomState(), researchMissionPacket: researchMissionFixture }
    const { container, unmount } = await renderWorkbench({ roomState })

    const root = query(container, '[data-product-prep-workbench="v1"]')
    expect(root.getAttribute('data-workbench-mode')).toBe('visual-receiving-board')
    expect(root.getAttribute('data-live-actions-locked')).toBe('true')
    expect(root.getAttribute('data-etsy-product-board-state')).toBe('has-products')
    expect(query(container, '[data-product-search-surface="moved-to-oracle"]').textContent).toContain('ETSY MARKET LAB')
    expect(query(container, '[data-product-search-surface="moved-to-oracle"]').textContent).toContain('Search in Oracle')
    expect(query(container, '[data-research-mission-handoff="staged"]').textContent).toContain('NewShop')
    expect(query(container, '[data-research-mission-handoff="staged"]').textContent).toContain('External research not started')
    expect(query(container, '[data-etsy-product-prep-cockpit="v1"]').textContent).toContain('Active product artifact')
    expect(query(container, '[data-etsy-readiness-radar="v1"]').textContent).toContain('Draft ready')
    expect(query(container, '[data-etsy-candidate-comparison="v1"]').textContent).toContain('Candidate comparison')
    expect(query(container, '[data-candidate-board="v1"]').textContent).toContain('Gold Bow Necklace')
    expect(query(container, '[data-product-image-placeholder="bow"]')).toBeTruthy()
    expect(query(container, '[data-etsy-visual-surfaces="v1"]').textContent).toContain('Truth')
    expect(query(container, '[data-etsy-visual-surfaces="v1"]').textContent).toContain('ShotLab')
    expect(query(container, '[data-product-dossier="v1"]').textContent).toContain('Truth')
    expect(query(container, '[data-shotlab-prep-board="v1"]').textContent).toContain('ShotLab')
    expect(query(container, '[data-seo-workbench="v1"]').textContent).toContain('SEO')
    expect(query(container, '[data-approval-console="v1"]').textContent).toContain('Draft')

    const proof = query(container, '[data-debug-proof-collapsed="true"]') as HTMLDetailsElement
    expect(proof.open).toBe(false)
    expect(proof.textContent).toContain('Readback / packets')
    expect(container.textContent).toContain('Live read-only research connector is not enabled.')

    const buttonText = Array.from(container.querySelectorAll('button')).map((button) => button.textContent).join(' ')
    expect(buttonText).not.toMatch(/upload|publish/i)

    await unmount()
  })

  it('keeps candidate, ShotLab, SEO, and approval actions local callback driven', async () => {
    const { container, roomState, actions, unmount } = await renderWorkbench()
    const candidateId = roomState.candidates[0].candidateId

    await click(buttonNamed(container, 'Choose'))
    expect(actions.selectCandidate).toHaveBeenCalledWith(candidateId)

    await click(buttonNamed(container, 'Shortlist'))
    expect(actions.addCandidateToVisualBoard).toHaveBeenCalledWith(candidateId)

    await click(buttonNamed(container, 'Reject'))
    expect(actions.rejectCandidate).toHaveBeenCalledWith(candidateId)
    await click(buttonNamed(container, 'Plan images'))
    expect(actions.createShotLabHandoffPacket).toHaveBeenCalledTimes(1)

    await click(buttonNamed(container, 'Write SEO'))
    expect(actions.createSeoPacket).toHaveBeenCalledTimes(1)

    await click(buttonNamed(container, 'Ask approval'))
    expect(actions.createDraftApprovalPacket).toHaveBeenCalledTimes(1)

    expect(query(container, '[data-live-actions-allowed="false"]')).toBeTruthy()
    expect(query(container, '[data-worker-fanout-allowed="false"]')).toBeTruthy()

    await unmount()
  })
})
