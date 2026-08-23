/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VerificationBadge } from './verification-badge'

// This repo does not enable vitest `globals`, so Testing Library's automatic
// cleanup is never registered — unmount between cases explicitly.
afterEach(cleanup)

describe('VerificationBadge', () => {
  it('labels the two states distinctly', () => {
    const { unmount } = render(
      <VerificationBadge
        state="verified"
        title="Repro case fails as expected"
      />,
    )
    expect(screen.getByText('VERIFIED')).toBeTruthy()
    unmount()

    render(<VerificationBadge state="claimed" title="Agent says it works" />)
    expect(screen.getByText('CLAIMED · UNVERIFIED')).toBeTruthy()
  })

  it('renders evidence lines, time and action chips when supplied', () => {
    render(
      <VerificationBadge
        state="claimed"
        time="09:38"
        title="Restorable from vault git"
        evidence={['no artifact checked · no exit code']}
        actions={['VERIFY NOW', 'SHOW PLAN']}
      />,
    )

    expect(screen.getByText('09:38')).toBeTruthy()
    expect(screen.getByText('no artifact checked · no exit code')).toBeTruthy()
    expect(screen.getByText('VERIFY NOW')).toBeTruthy()
    expect(screen.getByText('SHOW PLAN')).toBeTruthy()
  })

  it('omits the evidence block entirely when there is none', () => {
    const { container } = render(
      <VerificationBadge state="verified" title="Approved by a human" />,
    )

    // header + title only — no empty evidence or action rows.
    expect(
      container.querySelector('[data-jv-verification]')?.children,
    ).toHaveLength(2)
  })
})
