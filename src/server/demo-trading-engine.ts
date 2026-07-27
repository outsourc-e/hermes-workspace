/**
 * Automated Binance trading engine — VT-Capital concepts folded in.
 *
 * One cycle per symbol:
 *   1. every enabled strategy evaluates fresh demo candles
 *   2. the COUNCIL combines their signals, weighted by each strategy's
 *      accumulated score (proven formulas count more)
 *   3. a BUY verdict must then pass the GUARDIAN risk layer (position cap,
 *      per-trade cap, daily-loss halt, loss-streak cooldown, balance floor)
 *   4. open positions close on stop-loss / take-profit / owner-strategy SELL
 *      / strong council SELL; realized PnL updates the owner's score and is
 *      appended to a persistent trade log for refinement
 *
 * Runs in paper, Binance testnet, or gated Binance live mode. Live mode still
 * requires app approval, environment approval, the kill switch to be disarmed,
 * and guardian risk checks. Every testnet/live order decision is shadowed into
 * paper records before the external order path is allowed to continue.
 */
import { spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {
  createDemoClientFromEnv,
  createLiveClientFromEnv,
  floorToStep,
} from './binance-demo-client'
import {
  fetchBinanceKlines,
  fetchBinanceTickerPrice,
  recordBinanceMarketObservation,
} from './binance-market.service'
import {
  STRATEGIES,
  applyTradeOutcome,
  atr,
  atrSizeMultiplier,
  councilVote,
  emptyScore,
  fibExtensionTarget,
  getStrategy,
  kellyFraction,
  regimeAllowsLong,
  scaledQuoteSize,
  trendIsStrong,
} from './trading-strategies'
import {
  DEFAULT_GUARDIAN_CONFIG,
  checkOrderProposal,
  cooldownUntil,
  dayKey,
  weekKey,
} from './trading-guardian'
import { isConnectivityBreakerTripped } from './connectivity-breaker'
import {
  fetchTopTraderLongShortRatio,
  longShortSentimentDecision,
} from './long-short-sentiment'
import {
  applyBucketOutcome,
  bucketVeto,
  buildEntryFeatureVector,
} from './trading-pattern-veto'
import {
  appendAuditLog,
  readFinanceStore,
  writeFinanceStore,
} from './finance-store'
import type { BucketStats, EntryFeatureVector } from './trading-pattern-veto'
import type { Candle, CouncilMember, StrategyScore } from './trading-strategies'
import type { GuardianBlock, GuardianConfig } from './trading-guardian'
import type {
  BinanceExecutionClient,
  BinanceExecutionEnvironment,
  BinanceOrderInput,
  BinanceOrderResult,
  SymbolFilters,
} from './binance-demo-client'
import type { FinanceDatabase } from './finance-store'

const SR_KIND_SCORE = 'demo_strategy_score'
const SR_KIND_POSITION = 'demo_open_position'
const SR_KIND_TRADE = 'demo_trade_log'
const SR_KIND_BLOCK = 'demo_guardian_block'
const SR_KIND_SHADOW_DECISION = 'paper_shadow_decision'
const SR_KIND_LEARNING_CANDIDATE = 'learning_candidate'
const SR_KIND_PATTERN_VETO_STATS = 'demo_pattern_veto_stats'
const SR_KIND_LONG_SHORT_OBSERVATION = 'demo_long_short_observation'
const TRADE_LOG_CAP = 200
const BLOCK_LOG_CAP = 50
// Close-failure escalation: alert once at 3 consecutive failed close attempts,
// force a book-close at 12 (~1 hour of 5-minute cycles). A silently retried
// close held 3 positions hostage for 4 days before this existed (2026-07-12).
const CLOSE_FAILURE_ALERT_THRESHOLD = 3
const CLOSE_FAILURE_FORCE_LIMIT = 12
const LONG_SHORT_OBSERVATION_CAP = 5000 // ~30+ days at one observation/symbol/cycle, enough for a future backtest
const SAFEGUARD_HISTORY_CAP = 25
const STRATEGY_OVERRIDE_HISTORY_CAP = 50
const LEARNING_CANDIDATE_CAP = 50
const DEFAULT_STRATEGY_OVERRIDE_REVIEW_DAYS = 3
const DEFAULT_STRATEGY_OVERRIDE_EXPIRY_DAYS = 7
const MARKET_MIN_CANDLES = 20
const MARKET_PREFERRED_CANDLES = 50
const MARKET_CAUTION_VOLATILITY_PCT = 4
const MARKET_BLOCK_VOLATILITY_PCT = 8
const MARKET_CAUTION_DRAWDOWN_PCT = 15
const MARKET_BLOCK_DRAWDOWN_PCT = 35
const MARKET_CAUTION_TREND_PCT = -12
const MARKET_BLOCK_TREND_PCT = -30
const MARKET_WARMUP_TARGET_CANDLES = 300

export interface EngineConfig {
  symbols: Array<string>
  interval: string
  quotePerTrade: number
  enabledStrategies: Array<string>
  stopLossPct: number
  takeProfitPct: number
  /**
   * Long-SMA regime gate on BUY entries (0 = off). This mirrors the offline
   * backtest gate: exits are never gated, and short warm-up windows fail open.
   */
  regimeSmaPeriod: number
  /**
   * Trailing stop as a fraction below the position's high-water price (0 = off).
   * When on, it replaces the fixed take-profit so winners can run.
   */
  trailingStopPct: number
  /** ATR lookback for volatility-scaled exits. Multiples of 0 disable ATR exits. */
  atrPeriod: number
  /** Stop distance = entry - ATR x multiple (0 = use fixed stopLossPct). */
  atrStopMultiple: number
  /** Target distance = entry + ATR x multiple (0 = use fixed takeProfitPct). */
  atrTakeProfitMultiple: number
  /** Trail distance = high-water price - ATR x multiple (0 = use trailingStopPct). */
  atrTrailingMultiple: number
  /** Council net-vote threshold to act. */
  councilThreshold: number
  /** Force-close a position after this many minutes if SL/TP/trailing haven't fired (0 = off). */
  maxHoldMinutes: number
  guardian: GuardianConfig
  /**
   * Inverse-volatility position sizing (0 = off). The "normal" ATR/price
   * ratio quotePerTrade was calibrated for — size scales down in
   * higher-than-baseline volatility and up in calmer conditions, bounded by
   * atrSizeMinMultiplier/atrSizeMaxMultiplier. Independent of the dormant
   * atrStopMultiple/atrTakeProfitMultiple/atrTrailingMultiple exit fields.
   */
  atrSizeBaselinePct: number
  atrSizeMinMultiplier: number
  atrSizeMaxMultiplier: number
  /**
   * Kelly-criterion sizing scaffolding — off by default and inert (1x, no
   * change) until BOTH kellySizingEnabled is true AND the lead strategy has
   * at least kellySizingMinClosedTrades closed trades to trust its
   * win-rate/payoff inputs. Deliberately conservative: this v1 only ever
   * shrinks size relative to quotePerTrade (kellyFraction / maxFraction),
   * never grows it, matching this codebase's existing "new levers only
   * reduce risk" convention (see auto-refinement.ts).
   */
  kellySizingEnabled: boolean
  kellySizingMinClosedTrades: number
  kellySizingMaxFraction: number
  /**
   * "Ump-lite" pattern-bucket veto (off by default). Entry-time features are
   * always logged onto opened/closed trades regardless of this flag, so
   * evidence accrues even while disabled — only the veto ITSELF is gated.
   * See trading-pattern-veto.ts.
   */
  patternVetoEnabled: boolean
  patternVetoMinSamples: number
  patternVetoLossRateThreshold: number
  /**
   * ADX trend-STRENGTH gate on BUY entries (adxThreshold 0 = off), distinct
   * from regimeSmaPeriod's trend-DIRECTION gate above — both can be active
   * at once. Fails open on short warm-up windows, same convention as the
   * regime gate.
   */
  adxPeriod: number
  adxThreshold: number
  /**
   * Fibonacci-extension take-profit (off by default) — entry price plus/minus
   * the most recent fibSwingLookback-candle swing range, scaled by
   * fibExtensionRatio. A third take-profit type alongside the fixed-%
   * (takeProfitPct) and ATR-multiple (atrTakeProfitMultiple) options above;
   * ATR still wins if both happen to be configured (see atrExitPlan()).
   */
  fibTakeProfitEnabled: boolean
  fibSwingLookback: number
  fibExtensionRatio: number
  /**
   * Top-trader long/short-ratio sentiment (off by default) — an extra
   * council-vote member sourced from Binance's public futures market data
   * (read-only, no auth, no order-placement capability), not a candle
   * strategy. See long-short-sentiment.ts.
   */
  longShortSentimentEnabled: boolean
  longShortSentimentPeriod: string
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  interval: '1h',
  quotePerTrade: 25,
  enabledStrategies: STRATEGIES.map((s) => s.id),
  stopLossPct: 0.02,
  takeProfitPct: 0.03,
  regimeSmaPeriod: 0,
  trailingStopPct: 0,
  atrPeriod: 14,
  atrStopMultiple: 0,
  atrTakeProfitMultiple: 0,
  atrTrailingMultiple: 0,
  atrSizeBaselinePct: 0,
  atrSizeMinMultiplier: 0.25,
  atrSizeMaxMultiplier: 1.5,
  kellySizingEnabled: false,
  kellySizingMinClosedTrades: 30,
  kellySizingMaxFraction: 0.25,
  patternVetoEnabled: false,
  patternVetoMinSamples: 20,
  patternVetoLossRateThreshold: 0.65,
  adxPeriod: 14,
  adxThreshold: 0,
  fibTakeProfitEnabled: false,
  fibSwingLookback: 20,
  fibExtensionRatio: 1.618,
  longShortSentimentEnabled: false,
  longShortSentimentPeriod: '1h',
  councilThreshold: 0.6,
  maxHoldMinutes: 0,
  guardian: DEFAULT_GUARDIAN_CONFIG,
}

type PersistedExecutionMode = BinanceExecutionEnvironment | 'shadow_paper'

interface OpenPosition {
  id: string
  symbol: string
  strategyId: string
  entryPrice: number
  quantity: number
  entryQuote: number
  /** Buy-side commission in quote currency, carried so it can be netted at close. */
  entryFeeQuote: number
  /** Highest observed execution/market price while held; used by trailing stop. */
  highWaterPrice?: number
  /** ATR sampled at entry; all ATR exit levels are entry-anchored. */
  atrAtEntry?: number | null
  atrStopPrice?: number | null
  atrTakeProfitPrice?: number | null
  atrTrailDistance?: number | null
  /** Fibonacci-extension take-profit price, computed at entry only when fibTakeProfitEnabled (and ATR isn't already handling the take-profit). */
  fibTakeProfitPrice?: number | null
  openedAt: string
  executionMode?: PersistedExecutionMode
  groupId?: string
  shadowOfGroupId?: string
  /** Entry-time feature vector for the pattern-bucket veto (Ump-lite); logged unconditionally, only gates entries when patternVetoEnabled. */
  patternFeatures?: EntryFeatureVector
  /** Consecutive failed close attempts; alerts at 3, force book-close at 12 (~1h of 5-min cycles). Reset on any successful cycle exit. */
  closeFailureCount?: number
}

type PositionAtrExits = Pick<
  OpenPosition,
  | 'atrAtEntry'
  | 'atrStopPrice'
  | 'atrTakeProfitPrice'
  | 'atrTrailDistance'
  | 'fibTakeProfitPrice'
>

export interface TradeLogEntry {
  id: string
  symbol: string
  strategyId: string
  entryPrice: number
  exitPrice: number
  quantity: number
  entryQuote: number
  exitQuote: number
  /** Net P/L after subtracting buy + sell commissions. */
  pnlQuote: number
  /** Total round-trip commission (buy + sell) in quote currency. */
  feesQuote: number
  reason: string
  openedAt: string
  closedAt: string
  executionMode?: PersistedExecutionMode
  groupId?: string
  shadowOfGroupId?: string
  /** Carried from the opening position so pattern-veto stats can be folded in at close. */
  patternFeatures?: EntryFeatureVector
}

export interface CycleAction {
  symbol: string
  strategyId: string
  action: 'OPEN' | 'CLOSE' | 'SKIP' | 'BLOCKED'
  reason: string
  price?: number
  pnlQuote?: number
}

export interface CycleResult {
  ran: boolean
  reason?: string
  actions: Array<CycleAction>
  scores: Array<StrategyScore>
  openPositions: number
  dailyPnlQuote: number
  ranAt: string
  executionMode?: BinanceExecutionEnvironment
  marketWarmup?: MarketDataWarmupReport
  learning?: LearningCycleResult
}

export type MarketLearningStatus =
  | 'tradeable'
  | 'caution'
  | 'insufficient_data'
  | 'stale'
  | 'blocked'

export interface MarketLearningSymbol {
  symbol: string
  interval: string
  status: MarketLearningStatus
  blocksNewEntries: boolean
  candleCount: number
  latestClose: number | null
  latestPrice: number | null
  lastCandleClosedAt: string | null
  latestPriceObservedAt: string | null
  ageMinutes: number | null
  priceAgeMinutes: number | null
  volatilityPct: number
  trendPct: number
  shortTrendPct: number
  maxDrawdownPct: number
  averageVolume: number
  score: number
  blockers: Array<string>
  warnings: Array<string>
}

export interface MarketLearningReport {
  generatedAt: string
  interval: string
  overallStatus: MarketLearningStatus
  summary: {
    symbols: number
    tradeable: number
    caution: number
    insufficientData: number
    stale: number
    blocked: number
  }
  symbols: Array<MarketLearningSymbol>
}

export type MarketDataWarmupStatus = 'warmed' | 'skipped' | 'failed'

export interface MarketDataWarmupSymbol {
  symbol: string
  interval: string
  status: MarketDataWarmupStatus
  candlesBefore: number
  candlesAfter: number
  fetchedCandles: number
  targetCandles: number
  latestClose: number | null
  reason: string
}

export interface MarketDataWarmupReport {
  ranAt: string
  targetCandles: number
  summary: {
    symbols: number
    warmed: number
    skipped: number
    failed: number
  }
  symbols: Array<MarketDataWarmupSymbol>
}

interface MarketDataWarmupRun {
  report: MarketDataWarmupReport
  candlesBySymbol: Map<string, Array<Candle>>
  priceBySymbol: Map<string, number>
}

// ── strategy_results persistence helpers ─────────────────────────────────────

type SRRow = Record<string, unknown>

function loadScores(rows: Array<SRRow>): Map<string, StrategyScore> {
  const map = new Map<string, StrategyScore>()
  for (const r of rows) {
    if (r.kind === SR_KIND_SCORE && typeof r.strategyId === 'string') {
      map.set(r.strategyId, {
        ...emptyScore(r.strategyId),
        ...(r as object),
      } as StrategyScore)
    }
  }
  for (const s of STRATEGIES)
    if (!map.has(s.id)) map.set(s.id, emptyScore(s.id))
  return map
}

function loadOfKind<T>(rows: Array<SRRow>, kind: string): Array<T> {
  return rows.filter((r) => r.kind === kind) as unknown as Array<T>
}

interface PersistInput {
  scores: Map<string, StrategyScore>
  positions: Array<OpenPosition>
  trades: Array<TradeLogEntry>
  blocks: Array<SRRow>
  patternVetoStats: Record<string, BucketStats>
  sentimentObservations: Array<SRRow>
}

function persist(input: PersistInput): void {
  const db = readFinanceStore()
  const others = db.strategy_results.filter(
    (r: SRRow) =>
      r.kind !== SR_KIND_SCORE &&
      r.kind !== SR_KIND_POSITION &&
      r.kind !== SR_KIND_TRADE &&
      r.kind !== SR_KIND_BLOCK &&
      r.kind !== SR_KIND_PATTERN_VETO_STATS &&
      r.kind !== SR_KIND_LONG_SHORT_OBSERVATION,
  )
  db.strategy_results = [
    ...others,
    ...[...input.scores.values()].map((s) => ({ kind: SR_KIND_SCORE, ...s })),
    ...input.positions.map((p) => ({ kind: SR_KIND_POSITION, ...p })),
    ...input.trades
      .slice(-TRADE_LOG_CAP)
      .map((t) => ({ kind: SR_KIND_TRADE, ...t })),
    ...input.blocks.slice(-BLOCK_LOG_CAP),
    // Each bucket carries a deterministic id derived from its key: rows
    // without one collide in the Postgres mirror, whose synthetic fallback id
    // (kind + strategyId + timestamp) is identical for every id-less bucket —
    // two buckets broke the whole mirror transaction on 2026-07-13.
    ...Object.values(input.patternVetoStats).map((s) => ({
      kind: SR_KIND_PATTERN_VETO_STATS,
      ...s,
      id: `pattern_veto:${s.key}`,
    })),
    ...input.sentimentObservations.slice(-LONG_SHORT_OBSERVATION_CAP),
  ]
  db.updatedAt = new Date().toISOString()
  writeFinanceStore(db)
}

function realizedToday(trades: Array<TradeLogEntry>, now = new Date()): number {
  const today = dayKey(now)
  return trades
    .filter((t) => !isShadow(t) && dayKey(t.closedAt) === today)
    .reduce((sum, t) => sum + t.pnlQuote, 0)
}

function realizedWeekly(
  trades: Array<TradeLogEntry>,
  now = new Date(),
): number {
  const thisWeek = weekKey(now)
  return trades
    .filter((t) => !isShadow(t) && weekKey(t.closedAt) === thisWeek)
    .reduce((sum, t) => sum + t.pnlQuote, 0)
}

/**
 * Mark-to-market unrealized PnL of all open positions (negative = net loss).
 * NOTE: if a position's live price can't be fetched we fall back to its entry
 * price (~0 contribution). That is NOT conservative — it under-counts that
 * position's loss, so the open-drawdown halt can under-fire. Acceptable here
 * because the demo client's getPrice effectively never fails; revisit before
 * wiring this to a live price feed.
 */
async function openUnrealizedQuote(
  positions: Array<OpenPosition>,
  client: BinanceExecutionClient,
): Promise<number> {
  let total = 0
  for (const pos of positions) {
    let mark = pos.entryPrice
    try {
      mark = await client.getPrice(pos.symbol)
    } catch {
      // keep entryPrice fallback (see note above)
    }
    total += mark * pos.quantity - pos.entryQuote
  }
  return total
}

/**
 * Total commission for a filled order expressed in quote currency (USDT).
 * Commission charged in the quote asset is counted as-is; commission charged in
 * the base asset (Binance spot/testnet default) or another asset is valued at
 * the fill price. First-order correction so realized P/L stops ignoring fees —
 * without it, a 0.5% take-profit against ~0.2% round-trip fees would report a
 * win rate and profit factor materially higher than reality.
 */
function orderFeeQuote(
  fills: Array<{ price: number; commission: number; commissionAsset: string }>,
  fallbackPrice: number,
): number {
  return fills.reduce((sum, fill) => {
    if (fill.commissionAsset === 'USDT') return sum + fill.commission
    return sum + fill.commission * (fill.price || fallbackPrice)
  }, 0)
}

/**
 * Base asset of a spot symbol (e.g. SOLUSDT -> SOL). The engine's symbols are
 * validated Binance spot pairs quoted in USDT; anything else falls back to ''
 * so callers treat the fee sum as unknown rather than guessing.
 */
export function baseAssetOf(symbol: string): string {
  const normalized = symbol.trim().toUpperCase()
  return normalized.endsWith('USDT') ? normalized.slice(0, -4) : ''
}

/**
 * Sum of buy-side commissions taken in the BASE asset. Binance deducts the
 * MARKET-BUY fee from the received asset itself (unless paid in BNB), so the
 * account is credited executedQty minus this — selling the gross executedQty
 * later fails with insufficient balance. See 2026-07-12 stuck-position bug.
 */
export function orderBaseFee(
  fills: Array<{ commission: number; commissionAsset: string }>,
  baseAsset: string,
): number {
  if (!baseAsset) return 0
  return fills.reduce(
    (sum, fill) =>
      fill.commissionAsset === baseAsset ? sum + fill.commission : sum,
    0,
  )
}

function executionModeOfPosition(
  position: OpenPosition,
): PersistedExecutionMode {
  return position.executionMode ?? 'testnet'
}

function executionModeOfTrade(trade: TradeLogEntry): PersistedExecutionMode {
  return trade.executionMode ?? 'testnet'
}

function isShadow(position: OpenPosition | TradeLogEntry): boolean {
  return position.executionMode === 'shadow_paper'
}

function activePositionsForMode(
  positions: Array<OpenPosition>,
  mode: BinanceExecutionEnvironment,
): Array<OpenPosition> {
  return positions.filter(
    (position) => executionModeOfPosition(position) === mode,
  )
}

function realizedTradesForMode(
  trades: Array<TradeLogEntry>,
  mode: BinanceExecutionEnvironment,
): Array<TradeLogEntry> {
  return trades.filter((trade) => executionModeOfTrade(trade) === mode)
}

function shouldShadow(
  mode: BinanceExecutionEnvironment,
  dbSettings: Record<string, unknown>,
): boolean {
  return mode !== 'paper' && dbSettings.paperShadowEnabled !== false
}

function newGroupId(symbol: string): string {
  return `grp_${symbol}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function paperFill(
  symbol: string,
  side: 'BUY' | 'SELL',
  price: number,
  input: { quantity?: number; quoteOrderQty?: number },
): BinanceOrderResult {
  const quantity = input.quantity ?? (input.quoteOrderQty ?? 0) / price
  const quote = input.quoteOrderQty ?? quantity * price
  return {
    symbol,
    orderId: Date.now(),
    status: 'FILLED',
    side,
    type: 'MARKET',
    executedQty: quantity,
    cummulativeQuoteQty: quote,
    fills: [{ price, qty: quantity, commission: 0, commissionAsset: 'USDT' }],
    transactTime: Date.now(),
    avgPrice: price,
  }
}

class PaperBinanceClient implements BinanceExecutionClient {
  readonly host = 'data-api.binance.vision'
  readonly environment: BinanceExecutionEnvironment = 'paper'

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  buildUserDataStreamSubscribeParams(): Record<string, unknown> {
    return {};
  }

  async getPrice(symbol: string): Promise<number> {
    return (await fetchBinanceTickerPrice(symbol)).price
  }

  async getKlines(
    symbol: string,
    interval = '1h',
    limit = 100,
  ): Promise<Array<Candle>> {
    return fetchBinanceKlines(symbol, interval, limit)
  }

  getAccount(): Promise<{
    accountType: string
    canTrade: boolean
    balances: Array<{ asset: string; free: number; locked: number }>
  }> {
    return Promise.resolve({
      accountType: 'PAPER',
      canTrade: true,
      balances: [{ asset: 'USDT', free: 10_000, locked: 0 }],
    })
  }

  async placeOrder(input: BinanceOrderInput): Promise<BinanceOrderResult> {
    const price = await this.getPrice(input.symbol)
    return paperFill(input.symbol, input.side, price, input)
  }
}

function atrExitPlan(
  entryPrice: number,
  candles: Array<Candle>,
  config: EngineConfig,
): PositionAtrExits {
  const entryAtr = atr(candles, config.atrPeriod)
  const atrTakeProfitPrice =
    entryAtr != null && config.atrTakeProfitMultiple > 0
      ? entryPrice + entryAtr * config.atrTakeProfitMultiple
      : null
  return {
    atrAtEntry: entryAtr,
    atrStopPrice:
      entryAtr != null && config.atrStopMultiple > 0
        ? entryPrice - entryAtr * config.atrStopMultiple
        : null,
    atrTakeProfitPrice,
    atrTrailDistance:
      entryAtr != null && config.atrTrailingMultiple > 0
        ? entryAtr * config.atrTrailingMultiple
        : null,
    // ATR still wins if both happen to be configured — Fib is only computed
    // as a fallback when the ATR take-profit isn't already set.
    fibTakeProfitPrice:
      atrTakeProfitPrice == null && config.fibTakeProfitEnabled
        ? fibExtensionTarget(
            'long',
            entryPrice,
            candles,
            config.fibSwingLookback,
            config.fibExtensionRatio,
          )
        : null,
  }
}

function recordShadowDecision(input: {
  groupId: string
  symbol: string
  strategyId: string
  side: 'BUY' | 'SELL'
  quoteAmount?: number
  quantity?: number
  reason: string
}): void {
  const db = readFinanceStore()
  db.strategy_results.push({
    kind: SR_KIND_SHADOW_DECISION,
    executionMode: 'shadow_paper',
    at: new Date().toISOString(),
    ...input,
  })
  writeFinanceStore(db)
  appendAuditLog('paper_shadow_decision_recorded', input)
}

function openShadowPosition(input: {
  positions: Array<OpenPosition>
  symbol: string
  strategyId: string
  groupId: string
  price: number
  quoteAmount: number
  atrExits: PositionAtrExits
}): void {
  const quantity = input.quoteAmount / input.price
  input.positions.push({
    id: `shadow_pos_${input.groupId}`,
    symbol: input.symbol,
    strategyId: input.strategyId,
    entryPrice: input.price,
    quantity,
    entryQuote: input.quoteAmount,
    entryFeeQuote: 0,
    highWaterPrice: input.price,
    ...input.atrExits,
    openedAt: new Date().toISOString(),
    executionMode: 'shadow_paper',
    groupId: input.groupId,
    shadowOfGroupId: input.groupId,
  })
}

function closeShadowPosition(input: {
  positions: Array<OpenPosition>
  trades: Array<TradeLogEntry>
  groupId?: string
  price: number
  reason: string
}): Array<OpenPosition> {
  if (!input.groupId) return input.positions
  const shadow = input.positions.find(
    (position) =>
      position.executionMode === 'shadow_paper' &&
      position.groupId === input.groupId,
  )
  if (!shadow) return input.positions
  const exitQuote = shadow.quantity * input.price
  const pnlQuote = exitQuote - shadow.entryQuote
  input.trades.push({
    id: `shadow_trade_${input.groupId}_${Date.now()}`,
    symbol: shadow.symbol,
    strategyId: shadow.strategyId,
    entryPrice: shadow.entryPrice,
    exitPrice: input.price,
    quantity: shadow.quantity,
    entryQuote: shadow.entryQuote,
    exitQuote,
    pnlQuote,
    feesQuote: 0,
    reason: `shadow ${input.reason}`,
    openedAt: shadow.openedAt,
    closedAt: new Date().toISOString(),
    executionMode: 'shadow_paper',
    groupId: input.groupId,
    shadowOfGroupId: input.groupId,
  })
  return input.positions.filter((position) => position.id !== shadow.id)
}

async function preflightLiveOrder(
  client: BinanceExecutionClient,
  input: BinanceOrderInput,
): Promise<void> {
  if (client.environment === 'live') {
    if (!client.testOrder)
      throw new Error('Live Binance client does not support test orders')
    await client.testOrder(input)
  }
}

/** Engine config = defaults ⊕ finance settings.demoTrading ⊕ per-call overrides. */
export function resolveEngineConfig(
  settingsOverride: unknown,
  callOverride?: Partial<EngineConfig>,
): EngineConfig {
  const fromSettings =
    settingsOverride && typeof settingsOverride === 'object'
      ? (settingsOverride as Partial<EngineConfig>)
      : {}
  return {
    ...DEFAULT_ENGINE_CONFIG,
    ...fromSettings,
    ...callOverride,
    guardian: {
      ...DEFAULT_GUARDIAN_CONFIG,
      ...(fromSettings.guardian ?? {}),
      ...(callOverride?.guardian ?? {}),
    },
  }
}

// ── engine ───────────────────────────────────────────────────────────────────

export interface RunCycleOptions {
  config?: Partial<EngineConfig>
  client?: BinanceExecutionClient
  /** Bypasses non-live mode selection only; live approval and kill switch still apply. */
  force?: boolean
}

// Trade alerts: push a Telegram digest when a cycle actually does something.
// Disable with HERMES_DEMO_TRADE_ALERTS=off. Never throws — alerting must not
// break a trading cycle.
const TRADE_ALERTS_ENABLED = process.env.HERMES_DEMO_TRADE_ALERTS !== 'off'
const ALERT_TARGET = 'telegram:2130622225'
let _hermesBin: string | null = null
function hermesBin(): string {
  if (_hermesBin) return _hermesBin
  const home = os.homedir()
  const candidates = [
    `${home}/.local/bin/hermes`,
    `${home}/.hermes/hermes-agent/venv/bin/hermes`,
    `${home}/.hermes/node/bin/hermes`,
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        _hermesBin = candidate
        return candidate
      }
    } catch {
      /* skip */
    }
  }
  try {
    _hermesBin =
      spawnSync('which', ['hermes'], { encoding: 'utf-8' }).stdout.trim() ||
      'hermes'
  } catch {
    _hermesBin = 'hermes'
  }
  return _hermesBin
}
function sendTradeAlert(message: string): void {
  if (!TRADE_ALERTS_ENABLED) return
  // Never send (or spawn) during tests, and never block the trading cycle on it:
  // fire-and-forget a detached child so a slow/hung `hermes send` can't stall trading.
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return
  try {
    const child = spawn(
      hermesBin(),
      ['send', '--to', ALERT_TARGET, '-q', message],
      {
        stdio: 'ignore',
        detached: true,
      },
    )
    child.on('error', () => {
      /* non-fatal */
    })
    child.unref()
  } catch {
    /* non-fatal */
  }
}

/** Builds a Telegram digest from a cycle's actions; empty string = nothing worth sending. */
function tradeAlertDigest(actions: Array<CycleAction>): string {
  const lines: Array<string> = []
  for (const a of actions) {
    if (a.action === 'OPEN') {
      lines.push(
        `🟢 BOUGHT ${a.symbol} @ ${a.price?.toFixed(2) ?? '?'} (${a.strategyId})`,
      )
    } else if (a.action === 'CLOSE') {
      const pnl =
        a.pnlQuote !== undefined
          ? `${a.pnlQuote >= 0 ? '+' : ''}${a.pnlQuote.toFixed(2)} USDT`
          : ''
      lines.push(
        `🔴 SOLD ${a.symbol} @ ${a.price?.toFixed(2) ?? '?'} · ${pnl} · ${a.reason}`,
      )
    } else if (a.action === 'BLOCKED' && a.reason.includes('_halt')) {
      lines.push(`⚠️ HALTED ${a.symbol}: ${a.reason}`)
    }
  }
  return lines.length ? `⚙️ Demo trading (testnet)\n${lines.join('\n')}` : ''
}

let cycleInProgress = false

function executionModeForTradingMode(
  mode: string,
): BinanceExecutionEnvironment | null {
  if (mode === 'paper_trade') return 'paper'
  if (mode === 'testnet_execute') return 'testnet'
  if (
    ['live_manual_approval', 'live_auto_trade', 'live_monitored'].includes(mode)
  )
    return 'live'
  return null
}

function marketIntervalMs(interval: string): number {
  const match = interval.match(/^(\d+)([mhdwM])$/)
  if (!match) return 60 * 60_000
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return 60 * 60_000
  const unit = match[2]
  if (unit === 'm') return value * 60_000
  if (unit === 'h') return value * 60 * 60_000
  if (unit === 'd') return value * 24 * 60 * 60_000
  if (unit === 'w') return value * 7 * 24 * 60 * 60_000
  if (unit === 'M') return value * 30 * 24 * 60 * 60_000
  return 60 * 60_000
}

function pctChange(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0
}

function roundMetric(value: number, places = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function standardDeviation(values: Array<number>): number {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function maxDrawdownPct(closes: Array<number>): number {
  let peak = closes[0] ?? 0
  let maxDrawdown = 0
  for (const close of closes) {
    if (close > peak) peak = close
    if (peak > 0)
      maxDrawdown = Math.max(maxDrawdown, ((peak - close) / peak) * 100)
  }
  return maxDrawdown
}

function marketLearningForSymbol(
  db: FinanceDatabase,
  symbol: string,
  interval: string,
  now = new Date(),
): MarketLearningSymbol {
  const normalizedSymbol = symbol.toUpperCase()
  const intervalMs = marketIntervalMs(interval)
  const nowMs = now.getTime()
  const candleMap = new Map<
    string,
    {
      id: string
      openedAt: string
      closedAt: string
      close: number
      volume: number
    }
  >()

  for (const row of db.historical_candles) {
    const record = row
    if (stringFromRecord(record, 'platform') !== 'binance') continue
    if (stringFromRecord(record, 'symbol') !== normalizedSymbol) continue
    if (stringFromRecord(record, 'interval') !== interval) continue
    const close = numberFromRecord(record, 'close')
    const volume = numberFromRecord(record, 'volume')
    const openedAt = stringFromRecord(record, 'openedAt')
    const closedAt = stringFromRecord(record, 'closedAt')
    if (close == null || volume == null || !openedAt || !closedAt) continue
    const id =
      stringFromRecord(record, 'id') ??
      `${normalizedSymbol}:${interval}:${openedAt}`
    candleMap.set(id, { id, openedAt, closedAt, close, volume })
  }

  const candles = [...candleMap.values()]
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
    .slice(-100)
  const closes = candles.map((candle) => candle.close)
  const returns: Array<number> = []
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]))
    }
  }

  const latestPriceRows = db.market_prices
    .filter(
      (row) => row.platform === 'binance' && row.symbol === normalizedSymbol,
    )
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
  const latestPriceRow =
    latestPriceRows.length > 0 ? latestPriceRows[0] : undefined
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null
  const latestClose = latestCandle ? latestCandle.close : null
  const latestPrice = latestPriceRow ? latestPriceRow.price : null
  const lastCandleClosedAt = latestCandle ? latestCandle.closedAt : null
  const latestPriceObservedAt = latestPriceRow
    ? latestPriceRow.observedAt
    : null
  const ageMinutes =
    lastCandleClosedAt && Number.isFinite(Date.parse(lastCandleClosedAt))
      ? Math.max(0, (nowMs - Date.parse(lastCandleClosedAt)) / 60_000)
      : null
  const priceAgeMinutes =
    latestPriceObservedAt && Number.isFinite(Date.parse(latestPriceObservedAt))
      ? Math.max(0, (nowMs - Date.parse(latestPriceObservedAt)) / 60_000)
      : null
  const volatilityPct = standardDeviation(returns) * 100
  const trendPct =
    closes.length >= 2 ? pctChange(closes[0], closes[closes.length - 1]) : 0
  const shortWindow = closes.slice(-Math.min(6, closes.length))
  const shortTrendPct =
    shortWindow.length >= 2
      ? pctChange(shortWindow[0], shortWindow[shortWindow.length - 1])
      : 0
  const drawdownPct = maxDrawdownPct(closes)
  const recentVolumes = candles
    .slice(-Math.min(20, candles.length))
    .map((c) => c.volume)
  const averageVolume = recentVolumes.length
    ? recentVolumes.reduce((sum, volume) => sum + volume, 0) /
      recentVolumes.length
    : 0

  const blockers: Array<string> = []
  const warnings: Array<string> = []
  if (candles.length < MARKET_MIN_CANDLES) {
    blockers.push(
      `only ${candles.length} candles available; need ${MARKET_MIN_CANDLES}`,
    )
  } else if (candles.length < MARKET_PREFERRED_CANDLES) {
    warnings.push(
      `only ${candles.length} candles available; prefer ${MARKET_PREFERRED_CANDLES}`,
    )
  }
  const staleLimitMinutes = Math.max(15, (intervalMs * 3) / 60_000)
  if (ageMinutes == null) {
    blockers.push('latest candle close time is missing')
  } else if (ageMinutes > staleLimitMinutes) {
    blockers.push(
      `latest candle is stale at ${roundMetric(ageMinutes, 1)} minutes old`,
    )
  }
  const priceStaleLimitMinutes = Math.max(15, intervalMs / 60_000)
  if (priceAgeMinutes != null && priceAgeMinutes > priceStaleLimitMinutes) {
    blockers.push(
      `latest price is stale at ${roundMetric(priceAgeMinutes, 1)} minutes old`,
    )
  } else if (latestPrice == null) {
    warnings.push('latest price observation is missing')
  }
  if (candles.length > 0 && averageVolume <= 0)
    blockers.push('recent candle volume is zero')
  if (volatilityPct > MARKET_BLOCK_VOLATILITY_PCT) {
    blockers.push(
      `volatility ${roundMetric(volatilityPct)}% is above ${MARKET_BLOCK_VOLATILITY_PCT}%`,
    )
  } else if (volatilityPct > MARKET_CAUTION_VOLATILITY_PCT) {
    warnings.push(`volatility ${roundMetric(volatilityPct)}% is elevated`)
  }
  if (drawdownPct > MARKET_BLOCK_DRAWDOWN_PCT) {
    blockers.push(
      `drawdown ${roundMetric(drawdownPct)}% is above ${MARKET_BLOCK_DRAWDOWN_PCT}%`,
    )
  } else if (drawdownPct > MARKET_CAUTION_DRAWDOWN_PCT) {
    warnings.push(`drawdown ${roundMetric(drawdownPct)}% is elevated`)
  }
  if (trendPct < MARKET_BLOCK_TREND_PCT) {
    blockers.push(
      `trend ${roundMetric(trendPct)}% is below ${MARKET_BLOCK_TREND_PCT}%`,
    )
  } else if (trendPct < MARKET_CAUTION_TREND_PCT) {
    warnings.push(`trend ${roundMetric(trendPct)}% is weak`)
  }

  let status: MarketLearningStatus = 'tradeable'
  if (blockers.some((blocker) => blocker.includes('only ')))
    status = 'insufficient_data'
  else if (blockers.some((blocker) => blocker.includes('stale')))
    status = 'stale'
  else if (blockers.length > 0) status = 'blocked'
  else if (warnings.length > 0) status = 'caution'

  const score = Math.max(
    0,
    Math.min(100, 100 - blockers.length * 35 - warnings.length * 10),
  )

  return {
    symbol: normalizedSymbol,
    interval,
    status,
    blocksNewEntries:
      status === 'insufficient_data' ||
      status === 'stale' ||
      status === 'blocked',
    candleCount: candles.length,
    latestClose,
    latestPrice,
    lastCandleClosedAt,
    latestPriceObservedAt,
    ageMinutes: ageMinutes == null ? null : roundMetric(ageMinutes, 1),
    priceAgeMinutes:
      priceAgeMinutes == null ? null : roundMetric(priceAgeMinutes, 1),
    volatilityPct: roundMetric(volatilityPct),
    trendPct: roundMetric(trendPct),
    shortTrendPct: roundMetric(shortTrendPct),
    maxDrawdownPct: roundMetric(drawdownPct),
    averageVolume: roundMetric(averageVolume, 4),
    score,
    blockers,
    warnings,
  }
}

export function marketLearningReport(
  options: {
    symbols?: Array<string>
    interval?: string
    db?: FinanceDatabase
    now?: Date
  } = {},
): MarketLearningReport {
  const db = options.db ?? readFinanceStore()
  const config = resolveEngineConfig(
    (db.settings as Record<string, unknown>).demoTrading,
  )
  const symbols = options.symbols?.length ? options.symbols : config.symbols
  const interval = options.interval ?? config.interval
  const generatedAt = (options.now ?? new Date()).toISOString()
  const symbolReports = symbols.map((symbol) =>
    marketLearningForSymbol(db, symbol, interval, new Date(generatedAt)),
  )
  const summary = {
    symbols: symbolReports.length,
    tradeable: symbolReports.filter((symbol) => symbol.status === 'tradeable')
      .length,
    caution: symbolReports.filter((symbol) => symbol.status === 'caution')
      .length,
    insufficientData: symbolReports.filter(
      (symbol) => symbol.status === 'insufficient_data',
    ).length,
    stale: symbolReports.filter((symbol) => symbol.status === 'stale').length,
    blocked: symbolReports.filter((symbol) => symbol.status === 'blocked')
      .length,
  }
  const severity: Record<MarketLearningStatus, number> = {
    tradeable: 0,
    caution: 1,
    insufficient_data: 2,
    stale: 3,
    blocked: 4,
  }
  const overallStatus = symbolReports.reduce<MarketLearningStatus>(
    (worst, symbol) =>
      severity[symbol.status] > severity[worst] ? symbol.status : worst,
    'tradeable',
  )

  return {
    generatedAt,
    interval,
    overallStatus,
    summary,
    symbols: symbolReports,
  }
}

function normalizeMarketSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

async function runMarketDataWarmup(input: {
  config: EngineConfig
  client?: BinanceExecutionClient
  executionMode?: BinanceExecutionEnvironment
  targetCandles?: number
  force?: boolean
}): Promise<MarketDataWarmupRun> {
  const targetCandles = Math.max(
    MARKET_MIN_CANDLES,
    Math.min(input.targetCandles ?? MARKET_WARMUP_TARGET_CANDLES, 1000),
  )
  const ranAt = new Date().toISOString()
  const candlesBySymbol = new Map<string, Array<Candle>>()
  const priceBySymbol = new Map<string, number>()
  const symbols: Array<MarketDataWarmupSymbol> = []

  for (const configuredSymbol of input.config.symbols) {
    const symbol = normalizeMarketSymbol(configuredSymbol)
    const before = marketLearningForSymbol(
      readFinanceStore(),
      symbol,
      input.config.interval,
      new Date(ranAt),
    )
    const needsWarmup =
      input.force === true ||
      before.candleCount < targetCandles ||
      before.status === 'insufficient_data' ||
      before.status === 'stale'

    if (!needsWarmup) {
      symbols.push({
        symbol,
        interval: input.config.interval,
        status: 'skipped',
        candlesBefore: before.candleCount,
        candlesAfter: before.candleCount,
        fetchedCandles: 0,
        targetCandles,
        latestClose: before.latestClose,
        reason: `already has ${before.candleCount} candles`,
      })
      continue
    }

    try {
      const candles = input.client
        ? await input.client.getKlines(
            symbol,
            input.config.interval,
            targetCandles,
          )
        : await fetchBinanceKlines(symbol, input.config.interval, targetCandles)
      const latestClose =
        candles.length > 0 ? candles[candles.length - 1].close : null
      const price =
        latestClose ??
        (input.client
          ? await input.client.getPrice(symbol)
          : (await fetchBinanceTickerPrice(symbol)).price)
      const result = recordBinanceMarketObservation({
        symbol,
        interval: input.config.interval,
        candles,
        price,
        platform: 'binance',
        source: `binance-${input.executionMode ?? 'public'}-market-warmup`,
      })
      const after = marketLearningForSymbol(
        readFinanceStore(),
        symbol,
        input.config.interval,
        new Date(),
      )
      if (candles.length > 0) {
        candlesBySymbol.set(symbol, candles)
        priceBySymbol.set(symbol, price)
      }
      symbols.push({
        symbol,
        interval: input.config.interval,
        status: 'warmed',
        candlesBefore: before.candleCount,
        candlesAfter: result.candleCount,
        fetchedCandles: candles.length,
        targetCandles,
        latestClose,
        reason: after.blocksNewEntries
          ? `warmed but market quality remains ${after.status}`
          : `stored ${result.candlesInserted} new and ${result.candlesUpdated} updated candles`,
      })
    } catch (err) {
      symbols.push({
        symbol,
        interval: input.config.interval,
        status: 'failed',
        candlesBefore: before.candleCount,
        candlesAfter: before.candleCount,
        fetchedCandles: 0,
        targetCandles,
        latestClose: before.latestClose,
        reason: (err as Error).message,
      })
      appendAuditLog('market_warmup_failed', {
        symbol,
        interval: input.config.interval,
        executionMode: input.executionMode,
        reason: (err as Error).message,
      })
    }
  }

  const report = {
    ranAt,
    targetCandles,
    summary: {
      symbols: symbols.length,
      warmed: symbols.filter((item) => item.status === 'warmed').length,
      skipped: symbols.filter((item) => item.status === 'skipped').length,
      failed: symbols.filter((item) => item.status === 'failed').length,
    },
    symbols,
  }

  appendAuditLog('market_warmup_completed', {
    targetCandles,
    summary: report.summary,
    executionMode: input.executionMode,
  })

  return { report, candlesBySymbol, priceBySymbol }
}

export async function warmupMarketData(
  options: {
    config?: Partial<EngineConfig>
    client?: BinanceExecutionClient
    executionMode?: BinanceExecutionEnvironment
    targetCandles?: number
    force?: boolean
  } = {},
): Promise<MarketDataWarmupReport> {
  const db = readFinanceStore()
  const config = resolveEngineConfig(
    (db.settings as Record<string, unknown>).demoTrading,
    options.config,
  )
  const run = await runMarketDataWarmup({
    config,
    client: options.client,
    executionMode: options.executionMode,
    targetCandles: options.targetCandles,
    force: options.force,
  })
  return run.report
}

/**
 * Public entry point. Serializes cycles: every cycle runs in the single workspace
 * server process (the 20-min cron and the manual "Run cycle" button both POST to
 * /api/demo-trading), so an in-process flag prevents two overlapping runs from
 * both reading "flat", double-entering the same symbol, and racing each other's
 * store writes. Safe with a plain boolean because Node is single-threaded and the
 * check-and-set happens before the first await.
 */
export async function runTradingCycle(
  options: RunCycleOptions = {},
): Promise<CycleResult> {
  if (cycleInProgress) {
    return {
      ran: false,
      reason: 'a trading cycle is already in progress',
      actions: [],
      scores: [],
      openPositions: 0,
      dailyPnlQuote: 0,
      ranAt: new Date().toISOString(),
    }
  }
  cycleInProgress = true
  try {
    return await runTradingCycleInner(options)
  } finally {
    cycleInProgress = false
  }
}

async function runTradingCycleInner(
  options: RunCycleOptions = {},
): Promise<CycleResult> {
  const ranAt = new Date().toISOString()
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const config = resolveEngineConfig(settings.demoTrading, options.config)
  const cycleContext: { marketWarmup?: MarketDataWarmupReport } = {}

  const mode = db.settings.tradingMode
  let executionMode: BinanceExecutionEnvironment | null =
    executionModeForTradingMode(mode)
  if (!executionMode && options.force)
    executionMode = options.client?.environment ?? 'paper'

  const rows = db.strategy_results as Array<SRRow>
  const scores = loadScores(rows)
  let positions = loadOfKind<OpenPosition>(rows, SR_KIND_POSITION)
  const trades = loadOfKind<TradeLogEntry>(rows, SR_KIND_TRADE)
  const blocks = rows.filter((r) => r.kind === SR_KIND_BLOCK)
  let patternVetoStats: Record<string, BucketStats> = Object.fromEntries(
    loadOfKind<BucketStats>(rows, SR_KIND_PATTERN_VETO_STATS).map((s) => [s.key, s]),
  )
  const sentimentObservations = rows.filter(
    (r) => r.kind === SR_KIND_LONG_SHORT_OBSERVATION,
  )
  const activeTrades = executionMode
    ? realizedTradesForMode(trades, executionMode)
    : []
  const dailyPnlQuote = realizedToday(activeTrades)

  const bail = (reason: string): CycleResult => {
    appendAuditLog('demo_trading_cycle_bailed', {
      reason,
      tradingMode: db.settings.tradingMode,
      executionMode: executionMode ?? undefined,
    })
    return {
      ran: false,
      reason,
      actions: [],
      scores: [...scores.values()],
      openPositions: executionMode
        ? activePositionsForMode(positions, executionMode).length
        : 0,
      dailyPnlQuote,
      ranAt,
      executionMode: executionMode ?? undefined,
      marketWarmup: cycleContext.marketWarmup,
    }
  }

  if (db.settings.emergencyKillSwitch)
    return bail('emergency kill switch is active')
  if (isConnectivityBreakerTripped()) {
    return bail('connectivity breaker tripped — repeated invalid-credential errors, needs manual reset')
  }
  if (!executionMode) {
    return bail(
      `tradingMode is "${db.settings.tradingMode}", not paper_trade, testnet_execute, or approved Binance live`,
    )
  }

  if (executionMode === 'live') {
    if (!db.settings.liveTradingEnabled)
      return bail('live Binance trading is not enabled')
    if (!db.settings.liveBinanceApprovedAt)
      return bail('live Binance approval has not been recorded')
    if (mode === 'live_auto_trade' && !db.settings.autonomousTradingEnabled) {
      return bail('autonomous trading must be enabled for live_auto_trade mode')
    }
    if (mode === 'live_monitored' && !db.settings.monitoringActive) {
      return bail('monitoring must be active for live_monitored mode')
    }
  }

  const quality = decisionQualityReport()
  if (executionMode === 'live' && quality.recommendedAdjustments.pauseLive) {
    return bail(`decision quality keeps live paused: ${quality.status}`)
  }

  let client = options.client
  if (!client) {
    if (executionMode === 'paper') {
      client = new PaperBinanceClient()
    } else if (executionMode === 'testnet') {
      const built = createDemoClientFromEnv()
      if (!built.client)
        return bail(built.reason || 'Binance testnet client unavailable')
      client = built.client
    } else {
      const built = createLiveClientFromEnv()
      if (!built.client)
        return bail(built.reason || 'Binance live client unavailable')
      client = built.client
    }
  }

  if (executionMode === 'live' && client.environment !== 'live') {
    return bail(
      `live mode requires a live Binance client, got ${client.environment}`,
    )
  }
  if (executionMode === 'testnet' && client.environment === 'live') {
    return bail('testnet mode refuses a live Binance client')
  }

  const warmupRun = await runMarketDataWarmup({
    config,
    client,
    executionMode,
    targetCandles: MARKET_WARMUP_TARGET_CANDLES,
  })
  cycleContext.marketWarmup = warmupRun.report

  // One account read per cycle: quote balance feeds the guardian floor check.
  let quoteBalance = 0
  try {
    const account = await client.getAccount()
    if (executionMode === 'live' && !account.canTrade)
      return bail('live Binance account reports canTrade=false')
    quoteBalance = account.balances.find((b) => b.asset === 'USDT')?.free ?? 0
  } catch (err) {
    return bail(`account read failed: ${(err as Error).message}`)
  }

  const activePositions = () => activePositionsForMode(positions, executionMode)
  const activeTradeLog = () => realizedTradesForMode(trades, executionMode)
  const openUnrealizedPnlQuote = await openUnrealizedQuote(
    activePositions(),
    client,
  )
  const livePerOrderCap =
    typeof settings.livePerOrderCapUsdt === 'number' &&
    Number.isFinite(settings.livePerOrderCapUsdt)
      ? Math.max(1, settings.livePerOrderCapUsdt)
      : 10
  const paperShadow = shouldShadow(executionMode, settings)
  const qualityByStrategy = new Map(
    quality.byStrategy.map((strategy) => [strategy.strategyId, strategy]),
  )
  const qualitySizeMultiplier = Math.max(
    0.1,
    Math.min(1, quality.recommendedAdjustments.positionSizeMultiplier),
  )
  const strategyOverrides = readStrategyOverrideState(settings.demoTrading)
  const overrideByStrategy = new Map(
    strategyOverrides.active.map((override) => [override.strategyId, override]),
  )

  const actions: Array<CycleAction> = []

  const recordBlocks = (
    symbol: string,
    strategyId: string,
    verdictBlocks: Array<GuardianBlock>,
  ) => {
    for (const b of verdictBlocks) {
      blocks.push({
        kind: SR_KIND_BLOCK,
        symbol,
        strategyId,
        rule: b.rule,
        detail: b.detail,
        at: new Date().toISOString(),
        executionMode,
      })
      actions.push({
        symbol,
        strategyId,
        action: 'BLOCKED',
        reason: `${b.rule}: ${b.detail}`,
      })
    }
    appendAuditLog('binance_guardian_block', {
      symbol,
      strategyId,
      executionMode,
      blocks: verdictBlocks,
    })
  }

  const recordQualityBlock = (
    symbol: string,
    strategyId: string,
    rule: string,
    detail: string,
  ) => {
    blocks.push({
      kind: SR_KIND_BLOCK,
      symbol,
      strategyId,
      rule,
      detail,
      at: new Date().toISOString(),
      executionMode,
    })
    actions.push({
      symbol,
      strategyId,
      action: 'BLOCKED',
      reason: `${rule}: ${detail}`,
    })
    appendAuditLog('binance_decision_quality_block', {
      symbol,
      strategyId,
      executionMode,
      rule,
      detail,
    })
  }

  // Logs every fetched long/short-ratio observation regardless of whether it
  // changed the vote — building up history for a future backtest (Binance
  // only retains ~30 days of this via its API, so we accumulate our own).
  const appendSentimentObservation = (
    point: { longShortRatio: number; longAccount: number; shortAccount: number; timestamp: number } | null,
    obsSymbol: string,
  ) => {
    if (point == null) return
    sentimentObservations.push({
      kind: SR_KIND_LONG_SHORT_OBSERVATION,
      symbol: obsSymbol,
      longShortRatio: point.longShortRatio,
      longAccount: point.longAccount,
      shortAccount: point.shortAccount,
      timestamp: point.timestamp,
      observedAt: new Date().toISOString(),
    })
  }

  // Crash-safety: persist the store immediately after each order or shadow decision.
  const checkpoint = () => persist({ scores, positions, trades, blocks, patternVetoStats, sentimentObservations })

  for (const symbol of config.symbols) {
    let candles: Array<Candle>
    let price: number
    const normalizedSymbol = normalizeMarketSymbol(symbol)
    const warmedCandles = warmupRun.candlesBySymbol.get(normalizedSymbol)
    try {
      if (warmedCandles?.length) {
        candles = warmedCandles
        price =
          warmupRun.priceBySymbol.get(normalizedSymbol) ??
          candles[candles.length - 1].close
      } else {
        candles = await client.getKlines(
          symbol,
          config.interval,
          Math.min(MARKET_WARMUP_TARGET_CANDLES, 1000),
        )
        price = candles.length
          ? candles[candles.length - 1].close
          : await client.getPrice(symbol)
        try {
          recordBinanceMarketObservation({
            symbol,
            interval: config.interval,
            candles,
            price,
            platform: 'binance',
            source: `binance-${executionMode}-trading-engine`,
          })
        } catch (err) {
          appendAuditLog('market_observation_persist_failed', {
            symbol,
            interval: config.interval,
            executionMode,
            reason: (err as Error).message,
          })
        }
      }
    } catch (err) {
      actions.push({
        symbol,
        strategyId: '-',
        action: 'SKIP',
        reason: `market data error: ${(err as Error).message}`,
      })
      continue
    }

    const configuredStrategies = STRATEGIES.filter((s) =>
      config.enabledStrategies.includes(s.id),
    )
    const disabledStrategies = configuredStrategies.filter(
      (strategy) => overrideByStrategy.get(strategy.id)?.mode === 'disabled',
    )
    if (
      configuredStrategies.length > 0 &&
      disabledStrategies.length === configuredStrategies.length
    ) {
      for (const strategy of disabledStrategies) {
        recordQualityBlock(
          symbol,
          strategy.id,
          'manual_strategy_override',
          `${strategy.id} is disabled until manual review`,
        )
      }
    }
    const members: Array<CouncilMember> = configuredStrategies
      .filter((s) => overrideByStrategy.get(s.id)?.mode !== 'disabled')
      .map((s) => ({
        strategyId: s.id,
        decision: s.evaluate(candles),
        score: scores.get(s.id)?.score ?? 0,
      }))
    if (config.longShortSentimentEnabled) {
      try {
        const points = await fetchTopTraderLongShortRatio(
          symbol,
          config.longShortSentimentPeriod,
          1,
        )
        const latest = points.length > 0 ? points[0] : undefined
        appendSentimentObservation(latest ?? null, symbol)
        members.push({
          strategyId: 'long_short_sentiment',
          decision: longShortSentimentDecision(latest ? latest.longShortRatio : null),
          score: scores.get('long_short_sentiment')?.score ?? 0,
        })
      } catch {
        // Network hiccup on a read-only sentiment fetch must never break a
        // trading cycle — just skip this cycle's sentiment vote.
      }
    }
    const vote = councilVote(members, config.councilThreshold)

    // 1. Manage existing positions (exits first).
    const held = activePositions().filter((p) => p.symbol === symbol)
    for (const pos of held) {
      const previousHighWater = pos.highWaterPrice ?? pos.entryPrice
      const highWaterPrice = Math.max(previousHighWater, price)
      pos.highWaterPrice = highWaterPrice
      const ownerDecision = getStrategy(pos.strategyId)?.evaluate(candles)
      const changePct = (price - pos.entryPrice) / pos.entryPrice
      const hitAtrStop = pos.atrStopPrice != null && price <= pos.atrStopPrice
      const hitFixedStop =
        pos.atrStopPrice == null && changePct <= -config.stopLossPct
      const pctTrailPrice =
        config.trailingStopPct > 0
          ? highWaterPrice * (1 - config.trailingStopPct)
          : null
      const atrTrailPrice =
        pos.atrTrailDistance != null
          ? highWaterPrice - pos.atrTrailDistance
          : null
      const hitAtrTrail = atrTrailPrice != null && price <= atrTrailPrice
      const hitPctTrail =
        atrTrailPrice == null && pctTrailPrice != null && price <= pctTrailPrice
      const trailing = atrTrailPrice != null || pctTrailPrice != null
      const hitAtrTarget =
        !trailing &&
        pos.atrTakeProfitPrice != null &&
        price >= pos.atrTakeProfitPrice
      const hitFibTarget =
        !trailing &&
        pos.atrTakeProfitPrice == null &&
        pos.fibTakeProfitPrice != null &&
        price >= pos.fibTakeProfitPrice
      const hitFixedTarget =
        !trailing &&
        pos.atrTakeProfitPrice == null &&
        pos.fibTakeProfitPrice == null &&
        changePct >= config.takeProfitPct
      const ownerExit = ownerDecision?.signal === 'SELL'
      const councilExit = vote.signal === 'SELL'
      const heldMinutes =
        (Date.now() - new Date(pos.openedAt).getTime()) / 60_000
      const hitMaxHold =
        config.maxHoldMinutes > 0 && heldMinutes >= config.maxHoldMinutes
      if (
        hitAtrStop ||
        hitFixedStop ||
        hitAtrTrail ||
        hitPctTrail ||
        hitAtrTarget ||
        hitFibTarget ||
        hitFixedTarget ||
        ownerExit ||
        councilExit ||
        hitMaxHold
      ) {
        const reason = hitAtrStop
          ? `atr-stop ${(changePct * 100).toFixed(2)}% (ATR ${pos.atrAtEntry?.toFixed(2) ?? '?'})`
          : hitFixedStop
            ? `stop-loss ${(changePct * 100).toFixed(2)}%`
            : hitAtrTrail
              ? `atr-trailing-stop ${(changePct * 100).toFixed(2)}% (peak ${highWaterPrice.toFixed(2)}, ATR ${pos.atrAtEntry?.toFixed(2) ?? '?'})`
              : hitPctTrail
                ? `trailing-stop ${(changePct * 100).toFixed(2)}% (peak ${highWaterPrice.toFixed(2)})`
                : hitAtrTarget
                  ? `atr-target ${(changePct * 100).toFixed(2)}% (ATR ${pos.atrAtEntry?.toFixed(2) ?? '?'})`
                  : hitFibTarget
                    ? `fib-target ${(changePct * 100).toFixed(2)}%`
                    : hitFixedTarget
                      ? `take-profit ${(changePct * 100).toFixed(2)}%`
                      : ownerExit
                        ? `strategy exit: ${ownerDecision.reason}`
                        : councilExit
                          ? `council exit (net ${vote.net.toFixed(2)})`
                          : `max-hold-expired (${heldMinutes.toFixed(0)}m >= ${config.maxHoldMinutes}m)`
        const groupId = pos.groupId ?? newGroupId(symbol)
        const forceBookClose = (forceReason: string) => {
          const exitQuote = price * pos.quantity
          const feesQuote = pos.entryFeeQuote
          const pnlQuote = exitQuote - pos.entryQuote - feesQuote
          let nextScore = applyTradeOutcome(
            scores.get(pos.strategyId) ?? emptyScore(pos.strategyId),
            pnlQuote,
            pos.entryQuote,
          )
          if (nextScore.lossStreak >= config.guardian.lossStreakLimit) {
            nextScore = {
              ...nextScore,
              cooldownUntil: cooldownUntil(config.guardian),
            }
          }
          scores.set(pos.strategyId, nextScore)
          if (pos.patternFeatures) {
            patternVetoStats = applyBucketOutcome(
              patternVetoStats,
              pos.patternFeatures,
              pnlQuote,
            )
          }
          if (paperShadow) {
            positions = closeShadowPosition({
              positions,
              trades,
              groupId,
              price,
              reason: forceReason,
            })
          }
          trades.push({
            id: `trade_${symbol}_${Date.now()}`,
            symbol,
            strategyId: pos.strategyId,
            entryPrice: pos.entryPrice,
            exitPrice: price,
            quantity: pos.quantity,
            entryQuote: pos.entryQuote,
            exitQuote,
            pnlQuote,
            feesQuote,
            reason: forceReason,
            openedAt: pos.openedAt,
            closedAt: new Date().toISOString(),
            executionMode,
            groupId,
            patternFeatures: pos.patternFeatures,
          })
          positions = positions.filter((p) => p.id !== pos.id)
          actions.push({
            symbol,
            strategyId: pos.strategyId,
            action: 'CLOSE',
            reason: forceReason,
            price,
            pnlQuote,
          })
          appendAuditLog('binance_trade_force_closed', {
            symbol,
            strategyId: pos.strategyId,
            pnlQuote,
            reason: forceReason,
            closeFailureCount: pos.closeFailureCount ?? 0,
            executionMode,
          })
          sendTradeAlert(
            `⚠️ ${symbol} position force book-closed (${forceReason}). ` +
              'The real balance may still hold this asset — check the testnet account.',
          )
          checkpoint()
        }
        try {
          if (paperShadow) {
            recordShadowDecision({
              groupId,
              symbol,
              strategyId: pos.strategyId,
              side: 'SELL',
              quantity: pos.quantity,
              reason,
            })
          }

          // Best-effort clamp to what the account can actually sell: the
          // MARKET-BUY commission was taken in the base asset, so free
          // balance sits slightly below the recorded quantity, and selling
          // the gross amount fails forever (2026-07-12 stuck-position bug).
          let sellQuantity = pos.quantity
          let filters: SymbolFilters | null = null
          if (executionMode !== 'paper') {
            try {
              const base = baseAssetOf(symbol)
              if (base) {
                const account = await client.getAccount()
                const free = account.balances.find(
                  (b) => b.asset === base,
                )?.free
                if (typeof free === 'number' && free > 0 && free < sellQuantity)
                  sellQuantity = free
              }
              if (client.getSymbolFilters) {
                filters = await client.getSymbolFilters(symbol)
                if (filters.stepSize > 0)
                  sellQuantity = floorToStep(sellQuantity, filters.stepSize)
              }
            } catch {
              // Clamp is best-effort; on any lookup failure fall back to the
              // recorded quantity rather than adding a new failure mode.
            }
          }

          const unsellableDust =
            filters != null &&
            (sellQuantity <= 0 ||
              (filters.minQty > 0 && sellQuantity < filters.minQty) ||
              (filters.minNotional > 0 &&
                sellQuantity * price < filters.minNotional))
          if (
            unsellableDust ||
            (pos.closeFailureCount ?? 0) >= CLOSE_FAILURE_FORCE_LIMIT
          ) {
            forceBookClose(
              unsellableDust
                ? `force-closed-unsellable (dust ${sellQuantity} below exchange minimums; wanted: ${reason})`
                : `force-closed-unsellable (${pos.closeFailureCount} failed close attempts; wanted: ${reason})`,
            )
            continue
          }

          const orderInput: BinanceOrderInput = {
            symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: sellQuantity,
          }
          await preflightLiveOrder(client, orderInput)
          const order = await client.placeOrder(orderInput)
          if (order.executedQty <= 0) {
            pos.closeFailureCount = (pos.closeFailureCount ?? 0) + 1
            actions.push({
              symbol,
              strategyId: pos.strategyId,
              action: 'SKIP',
              reason: 'sell order did not fill - position retained',
            })
            appendAuditLog('binance_sell_unfilled', {
              symbol,
              strategyId: pos.strategyId,
              requested: sellQuantity,
              closeFailureCount: pos.closeFailureCount,
              executionMode,
            })
            checkpoint()
            continue
          }
          if (order.executedQty < sellQuantity) {
            appendAuditLog('binance_partial_sell', {
              symbol,
              requested: sellQuantity,
              filled: order.executedQty,
              executionMode,
            })
          }
          const exitQuote = order.cummulativeQuoteQty || price * sellQuantity
          const feesQuote =
            pos.entryFeeQuote +
            orderFeeQuote(order.fills, order.avgPrice || price)
          const pnlQuote = exitQuote - pos.entryQuote - feesQuote

          let nextScore = applyTradeOutcome(
            scores.get(pos.strategyId) ?? emptyScore(pos.strategyId),
            pnlQuote,
            pos.entryQuote,
          )
          if (nextScore.lossStreak >= config.guardian.lossStreakLimit) {
            nextScore = {
              ...nextScore,
              cooldownUntil: cooldownUntil(config.guardian),
            }
          }
          scores.set(pos.strategyId, nextScore)
          // Unconditional — evidence accrues regardless of patternVetoEnabled.
          if (pos.patternFeatures) {
            patternVetoStats = applyBucketOutcome(
              patternVetoStats,
              pos.patternFeatures,
              pnlQuote,
            )
          }

          if (paperShadow) {
            positions = closeShadowPosition({
              positions,
              trades,
              groupId,
              price: order.avgPrice || price,
              reason,
            })
          }
          trades.push({
            id: `trade_${symbol}_${Date.now()}`,
            symbol,
            strategyId: pos.strategyId,
            entryPrice: pos.entryPrice,
            exitPrice: order.avgPrice || price,
            quantity: pos.quantity,
            entryQuote: pos.entryQuote,
            exitQuote,
            pnlQuote,
            feesQuote,
            reason,
            openedAt: pos.openedAt,
            closedAt: new Date().toISOString(),
            executionMode,
            groupId,
            patternFeatures: pos.patternFeatures,
          })
          positions = positions.filter((p) => p.id !== pos.id)
          actions.push({
            symbol,
            strategyId: pos.strategyId,
            action: 'CLOSE',
            reason,
            price: order.avgPrice || price,
            pnlQuote,
          })
          appendAuditLog('binance_trade_close', {
            symbol,
            strategyId: pos.strategyId,
            pnlQuote,
            reason,
            executionMode,
          })
          checkpoint()
        } catch (err) {
          // A failed close means the position is retained and retried every
          // cycle — that must never be silent again (three positions sat
          // stuck for 4 days pre-2026-07-12 because SKIPs went nowhere).
          const failureCount = (pos.closeFailureCount ?? 0) + 1
          pos.closeFailureCount = failureCount
          const message = (err as Error).message
          actions.push({
            symbol,
            strategyId: pos.strategyId,
            action: 'SKIP',
            reason: `close failed: ${message}`,
          })
          appendAuditLog('binance_close_failed', {
            symbol,
            strategyId: pos.strategyId,
            error: message,
            closeFailureCount: failureCount,
            executionMode,
          })
          if (failureCount === CLOSE_FAILURE_ALERT_THRESHOLD) {
            sendTradeAlert(
              `🔴 ${symbol} close has failed ${failureCount}× in a row (${message}). ` +
                `Retrying every cycle; will force book-close at ${CLOSE_FAILURE_FORCE_LIMIT}.`,
            )
          }
          checkpoint()
        }
      }
    }

    // 2. Entries: council BUY + guardian approval, only if flat on the symbol for this mode.
    const stillHeld = activePositions().some((p) => p.symbol === symbol)
    if (!stillHeld && vote.signal === 'BUY' && vote.leadStrategyId) {
      const leadScore =
        scores.get(vote.leadStrategyId) ?? emptyScore(vote.leadStrategyId)
      const leadQuality = qualityByStrategy.get(vote.leadStrategyId)
      const leadOverride = overrideByStrategy.get(vote.leadStrategyId)
      if (leadOverride?.mode === 'disabled') {
        recordQualityBlock(
          symbol,
          vote.leadStrategyId,
          'manual_strategy_override',
          `${vote.leadStrategyId} is disabled until manual review`,
        )
        continue
      }
      if (leadQuality?.recommendation === 'disable_until_review') {
        recordQualityBlock(
          symbol,
          vote.leadStrategyId,
          'decision_quality_disable',
          `${vote.leadStrategyId} is disabled until review after weak closed-trade results`,
        )
        continue
      }
      if (leadQuality?.recommendation === 'cooldown') {
        recordQualityBlock(
          symbol,
          vote.leadStrategyId,
          'decision_quality_cooldown',
          `${vote.leadStrategyId} is cooling down after a loss streak`,
        )
        continue
      }
      if (
        !regimeAllowsLong(
          candles.map((candle) => candle.close),
          config.regimeSmaPeriod,
        )
      ) {
        recordQualityBlock(
          symbol,
          vote.leadStrategyId,
          'regime_below_long_sma',
          `${symbol} close is below the configured SMA(${config.regimeSmaPeriod}) regime gate`,
        )
        continue
      }
      if (!trendIsStrong(candles, config.adxPeriod, config.adxThreshold)) {
        recordQualityBlock(
          symbol,
          vote.leadStrategyId,
          'adx_trend_weak',
          `${symbol} ADX(${config.adxPeriod}) is below the configured strength threshold ${config.adxThreshold}`,
        )
        continue
      }
      const marketQuality = marketLearningForSymbol(
        readFinanceStore(),
        symbol,
        config.interval,
        new Date(),
      )
      if (marketQuality.blocksNewEntries) {
        recordQualityBlock(
          symbol,
          vote.leadStrategyId,
          `market_quality_${marketQuality.status}`,
          `${symbol} market quality ${marketQuality.status}: ${marketQuality.blockers.join('; ')}`,
        )
        continue
      }
      // Always computed (evidence accrues via the opened position below even
      // while disabled) — only the veto itself is gated on patternVetoEnabled.
      const patternFeatures = buildEntryFeatureVector(
        vote.leadStrategyId,
        candles,
        config.atrPeriod,
      )
      if (config.patternVetoEnabled) {
        const veto = bucketVeto(
          patternVetoStats,
          patternFeatures,
          config.patternVetoMinSamples,
          config.patternVetoLossRateThreshold,
        )
        if (veto.blocked) {
          recordQualityBlock(
            symbol,
            vote.leadStrategyId,
            'pattern_bucket_veto',
            veto.detail!,
          )
          continue
        }
      }
      const strategyMultiplier =
        (leadQuality?.recommendation === 'reduce_size' ? 0.5 : 1) *
        (leadOverride?.mode === 'reduce_size' ? leadOverride.multiplier : 1)
      const atrSizeMult =
        config.atrSizeBaselinePct > 0
          ? atrSizeMultiplier(
              atr(candles, config.atrPeriod),
              price,
              config.atrSizeBaselinePct,
              config.atrSizeMinMultiplier,
              config.atrSizeMaxMultiplier,
            )
          : 1
      // Kelly scaffolding: inert (1x) until enabled AND the lead strategy has
      // enough closed trades to trust its win-rate/payoff inputs. v1 only
      // ever shrinks (kellyFrac / maxFraction, capped at 1), never grows.
      const kellySizeMult =
        config.kellySizingEnabled &&
        config.kellySizingMaxFraction > 0 &&
        leadScore.trades >= config.kellySizingMinClosedTrades
          ? Math.min(
              1,
              kellyFraction(
                leadScore.winRate,
                leadScore.avgWinQuote ?? 0,
                leadScore.avgLossQuote ?? 0,
                config.kellySizingMaxFraction,
              ) / config.kellySizingMaxFraction,
            )
          : 1
      const proposedQuote = Math.max(
        1,
        Math.round(
          scaledQuoteSize(config.quotePerTrade, leadScore.score) *
            qualitySizeMultiplier *
            strategyMultiplier *
            atrSizeMult *
            kellySizeMult *
            100,
        ) / 100,
      )
      const verdict = checkOrderProposal(
        { symbol, strategyId: vote.leadStrategyId, quoteAmount: proposedQuote },
        {
          openPositions: activePositions().length,
          quoteBalance,
          dailyPnlQuote: realizedToday(activeTradeLog()),
          weeklyPnlQuote: realizedWeekly(activeTradeLog()),
          openUnrealizedPnlQuote,
          strategyLossStreak: leadScore.lossStreak,
          strategyCooldownUntil: leadScore.cooldownUntil,
        },
        config.guardian,
      )
      if (!verdict.allowed) {
        recordBlocks(symbol, vote.leadStrategyId, verdict.blocks)
      } else {
        const approvedQuote =
          executionMode === 'live'
            ? Math.min(verdict.approvedQuote, livePerOrderCap)
            : verdict.approvedQuote
        const groupId = newGroupId(symbol)
        const orderInput: BinanceOrderInput = {
          symbol,
          side: 'BUY',
          type: 'MARKET',
          quoteOrderQty: approvedQuote,
        }
        const shadowAtrExits = atrExitPlan(price, candles, config)
        try {
          if (paperShadow) {
            recordShadowDecision({
              groupId,
              symbol,
              strategyId: vote.leadStrategyId,
              side: 'BUY',
              quoteAmount: approvedQuote,
              reason: `council BUY (net ${vote.net.toFixed(2)})`,
            })
            openShadowPosition({
              positions,
              symbol,
              strategyId: vote.leadStrategyId,
              groupId,
              price,
              quoteAmount: approvedQuote,
              atrExits: shadowAtrExits,
            })
            checkpoint()
          }
          await preflightLiveOrder(client, orderInput)
          const order = await client.placeOrder(orderInput)
          if (order.executedQty > 0) {
            const spent = order.cummulativeQuoteQty || approvedQuote
            const fillPrice = order.avgPrice || price
            quoteBalance -= spent
            // Net of buy-side base-asset commission: the account is credited
            // executedQty minus fees taken in the base asset, and selling the
            // gross amount later fails with insufficient balance.
            const netQuantity =
              order.executedQty -
              orderBaseFee(order.fills, baseAssetOf(symbol))
            positions.push({
              id: `pos_${symbol}_${Date.now()}`,
              symbol,
              strategyId: vote.leadStrategyId,
              entryPrice: fillPrice,
              quantity: netQuantity > 0 ? netQuantity : order.executedQty,
              entryQuote: spent,
              entryFeeQuote: orderFeeQuote(order.fills, fillPrice),
              highWaterPrice: fillPrice,
              ...atrExitPlan(fillPrice, candles, config),
              openedAt: new Date().toISOString(),
              executionMode,
              groupId,
              patternFeatures,
            })
            actions.push({
              symbol,
              strategyId: vote.leadStrategyId,
              action: 'OPEN',
              reason: `council BUY (net ${vote.net.toFixed(2)}): ${vote.reasons.join('; ')}`,
              price: fillPrice,
            })
            appendAuditLog('binance_trade_open', {
              symbol,
              strategyId: vote.leadStrategyId,
              quote: approvedQuote,
              vote: vote.net,
              executionMode,
            })
            checkpoint()
          }
        } catch (err) {
          if (paperShadow) {
            positions = positions.filter(
              (position) => position.groupId !== groupId,
            )
            checkpoint()
          }
          actions.push({
            symbol,
            strategyId: vote.leadStrategyId,
            action: 'SKIP',
            reason: `open failed: ${(err as Error).message}`,
          })
        }
      }
    } else if (!stillHeld) {
      actions.push({
        symbol,
        strategyId: '-',
        action: 'SKIP',
        reason: `council: ${vote.signal} (net ${vote.net.toFixed(2)})`,
      })
    }
  }

  persist({ scores, positions, trades, blocks, patternVetoStats, sentimentObservations })
  let learning: LearningCycleResult | undefined
  if (mode === 'paper_trade' || mode === 'testnet_execute') {
    try {
      learning = runLearningCycle()
    } catch (err) {
      appendAuditLog('learning_cycle_failed', {
        reason: (err as Error).message,
      })
    }
  }
  const digest = tradeAlertDigest(actions)
  if (digest) sendTradeAlert(digest)
  return {
    ran: true,
    actions,
    scores: [...scores.values()],
    openPositions: activePositions().length,
    dailyPnlQuote: realizedToday(activeTradeLog()),
    ranAt,
    executionMode,
    marketWarmup: cycleContext.marketWarmup,
    learning,
  }
}

/** Read-only snapshot for the API/UI. */
export function getEngineState(): {
  scores: Array<StrategyScore>
  positions: Array<OpenPosition>
  trades: Array<TradeLogEntry>
  guardianBlocks: Array<SRRow>
  dailyPnlQuote: number
  config: EngineConfig
} {
  const db = readFinanceStore()
  const rows = db.strategy_results as Array<SRRow>
  const trades = loadOfKind<TradeLogEntry>(rows, SR_KIND_TRADE).filter(
    (trade) => !isShadow(trade),
  )
  const positions = loadOfKind<OpenPosition>(rows, SR_KIND_POSITION).filter(
    (position) => !isShadow(position),
  )
  return {
    scores: [...loadScores(rows).values()],
    positions,
    trades: trades.slice(-20).reverse(),
    guardianBlocks: rows
      .filter((r) => r.kind === SR_KIND_BLOCK)
      .slice(-20)
      .reverse(),
    dailyPnlQuote: realizedToday(trades),
    config: resolveEngineConfig(
      (db.settings as Record<string, unknown>).demoTrading,
    ),
  }
}

export interface DemoPerformance {
  totalTrades: number
  winRate: number
  profitFactor: number
  avgProfitLossPerTrade: number
  avgProfit: number
  avgLoss: number
  sharpeRatio: number
  maxDrawdown: number
  totalFeesQuote: number
}

/** Performance metrics over the demo engine's own closed trades (fee-net P/L). */
export function summarizeDemoTrades(
  trades: Array<TradeLogEntry>,
): DemoPerformance {
  const empty: DemoPerformance = {
    totalTrades: 0,
    winRate: 0,
    profitFactor: 0,
    avgProfitLossPerTrade: 0,
    avgProfit: 0,
    avgLoss: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    totalFeesQuote: 0,
  }
  if (trades.length === 0) return empty
  const pnls = trades.map((t) => t.pnlQuote)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const grossProfit = wins.reduce((sum, p) => sum + p, 0)
  const grossLoss = Math.abs(losses.reduce((sum, p) => sum + p, 0))
  const demoTotalPnl = pnls.reduce((sum, p) => sum + p, 0)
  const mean = demoTotalPnl / pnls.length
  const variance =
    pnls.reduce((sum, p) => sum + (p - mean) ** 2, 0) / pnls.length
  const std = Math.sqrt(variance)
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0
  for (const p of pnls) {
    cumulative += p
    if (cumulative > peak) peak = cumulative
    const drawdown = peak - cumulative
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
  }
  return {
    totalTrades: pnls.length,
    winRate: wins.length / pnls.length,
    profitFactor:
      grossLoss !== 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0,
    avgProfitLossPerTrade: mean,
    avgProfit: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length
      ? losses.reduce((sum, p) => sum + p, 0) / losses.length
      : 0,
    sharpeRatio: std !== 0 ? mean / std : 0,
    maxDrawdown,
    totalFeesQuote: trades.reduce((sum, t) => sum + (t.feesQuote || 0), 0),
  }
}

/** Reads the demo trade log from the store and summarizes it. */
export function demoTradingPerformance(): DemoPerformance {
  const rows = readFinanceStore().strategy_results as Array<SRRow>
  return summarizeDemoTrades(
    loadOfKind<TradeLogEntry>(rows, SR_KIND_TRADE).filter(
      (trade) => !isShadow(trade),
    ),
  )
}

export type DecisionQualityStatus =
  | 'insufficient_data'
  | 'degraded'
  | 'improving'
  | 'ready_for_testnet'
  | 'ready_for_manual_live_review'

export type StrategyQualityRecommendation =
  | 'keep'
  | 'reduce_size'
  | 'cooldown'
  | 'disable_until_review'

export interface DecisionQualityFinding {
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  evidenceCount?: number
}

export interface StrategyQuality {
  strategyId: string
  trades: number
  winRate: number
  totalPnlQuote: number
  avgPnlQuote: number
  score: number
  lossStreak: number
  recommendation: StrategyQualityRecommendation
}

export interface ShadowComparison {
  groupId: string
  symbol: string
  strategyId: string
  actualPnlQuote: number
  shadowPnlQuote: number
  slippageQuote: number
  executionMode?: PersistedExecutionMode
}

export interface DecisionQualityReport {
  checkedAt: string
  status: DecisionQualityStatus
  sample: {
    totalClosedTrades: number
    realClosedTrades: number
    shadowClosedTrades: number
    shadowDecisionCount: number
    pairedShadowTrades: number
    openPositions: number
    openShadowPositions: number
  }
  metrics: DemoPerformance & {
    totalPnlQuote: number
    recentWinRate: number
    recentPnlQuote: number
    shadowWinRate: number
    shadowVsActualAvgSlippageQuote: number
    maxLossStreak: number
  }
  byStrategy: Array<StrategyQuality>
  findings: Array<DecisionQualityFinding>
  recommendedAdjustments: {
    recommendedMode: 'paper_trade' | 'testnet_execute' | 'live_manual_approval'
    pauseLive: boolean
    positionSizeMultiplier: number
    maxQuotePerTrade: number
    reasons: Array<string>
  }
  validations: {
    enoughPaperData: boolean
    enoughShadowData: boolean
    enoughDataForTestnet: boolean
    enoughDataForLiveManual: boolean
    canIncreaseRisk: boolean
  }
  shadowComparisons: Array<ShadowComparison>
}

export interface AppliedSafeguards {
  tradingMode: string
  executionAccount: string
  liveTradingEnabled: boolean
  quotePerTrade: number
  baseQuotePerTrade: number
  positionSizeMultiplier: number
  recommendedMode: DecisionQualityReport['recommendedAdjustments']['recommendedMode']
  liveRecommendationDeferred: boolean
}

export interface SafeguardHistoryEntry {
  id: string
  appliedAt: string
  status: DecisionQualityStatus
  recommendedMode: DecisionQualityReport['recommendedAdjustments']['recommendedMode']
  appliedTradingMode: string
  executionAccount: string
  liveTradingEnabled: boolean
  baseQuotePerTrade: number
  previousQuotePerTrade: number
  appliedQuotePerTrade: number
  positionSizeMultiplier: number
  pauseLive: boolean
  liveRecommendationDeferred: boolean
  reasonSummary: string
}

export type StrategyOverrideMode = 'disabled' | 'reduce_size'
export type StrategyOverrideAction = StrategyOverrideMode | 'clear'

export interface StrategyOverride {
  id: string
  strategyId: string
  mode: StrategyOverrideMode
  multiplier: number
  reason: string
  createdAt: string
  updatedAt: string
  reviewAt: string | null
  expiresAt: string | null
  source: 'manual'
}

export interface StrategyOverrideHistoryEntry {
  id: string
  strategyId: string
  action: 'disabled' | 'reduced_size' | 'cleared' | 'updated'
  previousMode: StrategyOverrideMode | null
  mode: StrategyOverrideMode | null
  previousMultiplier: number | null
  multiplier: number | null
  previousReviewAt: string | null
  reviewAt: string | null
  previousExpiresAt: string | null
  expiresAt: string | null
  reason: string
  at: string
  activeOverrideId: string | null
}

export interface StrategyOverrideState {
  active: Array<StrategyOverride>
  history: Array<StrategyOverrideHistoryEntry>
}

export interface StrategyOverrideResult {
  changed: boolean
  message: string
  activeOverrides: Array<StrategyOverride>
  history: Array<StrategyOverrideHistoryEntry>
}

export interface StrategyOverrideRecommendationApplication {
  strategyId: string
  recommendation: StrategyQualityRecommendation
  overrideAction: StrategyOverrideMode
  multiplier: number | null
  changed: boolean
  message: string
}

export interface StrategyOverrideRecommendationSkip {
  strategyId: string
  recommendation: StrategyQualityRecommendation
  reason: string
}

export interface StrategyOverrideRecommendationResult {
  checkedAt: string
  applied: Array<StrategyOverrideRecommendationApplication>
  skipped: Array<StrategyOverrideRecommendationSkip>
  activeOverrides: Array<StrategyOverride>
  history: Array<StrategyOverrideHistoryEntry>
}

export type LearningCandidateStatus =
  | 'proposed'
  | 'paper_applied'
  | 'testnet_applied'
  | 'testnet_ready'
  | 'live_review_ready'
  | 'rejected'
  | 'expired'

export type LearningStabilityGate = 'conservative'

export interface LearningPolicy {
  enabled: boolean
  autoApplyModes: Array<'paper_trade' | 'testnet_execute'>
  candidateMinBacktestFolds: number
  stabilityGate: LearningStabilityGate
  livePromotionRequiresApproval: boolean
}

export interface LearningConfigPatch {
  quotePerTrade?: number
}

export interface LearningStrategyOverridePatch {
  strategyId: string
  overrideAction: StrategyOverrideMode
  multiplier: number | null
  reason: string
}

export interface LearningCandidate {
  kind: typeof SR_KIND_LEARNING_CANDIDATE
  id: string
  status: LearningCandidateStatus
  source: 'decision_quality'
  createdAt: string
  updatedAt: string
  appliedAt?: string | null
  expiresAt?: string | null
  fingerprint: string
  modeAtCreation: string
  reason: string
  configPatch: LearningConfigPatch
  strategyOverrides: Array<LearningStrategyOverridePatch>
  metrics: {
    closedTrades: number
    totalPnlQuote: number
    profitFactor: number
    winRate: number
    recentPnlQuote: number
    maxDrawdown: number
    maxLossStreak: number
  }
  validation: {
    method: 'closed_trade_evidence'
    minBacktestFolds: number
    passed: boolean
    reason: string
  }
  promotion: {
    eligibleFor: 'paper' | 'testnet_review' | 'live_review'
    requiresApproval: boolean
  }
}

export interface LearningStabilityAssessment {
  passed: boolean
  closedTrades: number
  evidenceDays: number
  profitFactor: number
  totalPnlQuote: number
  maxDrawdown: number
  maxDrawdownLimit: number
  hasCriticalFinding: boolean
  reasons: Array<string>
}

export interface LearningReport {
  checkedAt: string
  policy: LearningPolicy
  stability: LearningStabilityAssessment
  latestCandidate: LearningCandidate | null
  candidates: Array<LearningCandidate>
}

export interface LearningCycleResult extends LearningReport {
  generatedCandidate: LearningCandidate | null
  appliedCandidate: LearningCandidate | null
  skippedReason: string | null
}

const DEFAULT_LEARNING_POLICY: LearningPolicy = {
  enabled: true,
  autoApplyModes: ['paper_trade'],
  candidateMinBacktestFolds: 4,
  stabilityGate: 'conservative',
  livePromotionRequiresApproval: true,
}

function chronological<T extends { closedAt: string }>(
  rows: Array<T>,
): Array<T> {
  return [...rows].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
  )
}

function totalPnl(trades: Array<TradeLogEntry>): number {
  return trades.reduce((sum, trade) => sum + trade.pnlQuote, 0)
}

function winRate(trades: Array<TradeLogEntry>): number {
  return trades.length
    ? trades.filter((trade) => trade.pnlQuote > 0).length / trades.length
    : 0
}

function maxLossStreak(trades: Array<TradeLogEntry>): number {
  let current = 0
  let max = 0
  for (const trade of chronological(trades)) {
    if (trade.pnlQuote < 0) {
      current += 1
      max = Math.max(max, current)
    } else if (trade.pnlQuote > 0) {
      current = 0
    }
  }
  return max
}

function pairShadowComparisons(
  trades: Array<TradeLogEntry>,
): Array<ShadowComparison> {
  const actualByGroup = new Map<string, TradeLogEntry>()
  const shadowByGroup = new Map<string, TradeLogEntry>()
  for (const trade of trades) {
    if (!trade.groupId) continue
    if (isShadow(trade)) shadowByGroup.set(trade.groupId, trade)
    else actualByGroup.set(trade.groupId, trade)
  }
  const comparisons: Array<ShadowComparison> = []
  for (const [groupId, actual] of actualByGroup) {
    const shadow = shadowByGroup.get(groupId)
    if (!shadow) continue
    comparisons.push({
      groupId,
      symbol: actual.symbol,
      strategyId: actual.strategyId,
      actualPnlQuote: actual.pnlQuote,
      shadowPnlQuote: shadow.pnlQuote,
      slippageQuote: actual.pnlQuote - shadow.pnlQuote,
      executionMode: actual.executionMode,
    })
  }
  return comparisons
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .slice(-20)
}

function strategyRecommendation(
  score: StrategyScore,
  guardian: GuardianConfig,
): StrategyQualityRecommendation {
  const coolingDown = Boolean(
    score.cooldownUntil && new Date(score.cooldownUntil) > new Date(),
  )
  if (coolingDown || score.lossStreak >= guardian.lossStreakLimit)
    return 'cooldown'
  if (score.trades >= 3 && score.winRate < 0.34 && score.totalPnlQuote < 0)
    return 'disable_until_review'
  if (
    score.trades >= 3 &&
    (score.winRate < 0.45 || score.avgPnlQuote < 0 || score.score < -0.5)
  )
    return 'reduce_size'
  return 'keep'
}

/**
 * Validates whether the engine has enough positive evidence to increase risk.
 * It does not place orders and does not change configuration; it turns existing
 * paper/testnet/live and shadow rows into explicit learning guidance for the UI.
 */
export function decisionQualityReport(): DecisionQualityReport {
  const db = readFinanceStore()
  const rows = db.strategy_results as Array<SRRow>
  const config = resolveEngineConfig(
    (db.settings as Record<string, unknown>).demoTrading,
  )
  const allTrades = loadOfKind<TradeLogEntry>(rows, SR_KIND_TRADE)
  const realTrades = chronological(
    allTrades.filter((trade) => !isShadow(trade)),
  )
  const shadowTrades = chronological(
    allTrades.filter((trade) => isShadow(trade)),
  )
  const recentTrades = realTrades.slice(-Math.min(5, realTrades.length))
  const perf = summarizeDemoTrades(realTrades)
  const shadowComparisons = pairShadowComparisons(allTrades)
  const shadowSlippage = shadowComparisons.length
    ? shadowComparisons.reduce(
        (sum, comparison) => sum + comparison.slippageQuote,
        0,
      ) / shadowComparisons.length
    : 0
  const scores = [...loadScores(rows).values()]
  const findings: Array<DecisionQualityFinding> = []
  const closedCount = realTrades.length
  const recentPnlQuote = totalPnl(recentTrades)
  const recentWinRate = winRate(recentTrades)
  const lossStreak = maxLossStreak(realTrades)
  const shadowDecisionCount = rows.filter(
    (row) => row.kind === SR_KIND_SHADOW_DECISION,
  ).length
  const positions = loadOfKind<OpenPosition>(rows, SR_KIND_POSITION)
  const openPositions = positions.filter(
    (position) => !isShadow(position),
  ).length
  const openShadowPositions = positions.filter((position) =>
    isShadow(position),
  ).length

  if (closedCount < 5) {
    findings.push({
      severity: 'info',
      title: 'More paper/testnet evidence needed',
      detail: `Only ${closedCount} closed non-shadow trades are available. Keep running paper or testnet cycles before increasing risk.`,
      evidenceCount: closedCount,
    })
  }
  if (closedCount >= 5 && perf.winRate < 0.45) {
    findings.push({
      severity: 'warning',
      title: 'Low win rate',
      detail: `Win rate is ${(perf.winRate * 100).toFixed(1)}%, below the 45% review threshold.`,
      evidenceCount: closedCount,
    })
  }
  if (closedCount >= 5 && perf.profitFactor < 1) {
    findings.push({
      severity: 'warning',
      title: 'Losses exceed wins',
      detail: `Profit factor is ${perf.profitFactor.toFixed(2)}. Keep size reduced until gross wins exceed gross losses.`,
      evidenceCount: closedCount,
    })
  }
  if (
    recentTrades.length >= 3 &&
    recentTrades.every((trade) => trade.pnlQuote < 0)
  ) {
    findings.push({
      severity: 'critical',
      title: 'Recent losing streak',
      detail:
        'The last 3 or more closed trades are losses. New live entries should stay paused.',
      evidenceCount: recentTrades.length,
    })
  }
  if (lossStreak >= config.guardian.lossStreakLimit) {
    findings.push({
      severity: 'critical',
      title: 'Guardian loss-streak limit reached',
      detail: `Observed ${lossStreak} consecutive losses, meeting or exceeding the configured limit of ${config.guardian.lossStreakLimit}.`,
      evidenceCount: lossStreak,
    })
  }
  if (perf.maxDrawdown > config.quotePerTrade * 2) {
    findings.push({
      severity: 'warning',
      title: 'Drawdown is large versus trade size',
      detail: `Max drawdown is ${perf.maxDrawdown.toFixed(2)} USDT while base trade size is ${config.quotePerTrade.toFixed(2)} USDT.`,
    })
  }
  if (shadowComparisons.length > 0 && shadowSlippage < -0.5) {
    findings.push({
      severity: 'warning',
      title: 'Actual fills underperform paper shadow',
      detail: `Actual executions average ${Math.abs(shadowSlippage).toFixed(2)} USDT worse than shadow paper for paired trades.`,
      evidenceCount: shadowComparisons.length,
    })
  }
  if (shadowDecisionCount === 0) {
    findings.push({
      severity: 'info',
      title: 'No paper-shadow decisions yet',
      detail:
        'Run testnet or gated live cycles with paper shadow enabled before comparing assumptions against external execution.',
    })
  }

  const enoughPaperData = closedCount >= 5
  const enoughShadowData =
    shadowTrades.length >= 5 || shadowComparisons.length >= 3
  const qualityPositive =
    closedCount >= 5 &&
    perf.winRate >= 0.45 &&
    perf.profitFactor >= 1 &&
    recentPnlQuote >= 0 &&
    lossStreak < config.guardian.lossStreakLimit
  const liveReviewReady =
    closedCount >= 15 &&
    enoughShadowData &&
    perf.winRate >= 0.55 &&
    perf.profitFactor >= 1.5 &&
    perf.maxDrawdown <= config.quotePerTrade * 2 &&
    recentPnlQuote > 0 &&
    shadowSlippage >= -0.5

  const hardRisk = findings.some((finding) => finding.severity === 'critical')
  const warningRisk = findings.some((finding) => finding.severity === 'warning')
  let recommendedMode: DecisionQualityReport['recommendedAdjustments']['recommendedMode'] =
    'paper_trade'
  let positionSizeMultiplier = 0.25
  const reasons: Array<string> = []

  if (liveReviewReady && !hardRisk) {
    recommendedMode = 'live_manual_approval'
    positionSizeMultiplier = 0.5
    reasons.push(
      'Enough closed trades, positive profit factor, healthy win rate, and paper-shadow validation for manual live review.',
    )
  } else if (qualityPositive && !hardRisk) {
    recommendedMode = 'testnet_execute'
    positionSizeMultiplier = warningRisk ? 0.5 : 1
    reasons.push(
      'Closed-trade performance is positive enough for Binance testnet validation.',
    )
  } else {
    reasons.push(
      'Keep running paper mode until the engine has more positive closed-trade evidence.',
    )
  }
  if (hardRisk)
    reasons.push(
      'Critical risk finding present; live execution should remain paused.',
    )
  if (closedCount < 5)
    reasons.push('Closed-trade sample is too small to validate assumptions.')
  if (shadowComparisons.length === 0)
    reasons.push(
      'No paired external-vs-shadow trades yet; do not trust execution assumptions.',
    )

  const status: DecisionQualityStatus =
    liveReviewReady && !hardRisk
      ? 'ready_for_manual_live_review'
      : qualityPositive && !hardRisk
        ? 'ready_for_testnet'
        : closedCount < 5
          ? 'insufficient_data'
          : recentPnlQuote >= 0 && !hardRisk
            ? 'improving'
            : 'degraded'

  return {
    checkedAt: new Date().toISOString(),
    status,
    sample: {
      totalClosedTrades: allTrades.length,
      realClosedTrades: realTrades.length,
      shadowClosedTrades: shadowTrades.length,
      shadowDecisionCount,
      pairedShadowTrades: shadowComparisons.length,
      openPositions,
      openShadowPositions,
    },
    metrics: {
      ...perf,
      totalPnlQuote: totalPnl(realTrades),
      recentWinRate,
      recentPnlQuote,
      shadowWinRate: winRate(shadowTrades),
      shadowVsActualAvgSlippageQuote: shadowSlippage,
      maxLossStreak: lossStreak,
    },
    byStrategy: scores
      .filter(
        (score) =>
          score.trades > 0 || score.score !== 0 || score.lossStreak > 0,
      )
      .map((score) => ({
        strategyId: score.strategyId,
        trades: score.trades,
        winRate: score.winRate,
        totalPnlQuote: score.totalPnlQuote,
        avgPnlQuote: score.avgPnlQuote,
        score: score.score,
        lossStreak: score.lossStreak,
        recommendation: strategyRecommendation(score, config.guardian),
      }))
      .sort(
        (a, b) =>
          a.recommendation.localeCompare(b.recommendation) || b.score - a.score,
      ),
    findings,
    recommendedAdjustments: {
      recommendedMode,
      pauseLive: recommendedMode !== 'live_manual_approval' || hardRisk,
      positionSizeMultiplier,
      maxQuotePerTrade: Math.max(
        1,
        Math.round(config.quotePerTrade * positionSizeMultiplier * 100) / 100,
      ),
      reasons,
    },
    validations: {
      enoughPaperData,
      enoughShadowData,
      enoughDataForTestnet: qualityPositive,
      enoughDataForLiveManual: liveReviewReady,
      canIncreaseRisk: qualityPositive && !warningRisk && !hardRisk,
    },
    shadowComparisons,
  }
}

function numberFromRecord(
  row: Record<string, unknown>,
  key: string,
): number | null {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringFromRecord(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function isoFromValue(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function isoFromRecord(
  row: Record<string, unknown>,
  key: string,
): string | null {
  return isoFromValue(row[key])
}

function booleanFromRecord(
  row: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = row[key]
  return typeof value === 'boolean' ? value : null
}

function roundQuote(value: number): number {
  return Math.max(1, Math.round(value * 100) / 100)
}

function learningPolicyFromSettings(
  settingsDemoTrading: unknown,
): LearningPolicy {
  const dt =
    settingsDemoTrading &&
    typeof settingsDemoTrading === 'object' &&
    !Array.isArray(settingsDemoTrading)
      ? (settingsDemoTrading as Record<string, unknown>)
      : {}
  const raw =
    dt.learningPolicy &&
    typeof dt.learningPolicy === 'object' &&
    !Array.isArray(dt.learningPolicy)
      ? (dt.learningPolicy as Record<string, unknown>)
      : {}
  const autoApplyModes = Array.isArray(raw.autoApplyModes)
    ? raw.autoApplyModes.filter(
        (mode): mode is 'paper_trade' | 'testnet_execute' =>
          mode === 'paper_trade' || mode === 'testnet_execute',
      )
    : DEFAULT_LEARNING_POLICY.autoApplyModes
  return {
    enabled:
      typeof raw.enabled === 'boolean'
        ? raw.enabled
        : DEFAULT_LEARNING_POLICY.enabled,
    autoApplyModes: autoApplyModes.length
      ? autoApplyModes
      : DEFAULT_LEARNING_POLICY.autoApplyModes,
    candidateMinBacktestFolds:
      typeof raw.candidateMinBacktestFolds === 'number' &&
      Number.isFinite(raw.candidateMinBacktestFolds)
        ? Math.max(1, Math.floor(raw.candidateMinBacktestFolds))
        : DEFAULT_LEARNING_POLICY.candidateMinBacktestFolds,
    stabilityGate: 'conservative',
    livePromotionRequiresApproval:
      typeof raw.livePromotionRequiresApproval === 'boolean'
        ? raw.livePromotionRequiresApproval
        : DEFAULT_LEARNING_POLICY.livePromotionRequiresApproval,
  }
}

function learningCandidateStatusFromValue(
  value: unknown,
): LearningCandidateStatus {
  if (
    value === 'proposed' ||
    value === 'paper_applied' ||
    value === 'testnet_applied' ||
    value === 'testnet_ready' ||
    value === 'live_review_ready' ||
    value === 'rejected' ||
    value === 'expired'
  )
    return value
  return 'proposed'
}

function learningCandidateFromRecord(
  row: Record<string, unknown>,
): LearningCandidate | null {
  if (row.kind !== SR_KIND_LEARNING_CANDIDATE) return null
  const id = stringFromRecord(row, 'id')
  const fingerprint = stringFromRecord(row, 'fingerprint')
  const createdAt = stringFromRecord(row, 'createdAt')
  const updatedAt = stringFromRecord(row, 'updatedAt') ?? createdAt
  if (!id || !fingerprint || !createdAt || !updatedAt) return null
  const configPatch =
    row.configPatch &&
    typeof row.configPatch === 'object' &&
    !Array.isArray(row.configPatch)
      ? (row.configPatch as LearningConfigPatch)
      : {}
  const strategyOverrides = Array.isArray(row.strategyOverrides)
    ? row.strategyOverrides
        .map((override) =>
          override && typeof override === 'object' && !Array.isArray(override)
            ? (override as Partial<LearningStrategyOverridePatch>)
            : null,
        )
        .filter(
          (override): override is Partial<LearningStrategyOverridePatch> =>
            Boolean(override?.strategyId && override.overrideAction),
        )
        .map((override): LearningStrategyOverridePatch => {
          const overrideAction: StrategyOverrideMode =
            override.overrideAction === 'disabled' ? 'disabled' : 'reduce_size'
          return {
            strategyId: String(override.strategyId),
            overrideAction,
            multiplier:
              typeof override.multiplier === 'number'
                ? override.multiplier
                : null,
            reason:
              typeof override.reason === 'string'
                ? override.reason
                : 'Learning candidate override.',
          }
        })
    : []
  const metrics =
    row.metrics &&
    typeof row.metrics === 'object' &&
    !Array.isArray(row.metrics)
      ? (row.metrics as Record<string, unknown>)
      : {}
  const validation =
    row.validation &&
    typeof row.validation === 'object' &&
    !Array.isArray(row.validation)
      ? (row.validation as Record<string, unknown>)
      : {}
  const promotion =
    row.promotion &&
    typeof row.promotion === 'object' &&
    !Array.isArray(row.promotion)
      ? (row.promotion as Record<string, unknown>)
      : {}
  const eligibleFor =
    promotion.eligibleFor === 'testnet_review' ||
    promotion.eligibleFor === 'live_review'
      ? promotion.eligibleFor
      : 'paper'
  return {
    kind: SR_KIND_LEARNING_CANDIDATE,
    id,
    status: learningCandidateStatusFromValue(row.status),
    source: 'decision_quality',
    createdAt,
    updatedAt,
    appliedAt: isoFromRecord(row, 'appliedAt'),
    expiresAt: isoFromRecord(row, 'expiresAt'),
    fingerprint,
    modeAtCreation: stringFromRecord(row, 'modeAtCreation') ?? 'paper_trade',
    reason: stringFromRecord(row, 'reason') ?? 'Learning candidate.',
    configPatch,
    strategyOverrides,
    metrics: {
      closedTrades: numberFromRecord(metrics, 'closedTrades') ?? 0,
      totalPnlQuote: numberFromRecord(metrics, 'totalPnlQuote') ?? 0,
      profitFactor: numberFromRecord(metrics, 'profitFactor') ?? 0,
      winRate: numberFromRecord(metrics, 'winRate') ?? 0,
      recentPnlQuote: numberFromRecord(metrics, 'recentPnlQuote') ?? 0,
      maxDrawdown: numberFromRecord(metrics, 'maxDrawdown') ?? 0,
      maxLossStreak: numberFromRecord(metrics, 'maxLossStreak') ?? 0,
    },
    validation: {
      method: 'closed_trade_evidence',
      minBacktestFolds:
        numberFromRecord(validation, 'minBacktestFolds') ??
        DEFAULT_LEARNING_POLICY.candidateMinBacktestFolds,
      passed: booleanFromRecord(validation, 'passed') ?? false,
      reason:
        stringFromRecord(validation, 'reason') ??
        'Candidate was reconstructed from persisted state.',
    },
    promotion: {
      eligibleFor,
      requiresApproval:
        booleanFromRecord(promotion, 'requiresApproval') ?? true,
    },
  }
}

function loadLearningCandidates(rows: Array<SRRow>): Array<LearningCandidate> {
  return rows
    .map((row) => learningCandidateFromRecord(row))
    .filter((row): row is LearningCandidate => Boolean(row))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
}

function learningBaseQuote(
  demoTrading: Record<string, unknown>,
  currentQuote: number,
): number {
  const learningState =
    demoTrading.learning &&
    typeof demoTrading.learning === 'object' &&
    !Array.isArray(demoTrading.learning)
      ? (demoTrading.learning as Record<string, unknown>)
      : {}
  return numberFromRecord(learningState, 'baseQuotePerTrade') ?? currentQuote
}

function learningFingerprint(input: {
  status: LearningCandidateStatus
  configPatch: LearningConfigPatch
  strategyOverrides: Array<LearningStrategyOverridePatch>
  promotion: LearningCandidate['promotion']
}): string {
  return JSON.stringify({
    status: input.status,
    configPatch: input.configPatch,
    strategyOverrides: [...input.strategyOverrides].sort((a, b) =>
      a.strategyId.localeCompare(b.strategyId),
    ),
    promotion: input.promotion,
  })
}

function learningStabilityAssessment(
  report: DecisionQualityReport,
  trades: Array<TradeLogEntry>,
  quotePerTrade: number,
): LearningStabilityAssessment {
  const ordered = chronological(trades)
  const firstClosedAt = ordered[0]?.closedAt
  const lastClosedAt = ordered[ordered.length - 1]?.closedAt
  const evidenceDays =
    firstClosedAt && lastClosedAt
      ? Math.max(
          0,
          (new Date(lastClosedAt).getTime() -
            new Date(firstClosedAt).getTime()) /
            86_400_000,
        )
      : 0
  const maxDrawdownLimit = quotePerTrade * 2
  const hasCriticalFinding = report.findings.some(
    (finding) => finding.severity === 'critical',
  )
  const reasons: Array<string> = []
  if (ordered.length < 30) reasons.push('needs at least 30 closed trades')
  if (evidenceDays < 14) reasons.push('needs at least 14 days of evidence')
  if (report.metrics.profitFactor < 1.3)
    reasons.push('profit factor must be at least 1.30')
  if (report.metrics.totalPnlQuote <= 0)
    reasons.push('net realized PnL must be positive')
  if (report.metrics.maxDrawdown > maxDrawdownLimit)
    reasons.push('max drawdown exceeds 2x quote size')
  if (hasCriticalFinding)
    reasons.push('critical decision-quality finding active')
  return {
    passed: reasons.length === 0,
    closedTrades: ordered.length,
    evidenceDays,
    profitFactor: report.metrics.profitFactor,
    totalPnlQuote: report.metrics.totalPnlQuote,
    maxDrawdown: report.metrics.maxDrawdown,
    maxDrawdownLimit,
    hasCriticalFinding,
    reasons,
  }
}

function buildLearningCandidate(input: {
  db: FinanceDatabase
  report: DecisionQualityReport
  policy: LearningPolicy
  stability: LearningStabilityAssessment
}): LearningCandidate | null {
  const settings = input.db.settings as Record<string, unknown>
  const dt = (
    settings.demoTrading &&
    typeof settings.demoTrading === 'object' &&
    !Array.isArray(settings.demoTrading)
      ? { ...(settings.demoTrading as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>
  const config = resolveEngineConfig(dt)
  const mode =
    typeof settings.tradingMode === 'string'
      ? settings.tradingMode
      : 'paper_trade'
  const now = new Date().toISOString()
  const strategyOverrides = input.report.byStrategy
    .map((strategy) => {
      const target = targetOverrideForRecommendation(strategy.recommendation)
      if (!target) return null
      return {
        strategyId: strategy.strategyId,
        overrideAction: target.overrideAction,
        multiplier: target.multiplier,
        reason: target.reason,
      }
    })
    .filter(
      (override): override is LearningStrategyOverridePatch =>
        override !== null,
    )

  if (input.stability.passed) {
    const status: LearningCandidateStatus =
      mode === 'testnet_execute' && input.report.validations.enoughShadowData
        ? 'live_review_ready'
        : 'testnet_ready'
    const promotion: LearningCandidate['promotion'] = {
      eligibleFor:
        status === 'live_review_ready' ? 'live_review' : 'testnet_review',
      requiresApproval: true,
    }
    const configPatch: LearningConfigPatch = {}
    const fingerprint = learningFingerprint({
      status,
      configPatch,
      strategyOverrides: [],
      promotion,
    })
    return {
      kind: SR_KIND_LEARNING_CANDIDATE,
      id: `learning_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status,
      source: 'decision_quality',
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
      expiresAt: addDaysIso(now, 14),
      fingerprint,
      modeAtCreation: mode,
      reason:
        status === 'live_review_ready'
          ? 'Conservative testnet stability gate passed; ready for manual live review.'
          : 'Conservative paper stability gate passed; ready for explicit testnet review.',
      configPatch,
      strategyOverrides: [],
      metrics: {
        closedTrades: input.report.sample.realClosedTrades,
        totalPnlQuote: input.report.metrics.totalPnlQuote,
        profitFactor: input.report.metrics.profitFactor,
        winRate: input.report.metrics.winRate,
        recentPnlQuote: input.report.metrics.recentPnlQuote,
        maxDrawdown: input.report.metrics.maxDrawdown,
        maxLossStreak: input.report.metrics.maxLossStreak,
      },
      validation: {
        method: 'closed_trade_evidence',
        minBacktestFolds: input.policy.candidateMinBacktestFolds,
        passed: true,
        reason: 'Conservative stability gate passed on closed-trade evidence.',
      },
      promotion,
    }
  }

  if (input.report.sample.realClosedTrades < 3) return null

  const baseQuote = learningBaseQuote(dt, config.quotePerTrade)
  const recommendedQuote = roundQuote(
    baseQuote * input.report.recommendedAdjustments.positionSizeMultiplier,
  )
  const configPatch: LearningConfigPatch = {}
  if (recommendedQuote < config.quotePerTrade) {
    configPatch.quotePerTrade = recommendedQuote
  }

  if (!configPatch.quotePerTrade && strategyOverrides.length === 0) return null

  const promotion: LearningCandidate['promotion'] = {
    eligibleFor: 'paper',
    requiresApproval: false,
  }
  const fingerprint = learningFingerprint({
    status: 'proposed',
    configPatch,
    strategyOverrides,
    promotion,
  })
  return {
    kind: SR_KIND_LEARNING_CANDIDATE,
    id: `learning_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'proposed',
    source: 'decision_quality',
    createdAt: now,
    updatedAt: now,
    appliedAt: null,
    expiresAt: addDaysIso(now, 7),
    fingerprint,
    modeAtCreation: mode,
    reason:
      'Closed-trade evidence found weak decision quality; candidate only reduces engine risk (smaller size and/or strategy de-weighting), never increases it.',
    configPatch,
    strategyOverrides,
    metrics: {
      closedTrades: input.report.sample.realClosedTrades,
      totalPnlQuote: input.report.metrics.totalPnlQuote,
      profitFactor: input.report.metrics.profitFactor,
      winRate: input.report.metrics.winRate,
      recentPnlQuote: input.report.metrics.recentPnlQuote,
      maxDrawdown: input.report.metrics.maxDrawdown,
      maxLossStreak: input.report.metrics.maxLossStreak,
    },
    validation: {
      method: 'closed_trade_evidence',
      minBacktestFolds: input.policy.candidateMinBacktestFolds,
      passed: true,
      reason:
        'Risk-reduction candidate based on observed closed-trade losses; it cannot increase quote size or enable live risk.',
    },
    promotion,
  }
}

function upsertLearningCandidate(
  db: FinanceDatabase,
  candidate: LearningCandidate,
): LearningCandidate {
  const rows = db.strategy_results as Array<SRRow>
  const candidates = loadLearningCandidates(rows)
  const duplicate = [...candidates]
    .reverse()
    .find(
      (existing) =>
        existing.fingerprint === candidate.fingerprint &&
        existing.status === candidate.status,
    )
  if (duplicate) return duplicate
  const others = rows.filter((row) => row.kind !== SR_KIND_LEARNING_CANDIDATE)
  const nextCandidates = [...candidates, candidate].slice(
    -LEARNING_CANDIDATE_CAP,
  )
  db.strategy_results = [...others, ...nextCandidates] as never
  db.updatedAt = new Date().toISOString()
  writeFinanceStore(db)
  appendAuditLog('learning_candidate_created', {
    id: candidate.id,
    status: candidate.status,
    reason: candidate.reason,
    configPatch: candidate.configPatch,
    strategyOverrides: candidate.strategyOverrides,
  })
  return candidate
}

function updateLearningCandidateStatus(
  id: string,
  status: LearningCandidateStatus,
): LearningCandidate | null {
  const db = readFinanceStore()
  const rows = db.strategy_results as Array<SRRow>
  const candidates = loadLearningCandidates(rows)
  const target = candidates.find((candidate) => candidate.id === id)
  if (!target) return null
  const now = new Date().toISOString()
  const updated: LearningCandidate = {
    ...target,
    status,
    updatedAt: now,
    appliedAt:
      status === 'paper_applied' || status === 'testnet_applied'
        ? now
        : target.appliedAt,
  }
  const others = rows.filter((row) => row.kind !== SR_KIND_LEARNING_CANDIDATE)
  db.strategy_results = [
    ...others,
    ...candidates.map((candidate) =>
      candidate.id === id ? updated : candidate,
    ),
  ] as never
  db.updatedAt = now
  writeFinanceStore(db)
  appendAuditLog('learning_candidate_status_updated', { id, status })
  return updated
}

export function learningReport(): LearningReport {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const policy = learningPolicyFromSettings(settings.demoTrading)
  const quality = decisionQualityReport()
  const trades = chronological(
    loadOfKind<TradeLogEntry>(
      db.strategy_results as Array<SRRow>,
      SR_KIND_TRADE,
    ).filter((trade) => !isShadow(trade)),
  )
  const config = resolveEngineConfig(settings.demoTrading)
  const stability = learningStabilityAssessment(
    quality,
    trades,
    config.quotePerTrade,
  )
  const candidates = loadLearningCandidates(db.strategy_results as Array<SRRow>)
  return {
    checkedAt: new Date().toISOString(),
    policy,
    stability,
    latestCandidate: candidates[candidates.length - 1] ?? null,
    candidates: [...candidates].reverse(),
  }
}

export function applyLearningCandidate(candidateId: string): {
  candidate: LearningCandidate | null
  applied: boolean
  skippedReason: string | null
} {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const candidates = loadLearningCandidates(db.strategy_results as Array<SRRow>)
  const candidate = candidates.find((item) => item.id === candidateId) ?? null
  if (!candidate) {
    return {
      candidate: null,
      applied: false,
      skippedReason: `learning candidate not found: ${candidateId}`,
    }
  }
  if (candidate.status !== 'proposed') {
    return {
      candidate,
      applied: false,
      skippedReason: `candidate status is ${candidate.status}`,
    }
  }
  if (
    settings.tradingMode !== 'paper_trade' &&
    settings.tradingMode !== 'testnet_execute'
  ) {
    return {
      candidate,
      applied: false,
      skippedReason:
        'learning candidates can auto-apply only in paper_trade or testnet_execute',
    }
  }

  const dt = (
    settings.demoTrading &&
    typeof settings.demoTrading === 'object' &&
    !Array.isArray(settings.demoTrading)
      ? { ...(settings.demoTrading as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>
  const currentConfig = resolveEngineConfig(dt)
  const baseQuote = learningBaseQuote(dt, currentConfig.quotePerTrade)
  if (typeof candidate.configPatch.quotePerTrade === 'number') {
    dt.quotePerTrade = Math.min(
      currentConfig.quotePerTrade,
      candidate.configPatch.quotePerTrade,
    )
  }
  dt.learningPolicy = learningPolicyFromSettings(dt)
  dt.learning = {
    ...(dt.learning &&
    typeof dt.learning === 'object' &&
    !Array.isArray(dt.learning)
      ? (dt.learning as Record<string, unknown>)
      : {}),
    baseQuotePerTrade: baseQuote,
    lastAppliedCandidateId: candidate.id,
    lastAppliedAt: new Date().toISOString(),
  }
  settings.demoTrading = dt
  db.settings = settings as FinanceDatabase['settings']
  db.updatedAt = new Date().toISOString()
  writeFinanceStore(db)

  for (const override of candidate.strategyOverrides) {
    setStrategyOverride({
      strategyId: override.strategyId,
      overrideAction: override.overrideAction,
      multiplier: override.multiplier ?? undefined,
      reason: `Learning candidate ${candidate.id}: ${override.reason}`,
    })
  }

  const appliedStatus: LearningCandidateStatus =
    settings.tradingMode === 'testnet_execute'
      ? 'testnet_applied'
      : 'paper_applied'
  const updated = updateLearningCandidateStatus(candidate.id, appliedStatus)
  appendAuditLog(
    appliedStatus === 'testnet_applied'
      ? 'learning_candidate_testnet_applied'
      : 'learning_candidate_paper_applied',
    {
      id: candidate.id,
      configPatch: candidate.configPatch,
      strategyOverrides: candidate.strategyOverrides,
    },
  )
  return {
    candidate: updated ?? candidate,
    applied: true,
    skippedReason: null,
  }
}

export function runLearningCycle(): LearningCycleResult {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const policy = learningPolicyFromSettings(settings.demoTrading)
  const quality = decisionQualityReport()
  const trades = chronological(
    loadOfKind<TradeLogEntry>(
      db.strategy_results as Array<SRRow>,
      SR_KIND_TRADE,
    ).filter((trade) => !isShadow(trade)),
  )
  const config = resolveEngineConfig(settings.demoTrading)
  const stability = learningStabilityAssessment(
    quality,
    trades,
    config.quotePerTrade,
  )
  const existingCandidates = loadLearningCandidates(
    db.strategy_results as Array<SRRow>,
  )
  let generatedCandidate: LearningCandidate | null = null
  let appliedCandidate: LearningCandidate | null = null
  let skippedReason: string | null = null

  if (!policy.enabled) {
    skippedReason = 'learning policy is disabled'
  } else {
    const candidate = buildLearningCandidate({
      db,
      report: quality,
      policy,
      stability,
    })
    if (!candidate) {
      skippedReason = 'no learning candidate generated from current evidence'
    } else {
      generatedCandidate = upsertLearningCandidate(db, candidate)
      const currentMode =
        settings.tradingMode === 'testnet_execute'
          ? 'testnet_execute'
          : 'paper_trade'
      const shouldAutoApply =
        generatedCandidate.status === 'proposed' &&
        policy.autoApplyModes.includes(currentMode)
      if (shouldAutoApply) {
        const applied = applyLearningCandidate(generatedCandidate.id)
        appliedCandidate = applied.applied ? applied.candidate : null
        if (appliedCandidate) generatedCandidate = appliedCandidate
        skippedReason = applied.skippedReason
      } else if (generatedCandidate.status === 'proposed') {
        skippedReason =
          'candidate requires paper_trade or testnet_execute auto-apply to be enabled'
      } else {
        skippedReason = 'candidate is a promotion recommendation only'
      }
    }
  }

  const candidates = loadLearningCandidates(
    readFinanceStore().strategy_results as Array<SRRow>,
  )
  return {
    checkedAt: new Date().toISOString(),
    policy,
    stability,
    latestCandidate:
      candidates.length > 0
        ? candidates[candidates.length - 1]
        : (generatedCandidate ??
          (existingCandidates.length > 0
            ? existingCandidates[existingCandidates.length - 1]
            : null)),
    candidates: [...candidates].reverse(),
    generatedCandidate,
    appliedCandidate,
    skippedReason,
  }
}

function qualityStatusFromRecord(
  row: Record<string, unknown>,
  key: string,
): DecisionQualityStatus {
  const value = stringFromRecord(row, key)
  if (
    value === 'insufficient_data' ||
    value === 'degraded' ||
    value === 'improving' ||
    value === 'ready_for_testnet' ||
    value === 'ready_for_manual_live_review'
  ) {
    return value
  }
  return 'insufficient_data'
}

function recommendedModeFromRecord(
  row: Record<string, unknown>,
  key: string,
): DecisionQualityReport['recommendedAdjustments']['recommendedMode'] {
  const value = stringFromRecord(row, key)
  if (
    value === 'paper_trade' ||
    value === 'testnet_execute' ||
    value === 'live_manual_approval'
  )
    return value
  return 'paper_trade'
}

function sameSafeguardApplication(
  a: SafeguardHistoryEntry,
  b: SafeguardHistoryEntry,
): boolean {
  return (
    a.status === b.status &&
    a.recommendedMode === b.recommendedMode &&
    a.appliedTradingMode === b.appliedTradingMode &&
    a.executionAccount === b.executionAccount &&
    a.liveTradingEnabled === b.liveTradingEnabled &&
    a.baseQuotePerTrade === b.baseQuotePerTrade &&
    a.appliedQuotePerTrade === b.appliedQuotePerTrade &&
    a.positionSizeMultiplier === b.positionSizeMultiplier &&
    a.pauseLive === b.pauseLive &&
    a.liveRecommendationDeferred === b.liveRecommendationDeferred
  )
}

function safeguardEntryFromRecord(
  row: Record<string, unknown>,
  fallbackSettings?: Record<string, unknown>,
): SafeguardHistoryEntry | null {
  const appliedAt =
    stringFromRecord(row, 'appliedAt') ?? stringFromRecord(row, 'lastAppliedAt')
  if (!appliedAt) return null
  const baseQuotePerTrade =
    numberFromRecord(row, 'baseQuotePerTrade') ??
    DEFAULT_ENGINE_CONFIG.quotePerTrade
  const appliedQuotePerTrade =
    numberFromRecord(row, 'appliedQuotePerTrade') ??
    numberFromRecord(row, 'quotePerTrade') ??
    baseQuotePerTrade
  return {
    id:
      stringFromRecord(row, 'id') ??
      stringFromRecord(row, 'lastHistoryId') ??
      `safeguard_${new Date(appliedAt).getTime() || Date.now()}`,
    appliedAt,
    status: qualityStatusFromRecord(row, 'status'),
    recommendedMode: recommendedModeFromRecord(row, 'recommendedMode'),
    appliedTradingMode:
      stringFromRecord(row, 'appliedTradingMode') ??
      stringFromRecord(row, 'tradingMode') ??
      (typeof fallbackSettings?.tradingMode === 'string'
        ? fallbackSettings.tradingMode
        : 'paper_trade'),
    executionAccount:
      stringFromRecord(row, 'executionAccount') ??
      (typeof fallbackSettings?.executionAccount === 'string'
        ? fallbackSettings.executionAccount
        : 'paper'),
    liveTradingEnabled:
      booleanFromRecord(row, 'liveTradingEnabled') ??
      (typeof fallbackSettings?.liveTradingEnabled === 'boolean'
        ? fallbackSettings.liveTradingEnabled
        : false),
    baseQuotePerTrade,
    previousQuotePerTrade:
      numberFromRecord(row, 'previousQuotePerTrade') ?? appliedQuotePerTrade,
    appliedQuotePerTrade,
    positionSizeMultiplier:
      numberFromRecord(row, 'positionSizeMultiplier') ?? 1,
    pauseLive: booleanFromRecord(row, 'pauseLive') ?? true,
    liveRecommendationDeferred:
      booleanFromRecord(row, 'liveRecommendationDeferred') ?? false,
    reasonSummary:
      stringFromRecord(row, 'reasonSummary') ??
      'Applied decision-quality safeguards.',
  }
}

function normalizeSafeguardHistory(
  value: unknown,
): Array<SafeguardHistoryEntry> {
  if (!Array.isArray(value)) return []
  return value
    .map((row) =>
      row && typeof row === 'object' && !Array.isArray(row)
        ? safeguardEntryFromRecord(row as Record<string, unknown>)
        : null,
    )
    .filter((row): row is SafeguardHistoryEntry => Boolean(row))
    .sort(
      (a, b) =>
        new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime(),
    )
}

export function safeguardHistory(limit = 10): Array<SafeguardHistoryEntry> {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const dt =
    settings.demoTrading && typeof settings.demoTrading === 'object'
      ? (settings.demoTrading as Record<string, unknown>)
      : {}
  const safeguards =
    dt.safeguards && typeof dt.safeguards === 'object'
      ? (dt.safeguards as Record<string, unknown>)
      : {}
  const history = normalizeSafeguardHistory(safeguards.history)
  const latest = safeguardEntryFromRecord(safeguards, settings)
  if (
    latest &&
    !history.some(
      (row) => row.id === latest.id || sameSafeguardApplication(row, latest),
    )
  ) {
    history.push(latest)
  }
  return history
    .sort(
      (a, b) =>
        new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    )
    .slice(0, Math.max(1, Math.min(Math.floor(limit), SAFEGUARD_HISTORY_CAP)))
}

export function strategyCatalog(): Array<{
  id: string
  name: string
  description: string
}> {
  return STRATEGIES.map((strategy) => ({
    id: strategy.id,
    name: strategy.name,
    description: strategy.description,
  }))
}

function overrideModeFromRecord(
  row: Record<string, unknown>,
): StrategyOverrideMode | null {
  const value = stringFromRecord(row, 'mode')
  if (value === 'disabled' || value === 'reduce_size') return value
  return null
}

function normalizeMultiplier(value: unknown, fallback = 0.5): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(0.1, Math.min(0.9, Math.round(numeric * 100) / 100))
}

function daysFromValue(value: unknown, fallback: number): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : fallback
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(1, Math.min(90, Math.floor(numeric)))
}

function addDaysIso(fromIso: string, days: number): string {
  return new Date(
    new Date(fromIso).getTime() + days * 24 * 60 * 60 * 1000,
  ).toISOString()
}

function clampReviewBeforeExpiry(
  reviewAt: string | null,
  expiresAt: string | null,
): string | null {
  if (!reviewAt || !expiresAt) return reviewAt
  return Date.parse(reviewAt) > Date.parse(expiresAt) ? expiresAt : reviewAt
}

function strategyOverrideExpired(
  override: StrategyOverride,
  nowMs = Date.now(),
): boolean {
  if (!override.expiresAt) return false
  const expiresAtMs = Date.parse(override.expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs
}

function resolveStrategyOverrideDates(
  input: {
    reviewAt?: unknown
    expiresAt?: unknown
    reviewAfterDays?: unknown
    expiresAfterDays?: unknown
  },
  existing: StrategyOverride | null,
  now: string,
): { reviewAt: string | null; expiresAt: string | null } {
  const expiresAt =
    isoFromValue(input.expiresAt) ??
    (input.expiresAfterDays == null
      ? (existing?.expiresAt ??
        addDaysIso(now, DEFAULT_STRATEGY_OVERRIDE_EXPIRY_DAYS))
      : addDaysIso(
          now,
          daysFromValue(
            input.expiresAfterDays,
            DEFAULT_STRATEGY_OVERRIDE_EXPIRY_DAYS,
          ),
        ))
  const rawReviewAt =
    isoFromValue(input.reviewAt) ??
    (input.reviewAfterDays == null
      ? (existing?.reviewAt ??
        addDaysIso(now, DEFAULT_STRATEGY_OVERRIDE_REVIEW_DAYS))
      : addDaysIso(
          now,
          daysFromValue(
            input.reviewAfterDays,
            DEFAULT_STRATEGY_OVERRIDE_REVIEW_DAYS,
          ),
        ))
  return {
    reviewAt: clampReviewBeforeExpiry(rawReviewAt, expiresAt),
    expiresAt,
  }
}

function strategyOverrideFromRecord(
  row: Record<string, unknown>,
): StrategyOverride | null {
  const strategyId = stringFromRecord(row, 'strategyId')
  const mode = overrideModeFromRecord(row)
  if (!strategyId || !mode || !getStrategy(strategyId)) return null
  const now = new Date().toISOString()
  return {
    id: stringFromRecord(row, 'id') ?? `override_${strategyId}_${Date.now()}`,
    strategyId,
    mode,
    multiplier:
      mode === 'reduce_size' ? normalizeMultiplier(row.multiplier) : 0,
    reason: stringFromRecord(row, 'reason') ?? 'Manual strategy override.',
    createdAt: stringFromRecord(row, 'createdAt') ?? now,
    updatedAt: stringFromRecord(row, 'updatedAt') ?? now,
    reviewAt: isoFromRecord(row, 'reviewAt'),
    expiresAt: isoFromRecord(row, 'expiresAt'),
    source: 'manual',
  }
}

function strategyOverrideHistoryFromRecord(
  row: Record<string, unknown>,
): StrategyOverrideHistoryEntry | null {
  const strategyId = stringFromRecord(row, 'strategyId')
  const at = stringFromRecord(row, 'at')
  const action = stringFromRecord(row, 'action')
  if (!strategyId || !at || !getStrategy(strategyId)) return null
  if (
    action !== 'disabled' &&
    action !== 'reduced_size' &&
    action !== 'cleared' &&
    action !== 'updated'
  )
    return null
  const previousMode = stringFromRecord(row, 'previousMode')
  const mode = stringFromRecord(row, 'mode')
  return {
    id:
      stringFromRecord(row, 'id') ??
      `override_history_${strategyId}_${new Date(at).getTime() || Date.now()}`,
    strategyId,
    action,
    previousMode:
      previousMode === 'disabled' || previousMode === 'reduce_size'
        ? previousMode
        : null,
    mode: mode === 'disabled' || mode === 'reduce_size' ? mode : null,
    previousMultiplier: numberFromRecord(row, 'previousMultiplier'),
    multiplier: numberFromRecord(row, 'multiplier'),
    previousReviewAt: isoFromRecord(row, 'previousReviewAt'),
    reviewAt: isoFromRecord(row, 'reviewAt'),
    previousExpiresAt: isoFromRecord(row, 'previousExpiresAt'),
    expiresAt: isoFromRecord(row, 'expiresAt'),
    reason: stringFromRecord(row, 'reason') ?? 'Manual strategy override.',
    at,
    activeOverrideId: stringFromRecord(row, 'activeOverrideId'),
  }
}

function normalizeStrategyOverrideState(value: unknown): StrategyOverrideState {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const activeRows = Array.isArray(source.active) ? source.active : []
  const historyRows = Array.isArray(source.history) ? source.history : []
  const byStrategy = new Map<string, StrategyOverride>()
  const nowMs = Date.now()
  for (const row of activeRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const override = strategyOverrideFromRecord(row as Record<string, unknown>)
    if (override && !strategyOverrideExpired(override, nowMs))
      byStrategy.set(override.strategyId, override)
  }
  const history = historyRows
    .map((row) =>
      row && typeof row === 'object' && !Array.isArray(row)
        ? strategyOverrideHistoryFromRecord(row as Record<string, unknown>)
        : null,
    )
    .filter((row): row is StrategyOverrideHistoryEntry => Boolean(row))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-STRATEGY_OVERRIDE_HISTORY_CAP)
  return {
    active: [...byStrategy.values()].sort((a, b) =>
      a.strategyId.localeCompare(b.strategyId),
    ),
    history,
  }
}

function readStrategyOverrideState(
  settingsDemoTrading: unknown,
): StrategyOverrideState {
  const dt =
    settingsDemoTrading &&
    typeof settingsDemoTrading === 'object' &&
    !Array.isArray(settingsDemoTrading)
      ? (settingsDemoTrading as Record<string, unknown>)
      : {}
  return normalizeStrategyOverrideState(dt.strategyOverrides)
}

export function strategyOverrideState(): StrategyOverrideState {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  return readStrategyOverrideState(settings.demoTrading)
}

function strategyOverrideActionFromValue(
  value: unknown,
): StrategyOverrideAction {
  if (value === 'disabled' || value === 'reduce_size' || value === 'clear')
    return value
  throw new Error('overrideAction must be disabled, reduce_size, or clear')
}

export function setStrategyOverride(input: {
  strategyId: string
  overrideAction: unknown
  multiplier?: unknown
  reason?: unknown
  reviewAt?: unknown
  expiresAt?: unknown
  reviewAfterDays?: unknown
  expiresAfterDays?: unknown
}): StrategyOverrideResult {
  const strategyId =
    typeof input.strategyId === 'string' ? input.strategyId.trim() : ''
  if (!getStrategy(strategyId))
    throw new Error(`Unknown strategy: ${strategyId || '(blank)'}`)
  const overrideAction = strategyOverrideActionFromValue(input.overrideAction)
  const reason =
    typeof input.reason === 'string' && input.reason.trim()
      ? input.reason.trim().slice(0, 240)
      : 'Manual strategy review.'
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const dt = (
    settings.demoTrading &&
    typeof settings.demoTrading === 'object' &&
    !Array.isArray(settings.demoTrading)
      ? { ...(settings.demoTrading as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>
  const state = normalizeStrategyOverrideState(dt.strategyOverrides)
  const activeByStrategy = new Map(
    state.active.map((override) => [override.strategyId, override]),
  )
  const existing = activeByStrategy.get(strategyId) ?? null
  const now = new Date().toISOString()

  let changed = false
  let message = 'No strategy override change needed.'
  let nextOverride: StrategyOverride | null = existing
  let historyEntry: StrategyOverrideHistoryEntry | null = null

  if (overrideAction === 'clear') {
    if (existing) {
      activeByStrategy.delete(strategyId)
      changed = true
      nextOverride = null
      message = `${strategyId} override cleared.`
      historyEntry = {
        id: `override_history_${strategyId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        strategyId,
        action: 'cleared',
        previousMode: existing.mode,
        mode: null,
        previousMultiplier:
          existing.mode === 'reduce_size' ? existing.multiplier : null,
        multiplier: null,
        previousReviewAt: existing.reviewAt,
        reviewAt: null,
        previousExpiresAt: existing.expiresAt,
        expiresAt: null,
        reason,
        at: now,
        activeOverrideId: existing.id,
      }
    }
  } else {
    const mode: StrategyOverrideMode = overrideAction
    const multiplier =
      mode === 'reduce_size' ? normalizeMultiplier(input.multiplier) : 0
    const dates = resolveStrategyOverrideDates(input, existing, now)
    const sameActive =
      existing &&
      existing.mode === mode &&
      existing.multiplier === multiplier &&
      existing.reason === reason &&
      existing.reviewAt === dates.reviewAt &&
      existing.expiresAt === dates.expiresAt
    if (sameActive) {
      message = `${strategyId} already has that active override.`
    } else {
      const id =
        existing?.id ??
        `override_${strategyId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      nextOverride = {
        id,
        strategyId,
        mode,
        multiplier,
        reason,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        reviewAt: dates.reviewAt,
        expiresAt: dates.expiresAt,
        source: 'manual',
      }
      activeByStrategy.set(strategyId, nextOverride)
      changed = true
      message =
        mode === 'disabled'
          ? `${strategyId} disabled until review.`
          : `${strategyId} size reduced to ${multiplier.toFixed(2)}x until review.`
      historyEntry = {
        id: `override_history_${strategyId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        strategyId,
        action: existing
          ? 'updated'
          : mode === 'disabled'
            ? 'disabled'
            : 'reduced_size',
        previousMode: existing?.mode ?? null,
        mode,
        previousMultiplier:
          existing?.mode === 'reduce_size' ? existing.multiplier : null,
        multiplier: mode === 'reduce_size' ? multiplier : null,
        previousReviewAt: existing?.reviewAt ?? null,
        reviewAt: dates.reviewAt,
        previousExpiresAt: existing?.expiresAt ?? null,
        expiresAt: dates.expiresAt,
        reason,
        at: now,
        activeOverrideId: id,
      }
    }
  }

  const history = historyEntry
    ? [...state.history, historyEntry].slice(-STRATEGY_OVERRIDE_HISTORY_CAP)
    : state.history
  const nextState: StrategyOverrideState = {
    active: [...activeByStrategy.values()]
      .filter((override) => !strategyOverrideExpired(override))
      .sort((a, b) => a.strategyId.localeCompare(b.strategyId)),
    history,
  }
  dt.strategyOverrides = nextState
  settings.demoTrading = dt
  writeFinanceStore(db)
  if (changed) {
    appendAuditLog('strategy_override_changed', {
      strategyId,
      overrideAction,
      mode: nextOverride?.mode ?? null,
      multiplier:
        nextOverride?.mode === 'reduce_size' ? nextOverride.multiplier : null,
      reviewAt: nextOverride?.reviewAt ?? null,
      expiresAt: nextOverride?.expiresAt ?? null,
      reason,
    })
  }
  return {
    changed,
    message,
    activeOverrides: nextState.active,
    history: [...nextState.history].reverse(),
  }
}

