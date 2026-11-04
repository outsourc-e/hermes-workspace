import { describe, expect, it } from 'vitest'
import { currentMiniMaxModels } from './minimax-models'

describe('ordinary MiniMax catalogs', () => {
  it.each(['minimax', 'minimax-cn'])(
    'refreshes %s without changing other capabilities',
    (provider) => {
      const media = { id: 'speech-02-hd', provider }
      const custom = { id: 'MiniMax-M2.7', provider: 'custom' }
      const other = { id: 'local-model', provider: 'local' }
      expect(
        currentMiniMaxModels([
          other,
          { id: 'MiniMax-M2.7', provider },
          { id: 'MiniMax-M3', provider },
          media,
          custom,
        ]),
      ).toEqual([
        other,
        { id: 'MiniMax-M3.1-Flash', name: 'MiniMax-M3.1-Flash', provider },
        { id: 'MiniMax-M3', provider },
        media,
        custom,
      ])
    },
  )

  it('preserves direct provider prefixes', () => {
    expect(
      currentMiniMaxModels([
        { id: 'minimax-cn/MiniMax-M2.7', provider: 'minimax-cn' },
      ]).map((model) => model.id),
    ).toEqual(['minimax-cn/MiniMax-M3.1-Flash', 'minimax-cn/MiniMax-M3'])
  })

  it('retains gateway metadata and uses only advertised verified routes', () => {
    const m3 = {
      id: 'minimax/minimax-m3',
      provider: 'openrouter',
      context_length: 123,
    }
    const flash = {
      id: 'minimax/minimax-m3.1-flash:free',
      provider: 'openrouter',
      context_length: 456,
    }
    expect(
      currentMiniMaxModels([
        { id: 'minimax/minimax-m2.7', provider: 'openrouter' },
        m3,
        flash,
        { id: 'minimax/minimax-m3.1-flash', provider: 'openrouter' },
      ]),
    ).toEqual([flash, m3])
    expect(currentMiniMaxModels([m3])).toEqual([m3])
  })
})
