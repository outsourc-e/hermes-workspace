/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SpeechBubble } from './speech-bubble'
import { Toast, rarityForPlaygroundToast } from './toast'

describe('SpeechBubble', () => {
  it('renders all gameplay variants with tail data attributes', () => {
    const variants = ['npc', 'player', 'system', 'whisper', 'party'] as const
    for (const variant of variants) {
      const { unmount } = render(
        <SpeechBubble variant={variant} name={variant} tail="bottom">
          Hello {variant}
        </SpeechBubble>,
      )
      const bubble = screen
        .getByText(`Hello ${variant}`)
        .closest('.hermes-speech-bubble')
      expect(bubble?.getAttribute('data-variant')).toBe(variant)
      expect(bubble?.getAttribute('data-tail')).toBe('bottom')
      unmount()
    }
  })
})

describe('Toast', () => {
  it('renders all rarity variants and maps playground reward kinds', () => {
    const rarities = [
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
    ] as const
    for (const rarity of rarities) {
      const { unmount } = render(
        <Toast title={`${rarity} loot`} rarity={rarity}>
          Reward text
        </Toast>,
      )
      expect(
        screen
          .getByText(`${rarity} loot`)
          .closest('.hermes-toast')
          ?.getAttribute('data-rarity'),
      ).toBe(rarity)
      unmount()
    }

    expect(rarityForPlaygroundToast('item')).toBe('uncommon')
    expect(rarityForPlaygroundToast('quest')).toBe('rare')
    expect(rarityForPlaygroundToast('title')).toBe('legendary')
    expect(rarityForPlaygroundToast('misc')).toBe('common')
  })
})
