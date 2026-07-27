import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_GRID_ENGINE_CONFIG,
  advanceSymbolState,
} from './grid-paper-engine'
import type { GridEngineConfig, GridSymbolState } from './grid-paper-engine'
import type { Candle } from './trading-strategies'

// Same sandbox pattern as demo-trading-engine.test.ts: point the finance
// store at a temp HOME so tests never touch ~/.hermes/finance.
let tmp: string
let realHome: string | undefined
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-paper-engine-'))
  realHome = process.env.HOME
  process.env.HOME = tmp
  vi.resetModules()
})
afterEach(() => {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
  fs.rmSync(tmp, { recursive: true, force: true })
})

const HOUR = 60 * 60_000
const BASE = Date.parse('2026-01-01T00:00:00.000Z')

function candle(
  index: number,
  vals: { open: number; high: number; low: number; close: number },
): Candle {
  return {
    openTime: BASE + index * HOUR,
    open: vals.open,
    high: vals.high,
    low: vals.low,
    close: vals.close,
    volume: 1,
  }
}

function flat(index: number, price: number, spread = 0): Candle {
  return candle(index, {
    open: price,
    high: price + spread,
    low: price - spread,
    close: price,
  })
}

function cfg(overrides: Partial<GridEngineConfig> = {}): GridEngineConfig {
  return { ...DEFAULT_GRID_ENGINE_CONFIG, ...overrides }
}

/** Strips fields that legitimately differ per call (id, timestamps) for economic comparison. */
function economicShape(trades: Array<{ entryPrice: number; exitPrice: number; reason: string; pnlQuote: number }>) {
  return trades
    .map((t) => ({
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      reason: t.reason,
      pnlQuote: Number(t.pnlQuote.toFixed(8)),
    }))
    .sort((a, b) => a.entryPrice - b.entryPrice || a.exitPrice - b.exitPrice)
}

describe('advanceSymbolState — cold start', () => {
  it('arms from a warmup window and fills on a subsequent sweep', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    candles.push(candle(6, { open: 98, high: 105, low: 95, close: 100 }))

    const { state, trades } = advanceSymbolState(
      'BTCUSDT',
      undefined,
      candles,
      cfg({ rangeLookbackCandles: 5, gridCount: 3, spacing: 'arithmetic', efficiencyGate: false }),
    )

    expect(state.armed).toBe(true)
    expect(state.lastProcessedOpenTime).toBe(candles[6].openTime)
    const fills = trades.filter((t) => t.reason === 'grid-fill')
    expect(fills).toHaveLength(1)
    expect(fills[0].entryPrice).toBe(90)
    expect(fills[0].exitPrice).toBe(100)
    expect(fills[0].pnlQuote).toBeGreaterThan(0)
  })
})

describe('advanceSymbolState — incremental correctness', () => {
  it('produces the same economic result across two calls as one continuous call', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 })) // fills level 90
    for (let i = 6; i < 9; i++) candles.push(flat(i, 92, 1))
    candles.push(candle(9, { open: 98, high: 105, low: 95, close: 100 })) // sells at 100
    for (let i = 10; i < 13; i++) candles.push(flat(i, 99, 1))

    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: false,
    })

    const oneShot = advanceSymbolState('BTCUSDT', undefined, candles, config)

    // Split the same history into two "cron cycles": first sees only the
    // first 9 candles, second sees the full history (as a live fetch would
    // — a generous trailing window that includes already-processed candles).
    const firstCycle = advanceSymbolState('BTCUSDT', undefined, candles.slice(0, 9), config)
    const secondCycle = advanceSymbolState('BTCUSDT', firstCycle.state, candles, config)
    const combinedTrades = [...firstCycle.trades, ...secondCycle.trades]

    expect(economicShape(combinedTrades)).toEqual(economicShape(oneShot.trades))
    expect(secondCycle.state.lastProcessedOpenTime).toBe(oneShot.state.lastProcessedOpenTime)
    expect(secondCycle.state.armed).toBe(oneShot.state.armed)
  })

  it('does nothing when a cycle sees no candles newer than lastProcessedOpenTime', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))

    const config = cfg({ rangeLookbackCandles: 5, gridCount: 3, spacing: 'arithmetic', efficiencyGate: false })
    const first = advanceSymbolState('BTCUSDT', undefined, candles, config)
    // Re-run with the exact same candle set — nothing new to process.
    const second = advanceSymbolState('BTCUSDT', first.state, candles, config)

    expect(second.trades).toHaveLength(0)
    expect(second.state).toEqual({ ...first.state, updatedAt: second.state.updatedAt })
  })
})

