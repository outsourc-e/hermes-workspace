/**
 * Live paper-mode grid engine — the incremental, stateful counterpart to
 * src/server/grid-backtest.ts's offline batch replay. A live cycle can't
 * re-simulate from scratch every run (the range/levels would silently
 * reshuffle each time the fetch window moves), so this persists grid state
 * between cycles and only steps forward through genuinely new candles.
 *
 * Deliberately reimplements grid-backtest.ts's per-candle transition rules
 * rather than importing them — this repo already keeps its offline/live
 * pairs separate (trading-backtest.ts vs demo-trading-engine.ts don't share
 * a core either), and this module is intentionally isolated from
 * demo-trading-engine.ts entirely: its own lock, its own settings key
 * (`settings.demoTradingGrid`), its own finance-store kinds, zero shared
 * mutable state with the council engine's 5-minute cycle.
 *
 * Paper-first: reads public market data (fetchBinanceKlines) and simulates
 * fills; paper accounting is always authoritative. With
 * `executionMode: 'testnet_execute'` (off by default) each paper fill is
 * additionally mirrored as a real MARKET order on the hard-locked Binance
 * testnet — gated by tradingMode, the kill switch, a per-cycle order budget,
 * and a daily realized-loss cap, and a real-order failure can never break
 * the paper cycle. Config defaults match the blind-tested candidate from
 * the offline research (efficiency-ratio gate only — the range-width chop
 * gate was tested and found to hurt results when combined).
 */
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { fetchBinanceKlines } from './binance-market.service'
import {
  appendAuditLog,
  readFinanceStore,
  writeFinanceStore,
} from './finance-store'
import { isConnectivityBreakerTripped } from './connectivity-breaker'
import { createDemoClientFromEnv, floorToStep } from './binance-demo-client'
import type { BinanceExecutionClient } from './binance-demo-client'
import type { Candle } from './trading-strategies'

export type GridSpacing = 'arithmetic' | 'geometric'

export interface GridEngineConfig {
  symbols: Array<string>
  interval: string
  rangeLookbackCandles: number
  gridCount: number
  spacing: GridSpacing
  quotePerGrid: number
  feeRatePerSide: number
  upperStopPct: number
  lowerStopPct: number
  autoRecenter: boolean
  efficiencyGate: boolean
  efficiencyLookbackCandles: number
  maxEfficiencyRatio: number
  /** Trailing candles fetched per cycle; must exceed rangeLookback + efficiencyLookback. */
  fetchCandleLimit: number
  /**
   * 0 = off. Re-arm after this many consecutive closes outside [lower, upper]
   * without a stop/chop trigger — the dead zone where the grid otherwise
   * idles. N=24 (one day at 1h candles) validated on both backtest windows
   * 2026-07-13; N=6 was WORSE than baseline, so don't arm small values.
   */
  rearmOutsideRangeCandles: number
  /**
   * Closes the sustained-decline gap where autoRecenter's stop-triggered
   * re-arm recomputes `lower` from the current window, so the effective
   * stop slides down with a falling market instead of acting as a hard
   * floor (root-caused live 2026-07-23, ~line 416-423 above; backtest
   * validation in grid-backtest.ts's absoluteStopFloorEnabled). When
   * enabled, the lower stop bound from the most recent non-stop-triggered
   * arm (initial/cold-start, chop-recovery, or idle-range re-arm) is frozen
   * as an absolute floor; a stop-triggered re-arm keeps it unchanged, and
   * once the active range has recentered below it, closing below the
   * floor liquidates and halts for good regardless of autoRecenter.
   */
  absoluteStopFloorEnabled: boolean
  /**
   * 'paper' (default) = simulate only, no keys needed. 'testnet_execute' =
   * additionally mirror each paper fill as a real MARKET order on the
   * hard-locked Binance testnet. Paper stays authoritative either way; the
   * real orders are an execution shadow, and every gate (tradingMode,
   * kill switch, order budget, daily-loss cap) applies only to them.
   */
  executionMode: 'paper' | 'testnet_execute'
  /** Pause real-order mirroring for the rest of the day once today's realized grid P&L is below −this. 0 = no cap. */
  maxDailyLossQuote: number
  /** Real orders mirrored per cycle at most; excess paper fills are skipped (audit-logged), paper stays authoritative. */
  maxRealOrdersPerCycle: number
}