function targetOverrideForRecommendation(
  recommendation: StrategyQualityRecommendation,
): {
  overrideAction: StrategyOverrideMode
  multiplier: number | null
  reason: string
} | null {
  if (recommendation === 'disable_until_review') {
    return {
      overrideAction: 'disabled',
      multiplier: null,
      reason:
        'Decision validation recommended disabling this strategy until review.',
    }
  }
  if (recommendation === 'cooldown') {
    return {
      overrideAction: 'disabled',
      multiplier: null,
      reason:
        'Decision validation recommended cooldown after loss-streak evidence.',
    }
  }
  if (recommendation === 'reduce_size') {
    return {
      overrideAction: 'reduce_size',
      multiplier: 0.5,
      reason: 'Decision validation recommended reducing this strategy size.',
    }
  }
  return null
}

function existingOverrideIsAtLeastAsStrict(
  existing: StrategyOverride,
  target: { overrideAction: StrategyOverrideMode; multiplier: number | null },
): boolean {
  if (existing.mode === 'disabled') return true
  if (target.overrideAction === 'disabled') return false
  return existing.multiplier <= (target.multiplier ?? 0.5)
}

export function applyStrategyOverrideRecommendations(): {
  report: DecisionQualityReport
  result: StrategyOverrideRecommendationResult
} {
  const report = decisionQualityReport()
  const applied: Array<StrategyOverrideRecommendationApplication> = []
  const skipped: Array<StrategyOverrideRecommendationSkip> = []
  let activeByStrategy = new Map(
    strategyOverrideState().active.map((override) => [
      override.strategyId,
      override,
    ]),
  )

  for (const strategy of report.byStrategy) {
    const target = targetOverrideForRecommendation(strategy.recommendation)
    if (!target) {
      skipped.push({
        strategyId: strategy.strategyId,
        recommendation: strategy.recommendation,
        reason: 'strategy recommendation is keep',
      })
      continue
    }
    const existing = activeByStrategy.get(strategy.strategyId)
    if (existing && existingOverrideIsAtLeastAsStrict(existing, target)) {
      skipped.push({
        strategyId: strategy.strategyId,
        recommendation: strategy.recommendation,
        reason: `existing ${existing.mode} override is already as strict or stricter`,
      })
      continue
    }
    const update = setStrategyOverride({
      strategyId: strategy.strategyId,
      overrideAction: target.overrideAction,
      multiplier: target.multiplier ?? undefined,
      reason: target.reason,
    })
    activeByStrategy = new Map(
      update.activeOverrides.map((override) => [override.strategyId, override]),
    )
    applied.push({
      strategyId: strategy.strategyId,
      recommendation: strategy.recommendation,
      overrideAction: target.overrideAction,
      multiplier: target.multiplier,
      changed: update.changed,
      message: update.message,
    })
  }

  const finalState = strategyOverrideState()
  const result: StrategyOverrideRecommendationResult = {
    checkedAt: new Date().toISOString(),
    applied,
    skipped,
    activeOverrides: finalState.active,
    history: [...finalState.history].reverse(),
  }
  appendAuditLog('strategy_override_recommendations_applied', {
    appliedCount: applied.filter((item) => item.changed).length,
    skippedCount: skipped.length,
    checkedStrategies: report.byStrategy.length,
  })
  return { report, result }
}

