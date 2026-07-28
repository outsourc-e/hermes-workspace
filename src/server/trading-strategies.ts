/**
 * Pluggable trading strategies + per-strategy scoring.
 *
 * A strategy is a pure function from a candle series to a signal. Strategies
 * carry no I/O and no state — the loop feeds them market data and records the
 * outcome of any trade they trigger, so formulas can be refined from the
 * accumulated score history without touching execution code.
 */

export type Signal = 'BUY' | 'SELL' | 'HOLD'

export interface Candle {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /**
   * Aggressor buy volume within the bar (Binance kline field index 9,
   * `takerBuyBaseAssetVolume`) — optional so existing cached candles and
   * fakes/fixtures without it still satisfy this type; strategies reading
   * it must treat `undefined` as "unavailable", not zero.
   */
  takerBuyVolume?: number
}

export interface StrategyDecision {
  signal: Signal
  /** 0..1 confidence used for ranking and (later) capital sizing. */
  confidence: number
  reason: string
}

export interface Strategy {
  id: string
  name: string
  description: string
  /** Minimum candles required before the strategy can emit a non-HOLD. */
  minCandles: number
  evaluate: (
    candles: Array<Candle>,
    params?: Record<string, number>,
  ) => StrategyDecision
}

const HOLD = (reason: string): StrategyDecision => ({
  signal: 'HOLD',
  confidence: 0,
  reason,
})

export function sma(values: Array<number>, period: number): number | null {
  if (values.length < period) return null
  let sum = 0
  for (let i = values.length - period; i < values.length; i++) sum += values[i]
  return sum / period
}

export function trueRange(candle: Candle, previousClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose),
  )
}

/** Simple trailing ATR over `period` true ranges. */
export function atr(candles: Array<Candle>, period: number): number | null {
  const roundedPeriod = Math.round(period)
  if (roundedPeriod <= 0 || candles.length < roundedPeriod + 1) return null
  let sum = 0
  for (let i = candles.length - roundedPeriod; i < candles.length; i++) {
    sum += trueRange(candles[i], candles[i - 1].close)
  }
  return sum / roundedPeriod
}

/**
 * Simplified single-pass ADX (Average Directional Index) — same trailing-
 * average style as atr()/rsi() above, not the textbook double-smoothed
 * Wilder ADX (which needs ~2x the candle history for little practical
 * difference at our timeframes). Higher = stronger trend, regardless of
 * direction; does not itself say which way the trend runs.
 */
export function adx(candles: Array<Candle>, period: number): number | null {
  const roundedPeriod = Math.round(period)
  if (roundedPeriod <= 0 || candles.length < roundedPeriod + 1) return null
  let sumPlusDM = 0
  let sumMinusDM = 0
  let sumTR = 0
  for (let i = candles.length - roundedPeriod; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high
    const downMove = candles[i - 1].low - candles[i].low
    if (upMove > downMove && upMove > 0) sumPlusDM += upMove
    if (downMove > upMove && downMove > 0) sumMinusDM += downMove
    sumTR += trueRange(candles[i], candles[i - 1].close)
  }
  if (sumTR <= 0) return 0
  const plusDI = (100 * sumPlusDM) / sumTR
  const minusDI = (100 * sumMinusDM) / sumTR
  const diSum = plusDI + minusDI
  return diSum <= 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / diSum
}

/**
 * Trend-STRENGTH gate (distinct from regimeAllowsLong's trend-DIRECTION
 * gate below) — fails open (true) when disabled or data is insufficient,
 * same convention as regimeAllowsLong.
 */
export function trendIsStrong(
  candles: Array<Candle>,
  period: number,
  threshold: number,
): boolean {
  if (period <= 0 || threshold <= 0) return true
  const value = adx(candles, period)
  return value == null ? true : value >= threshold
}

