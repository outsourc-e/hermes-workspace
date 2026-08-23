/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileConductorBoard } from './mobile-conductor'
import type { ReactNode } from 'react'
import {
  mobileConductorLastNightFixture,
  mobileConductorNeedsYouFixture,
  mobileConductorRunningChain,
} from '@/components/jarvis/fixtures'

/**
 * The board's inactive COMMAND tab is a real `<Link>`, which needs a mounted
 * router. Standing one up would test TanStack, not this board — and the board
 * has no other router dependency — so `Link` is stubbed as the anchor it
 * renders to and everything else is exercised for real.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string
    children: ReactNode
    className?: string
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

// This repo does not enable vitest `globals`, so Testing Library's automatic
// cleanup is never registered — unmount between cases explicitly.
afterEach(cleanup)

describe('MobileConductorBoard', () => {
  it('answers the four glance counts without a scroll', () => {
    const { container } = render(<MobileConductorBoard />)

    const stats = container.querySelectorAll('[data-jv-stat-tone]')
    expect(stats).toHaveLength(4)
    expect(screen.getByText('RUNNING')).toBeTruthy()
    expect(screen.getByText('BLOCKED')).toBeTruthy()
    expect(screen.getByText('FAILED')).toBeTruthy()
    expect(screen.getByText('IDLE')).toBeTruthy()
  })

  it('points at the gate rather than drawing it', () => {
    const { container } = render(<MobileConductorBoard />)

    const needsYou = screen.getByRole('region', {
      name: mobileConductorNeedsYouFixture.heading,
    })
    expect(
      within(needsYou).getByText(mobileConductorNeedsYouFixture.label),
    ).toBeTruthy()
    expect(
      within(needsYou).getByText(mobileConductorNeedsYouFixture.title),
    ).toBeTruthy()

    // A glance surface must not imply you can decide from here: the honest
    // blast-radius panel belongs to the Command board's gate, not to this one.
    expect(container.querySelector('[data-jv-gate-state]')).toBeNull()
    expect(screen.queryByText('BLAST RADIUS')).toBeNull()
  })

  it('lists only the running workers and marks the chain as a convention', () => {
    const { container } = render(<MobileConductorBoard />)

    const running = container.querySelectorAll(
      '[data-jv-worker-status="running"]',
    )
    expect(running).toHaveLength(2)

    const chain = screen.getByText(mobileConductorRunningChain.chain)
    expect(chain.getAttribute('data-jv-fixture')).toBe('no-source')
  })

  it('shows only the unhealthy jobs, with the healthy rest as one line', () => {
    const { container } = render(<MobileConductorBoard />)

    const jobs = container.querySelectorAll('[data-jv-job-tone]')
    expect(jobs).toHaveLength(2)
    expect(screen.getByText('ops-watch:certs')).toBeTruthy()
    expect(screen.getByText('maintainer:dep-audit')).toBeTruthy()
    expect(screen.getByText('4 other jobs healthy')).toBeTruthy()

    // The launchd diagnostic has no source at all (mapping §3.5 item 12).
    expect(
      screen
        .getByText('no run in 23d · launchd unloaded')
        .getAttribute('data-jv-fixture'),
    ).toBe('no-source')
  })

  it('marks the whole run history as a fixture — no per-run source exists', () => {
    const { container } = render(<MobileConductorBoard />)

    const lastNight = screen.getByRole('region', {
      name: mobileConductorLastNightFixture.heading,
    })
    expect(lastNight.getAttribute('data-jv-fixture')).toBe('no-source')
    expect(container.querySelectorAll('[data-jv-run-outcome]')).toHaveLength(
      mobileConductorLastNightFixture.runs.length,
    )
  })
})
