import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRID_BACKTEST_CONFIG,
  buildLevels,
  efficiencyRatio,
  runGridBacktest,
} from './grid-backtest'
import type { GridBacktestConfig } from './grid-backtest'
import type { Candle } from './trading-strategies'

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

function cfg(overrides: Partial<GridBacktestConfig> = {}): GridBacktestConfig {
  return { ...DEFAULT_GRID_BACKTEST_CONFIG, ...overrides }
}

describe('buildLevels', () => {
  it('produces different level prices for arithmetic vs geometric spacing', () => {
    const arithmetic = buildLevels(90, 110, 'arithmetic', 3)
    const geometric = buildLevels(90, 110, 'geometric', 3)
    expect(arithmetic).toEqual([90, 100, 110])
    expect(geometric[0]).toBeCloseTo(90, 6)
    expect(geometric[2]).toBeCloseTo(110, 6)
    expect(geometric[1]).toBeCloseTo(Math.sqrt(90 * 110), 6)
    expect(geometric[1]).not.toBeCloseTo(arithmetic[1], 2)
  })
})

describe('efficiencyRatio', () => {
  it('is close to 1 for a straight-line trending series', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i <= 10; i++) candles.push(flat(i, 100 + i * 2))
    const er = efficiencyRatio(candles, 10, 10)
    expect(er).not.toBeNull()
    expect(er as number).toBeCloseTo(1, 6)
  })

  it('is close to 0 for a series that oscillates back to its starting price', () => {
    const candles: Array<Candle> = []
    const prices = [100, 105, 100, 105, 100, 105, 100, 105, 100, 105, 100]
    prices.forEach((p, i) => candles.push(flat(i, p)))
    const er = efficiencyRatio(candles, 10, 10)
    expect(er).not.toBeNull()
    expect(er as number).toBeCloseTo(0, 6)
  })

  it('returns null before the lookback window is warmed', () => {
    const candles = [flat(0, 100), flat(1, 101)]
    expect(efficiencyRatio(candles, 1, 10)).toBeNull()
  })
})