/** Wilder's RSI over `period` closes. Returns null if insufficient data. */
export function rsi(closes: Array<number>, period: number): number | null {
  if (closes.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  const avgGain = gain / period
  const avgLoss = loss / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/** SMA crossover: fast SMA over slow SMA → BUY; under → SELL. */
export const smaCrossoverStrategy: Strategy = {
  id: 'sma_crossover',
  name: 'SMA Crossover',
  description: 'Fast/slow simple-moving-average crossover trend follower.',
  minCandles: 21,
  evaluate(candles, params) {
    const fastP = Math.round(params?.fast ?? 9)
    const slowP = Math.round(params?.slow ?? 21)
    if (candles.length < slowP + 1) return HOLD('not enough candles')
    const closes = candles.map((c) => c.close)
    const prev = closes.slice(0, -1)
    const fastNow = sma(closes, fastP)
    const slowNow = sma(closes, slowP)
    const fastPrev = sma(prev, fastP)
    const slowPrev = sma(prev, slowP)
    if (
      fastNow == null ||
      slowNow == null ||
      fastPrev == null ||
      slowPrev == null
    ) {
      return HOLD('moving averages unavailable')
    }
    // Confidence from the *velocity* of the cross, not the spread: at the
    // crossover moment fast≈slow so the spread is ~0 by definition (the old
    // spread×50 formula kept this strategy at ~0 confidence forever). A fast
    // cross (spread swinging hard through zero) is a strong trend change; a
    // grazing cross is weak. Base 0.35 so a cross always gets a real vote.
    const spreadNow = (fastNow - slowNow) / slowNow
    const spreadPrev = (fastPrev - slowPrev) / slowPrev
    const velocity = Math.abs(spreadNow - spreadPrev)
    const confidence = Math.min(1, 0.35 + velocity * 150)
    if (fastPrev <= slowPrev && fastNow > slowNow) {
      return {
        signal: 'BUY',
        confidence,
        reason: `fast SMA(${fastP}) crossed above slow SMA(${slowP})`,
      }
    }
    if (fastPrev >= slowPrev && fastNow < slowNow) {
      return {
        signal: 'SELL',
        confidence,
        reason: `fast SMA(${fastP}) crossed below slow SMA(${slowP})`,
      }
    }
    return HOLD('no crossover')
  },
}

/**
 * RSI mean-reversion: oversold → BUY, overbought → SELL.
 *
 * Trend filter: mean reversion pays in ranges and bleeds in trends — in a
 * steady uptrend RSI camps overbought and its SELL votes cancel the council's
 * trend entries. When price sits beyond `trendBand` of the `trendPeriod` SMA,
 * the counter-trend vote is muted to HOLD (with-trend votes are unaffected).
 * Skipped when the window is shorter than `trendPeriod`; disable with
 * trendPeriod: 0.
 */
export const rsiReversionStrategy: Strategy = {
  id: 'rsi_reversion',
  name: 'RSI Mean Reversion',
  description:
    'Buys oversold and sells overbought RSI extremes, muted against strong trends.',
  minCandles: 15,
  evaluate(candles, params) {
    const period = Math.round(params?.period ?? 14)
    const low = params?.oversold ?? 30
    const high = params?.overbought ?? 70
    const trendPeriod = Math.round(params?.trendPeriod ?? 50)
    const trendBand = params?.trendBand ?? 0.02
    const closes = candles.map((c) => c.close)
    const value = rsi(closes, period)
    if (value == null) return HOLD('not enough candles for RSI')
    const trendSma = trendPeriod > 0 ? sma(closes, trendPeriod) : null
    const last = closes[closes.length - 1]
    const inUptrend = trendSma != null && last > trendSma * (1 + trendBand)
    const inDowntrend = trendSma != null && last < trendSma * (1 - trendBand)
    if (value <= low) {
      if (inDowntrend) {
        return HOLD(
          `RSI ${value.toFixed(1)} oversold but price ${(trendBand * 100).toFixed(0)}% below SMA(${trendPeriod}) — counter-trend BUY muted`,
        )
      }
      return {
        signal: 'BUY',
        confidence: Math.min(1, (low - value) / low + 0.2),
        reason: `RSI ${value.toFixed(1)} <= ${low} (oversold)`,
      }
    }
    if (value >= high) {
      if (inUptrend) {
        return HOLD(
          `RSI ${value.toFixed(1)} overbought but price ${(trendBand * 100).toFixed(0)}% above SMA(${trendPeriod}) — counter-trend SELL muted`,
        )
      }
      return {
        signal: 'SELL',
        confidence: Math.min(1, (value - high) / (100 - high) + 0.2),
        reason: `RSI ${value.toFixed(1)} >= ${high} (overbought)`,
      }
    }
    return HOLD(`RSI ${value.toFixed(1)} neutral`)
  },
}

/** Exponential moving average over the full series; returns the last value. */
export function ema(values: Array<number>, period: number): number | null {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let value = sma(values.slice(0, period), period)!
  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k)
  }
  return value
}

