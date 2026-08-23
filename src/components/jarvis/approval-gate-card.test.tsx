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