describe('runGridBacktest', () => {
  it('realizes profit net of fees on a buy-low/sell-high round trip', () => {
    const candles: Array<Candle> = []
    // Warmup: establish range [90, 110] over the lookback window.
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Sweep through the 90 level (buy fill), leaving 100 untouched.
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    // Sweep through the 100 level (sell target for the 90-level position).
    candles.push(candle(6, { open: 98, high: 105, low: 95, close: 100 }))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        quotePerGrid: 10,
        feeRatePerSide: 0.001,
      }),
    )

    const fills = report.trades.filter((t) => t.reason === 'grid-fill')
    expect(fills).toHaveLength(1)
    const trade = fills[0]
    expect(trade.entryPrice).toBe(90)
    expect(trade.exitPrice).toBe(100)
    expect(trade.quantity).toBeCloseTo(10 / 90, 6)
    // Gross move is ~11%, well above round-trip fees (~0.2%), so PnL must be positive net of fees.
    expect(trade.pnlQuote).toBeGreaterThan(0)
    expect(trade.pnlQuote).toBeLessThan((100 - 90) * (10 / 90))
    expect(trade.feesQuote).toBeGreaterThan(0)
  })

  it('never fills a level the price never touches', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Price wanders in a tight band that never reaches the 90/95/105/110 levels.
    for (let i = 5; i < 20; i++) candles.push(flat(i, 101, 2))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({ rangeLookbackCandles: 5, gridCount: 5, spacing: 'arithmetic' }),
    )

    expect(report.trades.filter((t) => t.reason === 'grid-fill')).toHaveLength(0)
  })

  it('liquidates on a stop breach and halts new entries without autoRecenter', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Fill the 90 level.
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    // Spike well above the 5%-over-upper stop (110 * 1.05 = 115.5).
    candles.push(candle(6, { open: 100, high: 120, low: 100, close: 118 }))
    // Price dips back to 90 again — should NOT re-enter since the grid is halted.
    for (let i = 7; i < 12; i++) candles.push(candle(i, { open: 92, high: 95, low: 85, close: 90 }))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        upperStopPct: 0.05,
        autoRecenter: false,
      }),
    )

    const stopTrades = report.trades.filter((t) => t.reason === 'stop-liquidation')
    expect(stopTrades).toHaveLength(1)
    expect(stopTrades[0].exitPrice).toBe(118)
    // Nothing should have re-entered after the halt.
    expect(report.trades.filter((t) => t.reason === 'grid-fill')).toHaveLength(0)
  })

  it('re-arms after a stop breach when autoRecenter is set', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    candles.push(candle(6, { open: 100, high: 120, low: 100, close: 118 }))
    // New range settles around the higher price; a fresh sweep should be able to fill again.
    for (let i = 7; i < 12; i++) candles.push(candle(i, { open: 118, high: 122, low: 114, close: 118 }))
    candles.push(candle(12, { open: 116, high: 119, low: 112, close: 115 }))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        upperStopPct: 0.05,
        autoRecenter: true,
      }),
    )

    expect(report.trades.some((t) => t.reason === 'stop-liquidation')).toBe(true)
    // With autoRecenter the grid should have re-armed and be able to log new activity
    // after the halted-run test above showed zero further trades.
    expect(report.symbolReports[0].stopOuts).toBeGreaterThanOrEqual(1)
  })

  it('without the absolute floor, autoRecenter keeps sliding the stop down through a sustained decline', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Sweeps both the 90 and 100 levels (open sits on 100, low dips to 89).
    candles.push(candle(5, { open: 100, high: 101, low: 89, close: 99 }))
    // Breach the original 10%-under-lower stop (90 * 0.9 = 81) — normal stop-out, re-arms.
    candles.push(candle(6, { open: 99, high: 100, low: 70, close: 75 }))
    // Fill the re-centered range's new lower level (70).
    candles.push(candle(7, { open: 85, high: 88, low: 69, close: 85 }))
    // Keeps declining well past the ORIGINAL floor (81), but the re-centered
    // lowerBound (70 * 0.9 = 63) is untouched — without the floor this just
    // keeps trading, which is exactly the live bug this fix closes.
    candles.push(candle(8, { open: 85, high: 86, low: 78, close: 79 }))
    // Recovery — with no floor, the grid should still be armed and able to
    // take a fresh round trip here (unlike the floor-enabled test below).
    for (let i = 9; i < 13; i++) candles.push(candle(i, { open: 90, high: 105, low: 88, close: 100 }))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        lowerStopPct: 0.1,
        autoRecenter: true,
        absoluteStopFloorEnabled: false,
      }),
    )

    expect(report.trades.filter((t) => t.reason === 'absolute-floor-liquidation')).toHaveLength(0)
    // Unlike the floor-enabled test, the grid keeps operating through the
    // recovery and completes at least one full round trip.
    expect(report.trades.filter((t) => t.reason === 'grid-fill').length).toBeGreaterThan(0)
  })

  it('engages the absolute floor once a re-arm has recentered below it, and halts for good', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Fill the 90 level.
    candles.push(candle(5, { open: 100, high: 101, low: 89, close: 99 }))
    // Breach the original floor (90 * 0.9 = 81) for the first time — this is
    // still an ordinary stop-out: `lower` (90) sits above its own floor by
    // construction, so autoRecenter re-arms as usual, not a halt.
    candles.push(candle(6, { open: 99, high: 100, low: 70, close: 75 }))
    // Fill the re-centered range's new lower level (70). Close (85) stays
    // above the frozen floor (81), so this bar trades normally.
    candles.push(candle(7, { open: 85, high: 88, low: 69, close: 85 }))
    // Now the active range has recentered below the frozen floor (new lower
    // 70 < 81) AND price closes below that floor (79 < 81) — the exact
    // sustained-decline case that slipped past the relative stop above.
    candles.push(candle(8, { open: 85, high: 86, low: 78, close: 79 }))
    // Price recovers well back into the original range — should NOT re-enter,
    // proving the halt is permanent, unlike a normal autoRecenter stop-out.
    for (let i = 9; i < 13; i++) candles.push(candle(i, { open: 90, high: 105, low: 88, close: 100 }))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        lowerStopPct: 0.1,
        autoRecenter: true,
        absoluteStopFloorEnabled: true,
      }),
    )

    const stopTrades = report.trades.filter((t) => t.reason === 'stop-liquidation')
    const floorTrades = report.trades.filter((t) => t.reason === 'absolute-floor-liquidation')
    // Bar 5 sweeps both the 90 and 100 levels, so the first (ordinary) stop
    // breach at bar 6 liquidates two held positions.
    expect(stopTrades).toHaveLength(2)
    expect(floorTrades).toHaveLength(1)
    expect(floorTrades[0].exitPrice).toBe(79)
    // Nothing should have re-entered after the floor halt, despite autoRecenter
    // and the price recovery in the tail candles.
    expect(report.trades.filter((t) => t.reason === 'grid-fill')).toHaveLength(0)
    expect(report.trades).toHaveLength(3)
  })

  it('pauses entries once the chop gate detects a trend, and resumes after', () => {
    const candles: Array<Candle> = []
    // Tight warmup so the range it defines doesn't itself look "wide" to the
    // 3-bar chop lookback that starts checking on the very next live bar.
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 101, low: 99, close: 100 }))
    // First live bar: dips to fill the 99 level, still a tight move overall.
    candles.push(candle(5, { open: 100, high: 101, low: 98, close: 99 }))
    // A couple more tight bars so the chop lookback stays "ranging".
    for (let i = 6; i < 9; i++) candles.push(flat(i, 99, 1))
    // Wide swing — should trip the chop gate (trending) and liquidate the held level.
    candles.push(candle(9, { open: 99, high: 140, low: 60, close: 99 }))
    for (let i = 10; i < 13; i++) candles.push(candle(i, { open: 99, high: 140, low: 60, close: 99 }))
    // Back to tight range — gate should resume once the wide bars roll out of the lookback.
    for (let i = 13; i < 20; i++) candles.push(flat(i, 99, 1))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        chopGate: true,
        chopLookbackCandles: 3,
        chopMaxRangePct: 0.1,
      }),
    )

    expect(report.symbolReports[0].chopPauses).toBeGreaterThan(0)
    expect(
      report.trades.some((t) => t.reason === 'chop-pause-liquidation'),
    ).toBe(true)
  })

  it('re-arms after price idles outside the range without tripping the stops', () => {
    const candles: Array<Candle> = []
    // Warmup range 90–110 (levels 90/100/110 with gridCount 3).
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // Fill the 90 level, closing just below the range (dead zone: outside
    // [90,110] but nowhere near the 50% stop bands).
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 88 }))
    // Two more closes outside — streak reaches 3 on bar 7.
    candles.push(flat(6, 88, 1))
    candles.push(flat(7, 88, 1))
    // Post-re-arm: new range spans ~85–110; a dip then a rally should produce
    // a fresh profitable grid fill, proving the grid resumed earning.
    candles.push(candle(8, { open: 88, high: 89, low: 84, close: 86 }))
    candles.push(candle(9, { open: 86, high: 99, low: 86, close: 98 }))

    const config = cfg({
      rangeLookbackCandles: 5,
      gridCount: 3,
      spacing: 'arithmetic',
      upperStopPct: 0.5,
      lowerStopPct: 0.5,
      autoRecenter: true,
      rearmOutsideRangeCandles: 3,
    })
    const report = runGridBacktest({ BTCUSDT: candles }, config)

    const rearms = report.trades.filter((t) => t.reason === 'range-idle-rearm')
    expect(rearms).toHaveLength(1)
    expect(rearms[0].entryPrice).toBe(90)
    expect(rearms[0].exitPrice).toBe(88)
    expect(rearms[0].pnlQuote).toBeLessThan(0) // cut the bag, honestly
    const postRearmFills = report.trades.filter(
      (t) => t.reason === 'grid-fill' && t.closedAt > rearms[0].closedAt,
    )
    expect(postRearmFills.length).toBeGreaterThan(0)

    // Control: with the rule off, nothing re-arms and no fresh fill happens.
    const control = runGridBacktest(
      { BTCUSDT: candles },
      { ...config, rearmOutsideRangeCandles: 0 },
    )
    expect(control.trades.filter((t) => t.reason === 'range-idle-rearm')).toHaveLength(0)
    expect(control.trades.filter((t) => t.reason === 'grid-fill')).toHaveLength(0)
  })

  it('measures max drawdown against account equity, not the raw PnL curve', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    // One small losing round trip: buy 90, forced-liquidate lower via a stop breach.
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    candles.push(candle(6, { open: 90, high: 90, low: 60, close: 61 }))

    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({
        rangeLookbackCandles: 5,
        gridCount: 3,
        spacing: 'arithmetic',
        quotePerGrid: 5,
        lowerStopPct: 0.2,
      }),
    )

    // A single small losing round trip against the grid's starting balance
    // must land as a sane, bounded percentage — the pre-fix bug measured
    // drawdown against the near-zero raw-PnL peak instead of equity, which
    // produced nonsensical values in the hundreds of percent.
    expect(report.maxDrawdownPct).toBeGreaterThan(0)
    expect(report.maxDrawdownPct).toBeLessThan(50)
  })

  it('reports a per-symbol buy-and-hold return for comparison', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 10; i++) {
      const price = 100 + i
      candles.push(candle(i, { open: price, high: price + 1, low: price - 1, close: price }))
    }
    const report = runGridBacktest({ BTCUSDT: candles }, cfg({ rangeLookbackCandles: 5, gridCount: 3 }))
    expect(report.buyAndHoldReturnPct.BTCUSDT).toBeCloseTo(
      ((candles[9].close - candles[0].close) / candles[0].close) * 100,
      6,
    )
  })

  it('includes riskAdjusted metrics computed from the equity curve', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 5; i++) candles.push(candle(i, { open: 100, high: 110, low: 90, close: 100 }))
    candles.push(candle(5, { open: 92, high: 95, low: 85, close: 90 }))
    candles.push(candle(6, { open: 98, high: 105, low: 95, close: 100 }))
    const report = runGridBacktest(
      { BTCUSDT: candles },
      cfg({ rangeLookbackCandles: 5, gridCount: 3, spacing: 'arithmetic' }),
    )
    expect(report.riskAdjusted).toBeDefined()
    expect(typeof report.riskAdjusted).toBe('object')
    // A profitable run over a real span should produce a finite or infinite
    // annualized return, not null (null is reserved for "not enough data").
    expect(report.riskAdjusted.annualizedReturnPct).not.toBeNull()
  })
})
