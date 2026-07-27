/**
 * Offline backtest for a spot-grid strategy — a structurally different
 * mechanism from src/server/trading-backtest.ts's council/guardian replay.
 *
 * A grid ladders buy orders below price and sell orders above, profiting
 * from oscillation inside a range regardless of direction (per Binance's own
 * description of Spot Grid: it "doesn't aim to predict market trends... and
 * breaks down if the market enters a strong trend outside the grid range").
 * That means a grid can hold many concurrent partial positions at once,
 * which doesn't fit the trading-strategies.ts `Strategy` interface (one
 * directional signal, at most one open position per symbol) — so this is a
 * standalone pure-function module with its own state machine, not another
 * `Strategy`. Nothing here writes to the finance store or touches the live
 * engine; it exists purely to test whether the grid mechanism adds anything
 * on our cached candle history.
 *
 * Deliberate modeling choices (documented, not hidden):
 *   - fills are detected from each candle's high/low (a real grid reacts to
 *     intrabar price), unlike trading-backtest.ts's candle-close-only fills
 *   - within a single bar, pending sells are settled before new buys are
 *     placed — a conservative, deterministic tie-break, not a claim about
 *     real intrabar execution order
 *   - a stop-out (price closes beyond the configured upper/lower bound)
 *     liquidates all held levels at that close and halts new entries unless
 *     `autoRecenter` is set, in which case the range is recomputed and the
 *     grid re-arms immediately
 *   - the chop gate (`chopGate`) independently pauses/resumes entries based
 *     on a rolling range-width ratio, and always recomputes the range on
 *     resume — a stop-out is a capital-preservation event a user would
 *     review, chop-gate pausing is just normal operation
 */
import { computeRiskAdjustedMetrics } from './trading-backtest'
import type { RiskAdjustedMetrics } from './trading-backtest'
import type { Candle } from './trading-strategies'

export type GridSpacing = 'arithmetic' | 'geometric'

export interface GridBacktestConfig {
  interval: string
  /** Trailing candles used to (re)compute the grid's [lower, upper] range. */
  rangeLookbackCandles: number
  /** Number of grid price lines; the top line is a ceiling only (never bought into). */
  gridCount: number
  spacing: GridSpacing
  quotePerGrid: number
  /** Fraction charged per side, e.g. 0.001 = 10 bps (matches trading-backtest.ts). */
  feeRatePerSide: number
  /** 0 = no stop. Breach liquidates all held levels at that candle's close. */
  upperStopPct: number
  lowerStopPct: number
  /** Recompute range + re-arm after a stop-out instead of halting for the rest of the run. */
  autoRecenter: boolean
  /** Pause new entries (and liquidate held levels) while the market is trending. */
  chopGate: boolean
  chopLookbackCandles: number
  /** (highestHigh - lowestLow) / mid over chopLookbackCandles above this = "trending". */
  chopMaxRangePct: number
  /**
   * Independent second gate on Kaufman's Efficiency Ratio (net displacement /
   * path length): catches directional-but-nominally-bounded moves and hard
   * whipsaws the range-width ratio alone doesn't distinguish from good chop.
   * Combines with chopGate via OR — either signal can pause the grid.
   */
  efficiencyGate: boolean
  efficiencyLookbackCandles: number
  /** Efficiency ratio above this (0..1) = "trending too directionally". */
  maxEfficiencyRatio: number
  /**
   * 0 = off. When the close sits outside [lower, upper] for this many
   * consecutive candles without tripping the stop bands, liquidate whatever
   * is still held and re-arm from the current window. Targets the dead zone
   * between "price left the range" and the ±30%/−15% stop bands, where the
   * live grid otherwise idles earning nothing (observed 2026-07-12: BTC ~1%
   * above its upper bound, daily P&L decayed +2.96 → +0.04).
   */
  rearmOutsideRangeCandles: number
  /**
   * Closes the sustained-decline gap in `autoRecenter`: normally each
   * stop-triggered re-arm recomputes `lower` from the current window, so the
   * effective stop price slides downward right along with a falling market
   * and never acts as a hard floor (confirmed live in grid-paper-engine.ts,
   * 2026-07-23). When enabled, the lower stop bound from the most recent
   * *non-stop-triggered* arm (initial arm, chop-gate recovery, or idle-range
   * re-arm — all legitimate "market moved to a new regime" events) is frozen
   * as an absolute floor. A stop-triggered re-arm keeps that floor unchanged;
   * if price ever closes below it the grid liquidates and halts for good,
   * regardless of `autoRecenter`.
   */
  absoluteStopFloorEnabled: boolean
}