describe('advanceSymbolState — efficiency gate persists across calls', () => {
  it('pauses on a trending window in one call and resumes in a later call', () => {
    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: true,
      efficiencyLookbackCandles: 3,
      maxEfficiencyRatio: 0.3,
    })

    // Seed an already-armed state with one held level directly — this test
    // is about pause/resume persisting across incremental calls, not about
    // re-proving the arming/fill mechanics the other tests already cover.
    const seeded: GridSymbolState = {
      kind: 'demo_grid_state',
      symbol: 'BTCUSDT',
      armed: true,
      halted: false,
      pausedForChop: false,
      lower: 99,
      upper: 101,
      levels: [
        {
          price: 99,
          held: true,
          entryPrice: 99,
          entryQuote: 5,
          entryFeeQuote: 0.005,
          openedAt: new Date(BASE + 4 * HOUR).toISOString(),
        },
        { price: 100, held: false, entryPrice: 0, entryQuote: 0, entryFeeQuote: 0, openedAt: '' },
        { price: 101, held: false, entryPrice: 0, entryQuote: 0, entryFeeQuote: 0, openedAt: '' },
      ],
      lastProcessedOpenTime: BASE + 4 * HOUR,
      updatedAt: new Date(0).toISOString(),
    }

    // Calm lookback context (needed for the efficiency-ratio window at the
    // first trending candle), staying under the level-100 sell target so
    // the seeded position remains held.
    const candles: Array<Candle> = []
    for (let i = 5; i < 9; i++) candles.push(flat(i, 99, 0.5))
    // Genuine directional run in the closes.
    candles.push(candle(9, { open: 100, high: 112, low: 98, close: 110 }))
    candles.push(candle(10, { open: 110, high: 122, low: 108, close: 120 }))
    candles.push(candle(11, { open: 120, high: 132, low: 118, close: 130 }))
    candles.push(candle(12, { open: 130, high: 142, low: 128, close: 140 }))

    const firstCycle = advanceSymbolState('BTCUSDT', seeded, candles.slice(0, 4), config)
    expect(firstCycle.state.pausedForChop).toBe(false)
    expect(firstCycle.state.levels[0].held).toBe(true)

    // Second cycle sees the full history including the wide swing.
    const secondCycle = advanceSymbolState('BTCUSDT', firstCycle.state, candles, config)
    expect(secondCycle.state.pausedForChop).toBe(true)
    expect(secondCycle.trades.some((t) => t.reason === 'chop-pause-liquidation')).toBe(true)

    // Third cycle: calm again — should resume.
    const calmTail: Array<Candle> = []
    for (let i = 13; i < 20; i++) calmTail.push(flat(i, 99, 1))
    const thirdCycle = advanceSymbolState('BTCUSDT', secondCycle.state, [...candles, ...calmTail], config)
    expect(thirdCycle.state.pausedForChop).toBe(false)
  })
})