/** MACD line series (fast EMA − slow EMA) for the tail of the series. */
function macdSeries(
  closes: Array<number>,
  fast: number,
  slow: number,
): Array<number> {
  const out: Array<number> = []
  for (let end = slow; end <= closes.length; end++) {
    const window = closes.slice(0, end)
    const f = ema(window, fast)
    const s = ema(window, slow)
    if (f != null && s != null) out.push(f - s)
  }
  return out
}

/** MACD momentum: MACD line crossing its signal line. */
export const macdMomentumStrategy: Strategy = {
  id: 'macd_momentum',
  name: 'MACD Momentum',
  description: 'MACD(12,26) line crossing its 9-period signal line.',
  minCandles: 40,
  evaluate(candles, params) {
    const fast = Math.round(params?.fast ?? 12)
    const slow = Math.round(params?.slow ?? 26)
    const signalP = Math.round(params?.signal ?? 9)
    const closes = candles.map((c) => c.close)
    if (closes.length < slow + signalP + 2)
      return HOLD('not enough candles for MACD')
    const macd = macdSeries(closes, fast, slow)
    if (macd.length < signalP + 2) return HOLD('not enough MACD history')
    const signalNow = ema(macd, signalP)
    const signalPrev = ema(macd.slice(0, -1), signalP)
    const macdNow = macd[macd.length - 1]
    const macdPrev = macd[macd.length - 2]
    if (signalNow == null || signalPrev == null)
      return HOLD('signal line unavailable')
    const price = closes[closes.length - 1]
    const spread = Math.abs(macdNow - signalNow) / (price || 1)
    const confidence = Math.min(1, spread * 400 + 0.15)
    if (macdPrev <= signalPrev && macdNow > signalNow) {
      return {
        signal: 'BUY',
        confidence,
        reason: 'MACD crossed above signal line',
      }
    }
    if (macdPrev >= signalPrev && macdNow < signalNow) {
      return {
        signal: 'SELL',
        confidence,
        reason: 'MACD crossed below signal line',
      }
    }
    return HOLD('no MACD cross')
  },
}

/** Donchian-style breakout: close beyond the prior N-candle extreme. */
export const breakoutStrategy: Strategy = {
  id: 'breakout',
  name: 'Channel Breakout',
  description: 'Close breaking above/below the prior N-candle high/low.',
  minCandles: 22,
  evaluate(candles, params) {
    const lookback = Math.round(params?.lookback ?? 20)
    if (candles.length < lookback + 1) return HOLD('not enough candles')
    const prior = candles.slice(-lookback - 1, -1)
    const last = candles[candles.length - 1]
    const priorHigh = Math.max(...prior.map((c) => c.high))
    const priorLow = Math.min(...prior.map((c) => c.low))
    if (last.close > priorHigh) {
      const conf = Math.min(
        1,
        ((last.close - priorHigh) / priorHigh) * 100 + 0.25,
      )
      return {
        signal: 'BUY',
        confidence: conf,
        reason: `close ${last.close.toFixed(2)} broke ${lookback}-candle high ${priorHigh.toFixed(2)}`,
      }
    }
    if (last.close < priorLow) {
      const conf = Math.min(
        1,
        ((priorLow - last.close) / priorLow) * 100 + 0.25,
      )
      return {
        signal: 'SELL',
        confidence: conf,
        reason: `close ${last.close.toFixed(2)} broke ${lookback}-candle low ${priorLow.toFixed(2)}`,
      }
    }
    return HOLD('inside channel')
  },
}

