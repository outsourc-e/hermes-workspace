/** @vitest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResearchAtlasSurface } from './ResearchAtlasSurface'
import type {
  ResearchAtlasSnapshot,
  ResearchMissionResponse,
} from '../../../lib/war-room/living-v3/research-atlas-contract'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const snapshot: ResearchAtlasSnapshot = {
  ok: true,
  schemaVersion: 'war-room-research-atlas-v1',
  generatedAtMs: 1,
  source: 'verified-local-research-hub',
  freshness: { state: 'ready', label: 'Verified local Research Atlas', sourceCollectedAt: '10.07.2026' },
  meta: { shops: 3, listings: 436, sales: 1819, reviews: 233, generated: '10.07.2026' },
  shops: [
    {
      key: 'slow', name: 'SlowToneHandmade', kind: 'Decor', url: 'https://www.etsy.com/shop/SlowToneHandmade',
      date: '10.07.2026', listings: 282, officialSales: 185, reviewsCount: 32, rating: 4.5, medianPrice: 63,
      headline: 'Verified shop research', topShare: 60, summary: ['Demand is concentrated.'], risks: ['Supplier identity is not proven.'],
      productCount: 282, supplierChecks: 16, strongSupplierMatches: 12,
      workbookUrl: '/api/war-room/research-atlas?asset=slow.xlsx',
    },
    {
      key: 'jitzz', name: 'JitzzShop', kind: 'Jewelry', url: 'https://www.etsy.com/shop/JitzzShop',
      date: '10.07.2026', listings: 135, officialSales: 1584, reviewsCount: 190, rating: 4.8, medianPrice: 30,
      headline: 'Verified shop research', topShare: 55, summary: [], risks: [], productCount: 135, supplierChecks: 10,
      strongSupplierMatches: 8, workbookUrl: '/api/war-room/research-atlas?asset=jitzz.xlsx',
    },
    {
      key: 'gazoo', name: 'GazooTrips', kind: 'Travel', url: 'https://www.etsy.com/shop/GazooTrips',
      date: '08.07.2026', listings: 19, officialSales: 50, reviewsCount: 11, rating: 4.7, medianPrice: 25,
      headline: 'Verified shop research', topShare: 48, summary: [], risks: [], productCount: 19, supplierChecks: 10,
      strongSupplierMatches: 9, workbookUrl: '/api/war-room/research-atlas?asset=gazoo.xlsx',
    },
  ],
  downloads: [
    { id: 'slow-workbook', label: 'SlowTone workbook', fileName: 'slow.xlsx', url: '/api/war-room/research-atlas?asset=slow.xlsx', sizeBytes: 100 },
  ],
  siteUrl: '/api/war-room/research-atlas?view=site',
  qa: {
    status: 'passed', summary: 'Browser and workbook QA passed.',
    reportUrl: '/api/war-room/research-atlas?asset=QA_REPORT.txt', truthBoundary: 'Visual match is not supplier proof.',
  },
  safety: {
    localOnly: true, readOnlySources: true, noEtsyWrites: true, noSupplierMessages: true, liveResearchStarted: false,
  },
}

const staged: ResearchMissionResponse = {
  ok: true,
  packet: {
    schemaVersion: 'war-room-research-mission-v1',
    missionId: 'research-shop-1',
    createdAtMs: 2,
    status: 'staged',
    targetType: 'shop',
    target: 'https://www.etsy.com/shop/NewShop',
    depth: 'deep',
    modules: ['official-shop', 'catalog', 'supplier-visual', 'risk'],
    notes: '',
    owner: { agentId: 'loki', roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt' },
    outputs: ['Workbook'],
    steps: [{ id: 'source-map', label: 'Map sources', state: 'pending' }],
    safety: {
      localOnly: true, externalResearchStarted: false, noMarketplaceWrites: true,
      noSupplierMessages: true, approvalRequiredForSideEffects: true,
    },
  },
  savedPath: '/tmp/research-shop-1.json',
  readback: 'משימת Deep נשמרה מקומית עבור Loki. המחקר החיצוני עדיין לא התחיל.',
}

async function flushReact() {
  await React.act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderSurface(onMissionStaged?: (result: ResearchMissionResponse) => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(() => {
    root.render(<ResearchAtlasSurface onReturnToProducts={vi.fn()} onMissionStaged={onMissionStaged} />)
  })
  await flushReact()
  return {
    container,
    unmount: async () => {
      await React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

function buttonNamed(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent.trim().startsWith(label))
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

async function click(element: HTMLElement) {
  await React.act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await flushReact()
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await React.act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ResearchAtlasSurface', () => {
  it('shows the three verified studies and keeps source proof collapsed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(snapshot) }))
    const { container, unmount } = await renderSurface()

    expect(container.querySelector('[data-research-atlas-state="ready"]')).toBeTruthy()
    expect(container.querySelector('[data-research-atlas-surface="v1"]')).toBeTruthy()
    expect(container.textContent).toContain('SlowToneHandmade')
    expect(container.textContent).toContain('JitzzShop')
    expect(container.textContent).toContain('GazooTrips')
    expect(container.textContent).toContain('436')
    expect(container.querySelector('details[data-research-proof-collapsed="true"]')?.hasAttribute('open')).toBe(false)
    expect(container.querySelector('iframe')).toBeNull()
    const shopSection = container.querySelector('.research-atlas__shop-section')
    const kpis = container.querySelector('.research-atlas__kpis')
    expect(shopSection?.nextElementSibling).toBe(kpis)

    await unmount()
  })

  it('stages a shop research mission with selectable depth and modules', async () => {
    const onMissionStaged = vi.fn()
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve(staged) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container, unmount } = await renderSurface(onMissionStaged)

    await click(buttonNamed(container, 'מחקר חדש'))
    await click(buttonNamed(container, 'חנות'))
    await click(buttonNamed(container, 'Deep'))
    const input = container.querySelector<HTMLInputElement>('.research-atlas__target-input input')
    expect(input).toBeTruthy()
    await setInputValue(input!, 'https://www.etsy.com/shop/NewShop')
    await click(buttonNamed(container, 'שמור משימת מחקר'))

    expect(container.querySelector('[data-research-mission-state="staged"]')).toBeTruthy()
    expect(container.querySelector('.research-atlas__mission[aria-live="polite"]')).toBeTruthy()
    expect(container.querySelector('.research-atlas__mission-summary')?.textContent).toContain('External research not started')
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
    expect(postCall?.[0]).toBe('/api/war-room/research-atlas')
    const body = JSON.parse(String(postCall?.[1]?.body))
    expect(body).toMatchObject({ targetType: 'shop', depth: 'deep', target: 'https://www.etsy.com/shop/NewShop' })
    expect(body.modules).toContain('supplier-visual')
    expect(container.textContent).toContain('research-shop-1')
    expect(container.textContent).toContain('המחקר החיצוני עדיין לא התחיל')
    expect(onMissionStaged).toHaveBeenCalledWith(staged)

    await unmount()
  })
})
