/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MobileCommandBoard } from './mobile-command'
import {
  mobileCommandGateFixture,
  mobileCommandThreadFixture,
} from '@/components/jarvis/fixtures'

// This repo does not enable vitest `globals`, so Testing Library's automatic
// cleanup is never registered — unmount between cases explicitly.
afterEach(cleanup)

describe('MobileCommandBoard', () => {
  it('leads with the gate — the hero is above the thread, not inside it', () => {
    const { container } = render(<MobileCommandBoard />)

    const gate = container.querySelector('[data-jv-gate-state="pending"]')
    const thread = screen.getByRole('region', { name: 'Thread' })
    expect(gate).toBeTruthy()

    // The whole point of artboard 03: the gate is not buried in the
    // conversation. DOCUMENT_POSITION_FOLLOWING === the thread comes after.
    expect(
      gate?.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(thread.contains(gate as Node)).toBe(false)
  })

  it('renders the real ApprovalGateCard, blast radius and undo path intact', () => {
    render(<MobileCommandBoard />)

    // Composing a second gate card for mobile would let the honest panel
    // drift; this asserts the primitive itself is what the phone shows.
    expect(screen.getByText('APPROVAL REQUIRED')).toBeTruthy()
    // Artboard 03 shortens the two headings for the 390pt column — the same
    // primitive, the same cells, fewer words.
    expect(screen.getByText('RADIUS')).toBeTruthy()
    expect(screen.getByText('UNDO')).toBeTruthy()
    expect(screen.queryByText('BLAST RADIUS')).toBeNull()
    expect(screen.queryByText('UNDO PATH')).toBeNull()
    expect(screen.getByText(mobileCommandGateFixture.blastRadius)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('condenses the thread and keeps its claim marked CLAIMED, not verified', () => {
    const { container } = render(<MobileCommandBoard />)

    expect(screen.getByText(mobileCommandThreadFixture.label)).toBeTruthy()
    expect(screen.getByText(/DISAGREES/)).toBeTruthy()
    expect(screen.getByText(mobileCommandThreadFixture.delegation)).toBeTruthy()

    const badge = container.querySelector('[data-jv-verification="claimed"]')
    expect(badge).toBeTruthy()
    expect(
      within(badge as HTMLElement).getByText('CLAIMED · UNVERIFIED'),
    ).toBeTruthy()
  })

  it('draws the legend with the same marks the thread uses', () => {
    const { container } = render(<MobileCommandBoard />)

    // The legend is rendered by EpistemicMark itself, so a legend row can
    // never describe an underline the marks above it do not actually use.
    for (const kind of ['known', 'recalled', 'assumed']) {
      expect(container.querySelector(`[data-jv-mark="${kind}"]`)).toBeTruthy()
    }
    expect(screen.getByText(/solid/)).toBeTruthy()
    expect(screen.getByText(/dotted/)).toBeTruthy()
    expect(screen.getByText(/dashed/)).toBeTruthy()
  })

  it('labels every unsourced region as a fixture', () => {
    const { container } = render(<MobileCommandBoard />)

    expect(
      container.querySelectorAll('[data-jv-fixture="no-source"]').length,
    ).toBeGreaterThan(0)
  })
})