export const DEFAULT_GRID_BACKTEST_CONFIG: GridBacktestConfig = {
  interval: '1h',
  rangeLookbackCandles: 200,
  gridCount: 20,
  spacing: 'geometric',
  quotePerGrid: 5,
  feeRatePerSide: 0.001,
  upperStopPct: 0,
  lowerStopPct: 0,
  autoRecenter: false,
  chopGate: false,
  chopLookbackCandles: 50,
  chopMaxRangePct: 0.15,
  efficiencyGate: false,
  efficiencyLookbackCandles: 50,
  maxEfficiencyRatio: 0.3,
  rearmOutsideRangeCandles: 0,
  absoluteStopFloorEnabled: false,
}

export interface GridTrade {
  symbol: string
  levelIndex: number
  entryPrice: number
  exitPrice: number
  quantity: number
  entryQuote: number
  exitQuote: number
  pnlQuote: number
  feesQuote: number
  reason:
    | 'grid-fill'
    | 'stop-liquidation'
    | 'chop-pause-liquidation'
    | 'range-idle-rearm'
    | 'absolute-floor-liquidation'
  openedAt: string
  closedAt: string
}

export interface GridSymbolReport {
  symbol: string
  trades: number
  wins: number
  totalPnlQuote: number
  totalFeesQuote: number
  profitFactor: number
  stopOuts: number
  chopPauses: number
  buyAndHoldReturnPct: number
}

export interface GridBacktestReport {
  config: GridBacktestConfig
  symbols: Array<string>
  interval: string
  from: string
  to: string
  candleCount: number
  trades: Array<GridTrade>
  symbolReports: Array<GridSymbolReport>
  totalPnlQuote: number
  totalFeesQuote: number
  returnPct: number
  maxDrawdownPct: number
  finalEquityQuote: number
  buyAndHoldReturnPct: Record<string, number>
  equityCurve: Array<{ at: string; equity: number }>
  /** Risk-adjusted metrics — see computeRiskAdjustedMetrics in trading-backtest.ts (shared, not duplicated). */
  riskAdjusted: RiskAdjustedMetrics
}

interface GridLevel {
  price: number
  held: boolean
  entryPrice: number
  entryQuote: number
  entryFeeQuote: number
  openedAt: string
}

function buildLevels(lower: number, upper: number, spacing: GridSpacing, count: number): Array<number> {
  if (count < 2 || upper <= lower) return []
  const levels: Array<number> = []
  if (spacing === 'arithmetic') {
    const step = (upper - lower) / (count - 1)
    for (let i = 0; i < count; i++) levels.push(lower + step * i)
  } else {
    const ratio = Math.pow(upper / lower, 1 / (count - 1))
    for (let i = 0; i < count; i++) levels.push(lower * Math.pow(ratio, i))
  }
  return levels
}

function rangeFromWindow(
  candles: Array<Candle>,
  endIndexInclusive: number,
  lookback: number,
): { lower: number; upper: number } | null {
  const start = Math.max(0, endIndexInclusive - lookback + 1)
  if (endIndexInclusive - start + 1 < lookback) return null
  let lower = Infinity
  let upper = -Infinity
  for (let i = start; i <= endIndexInclusive; i++) {
    lower = Math.min(lower, candles[i].low)
    upper = Math.max(upper, candles[i].high)
  }
  return { lower, upper }
}

/** (highestHigh - lowestLow) / mid over the trailing window; null before warmed. */
function rangeWidthRatio(
  candles: Array<Candle>,
  endIndexInclusive: number,
  lookback: number,
): number | null {
  const window = rangeFromWindow(candles, endIndexInclusive, lookback)
  if (!window) return null
  const mid = (window.upper + window.lower) / 2
  if (mid <= 0) return null
  return (window.upper - window.lower) / mid
}

/**
 * Kaufman's Efficiency Ratio: |net displacement| / (sum of bar-to-bar moves)
 * over the trailing window. Close to 1 = price moved in a straight line
 * (trending); close to 0 = price oscillated back and forth without going
 * anywhere (choppy). This catches a case the range-width ratio misses: price
 * can stay inside a nominally bounded range while still whipsawing hard
 * enough to hurt a grid, or can drift efficiently within a range that hasn't
 * technically been "broken" yet.
 */
