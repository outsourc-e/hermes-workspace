// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VtCapitalScreen } from './vt-capital-screen'

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true

const payload = {
  ok: true,
  checkedAt: Date.UTC(2026, 4, 6, 17, 0, 0),
  plugin: {
    name: 'vt-capital',
    version: '0.1.0',
    mode: 'observe_only',
    executionEnabled: false,
  },
  paths: {},
  marketBias: {
    fileExists: true,
    updatedAt: Date.UTC(2026, 4, 6, 16, 30, 0),
    sizeBytes: 1024,
    latest: {
      candidates: [
        {
          asset: 'BTC',
          candidate_bias: 'WATCH',
          confidence: 'medium',
          reasons: ['range pulito', 'risk contenuto'],
        },
      ],
    },
    recent: [],
  },
  council: {
    fileExists: true,
    updatedAt: Date.UTC(2026, 4, 6, 16, 45, 0),
    sizeBytes: 2048,
    recent: [{ asset: 'BTC', decision: 'WATCH' }],
  },
  workers: [
    {
      workerId: 'tradinganalyst',
      state: 'idle',
      currentTask: null,
      lastSummary: null,
      memoryExists: true,
      identityExists: true,
      runtimeExists: true,
    },
  ],
  guardian: {
    requireOrderScope: true,
    executionMode: 'demo_guardian',
    liveBlocked: true,
    executionEnabled: false,
    lastRiskCheck: {
      symbol: 'SOL/USDT',
      decision: 'approved',
      approval_id: 'risk-123',
    },
    lastOrderProposed: {
      symbol: 'SOL/USDT',
      book: 'trading',
      strategy_id: 'demo_guardian_intraday',
      approval_id: 'risk-123',
    },
    lastOrderExecuted: {
      symbol: 'SOL/USDT',
      status: 'open',
      approval_id: 'risk-123',
    },
    demoState: {
      openOrders: 1,
      trackedOrders: 3,
      lastOrder: {
        symbol: 'SOL/USDT',
        status: 'open',
        book: 'trading',
        strategy_id: 'demo_guardian_intraday',
      },
    },
    recentBlocks: [{ reason_code: 'DUPLICATE_OPEN_ORDER', symbol: 'SOL/USDT' }],
  },
  notes: [
    {
      title: 'Market Watch',
      path: '/root/hermes-vault/03-Trading-Notes/2026-05-06-market-watch.md',
      mtimeMs: Date.UTC(2026, 4, 6, 16, 55, 0),
      size: 4096,
    },
  ],
}

async function renderScreen() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(() => {
    root.render(<VtCapitalScreen />)
  })
  await React.act(async () => {
    await Promise.resolve()
  })
  return {
    container,
    unmount: async () => {
      await React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

describe('VtCapitalScreen', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ) as typeof global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('renders a plugin-scoped observability cockpit, not a generic dashboard clone', async () => {
    const { container, unmount } = await renderScreen()

    expect(container.querySelector('[data-plugin-surface="vt-capital"]')).not.toBeNull()
    expect(container.textContent).toContain('Plugin VT Capital')
    expect(container.textContent).toContain('Modalità osservazione')
    expect(container.textContent).toContain('Esecuzione disattivata')
    expect(container.textContent).toContain('Scope: solo plugin')
    expect(container.textContent).toContain('BTC')
    expect(container.textContent).toContain('Guardian / OMS')
    expect(container.textContent).toContain('require_order_scope attivo')
    expect(container.textContent).toContain('Ultimo risk.check')
    expect(container.textContent).toContain('Ultimo order.proposed')
    expect(container.textContent).toContain('Ultimo order.executed')
    expect(container.textContent).toContain('demo_guardian_intraday')
    expect(container.textContent).toContain('DUPLICATE_OPEN_ORDER')
    expect(global.fetch).toHaveBeenCalledWith('/api/vt-capital', { cache: 'no-store' })

    await unmount()
  })
})