describe('advanceSymbolState — idle-range re-arm', () => {
  const seededHeld = (): GridSymbolState => ({
    kind: 'demo_grid_state',
    symbol: 'BTCUSDT',
    armed: true,
    halted: false,
    pausedForChop: false,
    lower: 90,
    upper: 110,
    levels: [
      {
        price: 90,
        held: true,
        entryPrice: 90,
        entryQuote: 5,
        entryFeeQuote: 0.005,
        openedAt: new Date(BASE + 4 * HOUR).toISOString(),
      },
      { price: 100, held: false, entryPrice: 0, entryQuote: 0, entryFeeQuote: 0, openedAt: '' },
      { price: 110, held: false, entryPrice: 0, entryQuote: 0, entryFeeQuote: 0, openedAt: '' },
    ],
    lastProcessedOpenTime: BASE + 4 * HOUR,
    updatedAt: new Date(0).toISOString(),
  })

  it('re-arms after N outside closes, with the streak persisting across calls', () => {
    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: false,
      upperStopPct: 0.5,
      lowerStopPct: 0.5,
      autoRecenter: true,
      rearmOutsideRangeCandles: 3,
    })
    // Closes at 88 — below the 90 lower bound, nowhere near the 50% stops,
    // and never touching the 100 sell target, so the bag just sits.
    const candles: Array<Candle> = []
    for (let i = 5; i < 10; i++) candles.push(flat(i, 88, 1))

    // First cycle sees only two outside closes — streak persists, no re-arm yet.
    const first = advanceSymbolState('BTCUSDT', seededHeld(), candles.slice(0, 2), config)
    expect(first.trades).toHaveLength(0)
    expect(first.state.outsideRangeStreak).toBe(2)
    expect(first.state.levels[0].held).toBe(true)

    // Second cycle adds the third outside close — the re-arm fires.
    const second = advanceSymbolState('BTCUSDT', first.state, candles, config)
    const rearms = second.trades.filter((t) => t.reason === 'range-idle-rearm')
    expect(rearms).toHaveLength(1)
    expect(rearms[0].entryPrice).toBe(90)
    expect(rearms[0].exitPrice).toBe(88)
    expect(rearms[0].pnlQuote).toBeLessThan(0) // the bag is cut honestly
    expect(second.state.outsideRangeStreak).toBe(0)
    // Re-armed range recentres onto the recent window (upper pulled down
    // toward the 88-close regime instead of the stale 110).
    expect(second.state.armed).toBe(true)
    expect(second.state.upper).toBeLessThan(110)
  })

  it('is a no-op when rearmOutsideRangeCandles is 0 (default)', () => {
    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: false,
      upperStopPct: 0.5,
      lowerStopPct: 0.5,
      autoRecenter: true,
    })
    const candles: Array<Candle> = []
    for (let i = 5; i < 15; i++) candles.push(flat(i, 88, 1))
    const result = advanceSymbolState('BTCUSDT', seededHeld(), candles, config)
    expect(result.trades).toHaveLength(0)
    expect(result.state.levels[0].held).toBe(true)
    expect(result.state.lower).toBe(90)
    expect(result.state.upper).toBe(110)
  })
})

