import { describe, expect, it } from 'vitest'

import {
  accumulationDistributionLine,
  adx,
  applyTradeOutcome,
  atr,
  atrSizeMultiplier,
  breakoutStrategy,
  chaikinVolumeStrategy,
  councilVote,
  ema,
  emptyScore,
  fibExtensionTarget,
  keltnerChannelStrategy,
  kellyFraction,
  macdMomentumStrategy,
  regimeAllowsLong,
  rsi,
  rsiReversionStrategy,
  scaledQuoteSize,
  sma,
  smaCrossoverStrategy,
  takerImbalanceStrategy,
  trendIsStrong,
  trendPullbackStrategy,
  trueRange,
  type Candle,
} from './trading-strategies'

const candlesFromCloses = (closes: Array<number>): Array<Candle> =>
  closes.map((c, i) => ({
    openTime: i,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1,
  }))

const candleLike = (
  openTime: number,
  close: number,
  high: number,
  low: number,
): Candle => ({
  openTime,
  open: close,
  high,
  low,
  close,
  volume: 1,
})

describe('indicators', () => {
  it('sma averages the trailing window', () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5)
    expect(sma([1, 2], 3)).toBeNull()
  })

  it('rsi is 100 when only gains', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 5)).toBe(100)
  })

  it('true range captures gaps from the previous close', () => {
    expect(
      trueRange(
        { openTime: 1, open: 110, high: 112, low: 109, close: 111, volume: 1 },
        100,
      ),
    ).toBe(12)
  })

  it('atr averages trailing true ranges', () => {
    const candles = [
      candleLike(0, 100, 102, 98),
      candleLike(1, 103, 106, 101), // TR 6
      candleLike(2, 104, 105, 100), // TR 5
      candleLike(3, 111, 112, 110), // TR 8
    ]
    expect(atr(candles, 3)).toBeCloseTo((6 + 5 + 8) / 3, 6)
    expect(atr(candles.slice(0, 3), 3)).toBeNull()
  })

  it('adx is 100 for a pure one-directional trend (zero -DM)', () => {
    // Every step: only +DM contributes (down move is always negative, so
    // minusDM stays 0) -> |plusDI - minusDI| / diSum reduces to exactly 1.
    const candles = [
      candleLike(0, 100, 100, 95),
      candleLike(1, 108, 110, 104),
      candleLike(2, 116, 118, 112),
      candleLike(3, 124, 126, 120),
    ]
    expect(adx(candles, 3)).toBeCloseTo(100, 6)
  })

  it('adx is 0 for a flat (zero true-range) series', () => {
    const candles = [
      candleLike(0, 100, 100, 100),
      candleLike(1, 100, 100, 100),
      candleLike(2, 100, 100, 100),
      candleLike(3, 100, 100, 100),
    ]
    expect(adx(candles, 3)).toBe(0)
  })

  it('adx returns null with insufficient candles', () => {
    const candles = [candleLike(0, 100, 102, 98), candleLike(1, 103, 106, 101)]
    expect(adx(candles, 3)).toBeNull()
  })
})

describe('trendIsStrong', () => {
  const strongTrend = [
    candleLike(0, 100, 100, 95),
    candleLike(1, 108, 110, 104),
    candleLike(2, 116, 118, 112),
    candleLike(3, 124, 126, 120),
  ]
  const flat = [
    candleLike(0, 100, 100, 100),
    candleLike(1, 100, 100, 100),
    candleLike(2, 100, 100, 100),
    candleLike(3, 100, 100, 100),
  ]

  it('fails open when disabled or without enough history', () => {
    expect(trendIsStrong(strongTrend, 0, 25)).toBe(true) // period disabled
    expect(trendIsStrong(strongTrend, 3, 0)).toBe(true) // threshold disabled
    expect(trendIsStrong(strongTrend.slice(0, 1), 3, 25)).toBe(true) // insufficient data
  })

  it('allows entry when ADX clears the threshold, blocks when it does not', () => {
    expect(trendIsStrong(strongTrend, 3, 25)).toBe(true) // adx=100
    expect(trendIsStrong(flat, 3, 25)).toBe(false) // adx=0
  })
})