/**
 * Trend pullback: in a rising long-SMA regime, buy only after price has pulled
 * back near the medium SMA and then recovers through a short trigger SMA. This
 * avoids raw breakout chasing while staying long-only. SELL is a defensive
 * trend-failure exit for positions this strategy owns.
 */
export const trendPullbackStrategy: Strategy = {
  id: 'trend_pullback',
  name: 'Trend Pullback',
  description:
    'Buys recovery from shallow pullbacks inside a rising SMA regime.',
  minCandles: 82,
  evaluate(candles, params) {
    const trendPeriod = Math.round(params?.trendPeriod ?? 80)
    const pullbackPeriod = Math.round(params?.pullbackPeriod ?? 20)
    const triggerPeriod = Math.round(params?.triggerPeriod ?? 5)
    const pullbackLookback = Math.round(params?.pullbackLookback ?? 8)
    const touchBand = params?.touchBand ?? 0.005
    const maxExtension = params?.maxExtension ?? 0.03
    const minTrendSlope = params?.minTrendSlope ?? 0.0005

    const needed = Math.max(
      trendPeriod + 1,
      pullbackPeriod + 1,
      triggerPeriod + 1,
    )
    if (candles.length < needed)
      return HOLD('not enough candles for trend pullback')

    const closes = candles.map((c) => c.close)
    const prevCloses = closes.slice(0, -1)
    const last = closes[closes.length - 1]
    const trendNow = sma(closes, trendPeriod)
    const trendPrev = sma(prevCloses, trendPeriod)
    const pullbackNow = sma(closes, pullbackPeriod)
    const triggerNow = sma(closes, triggerPeriod)
    const triggerPrev = sma(prevCloses, triggerPeriod)
    if (
      trendNow == null ||
      trendPrev == null ||
      pullbackNow == null ||
      triggerNow == null ||
      triggerPrev == null
    ) {
      return HOLD('trend pullback averages unavailable')
    }

    const trendSlope = (trendNow - trendPrev) / trendPrev
    const aboveTrend = last >= trendNow
    if (!aboveTrend) {
      return {
        signal: 'SELL',
        confidence: Math.min(1, ((trendNow - last) / trendNow) * 25 + 0.45),
        reason: `close ${last.toFixed(2)} below trend SMA(${trendPeriod}) ${trendNow.toFixed(2)}`,
      }
    }
    if (trendSlope < -minTrendSlope && last < pullbackNow) {
      return {
        signal: 'SELL',
        confidence: 0.55,
        reason: `trend SMA(${trendPeriod}) rolling over while price is below pullback SMA(${pullbackPeriod})`,
      }
    }
    if (trendSlope < minTrendSlope) {
      return HOLD(
        `trend SMA(${trendPeriod}) slope ${trendSlope.toFixed(4)} below threshold`,
      )
    }

    const recent = closes.slice(
      Math.max(0, closes.length - 1 - pullbackLookback),
      -1,
    )
    const pulledBack = recent.some(
      (close) => close <= pullbackNow * (1 + touchBand),
    )
    const recovered =
      last > triggerNow && closes[closes.length - 2] <= triggerPrev
    const stillNearPullback = last <= pullbackNow * (1 + maxExtension)
    if (pulledBack && recovered && stillNearPullback) {
      const recovery = Math.max(0, (last - triggerNow) / last)
      const trendBoost = Math.min(0.25, (trendSlope / minTrendSlope) * 0.05)
      const confidence = Math.min(1, 0.35 + recovery * 80 + trendBoost)
      return {
        signal: 'BUY',
        confidence,
        reason: `recovered above SMA(${triggerPeriod}) after pullback to SMA(${pullbackPeriod}) in rising SMA(${trendPeriod}) regime`,
      }
    }
    return HOLD('no qualifying trend pullback recovery')
  },
}

/**
 * Council-level regime gate for long entries: in a spot (long-only) book, BUY
 * entries are only worth taking while price holds above its long SMA — every
 * 2026 backtest bleeder was a long entry against a bear regime. Fails open
 * when history is shorter than `period` (mirrors live warm-up; callers must
 * feed ≥`period` closes for the gate to bite) or when `period` is 0/negative.
 * Exits are never gated.
 */