describe('advanceSymbolState — absolute stop floor', () => {
  it('engages only after a re-arm has recentered below the frozen floor, and halts for good', () => {
    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: false,
      lowerStopPct: 0.1,
      autoRecenter: true,
      absoluteStopFloorEnabled: true,
    })
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Sweeps both the 90 and 100 levels.
    candles.push(candle(5, { open: 100, high: 101, low: 89, close: 99 }))
    // First (ordinary) stop breach — lower (90) sits above its own floor by
    // construction, so this re-arms as usual, not a halt.
    candles.push(candle(6, { open: 99, high: 100, low: 70, close: 75 }))
    // Fill the re-centered range's new lower level (70); close (85) stays
    // above the frozen floor (81), so this bar trades normally.
    candles.push(candle(7, { open: 85, high: 88, low: 69, close: 85 }))
    // Active range has recentered below the frozen floor (new lower 70 < 81)
    // AND price closes below it (79 < 81) — halts for good.
    candles.push(candle(8, { open: 85, high: 86, low: 78, close: 79 }))
    // Recovers well back into the original range — should NOT re-enter.
    for (let i = 9; i < 13; i++) candles.push(candle(i, { open: 90, high: 105, low: 88, close: 100 }))

    const { state, trades } = advanceSymbolState('BTCUSDT', undefined, candles, config)

    const stopTrades = trades.filter((t) => t.reason === 'stop-liquidation')
    const floorTrades = trades.filter((t) => t.reason === 'absolute-floor-liquidation')
    expect(stopTrades).toHaveLength(2)
    expect(floorTrades).toHaveLength(1)
    expect(floorTrades[0].exitPrice).toBe(79)
    expect(trades.filter((t) => t.reason === 'grid-fill')).toHaveLength(0)
    expect(state.halted).toBe(true)
    expect(state.armed).toBe(false)
  })

  it('persists floorPrice across separate cron-tick calls', () => {
    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: false,
      lowerStopPct: 0.1,
      autoRecenter: true,
      absoluteStopFloorEnabled: true,
    })
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 100, high: 101, low: 89, close: 99 }))
    candles.push(candle(6, { open: 99, high: 100, low: 70, close: 75 }))

    // First cron tick: cold-starts and processes through the first stop-out.
    const first = advanceSymbolState('BTCUSDT', undefined, candles, config)
    expect(first.state.floorPrice).toBeCloseTo(81, 6)

    // Second cron tick reloads from persisted state — the floor must survive
    // the round trip through the finance store, not just live in memory.
    const tail = [candle(7, { open: 85, high: 88, low: 69, close: 85 })]
    const second = advanceSymbolState('BTCUSDT', first.state, tail, config)
    expect(second.state.floorPrice).toBeCloseTo(81, 6)
  })

  it('leaves the floor unset and behaves as before when disabled (default)', () => {
    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      efficiencyGate: false,
      lowerStopPct: 0.1,
      autoRecenter: true,
      absoluteStopFloorEnabled: false,
    })
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 100, high: 101, low: 89, close: 99 }))
    candles.push(candle(6, { open: 99, high: 100, low: 70, close: 75 }))
    candles.push(candle(7, { open: 85, high: 88, low: 69, close: 85 }))
    candles.push(candle(8, { open: 85, high: 86, low: 78, close: 79 }))

    const { state, trades } = advanceSymbolState('BTCUSDT', undefined, candles, config)
    expect(state.floorPrice ?? null).toBeNull()
    expect(trades.filter((t) => t.reason === 'absolute-floor-liquidation')).toHaveLength(0)
    // Without the floor, the grid stays armed through the same decline.
    expect(state.halted).toBe(false)
  })
})

describe('runGridPaperCycle — I/O + lock', () => {
  it('does not run when the connectivity breaker is tripped — this engine\'s first-ever global gate', async () => {
    const { recordConnectivityOutcome } = await import('./connectivity-breaker')
    const CRED_FAILURE = 'Binance demo /api/v3/order failed (401): Unauthorized'
    recordConnectivityOutcome(CRED_FAILURE)
    recordConnectivityOutcome(CRED_FAILURE)
    recordConnectivityOutcome(CRED_FAILURE)
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const fetchKlines = vi.fn()
    const result = await runGridPaperCycle({ fetchKlines })
    expect(result.ran).toBe(false)
    expect(result.reason).toBe('connectivity breaker tripped')
    expect(fetchKlines).not.toHaveBeenCalled()
  })

  it('serializes overlapping cycles — the second is rejected as busy', async () => {
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    const fetchKlines = vi.fn().mockResolvedValue(candles)

    const [a, b] = await Promise.all([
      runGridPaperCycle({ fetchKlines }),
      runGridPaperCycle({ fetchKlines }),
    ])
    const busy = [a, b].filter((r) => !r.ran && r.reason === 'busy')
    expect(busy).toHaveLength(1)
  })

  it('persists grid state through the finance store and getGridEngineState reads it back', async () => {
    const { runGridPaperCycle, getGridEngineState } = await import('./grid-paper-engine')
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    const fetchKlines = vi.fn().mockResolvedValue(candles)

    const result = await runGridPaperCycle({ fetchKlines })
    expect(result.ran).toBe(true)
    expect(result.symbolsProcessed).toBe(DEFAULT_GRID_ENGINE_CONFIG.symbols.length)

    const state = getGridEngineState()
    expect(state.states.length).toBe(DEFAULT_GRID_ENGINE_CONFIG.symbols.length)
    // Only 6 candles were fetched, well under the default 200-candle
    // rangeLookback, so the grid correctly stays unarmed — this test is
    // about the store round-trip (persist → re-read), not arming.
    const btc = state.states.find((s: GridSymbolState) => s.symbol === 'BTCUSDT')
    expect(btc?.symbol).toBe('BTCUSDT')
    expect(btc?.armed).toBe(false)
    expect(btc?.lastProcessedOpenTime).toBe(candles[candles.length - 1].openTime)
  })
})

