// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AtlantisVaultSurface } from './AtlantisVaultSurface'
import type { AtlantisVaultSnapshot } from '../../../lib/war-room/living-v3/atlantis-vault-contract'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const snapshot: AtlantisVaultSnapshot = {
  ok: true,
  schemaVersion: 'atlantis-vault-status-v1',
  generatedAtMs: 10_000,
  source: 'server-real-readback',
  poseidon: {
    agentId: 'poseidon',
    roomId: 'atlantis-vault',
    stationId: 'atlantis-index',
    portraitPath: '/war-room/living-v3/agents/poseidon/portrait.png',
    visualStatus: 'poseidon-sea-pet-runtime-final',
    role: 'Atlantis Vault manager',
  },
  database: {
    activeTruthStore: 'local-json',
    supabaseRuntimeConnected: false,
    supabaseFoundationPresent: true,
    supabaseMigrationFiles: 4,
    localStoreFiles: 3,
    workspaceCoreProvider: 'local-file',
    workspaceCoreStatus: 'fallback',
    workspaceCoreRunCount: 0,
    workspaceCoreApprovalCount: 0,
    statement: 'Atlantis is reading real local Workspace stores now. Supabase/Postgres runtime writes are not enabled in this room yet.',
  },
  counts: {
    stores: 6,
    storesReady: 4,
    storesEmpty: 1,
    warnings: 1,
    blocked: 0,
    runs: 2,
    events: 3,
    artifacts: 1,
    approvalsWaiting: 0,
    etsyCandidates: 1,
    rejectedCandidates: 1,
    councilDiscussions: 1,
    obsidianLoadedNotes: 1,
    obsidianMissingNotes: 1,
    obsidianBlockedNotes: 0,
    poseidonRuntimeFiles: 15,
  },
  stores: [
    {
      id: 'workspace-kernel',
      kind: 'workspace-kernel',
      label: 'Workspace Kernel',
      state: 'ready',
      recordCount: 5,
      updatedAtMs: 10_000,
      detail: '2 runs · 3 events · 1 packets',
      path: '/tmp/workspace-kernel/state.json',
      proof: ['/tmp/workspace-kernel/state.json'],
    },
    {
      id: 'supabase-foundation',
      kind: 'supabase-foundation',
      label: 'Supabase Foundation',
      state: 'warn',
      recordCount: 4,
      updatedAtMs: null,
      detail: '4 migration files found; Atlantis runtime still reads local stores only.',
      path: '/tmp/supabase',
      proof: ['/tmp/supabase'],
    },
  ],
  flow: [
    { id: 'kernel-to-poseidon', from: 'Workspace Kernel', to: 'Poseidon', label: 'runs / packets', value: 3, state: 'ready' },
    { id: 'poseidon-asset-to-room', from: 'Poseidon asset', to: 'Atlantis room', label: 'runtime files', value: 15, state: 'ready' },
  ],
  obsidian: {
    vaultDir: '/tmp/obsidian',
    allowlistedNotes: 2,
    notes: [
      {
        noteId: 'workspace-bridge',
        title: 'Workspace bridge',
        relativePath: '04 Decisions/Workspace bridge.md',
        kind: 'decision',
        status: 'loaded',
        updatedAt: '2026-07-04T00:00:00Z',
      },
      {
        noteId: 'missing-note',
        title: 'Missing note',
        relativePath: 'missing.md',
        kind: 'decision',
        status: 'missing',
        updatedAt: null,
      },
    ],
  },
  recentRuns: [],
  recentArtifacts: [
    {
      artifactId: 'artifact-1',
      runId: 'run-1',
      kind: 'data-vault-audit-packet',
      label: 'Atlantis audit',
      roomId: 'atlantis-vault',
      stationId: 'atlantis-index',
      dataOrigin: 'local-only',
      missingFields: [],
      lockedActions: ['DB writes require DLV approval'],
      createdAtMs: 10_000,
    },
  ],
  safety: {
    localOnly: true,
    readOnly: true,
    getOnly: true,
    liveActionsAllowed: false,
    externalRequestsAllowed: false,
    writebackAllowed: false,
    workerSpawnAllowed: false,
  },
  lockedActions: ['DB writes require DLV approval'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

async function renderSurface() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(() => {
    root.render(<AtlantisVaultSurface />)
  })
  await React.act(async () => {
    await Promise.resolve()
  })
  return {
    container,
    unmount: async () => {
      await React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

describe('AtlantisVaultSurface', () => {
  it('loads the read-only Atlantis API and renders real-readback status without fake data labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(snapshot),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container, unmount } = await renderSurface()

    expect(fetchMock).toHaveBeenCalledWith('/api/war-room/atlantis-vault/status', expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    }))
    expect(container.querySelector('[data-atlantis-vault-surface="v1"]')).toBeTruthy()
    expect(container.querySelector('[data-atlantis-source="server-real-readback"]')).toBeTruthy()
    expect(container.querySelector('[data-atlantis-visual-workbench="truth-vault-v3"]')).toBeTruthy()
    expect(container.querySelector('[data-read-only="true"]')).toBeTruthy()
    expect(container.textContent).toContain('כספת מקור האמת')
    expect(container.textContent).toContain('בריאות מקור האמת')
    expect(container.textContent).toContain('Source health')
    expect(container.textContent).toContain('מצב ב־3 שניות')
    expect(container.textContent).toContain('Database spine')
    expect(container.textContent).toContain('Decision queue')
    expect(container.querySelector('[data-atlantis-toggle-details="true"]')?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.atlantis-vault__secondary-health')?.getAttribute('data-atlantis-details-open')).toBe('false')
    expect(container.querySelector('.atlantis-vault__grid')?.getAttribute('data-atlantis-details-open')).toBe('false')
    expect(container.textContent).toContain('Workspace Kernel')
    expect(container.textContent).toContain('Workspace memory')
    expect(container.textContent).toContain('Workspace Core')
    expect(container.textContent).toContain('local fallback')
    expect(container.textContent).toContain('Source proof')
    expect(container.textContent).toContain('Vault audit')
    expect(container.textContent).not.toContain('Poseidon room readback')
    expect(container.textContent).not.toContain('Vault command map')
    expect(container.textContent).not.toContain('Pipeline command table')
    expect(container.textContent).not.toMatch(/mock data|demo product|fake green/i)
    expect(container.textContent).not.toContain('Proof / debug details')
    expect(container.textContent).not.toContain('data-vault-audit-packet')

    const stationCta = container.querySelector<HTMLElement>('[data-workspace-station-cta="compact-v2"]')
    expect(stationCta).toBeTruthy()
    expect(stationCta?.getAttribute('data-workspace-station-cta-heavy-card')).toBe('removed')
    expect(stationCta?.getAttribute('data-primary-action-id')).toBe('atlantis.refresh-source-index')
    expect(stationCta?.textContent).not.toContain('Proof')
    expect(stationCta?.getAttribute('data-primary-action-owner')).toBe('poseidon')
    expect(stationCta?.getAttribute('data-primary-action-status')).toBe('ready')
    expect(stationCta?.getAttribute('data-primary-action-position')).toBe('standard-header-right')
    expect(stationCta?.getAttribute('data-proof-collapsed')).toBe('removed')
    expect(stationCta?.getAttribute('data-action-owner-agent')).toBe('poseidon')
    expect(stationCta?.getAttribute('data-action-target-room')).toBe('atlantis-vault')
    expect(stationCta?.getAttribute('data-action-target-station')).toBe('atlantis-index')
    expect(stationCta?.getAttribute('data-action-target-tool')).toBe('Source Index')
    expect(stationCta?.getAttribute('data-action-motion-signal')).toBe('standby')
    expect(stationCta?.textContent).toContain('Refresh index')
    expect(stationCta?.textContent).toContain('Source Index')

    await unmount()
  })
})