export function regimeAllowsLong(
  closes: Array<number>,
  period: number,
): boolean {
  if (period <= 0) return true
  const long = sma(closes, period)
  if (long == null) return true
  return closes[closes.length - 1] >= long
}

/**
 * Fibonacci-extension take-profit target: entry price plus (long) or minus
 * (short) the most recent swing's high-low range, scaled by extensionRatio
 * (161.8% is the standard convention). Simplified — a single swing window,
 * not a 3-point A-B-C retracement pattern. Shared by both engines, same
 * reuse pattern as atr()/rsi()/regimeAllowsLong() above.
 */
export function fibExtensionTarget(
  side: 'long' | 'short',
  entryPrice: number,
  candles: Array<Candle>,
  lookback: number,
  extensionRatio = 1.618,
): number | null {
  if (lookback <= 0 || candles.length < lookback) return null
  const window = candles.slice(-lookback)
  const swingRange =
    Math.max(...window.map((c) => c.high)) - Math.min(...window.map((c) => c.low))
  if (swingRange <= 0) return null
  return side === 'long'
    ? entryPrice + swingRange * extensionRatio
    : entryPrice - swingRange * extensionRatio
}

/**
 * Money-flow-volume cumulative sum (the Accumulation/Distribution Line).
 * Each candle contributes `((close-low)-(high-close))/(high-low) × volume` —
 * where within the bar's range the close landed, weighted by volume. Guards
 * the zero-range (high === low) case, which would otherwise divide by zero.
 */
export function accumulationDistributionLine(
  candles: Array<Candle>,
): Array<number> {
  const out: Array<number> = []
  let cumulative = 0
  for (const c of candles) {
    const range = c.high - c.low
    const moneyFlowMultiplier =
      range > 0 ? (c.close - c.low - (c.high - c.close)) / range : 0
    cumulative += moneyFlowMultiplier * c.volume
    out.push(cumulative)
  }
  return out
}

/**
 * Chaikin Oscillator: fast EMA minus slow EMA of the Accumulation/Distribution
 * Line, crossing zero. Volume-confirmed momentum — the only strategy in this
 * file that reads Candle.volume at all (every other strategy is pure price).
 * Confidence is normalized against recent average volume (not price), since
 * the oscillator's raw magnitude scales with each symbol's volume, not price.
 */
export const chaikinVolumeStrategy: Strategy = {
  id: 'chaikin_volume',
  name: 'Chaikin Volume Oscillator',
  description:
    'Volume-confirmed momentum: Chaikin Oscillator (EMA3−EMA10 of the accumulation/distribution line) crossing zero.',
  minCandles: 25,
  evaluate(candles, params) {
    const fast = Math.round(params?.fast ?? 3)
    const slow = Math.round(params?.slow ?? 10)
    if (candles.length < slow + 2)
      return HOLD('not enough candles for Chaikin oscillator')
    const adl = accumulationDistributionLine(candles)
    const fastNow = ema(adl, fast)
    const slowNow = ema(adl, slow)
    const fastPrev = ema(adl.slice(0, -1), fast)
    const slowPrev = ema(adl.slice(0, -1), slow)
    if (
      fastNow == null ||
      slowNow == null ||
      fastPrev == null ||
      slowPrev == null
    )
      return HOLD('Chaikin oscillator unavailable')
    const oscNow = fastNow - slowNow
    const oscPrev = fastPrev - slowPrev
    const recentVolumes = candles.slice(-slow).map((c) => c.volume)
    const avgVolume =
      recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length
    const scale = avgVolume > 0 ? Math.abs(oscNow) / avgVolume : 0
    const confidence = Math.min(1, scale * 0.5 + 0.2)
    if (oscPrev <= 0 && oscNow > 0) {
      return {
        signal: 'BUY',
        confidence,
        reason: 'Chaikin oscillator crossed above zero (accumulation)',
      }
    }
    if (oscPrev >= 0 && oscNow < 0) {
      return {
        signal: 'SELL',
        confidence,
        reason: 'Chaikin oscillator crossed below zero (distribution)',
      }
    }
    return HOLD('no Chaikin oscillator cross')
  },
}

