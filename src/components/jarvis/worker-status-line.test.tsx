/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkerStatusLine } from './worker-status-line'
import type { WorkerStatus } from './types'

const ALL_STATUSES: Array<WorkerStatus> = [
  'running',
  'blocked',
  'idle',
  'stale',
  'failed',
  'queued',
  'complete',
]

// This repo does not enable vitest `globals`, so Testing Library's automatic
// cleanup is never registered — unmount between cases explicitly.
afterEach(cleanup)

describe('WorkerStatusLine', () => {
  it('renders a row for every status', () => {
    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(
        <WorkerStatusLine name={status} status={status} detail="detail" />,
      )
      expect(
        container.querySelector(`[data-jv-worker-status="${status}"]`),
      ).toBeTruthy()
      expect(screen.getByText(status)).toBeTruthy()
      unmount()
    }
  })

  it('falls back to BLOCKED as the detail only for blocked workers', () => {
    const { unmount } = render(
      <WorkerStatusLine name="km-agent" status="blocked" />,
    )
    expect(screen.getByText('BLOCKED')).toBeTruthy()
    unmount()

    const { container } = render(<WorkerStatusLine name="qa" status="idle" />)
    expect(container.textContent).toBe('qa')
  })

  it('gives blocked a square dot and running a pulsing round one', () => {
    const { container: blocked, unmount } = render(
      <WorkerStatusLine name="km-agent" status="blocked" />,
    )
    const blockedDot = blocked.querySelector('[aria-hidden="true"]')
    expect(blockedDot?.className).not.toContain('rounded-jv-full')
    unmount()

    const { container: running } = render(
      <WorkerStatusLine name="orchestrator" status="running" />,
    )
    const runningDot = running.querySelector('[aria-hidden="true"]')
    expect(runningDot?.className).toContain('rounded-jv-full')
    expect(runningDot?.className).toContain('animate-jv-pulse')
  })
})