describe('fibExtensionTarget', () => {
  const window = [
    candleLike(0, 100, 110, 90), // swing range = 20
    candleLike(1, 105, 108, 95),
  ]

  it('projects entryPrice + swingRange * ratio for a long, minus for a short', () => {
    expect(fibExtensionTarget('long', 100, window, 2, 1.618)).toBeCloseTo(100 + 20 * 1.618, 6)
    expect(fibExtensionTarget('short', 100, window, 2, 1.618)).toBeCloseTo(100 - 20 * 1.618, 6)
  })

  it('defaults extensionRatio to 1.618', () => {
    expect(fibExtensionTarget('long', 100, window, 2)).toBeCloseTo(100 + 20 * 1.618, 6)
  })

  it('returns null with insufficient lookback candles', () => {
    expect(fibExtensionTarget('long', 100, window, 5)).toBeNull()
  })

  it('returns null when the swing range is zero (flat window)', () => {
    const flatWindow = [candleLike(0, 100, 100, 100), candleLike(1, 100, 100, 100)]
    expect(fibExtensionTarget('long', 100, flatWindow, 2)).toBeNull()
  })
})

describe('smaCrossoverStrategy', () => {
  it('signals BUY when the fast SMA crosses above the slow SMA', () => {
    // long downtrend then a sharp reversal so fast crosses above slow on the last candle
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      120, // spike up
    ]
    const d = smaCrossoverStrategy.evaluate(candlesFromCloses(closes), {
      fast: 3,
      slow: 8,
    })
    expect(d.signal).toBe('BUY')
    expect(d.confidence).toBeGreaterThan(0)
  })

  it('holds without enough candles', () => {
    expect(
      smaCrossoverStrategy.evaluate(candlesFromCloses([1, 2, 3])).signal,
    ).toBe('HOLD')
  })

  it('gives a fresh cross enough confidence to matter in the council', () => {
    const closes = [...Array.from({ length: 20 }, (_, i) => 100 - i), 120]
    const d = smaCrossoverStrategy.evaluate(candlesFromCloses(closes), {
      fast: 3,
      slow: 8,
    })
    expect(d.signal).toBe('BUY')
    // Base 0.35 + velocity: must clear the near-zero confidence the old
    // spread-at-cross formula produced (which kept it at 0 trades for a year).
    expect(d.confidence).toBeGreaterThanOrEqual(0.35)
  })

  it('grades a sharp cross above a grazing cross', () => {
    const sharp = smaCrossoverStrategy.evaluate(
      candlesFromCloses([
        ...Array.from({ length: 20 }, (_, i) => 100 - i),
        130,
      ]),
      { fast: 3, slow: 8 },
    )
    // Gentle drift then a tiny pop: crosses, but with low velocity (stays under the cap).
    const grazing = smaCrossoverStrategy.evaluate(
      candlesFromCloses([
        ...Array.from({ length: 20 }, (_, i) => 100 - i * 0.02),
        99.87,
      ]),
      { fast: 3, slow: 8 },
    )
    expect(sharp.signal).toBe('BUY')
    expect(grazing.signal).toBe('BUY')
    expect(sharp.confidence).toBeGreaterThan(grazing.confidence)
  })
})

describe('rsiReversionStrategy', () => {
  it('signals BUY when oversold', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i * 2) // steady decline
    const d = rsiReversionStrategy.evaluate(candlesFromCloses(closes), {
      period: 14,
    })
    expect(d.signal).toBe('BUY')
  })

  it('signals SELL when overbought', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 2) // steady rise
    const d = rsiReversionStrategy.evaluate(candlesFromCloses(closes), {
      period: 14,
    })
    expect(d.signal).toBe('SELL')
  })

  it('mutes the overbought SELL when price rides well above the trend SMA', () => {
    // 60 candles rising 1%/candle: overbought RSI, price far above SMA(50).
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i)
    const d = rsiReversionStrategy.evaluate(candlesFromCloses(closes), {
      period: 14,
    })
    expect(d.signal).toBe('HOLD')
    expect(d.reason).toContain('muted')
  })

  it('mutes the oversold BUY when price sits well below the trend SMA', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 0.99 ** i)
    const d = rsiReversionStrategy.evaluate(candlesFromCloses(closes), {
      period: 14,
    })
    expect(d.signal).toBe('HOLD')
    expect(d.reason).toContain('muted')
  })

  it('still counter-votes in a range and when the filter is disabled', () => {
    // Flat range then a small pop: overbought but price within 2% of SMA(50) → SELL stands.
    const range = [...Array.from({ length: 57 }, () => 100), 100.5, 101, 101.5]
    const inRange = rsiReversionStrategy.evaluate(candlesFromCloses(range), {
      period: 14,
    })
    expect(inRange.signal).toBe('SELL')
    // Strong uptrend but trendPeriod: 0 disables the filter → SELL again.
    const trend = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i)
    const noFilter = rsiReversionStrategy.evaluate(candlesFromCloses(trend), {
      period: 14,
      trendPeriod: 0,
    })
    expect(noFilter.signal).toBe('SELL')
  })
})