/**
 * Keltner Channel breakout: close beyond an ATR-scaled band around an EMA
 * centerline. Same breakout structure as breakoutStrategy, but the band
 * width is volatility-adaptive (ATR-based) instead of a fixed N-candle
 * high/low — meant to produce fewer false breakouts in choppy conditions
 * where a fixed Donchian channel is already wide from a prior swing.
 */
export const keltnerChannelStrategy: Strategy = {
  id: 'keltner_channel',
  name: 'Keltner Channel Breakout',
  description:
    'Close breaking above/below an ATR-scaled band around the EMA — volatility-adaptive, unlike the fixed-lookback Donchian breakout.',
  minCandles: 22,
  evaluate(candles, params) {
    const period = Math.round(params?.period ?? 20)
    const multiplier = params?.multiplier ?? 2
    if (candles.length < period + 1) return HOLD('not enough candles')
    const closes = candles.map((c) => c.close)
    const center = ema(closes, period)
    const width = atr(candles, period)
    if (center == null || width == null)
      return HOLD('Keltner channel unavailable')
    const upper = center + width * multiplier
    const lower = center - width * multiplier
    const last = candles[candles.length - 1]
    if (last.close > upper) {
      const conf = Math.min(1, ((last.close - upper) / upper) * 100 + 0.25)
      return {
        signal: 'BUY',
        confidence: conf,
        reason: `close ${last.close.toFixed(2)} broke Keltner upper band ${upper.toFixed(2)}`,
      }
    }
    if (last.close < lower) {
      const conf = Math.min(1, ((lower - last.close) / lower) * 100 + 0.25)
      return {
        signal: 'SELL',
        confidence: conf,
        reason: `close ${last.close.toFixed(2)} broke Keltner lower band ${lower.toFixed(2)}`,
      }
    }
    return HOLD('inside Keltner channel')
  },
}

/**
 * Taker buy/sell imbalance: rolling fraction of volume from aggressor buys
 * vs. sells (Binance kline field `takerBuyBaseAssetVolume`), read directly —
 * "the signal is the order flow" rather than a price-derived indicator.
 * Coarser than a true tick-by-tick order-book-depth signal (candle-aggregated,
 * not live book state), but needs no new data collection: Binance already
 * returns this on every kline, at any interval, back through full history.
 * Averaged over `period` candles since any single bar's ratio is noisy.
 */
export const takerImbalanceStrategy: Strategy = {
  id: 'taker_imbalance',
  name: 'Taker Buy/Sell Imbalance',
  description:
    'Rolling aggressor buy-volume fraction vs. sell — persistent buy/sell pressure from raw order flow, not a price indicator.',
  minCandles: 21,
  evaluate(candles, params) {
    const period = Math.round(params?.period ?? 20)
    // Calibrated against real BTC 1h data (2026-07-28): a 20-candle rolling
    // taker-buy-share deviation from 0.5 has stdev ~0.024 and 90th-percentile
    // magnitude ~0.043 — 0.08 (the original guess) is close to the observed
    // max and essentially never fires. 0.02 sits just under 1 stdev.
    const threshold = params?.threshold ?? 0.02
    if (candles.length < period + 1) return HOLD('not enough candles')
    const window = candles.slice(-period)
    if (window.some((c) => c.takerBuyVolume == null))
      return HOLD('taker buy volume unavailable for this candle set')
    const takerBuy = window.reduce((s, c) => s + (c.takerBuyVolume ?? 0), 0)
    const totalVolume = window.reduce((s, c) => s + c.volume, 0)
    if (totalVolume <= 0) return HOLD('no volume in window')
    const deviation = takerBuy / totalVolume - 0.5
    // Real BTC 1h data: deviation stdev ~0.024, 90th-pct magnitude ~0.043.
    // Dividing by the theoretical max range (0.5) capped confidence at ~0.3
    // even at the largest deviations ever observed — a dead formula, same
    // bug class as sma_crossover's original near-zero-at-the-cross issue.
    // Scaled instead against the real distribution: confidence clears the
    // council's 0.6 threshold a bit past 1 stdev, not at a value the data
    // essentially never reaches.
    const confidence = Math.min(1, 0.2 + Math.abs(deviation) * 15)
    if (deviation > threshold) {
      return {
        signal: 'BUY',
        confidence,
        reason: `taker buy share ${(50 + deviation * 100).toFixed(1)}% over ${period}c (persistent buy pressure)`,
      }
    }
    if (deviation < -threshold) {
      return {
        signal: 'SELL',
        confidence,
        reason: `taker buy share ${(50 + deviation * 100).toFixed(1)}% over ${period}c (persistent sell pressure)`,
      }
    }
    return HOLD('no persistent taker imbalance')
  },
}