function efficiencyRatio(
  candles: Array<Candle>,
  endIndexInclusive: number,
  lookback: number,
): number | null {
  const startClose = endIndexInclusive - lookback
  if (startClose < 0) return null
  const netMove = Math.abs(candles[endIndexInclusive].close - candles[startClose].close)
  let pathLength = 0
  for (let i = startClose + 1; i <= endIndexInclusive; i++) {
    pathLength += Math.abs(candles[i].close - candles[i - 1].close)
  }
  if (pathLength <= 0) return null
  return netMove / pathLength
}

function initLevels(prices: Array<number>): Array<GridLevel> {
  return prices.map((price) => ({
    price,
    held: false,
    entryPrice: 0,
    entryQuote: 0,
    entryFeeQuote: 0,
    openedAt: '',
  }))
}

function runSymbolGrid(
  symbol: string,
  candles: Array<Candle>,
  config: GridBacktestConfig,
): { trades: Array<GridTrade>; report: GridSymbolReport; equityContribution: Array<{ at: string; equity: number }> } {
  const trades: Array<GridTrade> = []
  const equityContribution: Array<{ at: string; equity: number }> = []
  let stopOuts = 0
  let chopPauses = 0
  let realizedPnl = 0

  let levels: Array<GridLevel> = []
  let lower = 0
  let upper = 0
  let armed = false
  let pausedForChop = false
  let outsideRangeStreak = 0
  // Distinguishes "stopped out, waiting for a manual re-arm" from "still
  // warming up" — without this, the initial-warmup branch below would
  // silently re-arm a halted (autoRecenter: false) grid on the very next bar.
  let halted = false
  // Absolute stop floor (see absoluteStopFloorEnabled doc): set from a
  // "fresh" arm (initial/chop-recovery/idle-rearm), left untouched across a
  // stop-triggered re-arm so it can't slide down with a falling market.
  let floorPrice: number | null = null

  const arm = (endIndex: number): boolean => {
    const range = rangeFromWindow(candles, endIndex, config.rangeLookbackCandles)
    if (!range) return false
    lower = range.lower
    upper = range.upper
    levels = initLevels(buildLevels(lower, upper, config.spacing, config.gridCount))
    outsideRangeStreak = 0
    return levels.length > 1
  }

  const computeFloor = (): number | null =>
    config.lowerStopPct > 0 ? lower * (1 - config.lowerStopPct) : null

  const liquidateAll = (
    price: number,
    at: string,
    reason: GridTrade['reason'],
  ): void => {
    for (const level of levels) {
      if (!level.held) continue
      const quantity = level.entryQuote / level.entryPrice
      const exitQuote = quantity * price
      const exitFee = exitQuote * config.feeRatePerSide
      const feesQuote = level.entryFeeQuote + exitFee
      const pnlQuote = exitQuote - level.entryQuote - feesQuote
      realizedPnl += pnlQuote
      trades.push({
        symbol,
        levelIndex: levels.indexOf(level),
        entryPrice: level.entryPrice,
        exitPrice: price,
        quantity,
        entryQuote: level.entryQuote,
        exitQuote,
        pnlQuote,
        feesQuote,
        reason,
        openedAt: level.openedAt,
        closedAt: at,
      })
      level.held = false
    }
  }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]
    const at = new Date(candle.openTime).toISOString()

    // The bar that (re)arms the grid defines the range from its own high/low,
    // so checking it for fills would trivially "sweep" whichever boundary it
    // just set. Always arm-and-skip: trading starts on the next bar.
    if (!armed) {
      if (!halted && i >= config.rangeLookbackCandles - 1) {
        armed = arm(i)
        if (armed && config.absoluteStopFloorEnabled) floorPrice = computeFloor()
      }
      equityContribution.push({ at, equity: realizedPnl })
      continue
    }

    const chopRatio = config.chopGate
      ? rangeWidthRatio(candles, i, config.chopLookbackCandles)
      : null
    const rangeTrending =
      config.chopGate && chopRatio != null && chopRatio > config.chopMaxRangePct
    const efficiency = config.efficiencyGate
      ? efficiencyRatio(candles, i, config.efficiencyLookbackCandles)
      : null
    const efficiencyTrending =
      config.efficiencyGate && efficiency != null && efficiency > config.maxEfficiencyRatio
    const trending = rangeTrending || efficiencyTrending

    if (trending && !pausedForChop) {
      liquidateAll(candle.close, at, 'chop-pause-liquidation')
      pausedForChop = true
      chopPauses++
      equityContribution.push({ at, equity: realizedPnl })
      continue
    } else if (!trending && pausedForChop) {
      pausedForChop = false
      armed = arm(i)
      if (armed && config.absoluteStopFloorEnabled) floorPrice = computeFloor()
      equityContribution.push({ at, equity: realizedPnl })
      continue
    }

    // Absolute floor: only engages once a stop-triggered re-arm has already
    // recentered the active range below the frozen floor (`lower < floorPrice`).
    // Right after a fresh arm, `lower` always sits above its own floor by
    // construction, so an ordinary first stop-out still goes through the
    // normal autoRecenter path below — this only catches the case where a
    // sustained decline has already outrun the floor once and is doing it
    // again (see absoluteStopFloorEnabled doc).
    const floorActive =
      config.absoluteStopFloorEnabled &&
      floorPrice != null &&
      lower < floorPrice &&
      candle.close < floorPrice
    if (floorActive) {
      liquidateAll(candle.close, at, 'absolute-floor-liquidation')
      stopOuts++
      armed = false
      halted = true
      equityContribution.push({ at, equity: realizedPnl })
      continue
    }

    // Range breach: liquidate everything at this candle's close.
    const upperBound = config.upperStopPct > 0 ? upper * (1 + config.upperStopPct) : null
    const lowerBound = config.lowerStopPct > 0 ? lower * (1 - config.lowerStopPct) : null
    const breachedUp = upperBound != null && candle.close > upperBound
    const breachedDown = lowerBound != null && candle.close < lowerBound
    if (breachedUp || breachedDown) {
      liquidateAll(candle.close, at, 'stop-liquidation')
      stopOuts++
      armed = false
      if (config.autoRecenter) armed = arm(i)
      else halted = true
      equityContribution.push({ at, equity: realizedPnl })
      continue
    }

    if (pausedForChop) {
      equityContribution.push({ at, equity: realizedPnl })
      continue
    }

    // Idle-range re-arm: price left [lower, upper] but hasn't tripped the
    // stop bands — the dead zone where the grid can sit earning nothing for
    // days. After N consecutive outside closes, cut whatever is still held
    // and recentre on the current window. Trading resumes next bar
    // (arm-and-skip, same as every other re-arm path).
    if (config.rearmOutsideRangeCandles > 0) {
      const outside = candle.close > upper || candle.close < lower
      outsideRangeStreak = outside ? outsideRangeStreak + 1 : 0
      if (outsideRangeStreak >= config.rearmOutsideRangeCandles) {
        liquidateAll(candle.close, at, 'range-idle-rearm')
        armed = arm(i)
        if (armed && config.absoluteStopFloorEnabled) floorPrice = computeFloor()
        equityContribution.push({ at, equity: realizedPnl })
        continue
      }
    }

    // 1. Sells first: any held level whose target (next level up) was swept this bar.
    for (let li = 0; li < levels.length - 1; li++) {
      const level = levels[li]
      if (!level.held) continue
      const target = levels[li + 1].price
      if (candle.low <= target && target <= candle.high) {
        const quantity = level.entryQuote / level.entryPrice
        const exitQuote = quantity * target
        const exitFee = exitQuote * config.feeRatePerSide
        const feesQuote = level.entryFeeQuote + exitFee
        const pnlQuote = exitQuote - level.entryQuote - feesQuote
        realizedPnl += pnlQuote
        trades.push({
          symbol,
          levelIndex: li,
          entryPrice: level.entryPrice,
          exitPrice: target,
          quantity,
          entryQuote: level.entryQuote,
          exitQuote,
          pnlQuote,
          feesQuote,
          reason: 'grid-fill',
          openedAt: level.openedAt,
          closedAt: at,
        })
        level.held = false
      }
    }

    // 2. Buys: any unheld level (excluding the top ceiling) swept this bar.
    for (let li = 0; li < levels.length - 1; li++) {
      const level = levels[li]
      if (level.held) continue
      if (candle.low <= level.price && level.price <= candle.high) {
        const entryFeeQuote = config.quotePerGrid * config.feeRatePerSide
        level.held = true
        level.entryPrice = level.price
        level.entryQuote = config.quotePerGrid
        level.entryFeeQuote = entryFeeQuote
        level.openedAt = at
      }
    }

    equityContribution.push({ at, equity: realizedPnl })
  }

  // Close out any still-held levels at the final candle's close so PnL reflects full exposure.
  if (candles.length > 0 && levels.some((l) => l.held)) {
    const last = candles[candles.length - 1]
    liquidateAll(last.close, new Date(last.openTime).toISOString(), 'stop-liquidation')
    equityContribution.push({
      at: new Date(last.openTime).toISOString(),
      equity: realizedPnl,
    })
  }

  const wins = trades.filter((t) => t.pnlQuote > 0).length
  const grossProfit = trades
    .filter((t) => t.pnlQuote > 0)
    .reduce((s, t) => s + t.pnlQuote, 0)
  const grossLoss = trades
    .filter((t) => t.pnlQuote < 0)
    .reduce((s, t) => s + Math.abs(t.pnlQuote), 0)
  const totalFeesQuote = trades.reduce((s, t) => s + t.feesQuote, 0)
  const buyAndHold =
    candles.length > 1
      ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100
      : 0

  return {
    trades,
    report: {
      symbol,
      trades: trades.length,
      wins,
      totalPnlQuote: realizedPnl,
      totalFeesQuote,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      stopOuts,
      chopPauses,
      buyAndHoldReturnPct: buyAndHold,
    },
    equityContribution,
  }
}