describe('applyTradeOutcome scoring', () => {
  it('rewards profit and counts a win', () => {
    const s = applyTradeOutcome(emptyScore('x'), 10, 100)
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(0)
    expect(s.score).toBeGreaterThan(0)
    expect(s.totalPnlQuote).toBe(10)
    expect(s.winRate).toBe(1)
  })

  it('penalizes loss and counts a loss', () => {
    const s = applyTradeOutcome(emptyScore('x'), -10, 100)
    expect(s.losses).toBe(1)
    expect(s.score).toBeLessThan(0)
  })

  it('accumulates across trades and clamps outliers', () => {
    let s = emptyScore('x')
    s = applyTradeOutcome(s, 5, 100) // +0.5
    s = applyTradeOutcome(s, -2, 100) // -0.2
    s = applyTradeOutcome(s, 9999, 100) // clamped to +1, not +999
    expect(s.trades).toBe(3)
    expect(s.wins).toBe(2)
    expect(s.score).toBeLessThanOrEqual(1.5 + 1e-9)
    expect(s.score).toBeCloseTo(0.5 - 0.2 + 1, 5)
  })
})

describe('new strategies', () => {
  it('macd momentum emits a decision on a long series', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i * 0.5),
      ...Array.from({ length: 20 }, (_, i) => 85 + i * 1.5),
    ]
    const d = macdMomentumStrategy.evaluate(candlesFromCloses(closes))
    expect(['BUY', 'SELL', 'HOLD']).toContain(d.signal)
  })

  it('breakout signals BUY when price breaks the prior high', () => {
    const closes = [...Array.from({ length: 21 }, () => 100), 110]
    const candles = closes.map((c, i) => ({
      openTime: i,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 1,
    }))
    expect(breakoutStrategy.evaluate(candles, { lookback: 20 }).signal).toBe(
      'BUY',
    )
  })

  it('trend pullback buys recovery from a shallow pullback inside an uptrend', () => {
    const closes = [
      ...Array.from({ length: 80 }, (_, i) => 100 + i),
      170,
      168,
      169,
      171,
      174,
    ]
    const d = trendPullbackStrategy.evaluate(candlesFromCloses(closes))
    expect(d.signal).toBe('BUY')
    expect(d.confidence).toBeGreaterThanOrEqual(0.35)
  })

  it('trend pullback sells when price loses the long trend SMA', () => {
    const closes = [...Array.from({ length: 80 }, (_, i) => 100 + i), 120]
    const d = trendPullbackStrategy.evaluate(candlesFromCloses(closes))
    expect(d.signal).toBe('SELL')
    expect(d.reason).toContain('below trend SMA')
  })

  it('trend pullback holds instead of chasing an extended recovery', () => {
    const closes = [
      ...Array.from({ length: 80 }, (_, i) => 100 + i),
      170,
      168,
      169,
      171,
      190,
    ]
    const d = trendPullbackStrategy.evaluate(candlesFromCloses(closes))
    expect(d.signal).toBe('HOLD')
  })

  it('ema tracks toward recent values', () => {
    expect(ema([1, 1, 1, 1, 1], 3)).toBeCloseTo(1, 5)
  })
})

function ohlcv(
  openTime: number,
  vals: {
    high: number
    low: number
    close: number
    volume: number
    takerBuyVolume?: number
  },
): Candle {
  return {
    openTime,
    open: vals.close,
    high: vals.high,
    low: vals.low,
    close: vals.close,
    volume: vals.volume,
    takerBuyVolume: vals.takerBuyVolume,
  }
}

describe('accumulationDistributionLine', () => {
  it('accumulates money-flow-volume per candle, weighted by where close landed in the range', () => {
    const candles = [
      ohlcv(0, { high: 10, low: 0, close: 10, volume: 5 }), // close at high → MFM=1 → +5
      ohlcv(1, { high: 10, low: 0, close: 0, volume: 3 }), // close at low → MFM=-1 → -3
    ]
    const adl = accumulationDistributionLine(candles)
    expect(adl).toEqual([5, 2])
  })

  it('treats a zero-range candle as contributing nothing (no divide-by-zero)', () => {
    const candles = [ohlcv(0, { high: 5, low: 5, close: 5, volume: 100 })]
    expect(accumulationDistributionLine(candles)).toEqual([0])
  })
})