export const STRATEGIES: Array<Strategy> = [
  smaCrossoverStrategy,
  rsiReversionStrategy,
  macdMomentumStrategy,
  breakoutStrategy,
  trendPullbackStrategy,
  chaikinVolumeStrategy,
  keltnerChannelStrategy,
  takerImbalanceStrategy,
]

export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.id === id)
}

// ── Scoring ────────────────────────────────────────────────────────────────

export interface StrategyScore {
  strategyId: string
  trades: number
  wins: number
  losses: number
  totalPnlQuote: number
  /** Running score: +1 weighted by profit on a win, −1 weighted by loss. */
  score: number
  winRate: number
  avgPnlQuote: number
  /** Consecutive losses (reset on any win) — feeds the guardian cooldown. */
  lossStreak: number
  /** ISO timestamp while the strategy sits out after a loss streak. */
  cooldownUntil?: string | null
  updatedAt: string
  /**
   * Running average magnitude of winning/losing trades (quote currency).
   * Optional — older persisted scores predate this field; treat missing as
   * 0 and let it build up going forward (see applyTradeOutcome). Feeds
   * kellyFraction(); nothing reads these until kellySizingEnabled is on.
   */
  avgWinQuote?: number
  avgLossQuote?: number
}

export function emptyScore(strategyId: string): StrategyScore {
  return {
    strategyId,
    trades: 0,
    wins: 0,
    losses: 0,
    totalPnlQuote: 0,
    score: 0,
    winRate: 0,
    avgPnlQuote: 0,
    lossStreak: 0,
    cooldownUntil: null,
    updatedAt: new Date().toISOString(),
    avgWinQuote: 0,
    avgLossQuote: 0,
  }
}

/**
 * Fold a closed trade's realized PnL (in quote currency, e.g. USDT) into a
 * strategy's score. Profit adds a reward scaled by return; loss subtracts.
 */
export function applyTradeOutcome(
  score: StrategyScore,
  pnlQuote: number,
  entryQuote: number,
): StrategyScore {
  const trades = score.trades + 1
  const wins = score.wins + (pnlQuote > 0 ? 1 : 0)
  const losses = score.losses + (pnlQuote < 0 ? 1 : 0)
  const totalPnlQuote = score.totalPnlQuote + pnlQuote
  // Reward proportional to return-on-entry, clamped so one lucky trade can't
  // dominate; symmetric penalty on losses.
  const roi = entryQuote > 0 ? pnlQuote / entryQuote : 0
  const delta = Math.max(-1, Math.min(1, roi * 10))
  const nextScore = score.score + delta
  // Incremental running averages of win/loss magnitude, for kellyFraction().
  // Missing on older persisted scores — treat as 0 and let it build forward.
  const prevAvgWin = score.avgWinQuote ?? 0
  const prevAvgLoss = score.avgLossQuote ?? 0
  const avgWinQuote =
    pnlQuote > 0 ? prevAvgWin + (pnlQuote - prevAvgWin) / wins : prevAvgWin
  const avgLossQuote =
    pnlQuote < 0
      ? prevAvgLoss + (-pnlQuote - prevAvgLoss) / losses
      : prevAvgLoss
  return {
    strategyId: score.strategyId,
    trades,
    wins,
    losses,
    totalPnlQuote,
    score: nextScore,
    winRate: trades > 0 ? wins / trades : 0,
    avgPnlQuote: trades > 0 ? totalPnlQuote / trades : 0,
    lossStreak: pnlQuote < 0 ? score.lossStreak + 1 : 0,
    cooldownUntil: pnlQuote < 0 ? (score.cooldownUntil ?? null) : null,
    updatedAt: new Date().toISOString(),
    avgWinQuote,
    avgLossQuote,
  }
}

