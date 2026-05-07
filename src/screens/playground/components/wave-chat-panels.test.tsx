/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FounderVaultPanel } from './founder-vault-panel'
import { InventoryPanel } from './inventory-panel'
import { MapPanel } from './map-panel'
import { QuestDialogPanel } from './quest-dialog-panel'
import { WaveChatPanelsShowcase } from './wave-chat-panels-showcase'

afterEach(() => cleanup())

describe('Wave chat RPG panels', () => {
  it('renders an inventory with a 6x4 item grid, rarity borders, tooltips, and equip drag handles', () => {
    render(<InventoryPanel />)

    const grid = screen.getByRole('grid', { name: /inventory slots/i })
    const cells = within(grid).getAllByRole('gridcell')
    expect(cells).toHaveLength(24)
    expect(screen.getByText('Inventory')).not.toBeNull()
    expect(screen.getByLabelText(/equip training blade/i).getAttribute('draggable')).toBe('true')
    expect(screen.getByText(/Rare quest reward/i)).not.toBeNull()
    expect(screen.getByLabelText(/training blade/i).getAttribute('data-rarity')).toBe('rare')
  })

  it('renders the quest dialog with NPC portrait, scroll transcript, choices, accept, and decline', () => {
    render(<QuestDialogPanel />)

    expect(screen.getByRole('dialog', { name: /quest dialog/i })).not.toBeNull()
    expect(screen.getByAltText(/athena portrait/i)).not.toBeNull()
    expect(screen.getByRole('region', { name: /dialog scroll/i }).textContent).toMatch(/HermesWorld/i)
    expect(screen.getAllByRole('button', { name: /ask about|promise|request/i })).toHaveLength(3)
    expect(screen.getByRole('button', { name: /accept quest/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /decline/i })).not.toBeNull()
  })

  it('renders a full-screen world map with zones, highlights, and player pin', () => {
    render(<MapPanel />)

    expect(screen.getByRole('dialog', { name: /world map/i })).not.toBeNull()
    expect(screen.getByLabelText(/current player position/i)).not.toBeNull()
    for (const name of ['Agora Commons', 'The Forge', 'Oracle Temple', 'Benchmark Arena']) {
      expect(screen.getByText(name)).not.toBeNull()
    }
    expect(screen.getByLabelText(/zone highlight agora commons/i).getAttribute('data-current-zone')).toBe('true')
  })

  it('renders the founder vault with seven reward slots and claim readiness', () => {
    render(<FounderVaultPanel eligible />)

    const rewards = screen.getAllByTestId('founder-reward-slot')
    expect(rewards).toHaveLength(7)
    for (const reward of ['Founder Cape', 'Founder Banner', 'Aether x50', 'Coins x1000', 'Trader Agent Trial', 'Founder Title', 'Founder Pet']) {
      expect(screen.getByText(reward)).not.toBeNull()
    }
    expect((screen.getByRole('button', { name: /claim founder vault/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('exposes a storybook-style showcase with all four panels for dev server screenshots', () => {
    render(<WaveChatPanelsShowcase />)

    expect(screen.getByRole('main', { name: /wave chat panel showcase/i })).not.toBeNull()
    expect(screen.getByText('Inventory')).not.toBeNull()
    expect(screen.getByText('Quest Dialog')).not.toBeNull()
    expect(screen.getByText('World Map')).not.toBeNull()
    expect(screen.getByText('Founder Vault')).not.toBeNull()
  })
})