/**
 * Applies the decision-quality report as concrete engine settings.
 *
 * This is deliberately conservative:
 * - it can reduce quote size, but never increases it;
 * - it never arms live trading as a side effect;
 * - repeated applies are idempotent because the original quote base is tracked.
 */
export function applyRecommendedSafeguards(): {
  report: DecisionQualityReport
  applied: AppliedSafeguards
} {
  const report = decisionQualityReport()
  const db = readFinanceStore()
  const appliedAt = new Date().toISOString()
  const settings = db.settings as Record<string, unknown>
  const dt = (
    settings.demoTrading && typeof settings.demoTrading === 'object'
      ? { ...(settings.demoTrading as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>
  const currentConfig = resolveEngineConfig(dt)
  const currentQuote = currentConfig.quotePerTrade
  const previousSafeguards =
    dt.safeguards && typeof dt.safeguards === 'object'
      ? (dt.safeguards as Record<string, unknown>)
      : {}
  const previousBase = numberFromRecord(previousSafeguards, 'baseQuotePerTrade')
  const previousApplied = numberFromRecord(
    previousSafeguards,
    'appliedQuotePerTrade',
  )
  const reusedPriorBase =
    previousBase !== null &&
    previousApplied !== null &&
    Math.abs(previousApplied - currentQuote) < 0.000001
  const baseQuote = reusedPriorBase ? previousBase : currentQuote
  const recommendedQuote = roundQuote(
    baseQuote * report.recommendedAdjustments.positionSizeMultiplier,
  )
  const appliedQuote = roundQuote(Math.min(currentQuote, recommendedQuote))

  dt.quotePerTrade = appliedQuote

  let targetMode = report.recommendedAdjustments.recommendedMode
  let liveRecommendationDeferred = false
  if (targetMode === 'live_manual_approval') {
    const liveAlreadyApproved = Boolean(
      db.settings.liveTradingEnabled && db.settings.liveBinanceApprovedAt,
    )
    if (!liveAlreadyApproved) {
      targetMode = 'testnet_execute'
      liveRecommendationDeferred = true
    }
  }

  if (targetMode === 'paper_trade') {
    db.settings.tradingMode = 'paper_trade'
    db.settings.executionAccount = 'paper'
    db.settings.liveTradingEnabled = false
  } else if (targetMode === 'testnet_execute') {
    db.settings.tradingMode = 'testnet_execute'
    db.settings.executionAccount = 'binance_testnet'
    db.settings.liveTradingEnabled = false
  } else {
    db.settings.tradingMode = 'live_manual_approval'
    db.settings.executionAccount = 'binance_live'
    db.settings.liveTradingEnabled = true
  }

  const applied: AppliedSafeguards = {
    tradingMode: db.settings.tradingMode,
    executionAccount: db.settings.executionAccount,
    liveTradingEnabled: db.settings.liveTradingEnabled,
    quotePerTrade: appliedQuote,
    baseQuotePerTrade: baseQuote,
    positionSizeMultiplier:
      report.recommendedAdjustments.positionSizeMultiplier,
    recommendedMode: report.recommendedAdjustments.recommendedMode,
    liveRecommendationDeferred,
  }
  const historyEntry: SafeguardHistoryEntry = {
    id: `safeguard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    appliedAt,
    status: report.status,
    recommendedMode: report.recommendedAdjustments.recommendedMode,
    appliedTradingMode: applied.tradingMode,
    executionAccount: applied.executionAccount,
    liveTradingEnabled: applied.liveTradingEnabled,
    baseQuotePerTrade: baseQuote,
    previousQuotePerTrade: currentQuote,
    appliedQuotePerTrade: appliedQuote,
    positionSizeMultiplier:
      report.recommendedAdjustments.positionSizeMultiplier,
    pauseLive: report.recommendedAdjustments.pauseLive,
    liveRecommendationDeferred,
    reasonSummary: report.recommendedAdjustments.reasons.join(' '),
  }
  const history = normalizeSafeguardHistory(previousSafeguards.history)
  const previousEntry =
    history.length > 0 ? history[history.length - 1] : undefined
  const shouldAppendHistory =
    !previousEntry || !sameSafeguardApplication(previousEntry, historyEntry)
  const nextHistory = (
    shouldAppendHistory ? [...history, historyEntry] : history
  ).slice(-SAFEGUARD_HISTORY_CAP)
  const latestHistoryEntry = shouldAppendHistory ? historyEntry : previousEntry
  dt.safeguards = {
    source: 'decision_quality',
    lastAppliedAt: appliedAt,
    lastHistoryId: latestHistoryEntry.id,
    status: report.status,
    recommendedMode: report.recommendedAdjustments.recommendedMode,
    pauseLive: report.recommendedAdjustments.pauseLive,
    positionSizeMultiplier:
      report.recommendedAdjustments.positionSizeMultiplier,
    baseQuotePerTrade: baseQuote,
    previousQuotePerTrade: currentQuote,
    appliedQuotePerTrade: appliedQuote,
    appliedTradingMode: applied.tradingMode,
    executionAccount: applied.executionAccount,
    liveTradingEnabled: applied.liveTradingEnabled,
    liveRecommendationDeferred,
    reasonSummary: historyEntry.reasonSummary,
    history: nextHistory,
  }
  settings.demoTrading = dt
  writeFinanceStore(db)
  appendAuditLog('recommended_safeguards_applied', { ...applied })
  return { report, applied }
}

export interface MonitorSymbol {
  symbol: string
  price: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  /** Weighted council net (conviction proxy); needs to clear the threshold to act. */
  net: number
  held: boolean
  unrealizedPnlQuote: number
}

export interface LiveMonitor {
  clientAvailable: boolean
  quoteBalance: number
  deployedQuote: number
  openUnrealizedPnlQuote: number
  equityQuote: number
  monitoring: Array<MonitorSymbol>
}

/**
 * Read-only live snapshot for the monitoring UI: current testnet balance, what
 * each watched symbol is doing right now (price + council signal), and open
 * position mark-to-market. Places no orders and ignores the trading-mode gate —
 * it just observes, so it works before the engine is armed too.
 */
export async function getLiveMonitor(): Promise<LiveMonitor> {
  const db = readFinanceStore()
  const config = resolveEngineConfig(
    (db.settings as Record<string, unknown>).demoTrading,
  )
  const rows = db.strategy_results as Array<SRRow>
  const mode = executionModeForTradingMode(db.settings.tradingMode) ?? 'paper'
  const positions = activePositionsForMode(
    loadOfKind<OpenPosition>(rows, SR_KIND_POSITION),
    mode,
  )
  const scores = loadScores(rows)
  const deployedQuote = positions.reduce((sum, p) => sum + p.entryQuote, 0)

  let client: BinanceExecutionClient | null = null
  if (mode === 'paper') {
    client = new PaperBinanceClient()
  } else if (mode === 'testnet') {
    client = createDemoClientFromEnv().client
  } else {
    client = createLiveClientFromEnv().client
  }
  if (!client) {
    return {
      clientAvailable: false,
      quoteBalance: 0,
      deployedQuote,
      openUnrealizedPnlQuote: 0,
      equityQuote: deployedQuote,
      monitoring: [],
    }
  }

  let quoteBalance = 0
  try {
    const acct = await client.getAccount()
    quoteBalance = acct.balances.find((b) => b.asset === 'USDT')?.free ?? 0
  } catch {
    /* balance read failed - leave 0 */
  }

  const monitoring: Array<MonitorSymbol> = []
  for (const symbol of config.symbols) {
    let price = 0
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let net = 0
    try {
      const candles = await client.getKlines(
        symbol,
        config.interval,
        Math.min(MARKET_WARMUP_TARGET_CANDLES, 1000),
      )
      price = candles.length
        ? candles[candles.length - 1].close
        : await client.getPrice(symbol)
      const members = STRATEGIES.filter((s) =>
        config.enabledStrategies.includes(s.id),
      ).map((s) => ({
        strategyId: s.id,
        decision: s.evaluate(candles),
        score: scores.get(s.id)?.score ?? 0,
      }))
      const vote = councilVote(members, config.councilThreshold)
      signal = vote.signal
      net = vote.net
    } catch {
      /* market data failed for this symbol - leave defaults */
    }
    const pos = positions.find((p) => p.symbol === symbol)
    monitoring.push({
      symbol,
      price,
      signal,
      net,
      held: Boolean(pos),
      unrealizedPnlQuote:
        pos && price > 0 ? price * pos.quantity - pos.entryQuote : 0,
    })
  }

  const openUnrealizedPnlQuote = monitoring.reduce(
    (sum, m) => sum + (m.held ? m.unrealizedPnlQuote : 0),
    0,
  )
  const positionsMarkValue = positions.reduce((sum, p) => {
    const m = monitoring.find((x) => x.symbol === p.symbol)
    return sum + (m && m.price > 0 ? m.price * p.quantity : p.entryQuote)
  }, 0)

  return {
    clientAvailable: true,
    quoteBalance,
    deployedQuote,
    openUnrealizedPnlQuote,
    equityQuote: quoteBalance + positionsMarkValue,
    monitoring,
  }
}