describe('runGridPaperCycle — testnet execution mirror', () => {
  // Grid settings that arm from a 5-candle window and trade BTC only, so the
  // fixtures stay small. Written into settings.demoTradingGrid the same way
  // set_grid_config would.
  const tightGrid = (extra: Record<string, unknown> = {}) => ({
    symbols: ['BTCUSDT'],
    rangeLookbackCandles: 5,
    gridCount: 3,
    spacing: 'arithmetic',
    efficiencyGate: false,
    ...extra,
  })

  async function seedSettings(
    gridConfig: Record<string, unknown>,
    settings: Record<string, unknown> = {},
  ) {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    Object.assign(db.settings, settings)
    ;(db.settings as Record<string, unknown>).demoTradingGrid = gridConfig
    store.writeFinanceStore(db)
  }

  // Warmup range 90–110, then a dip that fills the 90 level (one BUY event),
  // then a rally through 100 that sells it (one SELL event).
  function buyThenSellCandles(): Array<Candle> {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++)
      candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    candles.push(candle(6, { open: 98, high: 105, low: 95, close: 100 }))
    return candles
  }

  function fakeGridClient(overrides: Partial<any> = {}) {
    return {
      host: 'demo-api.binance.com',
      environment: 'testnet' as const,
      ping: async () => true,
      getPrice: async () => 100,
      getKlines: async () => [],
      getAccount: async () => ({
        accountType: 'SPOT',
        canTrade: true,
        balances: [
          { asset: 'USDT', free: 5000, locked: 0 },
          { asset: 'BTC', free: 1, locked: 0 },
        ],
      }),
      placeOrder: vi.fn(async (o: any) => ({
        symbol: o.symbol,
        orderId: Math.floor(Math.random() * 1e6),
        status: 'FILLED',
        side: o.side,
        type: o.type,
        executedQty: o.side === 'BUY' ? 0.055 : (o.quantity ?? 0.055),
        cummulativeQuoteQty: o.side === 'BUY' ? (o.quoteOrderQty ?? 5) : 5.5,
        fills: [],
        transactTime: Date.now(),
        avgPrice: o.side === 'BUY' ? 90 : 100,
      })),
      ...overrides,
    }
  }

  it('places no real orders when executionMode is unset (paper default)', async () => {
    await seedSettings(tightGrid(), { tradingMode: 'testnet_execute' })
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const client = fakeGridClient()
    const result = await runGridPaperCycle({
      fetchKlines: vi.fn().mockResolvedValue(buyThenSellCandles()),
      client: client as never,
    })
    expect(result.ran).toBe(true)
    expect(result.trades.length).toBeGreaterThan(0) // paper traded normally
    expect(result.realFills).toHaveLength(0)
    expect(client.placeOrder).not.toHaveBeenCalled()
  })

  it('mirrors paper fills as real testnet orders when armed, sells before buys', async () => {
    await seedSettings(tightGrid({ executionMode: 'testnet_execute' }), {
      tradingMode: 'testnet_execute',
      emergencyKillSwitch: false,
    })
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const client = fakeGridClient()
    const result = await runGridPaperCycle({
      fetchKlines: vi.fn().mockResolvedValue(buyThenSellCandles()),
      client: client as never,
    })
    expect(result.ran).toBe(true)
    // Bar 5 buys level 90; bar 6 sells it at 100 AND re-buys the swept 100
    // level — 3 paper fills, all mirrored.
    expect(result.realFills.length).toBe(3)
    const calls = (client.placeOrder as any).mock.calls.map((c: any) => c[0])
    expect(calls[0].side).toBe('SELL') // risk-reducing side first
    expect(calls[1].side).toBe('BUY')
    expect(calls[2].side).toBe('BUY')
    expect(calls[1].quoteOrderQty).toBe(DEFAULT_GRID_ENGINE_CONFIG.quotePerGrid)
    // Real fills persisted under their own kind.
    const store = await import('./finance-store')
    const rows = store.readFinanceStore().strategy_results as Array<any>
    expect(rows.filter((r) => r.kind === 'demo_grid_real_fill')).toHaveLength(3)
  })

  it('keeps paper authoritative when the kill switch blocks mirroring', async () => {
    await seedSettings(tightGrid({ executionMode: 'testnet_execute' }), {
      tradingMode: 'testnet_execute',
      emergencyKillSwitch: true,
    })
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const client = fakeGridClient()
    const result = await runGridPaperCycle({
      fetchKlines: vi.fn().mockResolvedValue(buyThenSellCandles()),
      client: client as never,
    })
    expect(result.ran).toBe(true)
    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.realFills).toHaveLength(0)
    expect(client.placeOrder).not.toHaveBeenCalled()
  })

  it('survives real-order failures without breaking the paper cycle', async () => {
    await seedSettings(tightGrid({ executionMode: 'testnet_execute' }), {
      tradingMode: 'testnet_execute',
      emergencyKillSwitch: false,
    })
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const client = fakeGridClient({
      placeOrder: vi.fn(async () => {
        throw new Error('Account has insufficient balance for requested action.')
      }),
    })
    const result = await runGridPaperCycle({
      fetchKlines: vi.fn().mockResolvedValue(buyThenSellCandles()),
      client: client as never,
    })
    expect(result.ran).toBe(true)
    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.realFills).toHaveLength(0)
  })

  it('respects the per-cycle order budget (excess skipped, paper intact)', async () => {
    await seedSettings(
      tightGrid({ executionMode: 'testnet_execute', maxRealOrdersPerCycle: 1 }),
      { tradingMode: 'testnet_execute', emergencyKillSwitch: false },
    )
    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const client = fakeGridClient()
    const result = await runGridPaperCycle({
      fetchKlines: vi.fn().mockResolvedValue(buyThenSellCandles()),
      client: client as never,
    })
    expect(result.ran).toBe(true)
    expect(result.realFills).toHaveLength(1)
    expect(result.realFills[0].side).toBe('SELL') // budget went to the sell
    expect(client.placeOrder).toHaveBeenCalledTimes(1)
  })

  it('pauses mirroring for the day once the daily-loss cap is breached', async () => {
    await seedSettings(
      tightGrid({ executionMode: 'testnet_execute', maxDailyLossQuote: 10 }),
      { tradingMode: 'testnet_execute', emergencyKillSwitch: false },
    )
    // Seed a big realized loss for today under the grid-trade kind.
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    ;(db.strategy_results as Array<any>).push({
      kind: 'demo_grid_trade',
      id: 'seed-loss',
      symbol: 'BTCUSDT',
      levelIndex: 0,
      entryPrice: 100,
      exitPrice: 80,
      quantity: 1,
      entryQuote: 100,
      exitQuote: 80,
      pnlQuote: -20,
      feesQuote: 0.2,
      reason: 'stop-liquidation',
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
    })
    store.writeFinanceStore(db)

    const { runGridPaperCycle } = await import('./grid-paper-engine')
    const client = fakeGridClient()
    const result = await runGridPaperCycle({
      fetchKlines: vi.fn().mockResolvedValue(buyThenSellCandles()),
      client: client as never,
    })
    expect(result.ran).toBe(true)
    expect(result.trades.length).toBeGreaterThan(0) // paper unaffected
    expect(result.realFills).toHaveLength(0)
    expect(client.placeOrder).not.toHaveBeenCalled()
  })
})
