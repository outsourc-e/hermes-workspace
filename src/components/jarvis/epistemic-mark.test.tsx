/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EpistemicMark } from './epistemic-mark'
import type { EpistemicMarkKind } from './types'

const EXPECTED_TAGS: Record<EpistemicMarkKind, string> = {
  known: 'KN',
  recalled: 'RC',
  assumed: 'AS',
}

// This repo does not enable vitest `globals`, so Testing Library's automatic
// cleanup is never registered — unmount between cases explicitly.
afterEach(cleanup)

describe('EpistemicMark', () => {
  it('renders the right tag for each mark', () => {
    for (const [mark, tag] of Object.entries(EXPECTED_TAGS)) {
      const { unmount } = render(
        <EpistemicMark mark={mark as EpistemicMarkKind}>a claim</EpistemicMark>,
      )
      expect(screen.getByText('a claim')).toBeTruthy()
      expect(screen.getByText(tag)).toBeTruthy()
      unmount()
    }
  })

  it('binds each mark to its own underline style token, never a literal', () => {
    for (const mark of Object.keys(EXPECTED_TAGS) as Array<EpistemicMarkKind>) {
      const { container, unmount } = render(
        <EpistemicMark mark={mark}>a claim</EpistemicMark>,
      )
      const claim = container.querySelector(`[data-jv-mark="${mark}"]`)
      const border = (claim as HTMLElement).style.borderBottom

      expect(border).toContain(`var(--jv-${mark}-rule-style)`)
      expect(border).toContain(`var(--jv-${mark}-rule)`)
      expect(border).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      unmount()
    }
  })
})
