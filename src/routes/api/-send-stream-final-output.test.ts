import { describe, expect, it } from 'vitest'

import { shouldPreferFinalOutput } from './send-stream'

describe('shouldPreferFinalOutput', () => {
  it('prefers a formatted final output over compact streamed deltas for the same text', () => {
    const compact =
      'NichtnurGeschwindigkeit.EinSwarmbringtdreiArtenvonVorteilen:1.Geschwindigkeit2.Qualität3.Kontext-Hygiene'
    const formatted =
      'Nicht nur Geschwindigkeit. Ein Swarm bringt drei Arten von Vorteilen:\n\n1. Geschwindigkeit\n2. Qualität\n3. Kontext-Hygiene'

    expect(shouldPreferFinalOutput(compact, formatted)).toBe(true)
  })

  it('does not replace streamed text with unrelated final output', () => {
    expect(
      shouldPreferFinalOutput(
        'Die aktuelle Antwort ist schon lesbar.',
        'Ein anderer finaler Text.',
      ),
    ).toBe(false)
  })
})