/**
 * Kelly-criterion bet fraction (concept from bbfamily/abu's ABuKellyPosition,
 * reimplemented clean-room): winRate - lossRate/payoffRatio, clamped to
 * [0, maxFraction]. avgLossQuote is a magnitude (pass positive); a strategy
 * with no edge or missing loss data safely returns 0, never a negative bet.
 */
export function kellyFraction(
  winRate: number,
  avgWinQuote: number,
  avgLossQuote: number,
  maxFraction = 0.25,
): number {
  if (avgLossQuote <= 0 || winRate <= 0 || winRate >= 1) return 0
  const payoffRatio = avgWinQuote / avgLossQuote
  const raw = winRate - (1 - winRate) / payoffRatio
  return Math.max(0, Math.min(maxFraction, raw))
}

// ── Council vote (VT-Capital council concept) ───────────────────────────────

export interface CouncilMember {
  strategyId: string
  decision: StrategyDecision
  score: number
}

export interface CouncilVote {
  signal: Signal
  /** Net weighted vote in [-inf, +inf]; sign gives direction. */
  net: number
  /** Strategy contributing the strongest weight in the winning direction. */
  leadStrategyId: string | null
  reasons: Array<string>
}

/** Track-record weight: proven strategies count more, losers count less. */
export function strategyWeight(score: number): number {
  return Math.max(0.5, Math.min(1.5, 1 + score * 0.1))
}

/**
 * Combine every enabled strategy's opinion into one decision. Entries need
 * weighted agreement (or one very confident, well-scored voice) instead of
 * any single formula's whim.
 */
export function councilVote(
  members: Array<CouncilMember>,
  threshold = 0.6,
): CouncilVote {
  let net = 0
  let leadStrategyId: string | null = null
  let leadContribution = 0
  const reasons: Array<string> = []
  for (const m of members) {
    if (m.decision.signal === 'HOLD') continue
    const weight = strategyWeight(m.score) * m.decision.confidence
    const contribution = m.decision.signal === 'BUY' ? weight : -weight
    net += contribution
    reasons.push(`${m.strategyId}: ${m.decision.signal} (${m.decision.reason})`)
    if (Math.abs(contribution) > Math.abs(leadContribution)) {
      leadContribution = contribution
      leadStrategyId = m.strategyId
    }
  }
  let signal: Signal = 'HOLD'
  if (net >= threshold) signal = 'BUY'
  else if (net <= -threshold) signal = 'SELL'
  // The lead must agree with the direction the council settled on.
  if (signal === 'BUY' && leadContribution < 0) leadStrategyId = null
  if (signal === 'SELL' && leadContribution > 0) leadStrategyId = null
  return { signal, net, leadStrategyId, reasons }
}

/** Position size scaled by the lead strategy's track record. */
export function scaledQuoteSize(baseQuote: number, leadScore: number): number {
  return Math.round(baseQuote * strategyWeight(leadScore) * 100) / 100
}

/**
 * Inverse-volatility position-size multiplier (concept from bbfamily/abu's
 * ABuAtrPosition, reimplemented clean-room). `baselineAtrPct` is the "normal"
 * ATR/price ratio the base quote size was calibrated for — calmer-than-
 * baseline conditions scale size up (capped at `maxMultiplier`), more
 * volatile conditions scale it down (floored at `minMultiplier`). Returns 1
 * (no-op) whenever there isn't enough information to size confidently, so
 * callers can leave this wired in with `baselineAtrPct: 0` to disable it.
 */
export function atrSizeMultiplier(
  atrValue: number | null,
  price: number,
  baselineAtrPct: number,
  minMultiplier = 0.25,
  maxMultiplier = 1.5,
): number {
  if (atrValue == null || price <= 0 || baselineAtrPct <= 0) return 1
  const atrPct = atrValue / price
  if (atrPct <= 0) return 1
  return Math.max(minMultiplier, Math.min(maxMultiplier, baselineAtrPct / atrPct))
}
