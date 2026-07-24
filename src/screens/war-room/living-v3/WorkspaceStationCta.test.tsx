// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceStationCta } from './WorkspaceStationCta'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WorkspaceStationCta', () => {
  it('renders the shared station CTA as a compact action chip without the old heavy Proof card', async () => {
    const onPrimaryAction = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await React.act(() => {
      root.render(
        <WorkspaceStationCta
          actionId="atlantis.refresh-source-index"
          label="Refresh data"
          sublabel="Read-only vault status"
          status="ready"
          ownerAgentId="poseidon"
          ownerLabel="Poseidon"
          targetRoomId="atlantis-vault"
          targetStationId="atlantis-index"
          targetToolLabel="Source Index"
          motionSignal="standby"
          onPrimaryAction={onPrimaryAction}
          secondaryActions={[{ id: 'next', label: 'Next' }]}
          proofSummary="Read-only proof"
          proofItems={["No writes"]}
        />,
      )
    })

    const cta = container.querySelector<HTMLElement>('[data-workspace-station-cta="compact-v2"]')
    expect(cta).toBeTruthy()
    expect(cta?.getAttribute('data-workspace-station-cta-heavy-card')).toBe('removed')
    expect(cta?.getAttribute('data-primary-action-id')).toBe('atlantis.refresh-source-index')
    expect(cta?.getAttribute('data-primary-action-owner')).toBe('poseidon')
    expect(cta?.getAttribute('data-primary-action-status')).toBe('ready')
    expect(cta?.getAttribute('data-primary-action-position')).toBe('standard-header-right')
    expect(cta?.getAttribute('data-proof-collapsed')).toBe('removed')
    expect(cta?.getAttribute('data-action-owner-agent')).toBe('poseidon')
    expect(cta?.getAttribute('data-action-target-room')).toBe('atlantis-vault')
    expect(cta?.getAttribute('data-action-target-station')).toBe('atlantis-index')
    expect(cta?.getAttribute('data-action-target-tool')).toBe('Source Index')
    expect(cta?.getAttribute('data-action-motion-signal')).toBe('standby')
    expect(cta?.textContent).toContain('Refresh data')
    expect(cta?.textContent).toContain('Source Index')
    expect(cta?.querySelector('.workspace-station-cta__proof')).toBeNull()
    expect(cta?.textContent).not.toContain('Proof')

    await React.act(() => root.unmount())
    document.body.removeChild(container)
  })
})
