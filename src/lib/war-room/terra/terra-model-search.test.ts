import { describe, expect, it, vi } from 'vitest'
import { searchTerraInternetModels } from './terra-model-search'

function printablesResponse(name = 'Spin Fidget Toy') {
  return new Response(JSON.stringify({
    data: {
      searchPrints2: {
        totalCount: 1,
        items: [
          {
            id: 123,
            name,
            slug: 'spin-fidget-toy',
            datePublished: '2026-01-01T00:00:00Z',
            likesCount: 25,
            downloadCount: 120,
            ratingAvg: 5,
            aiGenerated: false,
            price: 0,
            image: { filePath: 'images/fidget.jpg', imageWidth: 800, imageHeight: 600 },
            category: { nameEn: 'Other Toys & Games' },
            license: { abbreviation: 'CC0', name: 'Creative Commons — Public Domain' },
          },
        ],
      },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('Terra internet model search query normalization', () => {
  it('normalizes Hebrew fidget print requests before calling Printables', async () => {
    let variables: Record<string, unknown> | undefined
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      variables = JSON.parse(String(init?.body)).variables
      return Promise.resolve(printablesResponse())
    })

    const result = await searchTerraInternetModels({ query: 'פידגטים להדפסה', limit: 20 }, 1_700_000_000_000, fetcher as typeof fetch)

    expect(variables?.query).toBe('fidget toy')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.query).toBe('fidget toy')
      expect(result.candidates).toHaveLength(1)
      expect(result.lockedActions).toEqual(expect.arrayContaining(['download_model_file', 'printer_start']))
    }
  })

  it('normalizes common Hebrew utility model requests', async () => {
    let variables: Record<string, unknown> | undefined
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      variables = JSON.parse(String(init?.body)).variables
      return Promise.resolve(printablesResponse('Cable Clip'))
    })

    await searchTerraInternetModels({ query: 'מחזיק כבל להדפסה', limit: 5 }, 1_700_000_000_000, fetcher as typeof fetch)

    expect(variables?.query).toBe('cable clip')
  })
})