export const DEFAULT_GRID_ENGINE_CONFIG: GridEngineConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'],
  interval: '1h',
  rangeLookbackCandles: 200,
  gridCount: 20,
  spacing: 'geometric',
  quotePerGrid: 5,
  feeRatePerSide: 0.001,
  upperStopPct: 0.3,
  lowerStopPct: 0.15,
  autoRecenter: true,
  efficiencyGate: true,
  efficiencyLookbackCandles: 100,
  maxEfficiencyRatio: 0.25,
  fetchCandleLimit: 500,
  rearmOutsideRangeCandles: 0,
  absoluteStopFloorEnabled: false,
  executionMode: 'paper',
  maxDailyLossQuote: 25,
  maxRealOrdersPerCycle: 12,
}

export function resolveGridEngineConfig(settingsOverride: unknown): GridEngineConfig {
  const fromSettings =
    settingsOverride && typeof settingsOverride === 'object'
      ? (settingsOverride as Partial<GridEngineConfig>)
      : {}
  return { ...DEFAULT_GRID_ENGINE_CONFIG, ...fromSettings }
}

const SR_KIND_GRID_STATE = 'demo_grid_state'
const SR_KIND_GRID_TRADE = 'demo_grid_trade'
const SR_KIND_GRID_REAL_FILL = 'demo_grid_real_fill'
const GRID_TRADE_LOG_CAP = 500
const GRID_REAL_FILL_LOG_CAP = 500

interface GridLevelState {
  price: number
  held: boolean
  entryPrice: number
  entryQuote: number
  entryFeeQuote: number
  openedAt: string
}

export interface GridSymbolState {
  kind: typeof SR_KIND_GRID_STATE
  symbol: string
  armed: boolean
  halted: boolean
  pausedForChop: boolean
  lower: number
  upper: number
  levels: Array<GridLevelState>
  lastProcessedOpenTime: number
  updatedAt: string
  /** Consecutive closes outside [lower, upper]; drives rearmOutsideRangeCandles. */
  outsideRangeStreak?: number
  /** Absolute stop floor (see absoluteStopFloorEnabled doc); persisted so it survives cron restarts. */
  floorPrice?: number | null
}

