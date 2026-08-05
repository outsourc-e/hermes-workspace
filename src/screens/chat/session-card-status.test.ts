import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSessionCardStatusModel,
  parseSessionCardStatusModel,
} from './session-card-status'

afterEach(() => vi.unstubAllGlobals())

describe('Session Card status model', () => {
  it('reads only the exact Card projection', () => {
    expect(
      parseSessionCardStatusModel(
        {
          payload: {
            cards: [
              {
                cardId: 'remote:parent-card',
                usage: { model: 'provider/model' },
              },
            ],
          },
        },
        'remote:parent-card',
      ),
    ).toBe('provider/model')
    expect(
      parseSessionCardStatusModel(
        {
          payload: {
            cards: [
              { cardId: 'remote:raw-tip', usage: { model: 'wrong/model' } },
            ],
          },
        },
        'remote:parent-card',
      ),
    ).toBe('')
  })

  it('requests status only by exact Card ID', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: {
            cards: [
              {
                cardId: 'remote:parent-card',
                usage: { model: 'provider/model' },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSessionCardStatusModel('remote:parent-card'),
    ).resolves.toBe('provider/model')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session-status?cardId=remote%3Aparent-card',
    )
    expect(fetchMock.mock.calls.flat().join(' ')).not.toContain('sessionKey')
  })

  it('does not fetch for a missing or raw identity', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSessionCardStatusModel()).resolves.toBe('')
    await expect(fetchSessionCardStatusModel('raw-tip')).resolves.toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
