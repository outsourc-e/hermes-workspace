/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalGateCard } from './approval-gate-card'

const BASE = {
  title: 'Publish changelog 0.9.3 to the public site',
  command: 'gh workflow run publish.yml -f tag=v0.9.3',
  blastRadius: '1 public page · RSS to 2,411 subscribers',
  undoPath: 'Revert commit + CDN purge ≈90s.',
  actions: ['APPROVE', 'REJECT', 'HOLD FOR QA'],
}

// This repo does not enable vitest `globals`, so Testing Library's automatic
// cleanup is never registered — unmount between cases explicitly.
afterEach(cleanup)

describe('ApprovalGateCard', () => {
  it('states blast radius and undo path before the buttons', () => {
    render(<ApprovalGateCard {...BASE} waiting="4m 12s" />)

    expect(screen.getByText('APPROVAL REQUIRED')).toBeTruthy()
    expect(screen.getByText('BLAST RADIUS')).toBeTruthy()
    expect(screen.getByText('UNDO PATH')).toBeTruthy()
    expect(screen.getByText('waiting 4m 12s')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('is inert without a handler and reports the action with one', () => {
    const { unmount } = render(<ApprovalGateCard {...BASE} />)
    expect(() => fireEvent.click(screen.getByText('APPROVE'))).not.toThrow()
    unmount()

    const onAction = vi.fn()
    render(<ApprovalGateCard {...BASE} onAction={onAction} />)
    fireEvent.click(screen.getByText('REJECT'))
    expect(onAction).toHaveBeenCalledWith('REJECT')
  })

  it('shortens the panel headings only when asked to', () => {
    const { unmount } = render(
      <ApprovalGateCard
        {...BASE}
        cellLabels={{ blastRadius: 'RADIUS', undoPath: 'UNDO' }}
      />,
    )
    expect(screen.getByText('RADIUS')).toBeTruthy()
    expect(screen.getByText('UNDO')).toBeTruthy()
    expect(screen.queryByText('BLAST RADIUS')).toBeNull()
    expect(screen.queryByText('UNDO PATH')).toBeNull()
    // The values are untouched — only the headings change.
    expect(screen.getByText(BASE.blastRadius)).toBeTruthy()
    expect(screen.getByText(BASE.undoPath)).toBeTruthy()
    unmount()

    // One override leaves the other heading full.
    render(<ApprovalGateCard {...BASE} cellLabels={{ undoPath: 'UNDO' }} />)
    expect(screen.getByText('BLAST RADIUS')).toBeTruthy()
    expect(screen.getByText('UNDO')).toBeTruthy()
  })

  it('prints the keyboard hint only when given one, and only while pending', () => {
    const hint = '⌘⏎ approve · ⌘⌫ reject'

    const { unmount } = render(<ApprovalGateCard {...BASE} />)
    expect(screen.queryByText(hint)).toBeNull()
    unmount()

    const withHint = render(<ApprovalGateCard {...BASE} hint={hint} />)
    expect(screen.getByText(hint)).toBeTruthy()
    // It sits in the button row, after the buttons.
    expect(screen.getAllByRole('button')).toHaveLength(3)
    withHint.unmount()

    for (const state of ['approved', 'rejected'] as const) {
      const resolved = render(
        <ApprovalGateCard {...BASE} hint={hint} state={state} />,
      )
      expect(screen.queryByText(hint)).toBeNull()
      resolved.unmount()
    }
  })

  it('drops the buttons and the waiting timer once resolved', () => {
    for (const state of ['approved', 'rejected'] as const) {
      const { unmount } = render(
        <ApprovalGateCard {...BASE} waiting="4m 12s" state={state} />,
      )
      expect(screen.getByText(state.toUpperCase())).toBeTruthy()
      expect(screen.queryByText('waiting 4m 12s')).toBeNull()
      expect(screen.queryAllByRole('button')).toHaveLength(0)
      expect(screen.getByText(`gate resolved · ${state}`)).toBeTruthy()
      unmount()
    }
  })
})