describe('chaikinVolumeStrategy', () => {
  it('buys on a sharp accumulation burst after a distribution baseline', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 25; i++) {
      // Close near the low of each bar — distribution.
      candles.push(ohlcv(i, { high: 100, low: 90, close: 91, volume: 10 }))
    }
    for (let i = 25; i < 28; i++) {
      // Sharp, high-volume close-near-high burst — accumulation.
      candles.push(ohlcv(i, { high: 100, low: 90, close: 99, volume: 30 }))
    }
    const d = chaikinVolumeStrategy.evaluate(candles)
    expect(d.signal).toBe('BUY')
    expect(d.reason).toContain('above zero')
  })

  it('sells on a sharp distribution burst after an accumulation baseline', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 25; i++) {
      candles.push(ohlcv(i, { high: 100, low: 90, close: 99, volume: 10 }))
    }
    for (let i = 25; i < 28; i++) {
      candles.push(ohlcv(i, { high: 100, low: 90, close: 91, volume: 30 }))
    }
    const d = chaikinVolumeStrategy.evaluate(candles)
    expect(d.signal).toBe('SELL')
    expect(d.reason).toContain('below zero')
  })

  it('holds when the close sits near the middle of the range throughout', () => {
    const candles: Array<Candle> = Array.from({ length: 28 }, (_, i) =>
      ohlcv(i, { high: 100, low: 90, close: 95, volume: 10 }),
    )
    expect(chaikinVolumeStrategy.evaluate(candles).signal).toBe('HOLD')
  })

  it('holds below minCandles regardless of the pattern', () => {
    const candles: Array<Candle> = Array.from({ length: 10 }, (_, i) =>
      ohlcv(i, { high: 100, low: 90, close: 99, volume: 30 }),
    )
    expect(chaikinVolumeStrategy.evaluate(candles).signal).toBe('HOLD')
  })
})

describe('keltnerChannelStrategy', () => {
  it('buys when close breaks above the ATR-scaled upper band', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 20; i++)
      candles.push(ohlcv(i, { high: 101, low: 99, close: 100, volume: 1 }))
    candles.push(ohlcv(20, { high: 116, low: 114, close: 115, volume: 1 }))
    const d = keltnerChannelStrategy.evaluate(candles)
    expect(d.signal).toBe('BUY')
    expect(d.reason).toContain('upper band')
  })

  it('sells when close breaks below the ATR-scaled lower band', () => {
    const candles: Array<Candle> = []
    for (let i = 0; i < 20; i++)
      candles.push(ohlcv(i, { high: 101, low: 99, close: 100, volume: 1 }))
    candles.push(ohlcv(20, { high: 86, low: 84, close: 85, volume: 1 }))
    const d = keltnerChannelStrategy.evaluate(candles)
    expect(d.signal).toBe('SELL')
    expect(d.reason).toContain('lower band')
  })

  it('holds while price stays inside the band', () => {
    const candles: Array<Candle> = Array.from({ length: 21 }, (_, i) =>
      ohlcv(i, { high: 101, low: 99, close: 100, volume: 1 }),
    )
    expect(keltnerChannelStrategy.evaluate(candles).signal).toBe('HOLD')
  })

  it('holds below minCandles regardless of price action', () => {
    const candles: Array<Candle> = [
      ohlcv(0, { high: 101, low: 99, close: 100, volume: 1 }),
      ohlcv(1, { high: 116, low: 114, close: 115, volume: 1 }),
    ]
    expect(keltnerChannelStrategy.evaluate(candles).signal).toBe('HOLD')
  })
})