export interface GridPaperTrade {
  kind: typeof SR_KIND_GRID_TRADE
  id: string
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

/** A paper BUY fill emitted by advanceSymbolState so the testnet mirror can replicate it. */
export interface GridBuyEvent {
  symbol: string
  levelIndex: number
  price: number
  quoteAmount: number
  at: string
}

/** One mirrored real order on the Binance testnet (paper stays authoritative). */
export interface GridRealFill {
  kind: typeof SR_KIND_GRID_REAL_FILL
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  levelIndex: number
  /** Price the paper fill happened at (level/liquidation price). */
  paperPrice: number
  /** Actual average fill price of the real MARKET order. */
  realPrice: number
  realQty: number
  quoteAmount: number
  orderId: number
  at: string
}

// ── pure math helpers (mirrors grid-backtest.ts; reimplemented, not shared) ──

function buildLevels(
  lower: number,
  upper: number,
  spacing: GridSpacing,
  count: number,
): Array<number> {
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

function initLevelStates(prices: Array<number>): Array<GridLevelState> {
  return prices.map((price) => ({
    price,
    held: false,
    entryPrice: 0,
    entryQuote: 0,
    entryFeeQuote: 0,
    openedAt: '',
  }))
}

function armFrom(
  candles: Array<Candle>,
  endIndex: number,
  config: GridEngineConfig,
): { lower: number; upper: number; levels: Array<GridLevelState> } | null {
  const range = rangeFromWindow(candles, endIndex, config.rangeLookbackCandles)
  if (!range) return null
  const levels = initLevelStates(buildLevels(range.lower, range.upper, config.spacing, config.gridCount))
  if (levels.length < 2) return null
  return { lower: range.lower, upper: range.upper, levels }
}

function liquidateAll(
  levels: Array<GridLevelState>,
  price: number,
  at: string,
  reason: GridPaperTrade['reason'],
  symbol: string,
  config: GridEngineConfig,
  trades: Array<GridPaperTrade>,
): void {
  levels.forEach((level, levelIndex) => {
    if (!level.held) return
    const quantity = level.entryQuote / level.entryPrice
    const exitQuote = quantity * price
    const exitFee = exitQuote * config.feeRatePerSide
    const feesQuote = level.entryFeeQuote + exitFee
    const pnlQuote = exitQuote - level.entryQuote - feesQuote
    trades.push({
      kind: SR_KIND_GRID_TRADE,
      id: randomUUID(),
      symbol,
      levelIndex,
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
  })
}

/**
 * Steps a single symbol's persisted grid state forward through any candles
 * newer than `persisted.lastProcessedOpenTime`. Pure (no I/O) so it's
 * directly unit-testable and so two sequential calls over adjoining candle
 * slices are guaranteed to produce the same result as one call over the
 * combined slice — that equivalence is exactly what makes cron-restart-safe
 * incremental processing correct.
 */
export function advanceSymbolState(
  symbol: string,
  persisted: GridSymbolState | undefined,
  candles: Array<Candle>,
  config: GridEngineConfig,
): {
  state: GridSymbolState
  trades: Array<GridPaperTrade>
  buys: Array<GridBuyEvent>
} {
  const trades: Array<GridPaperTrade> = []
  const buys: Array<GridBuyEvent> = []
  const now = new Date().toISOString()

  let armed = persisted?.armed ?? false
  let halted = persisted?.halted ?? false
  let pausedForChop = persisted?.pausedForChop ?? false
  let lower = persisted?.lower ?? 0
  let upper = persisted?.upper ?? 0
  let outsideRangeStreak = persisted?.outsideRangeStreak ?? 0
  let levels: Array<GridLevelState> = persisted?.levels
    ? persisted.levels.map((l) => ({ ...l }))
    : []
  let lastProcessedOpenTime = persisted?.lastProcessedOpenTime ?? 0
  let floorPrice: number | null = persisted?.floorPrice ?? null

  const computeFloor = (): number | null =>
    config.lowerStopPct > 0 ? lower * (1 - config.lowerStopPct) : null

  let startIndex = candles.findIndex((c) => c.openTime > lastProcessedOpenTime)

  if (!persisted) {
    // Cold start: arm using the oldest available warmup window in this
    // fetch and skip that bar for fills — the bar that defines the range
    // would trivially "sweep" whichever boundary it just set.
    const warmupIndex = Math.min(config.rangeLookbackCandles - 1, candles.length - 1)
    const armResult = armFrom(candles, warmupIndex, config)
    if (armResult) {
      lower = armResult.lower
      upper = armResult.upper
      levels = armResult.levels
      armed = true
      if (config.absoluteStopFloorEnabled) floorPrice = computeFloor()
    }
    if (candles[warmupIndex]) lastProcessedOpenTime = candles[warmupIndex].openTime
    startIndex = warmupIndex + 1
  }

  if (startIndex < 0 || startIndex >= candles.length) {
    return {
      state: {
        kind: SR_KIND_GRID_STATE,
        symbol,
        armed,
        halted,
        pausedForChop,
        lower,
        upper,
        levels,
        lastProcessedOpenTime,
        updatedAt: now,
        outsideRangeStreak,
        floorPrice,
      },
      trades,
      buys,
    }
  }

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]
    const at = new Date(candle.openTime).toISOString()
    lastProcessedOpenTime = candle.openTime

    if (!armed) {
      if (!halted && i >= config.rangeLookbackCandles - 1) {
        const armResult = armFrom(candles, i, config)
        armed = !!armResult
        if (armResult) {
          lower = armResult.lower
          upper = armResult.upper
          levels = armResult.levels
          outsideRangeStreak = 0
          if (config.absoluteStopFloorEnabled) floorPrice = computeFloor()
        }
      }
      continue
    }

    const efficiency = config.efficiencyGate
      ? efficiencyRatio(candles, i, config.efficiencyLookbackCandles)
      : null
    const trending =
      config.efficiencyGate && efficiency != null && efficiency > config.maxEfficiencyRatio

    if (trending && !pausedForChop) {
      liquidateAll(levels, candle.close, at, 'chop-pause-liquidation', symbol, config, trades)
      pausedForChop = true
      continue
    } else if (!trending && pausedForChop) {
      pausedForChop = false
      const armResult = armFrom(candles, i, config)
      armed = !!armResult
      if (armResult) {
        lower = armResult.lower
        upper = armResult.upper
        levels = armResult.levels
        outsideRangeStreak = 0
        if (config.absoluteStopFloorEnabled) floorPrice = computeFloor()
      }
      continue
    }

    // Absolute floor: only engages once a stop-triggered re-arm has already
    // recentered the active range below the frozen floor — an ordinary
    // first stop-out still autoRecenters normally below (see
    // absoluteStopFloorEnabled doc).
    if (
      config.absoluteStopFloorEnabled &&
      floorPrice != null &&
      lower < floorPrice &&
      candle.close < floorPrice
    ) {
      liquidateAll(levels, candle.close, at, 'absolute-floor-liquidation', symbol, config, trades)
      armed = false
      halted = true
      continue
    }

    const upperBound = config.upperStopPct > 0 ? upper * (1 + config.upperStopPct) : null
    const lowerBound = config.lowerStopPct > 0 ? lower * (1 - config.lowerStopPct) : null
    const breachedUp = upperBound != null && candle.close > upperBound
    const breachedDown = lowerBound != null && candle.close < lowerBound
    if (breachedUp || breachedDown) {
      liquidateAll(levels, candle.close, at, 'stop-liquidation', symbol, config, trades)
      armed = false
      if (config.autoRecenter) {
        const armResult = armFrom(candles, i, config)
        armed = !!armResult
        if (armResult) {
          lower = armResult.lower
          upper = armResult.upper
          levels = armResult.levels
          outsideRangeStreak = 0
        }
      } else {
        halted = true
      }
      continue
    }

    if (pausedForChop) continue

    // Idle-range re-arm (mirrors grid-backtest.ts, N=24 validated 2026-07-13):
    // price left [lower, upper] but hasn't tripped the stop bands — the dead
    // zone where the grid can idle for days. After N consecutive outside
    // closes, cut whatever is still held and recentre on the current window.
    if (config.rearmOutsideRangeCandles > 0) {
      const outside = candle.close > upper || candle.close < lower
      outsideRangeStreak = outside ? outsideRangeStreak + 1 : 0
      if (outsideRangeStreak >= config.rearmOutsideRangeCandles) {
        liquidateAll(levels, candle.close, at, 'range-idle-rearm', symbol, config, trades)
        const armResult = armFrom(candles, i, config)
        armed = !!armResult
        if (armResult) {
          lower = armResult.lower
          upper = armResult.upper
          levels = armResult.levels
          if (config.absoluteStopFloorEnabled) floorPrice = computeFloor()
        }
        outsideRangeStreak = 0
        continue
      }
    }

    // Sells first: any held level whose target (next level up) was swept this bar.
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
        trades.push({
          kind: SR_KIND_GRID_TRADE,
          id: randomUUID(),
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

    // Buys: any unheld level (excluding the top ceiling) swept this bar.
    for (let li = 0; li < levels.length - 1; li++) {
      const level = levels[li]
      if (level.held) continue
      if (candle.low <= level.price && level.price <= candle.high) {
        level.held = true
        level.entryPrice = level.price
        level.entryQuote = config.quotePerGrid
        level.entryFeeQuote = config.quotePerGrid * config.feeRatePerSide
        level.openedAt = at
        buys.push({
          symbol,
          levelIndex: li,
          price: level.price,
          quoteAmount: config.quotePerGrid,
          at,
        })
      }
    }
  }

  return {
    state: {
      kind: SR_KIND_GRID_STATE,
      symbol,
      armed,
      halted,
      pausedForChop,
      lower,
      upper,
      levels,
      lastProcessedOpenTime,
      updatedAt: now,
      outsideRangeStreak,
      floorPrice,
    },
    trades,
    buys,
  }
}

// ── testnet execution mirror (only active when executionMode: 'testnet_execute') ──

// Same never-throws, never-blocks alert pattern as demo-trading-engine.ts's
// sendTradeAlert (module-private there; this engine is deliberately isolated).
const GRID_ALERTS_ENABLED = process.env.HERMES_DEMO_TRADE_ALERTS !== 'off'
const GRID_ALERT_TARGET = 'telegram:2130622225'
let _gridHermesBin: string | null = null
function gridHermesBin(): string {
  if (_gridHermesBin) return _gridHermesBin
  const home = os.homedir()
  const candidates = [
    `${home}/.local/bin/hermes`,
    `${home}/.hermes/hermes-agent/venv/bin/hermes`,
    `${home}/.hermes/node/bin/hermes`,
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        _gridHermesBin = candidate
        return candidate
      }
    } catch {
      /* skip */
    }
  }
  try {
    _gridHermesBin =
      spawnSync('which', ['hermes'], { encoding: 'utf-8' }).stdout.trim() ||
      'hermes'
  } catch {
    _gridHermesBin = 'hermes'
  }
  return _gridHermesBin
}
function sendGridAlert(message: string): void {
  if (!GRID_ALERTS_ENABLED) return
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return
  try {
    const child = spawn(
      gridHermesBin(),
      ['send', '--to', GRID_ALERT_TARGET, '-q', message],
      { stdio: 'ignore', detached: true },
    )
    child.on('error', () => {
      /* non-fatal */
    })
    child.unref()
  } catch {
    /* non-fatal */
  }
}

function baseAssetOfSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase()
  return normalized.endsWith('USDT') ? normalized.slice(0, -4) : ''
}

function todaysRealizedPnl(trades: Array<GridPaperTrade>): number {
  const today = new Date().toISOString().slice(0, 10)
  return trades
    .filter((t) => t.closedAt.slice(0, 10) === today)
    .reduce((sum, t) => sum + t.pnlQuote, 0)
}

/**
 * Mirrors this cycle's paper fills as real MARKET orders on the Binance
 * testnet. Paper accounting is authoritative; every real-order failure is
 * audit-logged + alerted and never breaks the cycle. Sells run before buys
 * (they free balance and reduce risk) inside a per-cycle order budget.
 */
async function mirrorRealOrders(input: {
  config: GridEngineConfig
  settings: Record<string, unknown>
  buys: Array<GridBuyEvent>
  sells: Array<GridPaperTrade>
  allTradesIncludingNew: Array<GridPaperTrade>
  client?: BinanceExecutionClient
}): Promise<Array<GridRealFill>> {
  const { config, settings } = input
  const skip = (reason: string): Array<GridRealFill> => {
    appendAuditLog('grid_real_mirror_skipped', {
      reason,
      buys: input.buys.length,
      sells: input.sells.length,
    })
    return []
  }
  if (input.buys.length === 0 && input.sells.length === 0) return []
  if (settings.tradingMode !== 'testnet_execute')
    return skip(`tradingMode is ${String(settings.tradingMode)}`)
  if (settings.emergencyKillSwitch === true) return skip('kill switch engaged')
  if (config.maxDailyLossQuote > 0) {
    const todayPnl = todaysRealizedPnl(input.allTradesIncludingNew)
    if (todayPnl < -config.maxDailyLossQuote) {
      sendGridAlert(
        `⚠️ Grid testnet mirroring paused for today: realized ${todayPnl.toFixed(2)} USDT ` +
          `is below the −${config.maxDailyLossQuote} daily-loss cap. Paper cycle continues.`,
      )
      return skip(`daily loss cap (${todayPnl.toFixed(2)} USDT today)`)
    }
  }
  let client = input.client
  if (!client) {
    const built = createDemoClientFromEnv()
    if (!built.client) return skip(`no testnet client: ${built.reason ?? 'unknown'}`)
    client = built.client
  }

  const realFills: Array<GridRealFill> = []
  let budget = config.maxRealOrdersPerCycle > 0 ? config.maxRealOrdersPerCycle : Infinity
  const overBudget: Array<string> = []

  // Sells first: they free balance for the buys and reduce exposure.
  for (const sell of input.sells) {
    if (budget <= 0) {
      overBudget.push(`SELL ${sell.symbol} level ${sell.levelIndex}`)
      continue
    }
    try {
      let quantity = sell.quantity
      try {
        const base = baseAssetOfSymbol(sell.symbol)
        if (base) {
          const account = await client.getAccount()
          const free = account.balances.find((b) => b.asset === base)?.free
          if (typeof free === 'number' && free > 0 && free < quantity)
            quantity = free
        }
        if (client.getSymbolFilters) {
          const filters = await client.getSymbolFilters(sell.symbol)
          if (filters.stepSize > 0) quantity = floorToStep(quantity, filters.stepSize)
          if (
            quantity <= 0 ||
            (filters.minQty > 0 && quantity < filters.minQty) ||
            (filters.minNotional > 0 && quantity * sell.exitPrice < filters.minNotional)
          ) {
            appendAuditLog('grid_real_sell_dust_skipped', {
              symbol: sell.symbol,
              levelIndex: sell.levelIndex,
              paperQuantity: sell.quantity,
              clampedQuantity: quantity,
            })
            continue
          }
        }
      } catch {
        // Clamp is best-effort — fall back to the paper quantity.
      }
      budget--
      const order = await client.placeOrder({
        symbol: sell.symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity,
      })
      realFills.push({
        kind: SR_KIND_GRID_REAL_FILL,
        id: randomUUID(),
        symbol: sell.symbol,
        side: 'SELL',
        levelIndex: sell.levelIndex,
        paperPrice: sell.exitPrice,
        realPrice: order.avgPrice || sell.exitPrice,
        realQty: order.executedQty,
        quoteAmount: order.cummulativeQuoteQty,
        orderId: order.orderId,
        at: new Date().toISOString(),
      })
    } catch (err) {
      appendAuditLog('grid_real_order_failed', {
        side: 'SELL',
        symbol: sell.symbol,
        levelIndex: sell.levelIndex,
        error: (err as Error).message,
      })
      sendGridAlert(
        `🔴 Grid testnet SELL failed for ${sell.symbol} (level ${sell.levelIndex}): ${(err as Error).message}. Paper state unaffected.`,
      )
    }
  }

  for (const buy of input.buys) {
    if (budget <= 0) {
      overBudget.push(`BUY ${buy.symbol} level ${buy.levelIndex}`)
      continue
    }
    try {
      budget--
      const order = await client.placeOrder({
        symbol: buy.symbol,
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: buy.quoteAmount,
      })
      realFills.push({
        kind: SR_KIND_GRID_REAL_FILL,
        id: randomUUID(),
        symbol: buy.symbol,
        side: 'BUY',
        levelIndex: buy.levelIndex,
        paperPrice: buy.price,
        realPrice: order.avgPrice || buy.price,
        realQty: order.executedQty,
        quoteAmount: order.cummulativeQuoteQty || buy.quoteAmount,
        orderId: order.orderId,
        at: new Date().toISOString(),
      })
    } catch (err) {
      appendAuditLog('grid_real_order_failed', {
        side: 'BUY',
        symbol: buy.symbol,
        levelIndex: buy.levelIndex,
        error: (err as Error).message,
      })
      sendGridAlert(
        `🔴 Grid testnet BUY failed for ${buy.symbol} (level ${buy.levelIndex}): ${(err as Error).message}. Paper state unaffected.`,
      )
    }
  }

  if (overBudget.length > 0) {
    appendAuditLog('grid_real_orders_over_budget', {
      budget: config.maxRealOrdersPerCycle,
      skipped: overBudget,
    })
    sendGridAlert(
      `⚠️ Grid testnet mirror skipped ${overBudget.length} order(s) over the ` +
        `${config.maxRealOrdersPerCycle}/cycle budget — real inventory now trails paper. Check the grid panel.`,
    )
  }
  return realFills
}

// ── cycle orchestration (I/O + persistence + lock) ──────────────────────────

let gridCycleInProgress = false

export interface GridCycleResult {
  ran: boolean
  reason?: string
  trades: Array<GridPaperTrade>
  symbolsProcessed: number
  /** Real testnet orders mirrored this cycle (always [] in paper mode). */
  realFills: Array<GridRealFill>
}

export interface GridCycleOptions {
  /** Injectable for tests — defaults to the real public-API fetch. */
  fetchKlines?: typeof fetchBinanceKlines
  /** Injectable for tests — defaults to createDemoClientFromEnv() when executionMode is testnet_execute. */
  client?: BinanceExecutionClient
}

async function runGridPaperCycleInner(options: GridCycleOptions): Promise<GridCycleResult> {
  // First global gate this paper-only engine has ever had — previously ran
  // regardless of emergencyKillSwitch/tradingMode. A tripped connectivity
  // breaker means repeated invalid-credential errors elsewhere (this engine
  // itself only reads public market data, never signs a request) — halting
  // here too avoids burning cycles while the underlying key problem exists.
  if (isConnectivityBreakerTripped()) {
    return {
      ran: false,
      reason: 'connectivity breaker tripped',
      trades: [],
      symbolsProcessed: 0,
      realFills: [],
    }
  }
  const fetchKlines = options.fetchKlines ?? fetchBinanceKlines
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const config = resolveGridEngineConfig(settings.demoTradingGrid)

  const rows = db.strategy_results
  const existingStates = rows.filter(
    (r) => r.kind === SR_KIND_GRID_STATE,
  ) as unknown as Array<GridSymbolState>
  const existingBySymbol = new Map(existingStates.map((s) => [s.symbol, s]))
  const existingTrades = rows.filter(
    (r) => r.kind === SR_KIND_GRID_TRADE,
  ) as unknown as Array<GridPaperTrade>
  const existingRealFills = rows.filter(
    (r) => r.kind === SR_KIND_GRID_REAL_FILL,
  ) as unknown as Array<GridRealFill>

  const newStates: Array<GridSymbolState> = []
  const allNewTrades: Array<GridPaperTrade> = []
  const allNewBuys: Array<GridBuyEvent> = []

  for (const symbol of config.symbols) {
    const candles = await fetchKlines(symbol, config.interval, config.fetchCandleLimit)
    const persisted = existingBySymbol.get(symbol)
    const { state, trades, buys } = advanceSymbolState(symbol, persisted, candles, config)
    newStates.push(state)
    allNewTrades.push(...trades)
    allNewBuys.push(...buys)
  }

  // Testnet execution mirror — strictly after the paper accounting, which
  // stays authoritative. Any real-order failure alerts + audit-logs inside
  // and never propagates back into the paper cycle.
  let newRealFills: Array<GridRealFill> = []
  if (config.executionMode === 'testnet_execute') {
    newRealFills = await mirrorRealOrders({
      config,
      settings,
      buys: allNewBuys,
      sells: allNewTrades,
      allTradesIncludingNew: [...existingTrades, ...allNewTrades],
      client: options.client,
    })
  }

  // Replace only our own kinds — everything else (including every council
  // row) passes through untouched, mirroring demo-trading-engine.ts's
  // persist() pattern exactly.
  const others = rows.filter(
    (r) =>
      r.kind !== SR_KIND_GRID_STATE &&
      r.kind !== SR_KIND_GRID_TRADE &&
      r.kind !== SR_KIND_GRID_REAL_FILL,
  )
  const mergedTrades = [...existingTrades, ...allNewTrades].slice(-GRID_TRADE_LOG_CAP)
  const mergedRealFills = [...existingRealFills, ...newRealFills].slice(
    -GRID_REAL_FILL_LOG_CAP,
  )
  db.strategy_results = [
    ...others,
    ...newStates.map((s) => ({ ...s })),
    ...mergedTrades.map((t) => ({ ...t })),
    ...mergedRealFills.map((f) => ({ ...f })),
  ]
  db.updatedAt = new Date().toISOString()
  writeFinanceStore(db)

  return {
    ran: true,
    trades: allNewTrades,
    symbolsProcessed: config.symbols.length,
    realFills: newRealFills,
  }
}

export async function runGridPaperCycle(
  options: GridCycleOptions = {},
): Promise<GridCycleResult> {
  if (gridCycleInProgress) {
    return { ran: false, reason: 'busy', trades: [], symbolsProcessed: 0, realFills: [] }
  }
  gridCycleInProgress = true
  try {
    return await runGridPaperCycleInner(options)
  } finally {
    gridCycleInProgress = false
  }
}

export interface GridPerformance {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnlQuote: number
  totalFeesQuote: number
}

/** Aggregate stats over ALL closed grid trades (not just the last-50 slice kept for display). */
export function summarizeGridTrades(
  trades: Array<GridPaperTrade>,
): GridPerformance {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnlQuote: 0,
      totalFeesQuote: 0,
    }
  }
  const wins = trades.filter((t) => t.pnlQuote > 0).length
  const losses = trades.filter((t) => t.pnlQuote < 0).length
  return {
    totalTrades: trades.length,
    wins,
    losses,
    winRate: wins / trades.length,
    totalPnlQuote: trades.reduce((sum, t) => sum + t.pnlQuote, 0),
    totalFeesQuote: trades.reduce((sum, t) => sum + t.feesQuote, 0),
  }
}

export function getGridEngineState(): {
  config: GridEngineConfig
  states: Array<GridSymbolState>
  trades: Array<GridPaperTrade>
  performance: GridPerformance
} {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const rows = db.strategy_results
  const allTrades = rows.filter(
    (r) => r.kind === SR_KIND_GRID_TRADE,
  ) as unknown as Array<GridPaperTrade>
  return {
    config: resolveGridEngineConfig(settings.demoTradingGrid),
    states: rows.filter((r) => r.kind === SR_KIND_GRID_STATE) as unknown as Array<GridSymbolState>,
    trades: [...allTrades].slice(-50).reverse(),
    performance: summarizeGridTrades(allTrades),
  }
}