export function runGridBacktest(
  candlesBySymbol: Record<string, Array<Candle>>,
  config: GridBacktestConfig,
): GridBacktestReport {
  const symbols = Object.keys(candlesBySymbol)
  const allTrades: Array<GridTrade> = []
  const symbolReports: Array<GridSymbolReport> = []
  const buyAndHoldReturnPct: Record<string, number> = {}
  let totalPnlQuote = 0
  let totalFeesQuote = 0
  let candleCount = 0
  let from = ''
  let to = ''
  const equityBySymbol: Record<string, Array<{ at: string; equity: number }>> = {}

  for (const symbol of symbols) {
    const candles = candlesBySymbol[symbol]
    candleCount += candles.length
    if (candles.length > 0) {
      const first = new Date(candles[0].openTime).toISOString()
      const last = new Date(candles[candles.length - 1].openTime).toISOString()
      if (!from || first < from) from = first
      if (!to || last > to) to = last
    }
    const { trades, report, equityContribution } = runSymbolGrid(symbol, candles, config)
    allTrades.push(...trades)
    symbolReports.push(report)
    buyAndHoldReturnPct[symbol] = report.buyAndHoldReturnPct
    totalPnlQuote += report.totalPnlQuote
    totalFeesQuote += report.totalFeesQuote
    equityBySymbol[symbol] = equityContribution
  }

  // Merge per-symbol equity contributions into one chronological running-total curve.
  const merged: Array<{ at: string; delta: number }> = []
  for (const symbol of symbols) {
    let prev = 0
    for (const point of equityBySymbol[symbol]) {
      merged.push({ at: point.at, delta: point.equity - prev })
      prev = point.equity
    }
  }
  merged.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  // Drawdown must be measured against actual account equity (starting
  // capital + PnL), not the raw cumulative-PnL curve — a PnL curve can sit
  // near zero, and computing "% down from peak" against a near-zero peak
  // blows up into meaningless numbers (e.g. hundreds of percent).
  const startingBalanceQuote = symbols.length * config.gridCount * config.quotePerGrid
  const equityCurve: Array<{ at: string; equity: number }> = []
  let equity = startingBalanceQuote
  let peak = startingBalanceQuote
  let maxDrawdownPct = 0
  for (const point of merged) {
    equity += point.delta
    equityCurve.push({ at: point.at, equity })
    peak = Math.max(peak, equity)
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdown)
  }

  const returnPct =
    startingBalanceQuote > 0 ? (totalPnlQuote / startingBalanceQuote) * 100 : 0

  return {
    config,
    symbols,
    interval: config.interval,
    from,
    to,
    candleCount,
    trades: allTrades,
    symbolReports,
    totalPnlQuote,
    totalFeesQuote,
    returnPct,
    maxDrawdownPct,
    finalEquityQuote: startingBalanceQuote + totalPnlQuote,
    buyAndHoldReturnPct,
    equityCurve,
    riskAdjusted: computeRiskAdjustedMetrics(equityCurve, returnPct, maxDrawdownPct),
  }
}

// Exposed for tests and the CLI summary.
export { buildLevels, rangeFromWindow, rangeWidthRatio, efficiencyRatio }