describe('takerImbalanceStrategy', () => {
  it('buys on persistent taker buy pressure, with confidence clearing the council threshold', () => {
    const candles: Array<Candle> = Array.from({ length: 21 }, (_, i) =>
      ohlcv(i, { high: 101, low: 99, close: 100, volume: 10, takerBuyVolume: 7 }),
    )
    const d = takerImbalanceStrategy.evaluate(candles)
    expect(d.signal).toBe('BUY')
    expect(d.reason).toContain('buy pressure')
    // Regression guard: the original confidence formula (dividing deviation
    // by the theoretical 0.5 max) capped out around 0.3 even at the largest
    // deviations ever observed in real data, so it never cleared the
    // council's default 0.6 vote threshold and the strategy silently never
    // led a trade in any backtest — same bug class as sma_crossover's
    // original near-zero-at-the-cross confidence.
    expect(d.confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('sells on persistent taker sell pressure', () => {
    const candles: Array<Candle> = Array.from({ length: 21 }, (_, i) =>
      ohlcv(i, { high: 101, low: 99, close: 100, volume: 10, takerBuyVolume: 3 }),
    )
    const d = takerImbalanceStrategy.evaluate(candles)
    expect(d.signal).toBe('SELL')
    expect(d.reason).toContain('sell pressure')
    expect(d.confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('holds when taker volume is balanced', () => {
    const candles: Array<Candle> = Array.from({ length: 21 }, (_, i) =>
      ohlcv(i, { high: 101, low: 99, close: 100, volume: 10, takerBuyVolume: 5 }),
    )
    expect(takerImbalanceStrategy.evaluate(candles).signal).toBe('HOLD')
  })

  it('holds when takerBuyVolume is missing from any candle in the window, rather than treating it as zero', () => {
    const candles: Array<Candle> = Array.from({ length: 21 }, (_, i) =>
      ohlcv(i, { high: 101, low: 99, close: 100, volume: 10, takerBuyVolume: 7 }),
    )
    // Drop the field on the most recent candle — guaranteed inside the
    // rolling window regardless of period, unlike an older out-of-window one.
    candles[candles.length - 1].takerBuyVolume = undefined
    const d = takerImbalanceStrategy.evaluate(candles)
    expect(d.signal).toBe('HOLD')
    expect(d.reason).toContain('unavailable')
  })

  it('holds below minCandles regardless of the pattern', () => {
    const candles: Array<Candle> = Array.from({ length: 10 }, (_, i) =>
      ohlcv(i, { high: 101, low: 99, close: 100, volume: 10, takerBuyVolume: 9 }),
    )
    expect(takerImbalanceStrategy.evaluate(candles).signal).toBe('HOLD')
  })
})

describe('regimeAllowsLong', () => {
  it('fails open when disabled or without enough history', () => {
    expect(regimeAllowsLong([100, 90], 0)).toBe(true)
    expect(regimeAllowsLong([100, 90], 5)).toBe(true)
  })

  it('blocks long entries below the long SMA and allows them above it', () => {
    expect(regimeAllowsLong([100, 100, 100, 80], 4)).toBe(false)
    expect(regimeAllowsLong([100, 100, 100, 110], 4)).toBe(true)
  })
})

describe('councilVote', () => {
  it('returns BUY when weighted votes exceed threshold', () => {
    const v = councilVote(
      [
        {
          strategyId: 'a',
          decision: { signal: 'BUY', confidence: 1, reason: 'up' },
          score: 5,
        },
        {
          strategyId: 'b',
          decision: { signal: 'BUY', confidence: 0.8, reason: 'up2' },
          score: 0,
        },
      ],
      0.6,
    )
    expect(v.signal).toBe('BUY')
    expect(v.leadStrategyId).toBe('a')
  })

  it('returns HOLD when votes cancel out', () => {
    const v = councilVote(
      [
        {
          strategyId: 'a',
          decision: { signal: 'BUY', confidence: 1, reason: 'up' },
          score: 0,
        },
        {
          strategyId: 'b',
          decision: { signal: 'SELL', confidence: 1, reason: 'down' },
          score: 0,
        },
      ],
      0.6,
    )
    expect(v.signal).toBe('HOLD')
  })

  it('weights proven strategies more heavily', () => {
    const v = councilVote(
      [
        {
          strategyId: 'proven',
          decision: { signal: 'BUY', confidence: 1, reason: 'up' },
          score: 8,
        },
        {
          strategyId: 'weak',
          decision: { signal: 'SELL', confidence: 1, reason: 'down' },
          score: -4,
        },
      ],
      0.6,
    )
    expect(v.signal).toBe('BUY')
    expect(v.leadStrategyId).toBe('proven')
  })
})

describe('scaledQuoteSize', () => {
  it('scales up for proven strategies and down for poor ones', () => {
    expect(scaledQuoteSize(25, 5)).toBeGreaterThan(25)
    expect(scaledQuoteSize(25, -5)).toBeLessThan(25)
  })
})

describe('atrSizeMultiplier', () => {
  it('is a no-op (1x) when disabled or missing inputs', () => {
    expect(atrSizeMultiplier(2, 100, 0)).toBe(1) // baselineAtrPct 0 = off
    expect(atrSizeMultiplier(null, 100, 0.02)).toBe(1) // no ATR value yet
    expect(atrSizeMultiplier(2, 0, 0.02)).toBe(1) // invalid price
  })

  it('returns 1x when current volatility matches the baseline', () => {
    // atr/price = 2/100 = 2%, baseline = 2% -> ratio 1
    expect(atrSizeMultiplier(2, 100, 0.02)).toBeCloseTo(1, 8)
  })

  it('scales size down (floored) in higher-than-baseline volatility', () => {
    // atr/price = 8/100 = 8%, baseline 2% -> raw ratio 0.25, right at the floor
    expect(atrSizeMultiplier(8, 100, 0.02, 0.25, 1.5)).toBeCloseTo(0.25, 8)
    // even more volatile still floors at 0.25, never goes negative/lower
    expect(atrSizeMultiplier(20, 100, 0.02, 0.25, 1.5)).toBeCloseTo(0.25, 8)
  })

  it('scales size up (capped) in calmer-than-baseline volatility', () => {
    // atr/price = 0.5/100 = 0.5%, baseline 2% -> raw ratio 4, capped at 1.5
    expect(atrSizeMultiplier(0.5, 100, 0.02, 0.25, 1.5)).toBeCloseTo(1.5, 8)
  })
})

describe('applyTradeOutcome loss streak', () => {
  it('increments lossStreak on losses and resets on a win', () => {
    let s = emptyScore('x')
    s = applyTradeOutcome(s, -5, 100)
    s = applyTradeOutcome(s, -5, 100)
    expect(s.lossStreak).toBe(2)
    s = applyTradeOutcome(s, 5, 100)
    expect(s.lossStreak).toBe(0)
  })
})

describe('applyTradeOutcome avgWinQuote/avgLossQuote', () => {
  it('tracks separate running averages for wins and losses', () => {
    let s = emptyScore('x')
    s = applyTradeOutcome(s, 10, 100) // win
    s = applyTradeOutcome(s, 30, 100) // win
    s = applyTradeOutcome(s, -5, 100) // loss
    s = applyTradeOutcome(s, -15, 100) // loss
    expect(s.avgWinQuote).toBeCloseTo(20, 8) // (10+30)/2
    expect(s.avgLossQuote).toBeCloseTo(10, 8) // (5+15)/2, stored as a positive magnitude
  })

  it('defaults missing avgWinQuote/avgLossQuote on older persisted scores to 0 and builds forward', () => {
    const legacy = { ...emptyScore('x') } as Record<string, unknown>
    delete legacy.avgWinQuote
    delete legacy.avgLossQuote
    const next = applyTradeOutcome(legacy as ReturnType<typeof emptyScore>, 40, 100)
    expect(next.avgWinQuote).toBeCloseTo(40, 8)
    expect(next.avgLossQuote).toBeCloseTo(0, 8)
  })
})

describe('kellyFraction', () => {
  it('computes the Kelly bet fraction, capped at maxFraction', () => {
    // winRate 0.6, payoff 100/50=2 -> 0.6 - 0.4/2 = 0.4, capped at 0.25
    expect(kellyFraction(0.6, 100, 50, 0.25)).toBeCloseTo(0.25, 8)
    // same edge, higher cap -> the uncapped 0.4
    expect(kellyFraction(0.6, 100, 50, 0.5)).toBeCloseTo(0.4, 8)
  })

  it('returns 0 (never negative) when there is no edge', () => {
    // winRate 0.3, payoff 1 -> 0.3 - 0.7/1 = negative -> floored at 0
    expect(kellyFraction(0.3, 50, 50, 0.25)).toBe(0)
  })

  it('returns 0 on invalid/degenerate inputs', () => {
    expect(kellyFraction(0.6, 100, 0, 0.25)).toBe(0) // no loss data yet
    expect(kellyFraction(0, 100, 50, 0.25)).toBe(0) // never won
    expect(kellyFraction(1, 100, 50, 0.25)).toBe(0) // never lost (1 - winRate) singularity guard
  })
})
