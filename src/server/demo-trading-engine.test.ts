import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'

// fetchTopTraderLongShortRatio makes a real network call — mock just that
// export so tests never hit fapi.binance.com; longShortSentimentDecision
// (pure, no network) stays real.
vi.mock('./long-short-sentiment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./long-short-sentiment')>()
  return { ...actual, fetchTopTraderLongShortRatio: vi.fn() }
})

// The finance store resolves its path from os.homedir() (which honours $HOME
// on POSIX) at module load, so point HOME at a temp dir and reset modules so
// the store re-evaluates against it — never touch the real ~/.hermes/finance.
let tmp: string
let realHome: string | undefined
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-engine-'))
  realHome = process.env.HOME
  process.env.HOME = tmp
  vi.resetModules()
})
afterEach(() => {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
  fs.rmSync(tmp, { recursive: true, force: true })
})

function fakeClient(overrides: Partial<any> = {}) {
  return {
    host: 'demo-api.binance.com',
    environment: 'testnet',
    ping: async () => true,
    getPrice: async () => 100,
    getKlines: async () => steadyDowntrend(),
    getAccount: async () => ({
      accountType: 'SPOT',
      canTrade: true,
      balances: [{ asset: 'USDT', free: 5000, locked: 0 }],
    }),
    placeOrder: async (o: any) => ({
      symbol: o.symbol,
      orderId: Math.floor(Math.random() * 1e6),
      status: 'FILLED',
      side: o.side,
      type: o.type,
      executedQty: o.side === 'BUY' ? 0.25 : 0.25,
      cummulativeQuoteQty: o.side === 'BUY' ? (o.quoteOrderQty ?? 25) : 30, // sell returns more → profit
      fills: [],
      transactTime: Date.now(),
      avgPrice: o.side === 'BUY' ? 100 : 120,
    }),
    ...overrides,
  }
}

// Steady decline → RSI oversold → BUY from the RSI strategy.
function steadyDowntrend() {
  const closes = Array.from({ length: 31 }, (_, i) => 100 - i * 0.35)
  const base = Date.now() - closes.length * 60 * 60_000
  return closes.map((c, i) => ({
    openTime: base + i * 60 * 60_000,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1,
  }))
}

function flatCandles(close: number, length = 31) {
  const base = Date.now() - length * 60 * 60_000
  return Array.from({ length }, (_, i) => ({
    openTime: base + i * 60 * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }))
}

function breakoutCandles() {
  const closes = [...Array.from({ length: 30 }, () => 100), 105]
  const base = Date.now() - closes.length * 60 * 60_000
  return closes.map((close, i) => ({
    openTime: base + i * 60 * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }))
}

async function setMode(mode: string) {
  const store = await import('./finance-store')
  const db = store.readFinanceStore()
  db.settings.tradingMode = mode as never
  db.settings.emergencyKillSwitch = false
  store.writeFinanceStore(db)
}

async function armLiveMode() {
  const store = await import('./finance-store')
  const db = store.readFinanceStore()
  db.settings.tradingMode = 'live_manual_approval' as never
  db.settings.executionAccount = 'binance_live'
  db.settings.liveTradingEnabled = true
  db.settings.liveBinanceApprovedAt = '2026-07-07T00:00:00.000Z'
  db.settings.liveBinanceApprovalId = 'test-approval'
  db.settings.livePerOrderCapUsdt = 10
  db.settings.paperShadowEnabled = true
  db.settings.emergencyKillSwitch = false
  store.writeFinanceStore(db)
}

async function seedLiveReadyEvidence() {
  const store = await import('./finance-store')
  const db = store.readFinanceStore()
  const base = Date.now()
  const closedAt = (index: number) =>
    new Date(base + index * 1000).toISOString()
  db.strategy_results = [
    {
      kind: 'demo_strategy_score',
      strategyId: 'rsi_reversion',
      trades: 15,
      wins: 14,
      losses: 1,
      totalPnlQuote: 27,
      score: 3,
      winRate: 14 / 15,
      avgPnlQuote: 27 / 15,
      lossStreak: 0,
      updatedAt: closedAt(30),
    },
    ...Array.from({ length: 15 }, (_, index) => ({
      kind: 'demo_trade_log',
      id: `ready_trade_${index}`,
      symbol: 'BTCUSDT',
      strategyId: 'rsi_reversion',
      entryPrice: 100,
      exitPrice: index === 5 ? 99 : 102,
      quantity: 1,
      entryQuote: 100,
      exitQuote: index === 5 ? 99 : 102,
      pnlQuote: index === 5 ? -1 : 2,
      feesQuote: 0,
      reason: 'ready evidence',
      openedAt: closedAt(index),
      closedAt: closedAt(index + 1),
      executionMode: 'paper',
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      kind: 'demo_trade_log',
      id: `ready_shadow_${index}`,
      symbol: 'BTCUSDT',
      strategyId: 'rsi_reversion',
      entryPrice: 100,
      exitPrice: 102,
      quantity: 1,
      entryQuote: 100,
      exitQuote: 102,
      pnlQuote: 2,
      feesQuote: 0,
      reason: 'ready shadow evidence',
      openedAt: closedAt(index),
      closedAt: closedAt(index + 1),
      executionMode: 'shadow_paper',
    })),
  ] as any
  store.writeFinanceStore(db)
}

describe('runTradingCycle gating', () => {
  it('does not run when tradingMode is not testnet_execute', async () => {
    await setMode('observe_only')
    const { runTradingCycle } = await import('./demo-trading-engine')
    const res = await runTradingCycle({ client: fakeClient() as never })
    expect(res.ran).toBe(false)
    expect(res.reason).toMatch(/testnet_execute/)
  })

  it('halts when the kill switch is active', async () => {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    db.settings.tradingMode = 'testnet_execute' as never
    db.settings.emergencyKillSwitch = true
    store.writeFinanceStore(db)
    const { runTradingCycle } = await import('./demo-trading-engine')
    const res = await runTradingCycle({ client: fakeClient() as never })
    expect(res.ran).toBe(false)
    expect(res.reason).toMatch(/kill switch/)
  })

  it('halts when the connectivity breaker is tripped', async () => {
    await setMode('testnet_execute')
    const { recordConnectivityOutcome } = await import('./connectivity-breaker')
    const CRED_FAILURE = 'Binance demo /api/v3/order failed (401): Unauthorized'
    recordConnectivityOutcome(CRED_FAILURE)
    recordConnectivityOutcome(CRED_FAILURE)
    recordConnectivityOutcome(CRED_FAILURE)
    const { runTradingCycle } = await import('./demo-trading-engine')
    const res = await runTradingCycle({ client: fakeClient() as never })
    expect(res.ran).toBe(false)
    expect(res.reason).toMatch(/connectivity breaker/)
  })

  it('audits a bailed cycle instead of failing silently', async () => {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    db.settings.tradingMode = 'testnet_execute' as never
    db.settings.emergencyKillSwitch = true
    store.writeFinanceStore(db)
    const { runTradingCycle } = await import('./demo-trading-engine')
    await runTradingCycle({ client: fakeClient() as never })
    const auditText = fs.readFileSync(
      path.join(tmp, '.hermes', 'finance', 'audit.jsonl'),
      'utf8',
    )
    const lines = auditText.trim().split('\n').map((l) => JSON.parse(l))
    const bailed = lines.find((l) => l.action === 'demo_trading_cycle_bailed')
    expect(bailed).toBeTruthy()
    expect(bailed.details.reason).toMatch(/kill switch/)
  })

  it('force runs regardless of mode', async () => {
    await setMode('observe_only')
    const { runTradingCycle } = await import('./demo-trading-engine')
    const res = await runTradingCycle({
      client: fakeClient() as never,
      force: true,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(res.ran).toBe(true)
  })

  it('persists market observations without duplicating candles across cycles', async () => {
    await setMode('testnet_execute')
    const base = Date.UTC(2026, 0, 1)
    const candles = Array.from({ length: 31 }, (_, i) => ({
      openTime: base + i * 60 * 60_000,
      open: 100 - i,
      high: 101 - i,
      low: 99 - i,
      close: 100 - i,
      volume: 10 + i,
    }))
    const { runTradingCycle } = await import('./demo-trading-engine')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: [] }

    await runTradingCycle({
      client: fakeClient({ getKlines: async () => candles }) as never,
      config: cfg,
    })
    await runTradingCycle({
      client: fakeClient({ getKlines: async () => candles }) as never,
      config: cfg,
    })

    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const persistedCandles = db.historical_candles.filter(
      (row: any) =>
        row.platform === 'binance' &&
        row.symbol === 'BTCUSDT' &&
        row.interval === '1h',
    )
    const persistedPrices = db.market_prices.filter(
      (row) => row.platform === 'binance' && row.symbol === 'BTCUSDT',
    )
    expect(persistedCandles).toHaveLength(31)
    expect(persistedCandles[0]).toMatchObject({
      id: `binance:BTCUSDT:1h:${base}`,
      source: 'binance-testnet-market-warmup',
    })
    expect(persistedPrices.length).toBeGreaterThan(0)
    expect(persistedPrices.length).toBeLessThanOrEqual(2)
  })

  it('blocks new entries when market learning has too little candle history', async () => {
    await setMode('testnet_execute')
    const base = Date.now() - 16 * 60 * 60_000
    const candles = Array.from({ length: 16 }, (_, i) => {
      const close = 100 - i * 0.4
      return {
        openTime: base + i * 60 * 60_000,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1,
      }
    })
    const placeOrder = vi.fn()
    const { marketLearningReport, runTradingCycle } =
      await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: fakeClient({
        getKlines: async () => candles,
        placeOrder,
      }) as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    const report = marketLearningReport({
      symbols: ['BTCUSDT'],
      interval: '1h',
    })

    expect(res.ran).toBe(true)
    expect(
      res.actions.some(
        (action) =>
          action.action === 'BLOCKED' &&
          action.reason.includes('market_quality_insufficient_data'),
      ),
    ).toBe(true)
    expect(placeOrder).not.toHaveBeenCalled()
    expect(report.symbols[0]).toMatchObject({
      symbol: 'BTCUSDT',
      status: 'insufficient_data',
      blocksNewEntries: true,
      candleCount: 16,
    })
  })

  it('warms underfilled market data before the entry gate and reuses the candles', async () => {
    await setMode('testnet_execute')
    const getKlines = vi.fn(async () => steadyDowntrend())
    const placeOrder = vi.fn(async (order: any) => ({
      symbol: order.symbol,
      orderId: 202,
      status: 'FILLED',
      side: order.side,
      type: order.type,
      executedQty: 0.1,
      cummulativeQuoteQty: order.quoteOrderQty ?? 10,
      fills: [],
      transactTime: Date.now(),
      avgPrice: 100,
    }))
    const { runTradingCycle } = await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: fakeClient({ getKlines, placeOrder }) as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })

    expect(res.ran).toBe(true)
    expect(getKlines).toHaveBeenCalledTimes(1)
    expect(res.marketWarmup?.summary).toMatchObject({
      symbols: 1,
      warmed: 1,
      failed: 0,
    })
    expect(res.marketWarmup?.symbols[0]).toMatchObject({
      symbol: 'BTCUSDT',
      status: 'warmed',
      candlesBefore: 0,
      candlesAfter: 31,
      fetchedCandles: 31,
    })
    expect(res.actions.some((action) => action.action === 'OPEN')).toBe(true)
    expect(placeOrder).toHaveBeenCalled()
  })

  it('blocks BUY entries below the configured long-SMA regime gate', async () => {
    await setMode('testnet_execute')
    const placeOrder = vi.fn()
    const { runTradingCycle } = await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: fakeClient({ placeOrder }) as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        regimeSmaPeriod: 20,
      },
    })

    expect(res.ran).toBe(true)
    expect(
      res.actions.some(
        (action) =>
          action.action === 'BLOCKED' &&
          action.reason.includes('regime_below_long_sma'),
      ),
    ).toBe(true)
    expect(placeOrder).not.toHaveBeenCalled()
  })
})

describe('runTradingCycle open → close → score', () => {
  it('shrinks position size when atrSizeBaselinePct is set below actual volatility', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')

    // steadyDowntrend's ~0.35/candle step gives ATR/price ≈ 0.35% — set the
    // "normal" baseline far below that so the multiplier floors at 0.25x.
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['rsi_reversion'],
      atrSizeBaselinePct: 0.0005,
    }
    const r1 = await runTradingCycle({ client: fakeClient() as never, config: cfg })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    const pos = getEngineState().positions[0]
    expect(pos).toBeTruthy()
    // Base quotePerTrade defaults to 25; floored 0.25x multiplier -> ~6.25.
    expect(pos!.entryQuote).toBeLessThan(10)
  })

  it('leaves sizing unchanged when kellySizingEnabled is on but the strategy has no trade history yet', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    // rsi_reversion's score is global (not per-symbol), so opening on two
    // different symbols in the same test — neither closed yet, so trades
    // stays 0 for both — isolates the kelly flag as the only variable.
    const baseline = await runTradingCycle({
      client: fakeClient() as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(baseline.actions.some((a) => a.action === 'OPEN')).toBe(true)
    const baselineEntryQuote = getEngineState().positions[0]!.entryQuote

    const withKelly = await runTradingCycle({
      client: fakeClient() as never,
      config: {
        symbols: ['ETHUSDT'],
        enabledStrategies: ['rsi_reversion'],
        kellySizingEnabled: true, // trades is still 0 -> below the 30-trade gate
      },
    })
    expect(withKelly.actions.some((a) => a.action === 'OPEN')).toBe(true)
    const withKellyEntryQuote = getEngineState().positions.find(
      (p) => p.symbol === 'ETHUSDT',
    )!.entryQuote

    expect(withKellyEntryQuote).toBeCloseTo(baselineEntryQuote, 6)
  })

  it('blocks an entry whose pattern bucket has a proven-bad loss rate, only when patternVetoEnabled', async () => {
    await setMode('testnet_execute')
    const { buildEntryFeatureVector, bucketKey } = await import(
      './trading-pattern-veto'
    )
    const store = await import('./finance-store')

    // Compute the exact bucket this fixture/strategy will land in, and seed
    // it as a proven-bad bucket (25 trades, 80% loss rate).
    const features = buildEntryFeatureVector('rsi_reversion', steadyDowntrend(), 14)
    const key = bucketKey(features)
    const db = store.readFinanceStore()
    db.strategy_results = [
      ...db.strategy_results,
      { kind: 'demo_pattern_veto_stats', key, trades: 25, losses: 20, lossRate: 0.8 },
    ]
    store.writeFinanceStore(db)

    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')

    const blocked = await runTradingCycle({
      client: fakeClient() as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        patternVetoEnabled: true,
      },
    })
    expect(
      blocked.actions.some(
        (a) => a.action === 'BLOCKED' && a.reason.startsWith('pattern_bucket_veto'),
      ),
    ).toBe(true)
    expect(getEngineState().positions).toHaveLength(0)

    // Same seeded bad bucket, but the flag defaults off — must not block.
    const allowed = await runTradingCycle({
      client: fakeClient() as never,
      config: { symbols: ['ETHUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(allowed.actions.some((a) => a.action === 'OPEN')).toBe(true)
  })

  it('logs entry-pattern features onto opened positions unconditionally (evidence accrues even while disabled)', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(r.actions.some((a) => a.action === 'OPEN')).toBe(true)
    const pos = getEngineState().positions[0] as unknown as {
      patternFeatures?: { strategyId: string }
    }
    expect(pos.patternFeatures?.strategyId).toBe('rsi_reversion')
  })

  it('blocks an entry whose ADX trend strength is below the configured threshold', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    // adxThreshold set far above any real 0-100 ADX value -> always blocks,
    // regardless of the fixture's actual trend strength — isolates the gate
    // mechanism itself rather than requiring a hand-tuned choppy fixture.
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        adxThreshold: 999,
      },
    })
    expect(
      r.actions.some(
        (a) => a.action === 'BLOCKED' && a.reason.startsWith('adx_trend_weak'),
      ),
    ).toBe(true)
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('leaves entries unaffected when adxThreshold is 0 (the default)', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle } = await import('./demo-trading-engine')
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(r.actions.some((a) => a.action === 'OPEN')).toBe(true)
  })

  it('computes a Fibonacci-extension take-profit price when fibTakeProfitEnabled', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        fibTakeProfitEnabled: true,
        fibSwingLookback: 20,
      },
    })
    expect(r.actions.some((a) => a.action === 'OPEN')).toBe(true)
    const pos = getEngineState().positions[0] as unknown as {
      fibTakeProfitPrice?: number | null
      entryPrice: number
    }
    expect(pos.fibTakeProfitPrice).not.toBeNull()
    expect(pos.fibTakeProfitPrice).toBeGreaterThan(pos.entryPrice)
  })

  it('leaves fibTakeProfitPrice null when fibTakeProfitEnabled is false (the default)', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(r.actions.some((a) => a.action === 'OPEN')).toBe(true)
    const pos = getEngineState().positions[0] as unknown as {
      fibTakeProfitPrice?: number | null
    }
    expect(pos.fibTakeProfitPrice ?? null).toBeNull()
  })

  it('does not fetch long/short sentiment when longShortSentimentEnabled is false (the default)', async () => {
    await setMode('testnet_execute')
    const { fetchTopTraderLongShortRatio } = await import('./long-short-sentiment')
    const { runTradingCycle } = await import('./demo-trading-engine')
    await runTradingCycle({
      client: fakeClient() as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] },
    })
    expect(fetchTopTraderLongShortRatio).not.toHaveBeenCalled()
  })

  it('lets a strong long/short-sentiment signal lead the vote and open a position under its own id', async () => {
    await setMode('testnet_execute')
    const { fetchTopTraderLongShortRatio } = await import('./long-short-sentiment')
    vi.mocked(fetchTopTraderLongShortRatio).mockResolvedValue([
      { symbol: 'BTCUSDT', longShortRatio: 2.5, longAccount: 0.71, shortAccount: 0.29, timestamp: Date.now() },
    ])
    const { runTradingCycle, getEngineState } = await import('./demo-trading-engine')
    // No strategies enabled -> the sentiment member is the only voice, so a
    // strong (capped-confidence) BUY from it alone should clear the council
    // threshold and open a position under its own strategyId.
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: [],
        longShortSentimentEnabled: true,
      },
    })
    expect(r.actions.some((a) => a.action === 'OPEN' && a.strategyId === 'long_short_sentiment')).toBe(true)
    expect(getEngineState().positions[0]?.strategyId).toBe('long_short_sentiment')
  })

  it('completes the cycle normally when the sentiment fetch fails (never breaks the cycle)', async () => {
    await setMode('testnet_execute')
    const { fetchTopTraderLongShortRatio } = await import('./long-short-sentiment')
    vi.mocked(fetchTopTraderLongShortRatio).mockRejectedValue(new Error('network error'))
    const { runTradingCycle } = await import('./demo-trading-engine')
    const r = await runTradingCycle({
      client: fakeClient() as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        longShortSentimentEnabled: true,
      },
    })
    expect(r.ran).toBe(true)
  })

  it('opens a position on a BUY signal, then closes with profit and scores it', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')

    // Isolate the RSI strategy so the council reduces to one clear voter.
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] }

    // Cycle 1: flat → council BUY (RSI oversold) → guardian OK → OPEN.
    const r1 = await runTradingCycle({
      client: fakeClient() as never,
      config: cfg,
    })
    expect(r1.ran).toBe(true)
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    expect(getEngineState().positions.length).toBe(1)

    // Cycle 2: price now well above entry (take-profit) → should CLOSE with positive PnL.
    const highBase = Date.now() - 31 * 60 * 60_000
    const highClient = fakeClient({
      getKlines: async () =>
        Array.from({ length: 31 }, (_, i) => ({
          openTime: highBase + i * 60 * 60_000,
          open: 130,
          high: 130,
          low: 130,
          close: 130,
          volume: 1,
        })),
    })
    const r2 = await runTradingCycle({
      client: highClient as never,
      config: cfg,
    })
    const close = r2.actions.find((a) => a.action === 'CLOSE')
    expect(close).toBeTruthy()
    expect(close!.pnlQuote).toBeGreaterThan(0)
    const state = getEngineState()
    expect(state.positions.length).toBe(0)
    const scored = state.scores.find((s) => s.trades > 0)
    expect(scored).toBeTruthy()
    expect(scored!.wins).toBe(1)
    expect(scored!.score).toBeGreaterThan(0)
  })

  it('uses trailing stop instead of fixed take-profit when configured', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['breakout'],
      trailingStopPct: 0.05,
      takeProfitPct: 0.03,
    }

    const r1 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    expect(getEngineState().positions[0]?.highWaterPrice).toBe(100)

    const r2 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(120) }) as never,
      config: cfg,
    })
    expect(r2.actions.some((a) => a.action === 'CLOSE')).toBe(false)
    expect(getEngineState().positions[0]?.highWaterPrice).toBe(120)

    const r3 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(113) }) as never,
      config: cfg,
    })
    const close = r3.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('trailing-stop')
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('force-closes a stale position once maxHoldMinutes elapses', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const store = await import('./finance-store')
    // breakout (not RSI-based) so a flat follow-up candle set can't itself
    // read as an overbought/oversold owner-exit signal.
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['breakout'],
      maxHoldMinutes: 60,
    }

    const r1 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)

    // Age every open position (real + paired paper-shadow) well past maxHoldMinutes.
    const db = store.readFinanceStore()
    const staleOpenedAt = new Date(Date.now() - 90 * 60_000).toISOString()
    for (const r of db.strategy_results as Array<any>) {
      if (r.kind === 'demo_open_position') r.openedAt = staleOpenedAt
    }
    store.writeFinanceStore(db)

    // Flat price at entry — nowhere near the 2%/3% SL/TP thresholds.
    const r2 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(100) }) as never,
      config: cfg,
    })
    const close = r2.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('max-hold-expired')
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('derives the base asset and sums only base-asset commissions', async () => {
    const { baseAssetOf, orderBaseFee } = await import('./demo-trading-engine')
    expect(baseAssetOf('SOLUSDT')).toBe('SOL')
    expect(baseAssetOf('btcusdt')).toBe('BTC')
    expect(baseAssetOf('BTCEUR')).toBe('')
    const fills = [
      { commission: 0.0001, commissionAsset: 'SOL' },
      { commission: 0.05, commissionAsset: 'BNB' },
      { commission: 0.0002, commissionAsset: 'SOL' },
    ]
    expect(orderBaseFee(fills, 'SOL')).toBeCloseTo(0.0003, 10)
    expect(orderBaseFee(fills, '')).toBe(0)
  })

  it('stores net quantity at entry when the buy fee is taken in the base asset', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const r1 = await runTradingCycle({
      client: fakeClient({
        getKlines: async () => breakoutCandles(),
        placeOrder: async (o: any) => ({
          symbol: o.symbol,
          orderId: 1,
          status: 'FILLED',
          side: o.side,
          type: o.type,
          executedQty: 0.25,
          cummulativeQuoteQty: 25,
          fills: [
            { price: 100, qty: 0.25, commission: 0.00025, commissionAsset: 'BTC' },
          ],
          transactTime: Date.now(),
          avgPrice: 100,
        }),
      }) as never,
      config: { symbols: ['BTCUSDT'], enabledStrategies: ['breakout'] },
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    // Binance credited 0.25 − 0.00025 BTC; selling the gross 0.25 would fail.
    expect(getEngineState().positions[0]?.quantity).toBeCloseTo(0.24975, 10)
  })

  it('clamps the sell to the free balance and floors to the lot step', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['breakout'] }
    const r1 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    // Recorded quantity is 0.25 (no fills in the default fake), but the
    // account only holds 0.2499 BTC — the legacy-position situation.
    const sellOrders: Array<any> = []
    const r2 = await runTradingCycle({
      client: fakeClient({
        getKlines: async () => flatCandles(120), // +20% → take-profit fires
        getAccount: async () => ({
          accountType: 'SPOT',
          canTrade: true,
          balances: [
            { asset: 'USDT', free: 5000, locked: 0 },
            { asset: 'BTC', free: 0.2499, locked: 0 },
          ],
        }),
        getSymbolFilters: async () => ({
          stepSize: 0.001,
          minQty: 0.001,
          minNotional: 5,
        }),
        placeOrder: async (o: any) => {
          if (o.side === 'SELL') sellOrders.push(o)
          return {
            symbol: o.symbol,
            orderId: 2,
            status: 'FILLED',
            side: o.side,
            type: o.type,
            executedQty: o.side === 'SELL' ? o.quantity : 0.25,
            cummulativeQuoteQty: o.side === 'SELL' ? o.quantity * 120 : 25,
            fills: [],
            transactTime: Date.now(),
            avgPrice: 120,
          }
        },
      }) as never,
      config: cfg,
    })
    expect(r2.actions.some((a) => a.action === 'CLOSE')).toBe(true)
    expect(sellOrders).toHaveLength(1)
    expect(sellOrders[0].quantity).toBeCloseTo(0.249, 10)
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('counts consecutive close failures instead of failing silently', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['breakout'] }
    await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    const failingSellClient = () =>
      fakeClient({
        getKlines: async () => flatCandles(120),
        placeOrder: async (o: any) => {
          if (o.side === 'SELL')
            throw new Error('Account has insufficient balance for requested action.')
          return {
            symbol: o.symbol, orderId: 3, status: 'FILLED', side: o.side,
            type: o.type, executedQty: 0.25, cummulativeQuoteQty: 25,
            fills: [], transactTime: Date.now(), avgPrice: 100,
          }
        },
      }) as never
    const r2 = await runTradingCycle({ client: failingSellClient(), config: cfg })
    expect(r2.actions.some((a) => a.reason?.includes('close failed'))).toBe(true)
    expect(getEngineState().positions[0]?.closeFailureCount).toBe(1)
    await runTradingCycle({ client: failingSellClient(), config: cfg })
    expect(getEngineState().positions[0]?.closeFailureCount).toBe(2)
  })

  it('force book-closes after the failure limit so the cap is never held hostage', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const store = await import('./finance-store')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['breakout'] }
    await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    const db = store.readFinanceStore()
    for (const r of db.strategy_results as Array<any>) {
      if (r.kind === 'demo_open_position') r.closeFailureCount = 12
    }
    store.writeFinanceStore(db)
    const sellOrders: Array<any> = []
    const r2 = await runTradingCycle({
      client: fakeClient({
        getKlines: async () => flatCandles(120),
        placeOrder: async (o: any) => {
          if (o.side === 'SELL') sellOrders.push(o)
          return {
            symbol: o.symbol, orderId: 4, status: 'FILLED', side: o.side,
            type: o.type, executedQty: 0.25, cummulativeQuoteQty: 30,
            fills: [], transactTime: Date.now(), avgPrice: 120,
          }
        },
      }) as never,
      config: cfg,
    })
    const close = r2.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('force-closed-unsellable')
    expect(sellOrders).toHaveLength(0)
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('force book-closes dust below exchange minimums instead of retrying forever', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['breakout'] }
    await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    const sellOrders: Array<any> = []
    const r2 = await runTradingCycle({
      client: fakeClient({
        getKlines: async () => flatCandles(120),
        getSymbolFilters: async () => ({
          stepSize: 0.001,
          minQty: 0.5, // recorded 0.25 is below the exchange minimum — unsellable
          minNotional: 5,
        }),
        placeOrder: async (o: any) => {
          if (o.side === 'SELL') sellOrders.push(o)
          return {
            symbol: o.symbol, orderId: 5, status: 'FILLED', side: o.side,
            type: o.type, executedQty: 0.25, cummulativeQuoteQty: 30,
            fills: [], transactTime: Date.now(), avgPrice: 120,
          }
        },
      }) as never,
      config: cfg,
    })
    const close = r2.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('dust')
    expect(sellOrders).toHaveLength(0)
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('lets a fixed take-profit fire ahead of an expired max-hold window', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle } = await import('./demo-trading-engine')
    const store = await import('./finance-store')
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['breakout'],
      maxHoldMinutes: 60,
    }

    const r1 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)

    const db = store.readFinanceStore()
    const pos = (db.strategy_results as Array<any>).find(
      (r) => r.kind === 'demo_open_position',
    )
    pos.openedAt = new Date(Date.now() - 90 * 60_000).toISOString()
    store.writeFinanceStore(db)

    // Price well above entry — take-profit (3%) fires the same cycle the
    // (also-expired) max-hold window would.
    const r2 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(130) }) as never,
      config: cfg,
    })
    const close = r2.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('take-profit')
    expect(close?.reason).not.toContain('max-hold')
  })

  it('uses ATR target instead of fixed take-profit when configured', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['breakout'],
      atrPeriod: 3,
      atrTakeProfitMultiple: 2,
      takeProfitPct: 0.01,
    }

    const r1 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    expect(getEngineState().positions[0]?.atrAtEntry).toBeCloseTo(5 / 3, 6)
    expect(getEngineState().positions[0]?.atrTakeProfitPrice).toBeCloseTo(
      100 + (5 / 3) * 2,
      6,
    )

    const r2 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(102) }) as never,
      config: cfg,
    })
    expect(r2.actions.some((a) => a.action === 'CLOSE')).toBe(false)

    const r3 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(104) }) as never,
      config: cfg,
    })
    const close = r3.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('atr-target')
    expect(getEngineState().positions).toHaveLength(0)
  })

  it('uses ATR trailing distance from the high-water price', async () => {
    await setMode('testnet_execute')
    const { getEngineState, runTradingCycle } =
      await import('./demo-trading-engine')
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['breakout'],
      atrPeriod: 3,
      atrTrailingMultiple: 2,
      takeProfitPct: 0.01,
    }

    const r1 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => breakoutCandles() }) as never,
      config: cfg,
    })
    expect(r1.actions.some((a) => a.action === 'OPEN')).toBe(true)
    expect(getEngineState().positions[0]?.atrTrailDistance).toBeCloseTo(
      (5 / 3) * 2,
      6,
    )

    const r2 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(110) }) as never,
      config: cfg,
    })
    expect(r2.actions.some((a) => a.action === 'CLOSE')).toBe(false)
    expect(getEngineState().positions[0]?.highWaterPrice).toBe(110)

    const r3 = await runTradingCycle({
      client: fakeClient({ getKlines: async () => flatCandles(106) }) as never,
      config: cfg,
    })
    const close = r3.actions.find((a) => a.action === 'CLOSE')
    expect(close?.reason).toContain('atr-trailing-stop')
    expect(getEngineState().positions).toHaveLength(0)
  })
})

describe('runTradingCycle concurrency', () => {
  it('serializes overlapping cycles — the second is rejected as busy', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle } = await import('./demo-trading-engine')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] }
    const [a, b] = await Promise.all([
      runTradingCycle({ client: fakeClient() as never, config: cfg }),
      runTradingCycle({ client: fakeClient() as never, config: cfg }),
    ])
    const busy = [a, b].filter(
      (r) => !r.ran && /already in progress/.test(r.reason ?? ''),
    )
    expect(busy).toHaveLength(1)
  })
})

describe('runTradingCycle fill handling', () => {
  it('retains the position when a sell order does not fill', async () => {
    await setMode('testnet_execute')
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    const cfg = { symbols: ['BTCUSDT'], enabledStrategies: ['rsi_reversion'] }
    // Cycle 1: oversold downtrend → BUY fills normally → 1 open position.
    await runTradingCycle({ client: fakeClient() as never, config: cfg })
    expect(getEngineState().positions.length).toBe(1)
    // Cycle 2: price well above entry → take-profit exit, but the SELL returns zero fill.
    const noFillBase = Date.now() - 31 * 60 * 60_000
    const noFillSell = fakeClient({
      getKlines: async () =>
        Array.from({ length: 31 }, (_, i) => ({
          openTime: noFillBase + i * 60 * 60_000,
          open: 130,
          high: 130,
          low: 130,
          close: 130,
          volume: 1,
        })),
      placeOrder: async (o: any) => ({
        symbol: o.symbol,
        orderId: 1,
        status: o.side === 'SELL' ? 'EXPIRED' : 'FILLED',
        side: o.side,
        type: o.type,
        executedQty: o.side === 'SELL' ? 0 : 0.25,
        cummulativeQuoteQty: o.side === 'SELL' ? 0 : 25,
        fills: [],
        transactTime: Date.now(),
        avgPrice: 130,
      }),
    })
    const r = await runTradingCycle({
      client: noFillSell as never,
      config: cfg,
    })
    expect(r.actions.some((a) => a.action === 'CLOSE')).toBe(false)
    expect(getEngineState().positions.length).toBe(1)
  })
})

describe('runTradingCycle live Binance gates', () => {
  it('blocks live mode until app-level live approval is recorded', async () => {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    db.settings.tradingMode = 'live_manual_approval' as never
    db.settings.liveTradingEnabled = true
    db.settings.emergencyKillSwitch = false
    store.writeFinanceStore(db)

    const { runTradingCycle } = await import('./demo-trading-engine')
    const res = await runTradingCycle({
      client: fakeClient({
        environment: 'live',
        host: 'api.binance.com',
      }) as never,
    })
    expect(res.ran).toBe(false)
    expect(res.reason).toMatch(/approval/)
  })

  it('pauses live mode before account access when decision quality is not ready', async () => {
    await armLiveMode()
    const getAccount = vi.fn(async () => ({
      accountType: 'SPOT',
      canTrade: true,
      balances: [{ asset: 'USDT', free: 5000, locked: 0 }],
    }))
    const { runTradingCycle } = await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: fakeClient({
        environment: 'live',
        host: 'api.binance.com',
        getAccount,
      }) as never,
    })

    expect(res.ran).toBe(false)
    expect(res.reason).toMatch(/decision quality keeps live paused/)
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('caps live entries and records a paper shadow decision before placing the order', async () => {
    await armLiveMode()
    await seedLiveReadyEvidence()
    const testOrders: Array<any> = []
    const placedOrders: Array<any> = []
    const liveClient = fakeClient({
      environment: 'live',
      host: 'api.binance.com',
      testOrder: async (order: any) => {
        testOrders.push(order)
      },
      placeOrder: async (order: any) => {
        placedOrders.push(order)
        return {
          symbol: order.symbol,
          orderId: 42,
          status: 'FILLED',
          side: order.side,
          type: order.type,
          executedQty: order.side === 'BUY' ? 0.1 : 0.1,
          cummulativeQuoteQty:
            order.side === 'BUY' ? (order.quoteOrderQty ?? 10) : 12,
          fills: [],
          transactTime: Date.now(),
          avgPrice: 100,
        }
      },
    })
    const { runTradingCycle, getEngineState } =
      await import('./demo-trading-engine')
    const cfg = {
      symbols: ['BTCUSDT'],
      enabledStrategies: ['rsi_reversion'],
      quotePerTrade: 25,
    }

    const res = await runTradingCycle({
      client: liveClient as never,
      config: cfg,
    })

    expect(res.ran).toBe(true)
    expect(res.executionMode).toBe('live')
    expect(testOrders[0]).toMatchObject({ side: 'BUY', quoteOrderQty: 10 })
    expect(placedOrders[0]).toMatchObject({ side: 'BUY', quoteOrderQty: 10 })
    expect(getEngineState().positions).toHaveLength(1)
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    expect(
      db.strategy_results.some(
        (row: any) =>
          row.kind === 'paper_shadow_decision' && row.side === 'BUY',
      ),
    ).toBe(true)
    expect(
      db.strategy_results.filter(
        (row: any) => row.kind === 'demo_open_position',
      ),
    ).toHaveLength(2)
  })
})

describe('runTradingCycle decision-quality safeguards', () => {
  it('reduces entry size while evidence is insufficient', async () => {
    await setMode('testnet_execute')
    const placedOrders: Array<any> = []
    const client = fakeClient({
      placeOrder: async (order: any) => {
        placedOrders.push(order)
        return {
          symbol: order.symbol,
          orderId: 99,
          status: 'FILLED',
          side: order.side,
          type: order.type,
          executedQty: 0.1,
          cummulativeQuoteQty: order.quoteOrderQty ?? 10,
          fills: [],
          transactTime: Date.now(),
          avgPrice: 100,
        }
      },
    })
    const { runTradingCycle } = await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: client as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        quotePerTrade: 40,
      },
    })

    expect(res.ran).toBe(true)
    expect(placedOrders[0]).toMatchObject({ side: 'BUY', quoteOrderQty: 10 })
  })

  it('blocks strategies marked disable_until_review before order placement', async () => {
    await setMode('testnet_execute')
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 3,
        wins: 0,
        losses: 3,
        totalPnlQuote: -9,
        score: -0.4,
        winRate: 0,
        avgPnlQuote: -3,
        lossStreak: 0,
        updatedAt: new Date().toISOString(),
      },
    ] as any
    store.writeFinanceStore(db)
    const placeOrder = vi.fn()
    const { runTradingCycle } = await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: fakeClient({ placeOrder }) as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        quotePerTrade: 40,
      },
    })

    expect(res.ran).toBe(true)
    expect(
      res.actions.some(
        (action) =>
          action.action === 'BLOCKED' &&
          action.reason.includes('decision_quality_disable'),
      ),
    ).toBe(true)
    expect(placeOrder).not.toHaveBeenCalled()
  })
})

describe('strategy overrides', () => {
  it('reuses an existing active override instead of duplicating it', async () => {
    const { setStrategyOverride, strategyOverrideState } =
      await import('./demo-trading-engine')

    const first = setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'disabled',
      reason: 'manual review',
    })
    const second = setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'disabled',
      reason: 'manual review',
    })
    const state = strategyOverrideState()

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(state.active).toHaveLength(1)
    expect(state.history).toHaveLength(1)
    expect(state.active[0]).toMatchObject({
      strategyId: 'rsi_reversion',
      mode: 'disabled',
    })
  })

  it('stores review and expiry windows on active overrides', async () => {
    const { setStrategyOverride, strategyOverrideState } =
      await import('./demo-trading-engine')

    const result = setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'disabled',
      reason: 'temporary review',
      reviewAfterDays: 2,
      expiresAfterDays: 5,
    })
    const active = strategyOverrideState().active[0]
    const updatedAt = Date.parse(active.updatedAt)

    expect(result.changed).toBe(true)
    expect(active.reviewAt).toBeTruthy()
    expect(active.expiresAt).toBeTruthy()
    expect(Date.parse(active.reviewAt!) - updatedAt).toBeGreaterThan(
      24 * 60 * 60 * 1000,
    )
    expect(Date.parse(active.expiresAt!) - updatedAt).toBeGreaterThan(
      4 * 24 * 60 * 60 * 1000,
    )
    expect(result.history[0]).toMatchObject({
      strategyId: 'rsi_reversion',
      reviewAt: active.reviewAt,
      expiresAt: active.expiresAt,
    })
  })

  it('clears an active override and records the re-enable history', async () => {
    const { setStrategyOverride, strategyOverrideState } =
      await import('./demo-trading-engine')

    setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'reduce_size',
      multiplier: 0.5,
    })
    const result = setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'clear',
      reason: 'review complete',
    })
    const state = strategyOverrideState()

    expect(result.changed).toBe(true)
    expect(state.active).toHaveLength(0)
    expect(state.history.map((row) => row.action)).toEqual([
      'reduced_size',
      'cleared',
    ])
  })

  it('blocks a disabled strategy before order placement', async () => {
    await setMode('testnet_execute')
    const placeOrder = vi.fn()
    const { setStrategyOverride, runTradingCycle } =
      await import('./demo-trading-engine')
    setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'disabled',
      reason: 'bad assumption',
    })

    const res = await runTradingCycle({
      client: fakeClient({ placeOrder }) as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        quotePerTrade: 40,
      },
    })

    expect(res.ran).toBe(true)
    expect(
      res.actions.some(
        (action) =>
          action.action === 'BLOCKED' &&
          action.reason.includes('manual_strategy_override'),
      ),
    ).toBe(true)
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('ignores expired disabled overrides before order placement', async () => {
    await setMode('testnet_execute')
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    db.settings.demoTrading = {
      ...(db.settings.demoTrading as Record<string, unknown>),
      strategyOverrides: {
        active: [
          {
            id: 'expired_rsi_override',
            strategyId: 'rsi_reversion',
            mode: 'disabled',
            multiplier: 0,
            reason: 'expired temporary disable',
            createdAt: past,
            updatedAt: past,
            reviewAt: past,
            expiresAt: past,
            source: 'manual',
          },
        ],
        history: [],
      },
    } as never
    store.writeFinanceStore(db)
    const placeOrder = vi.fn(async (order: any) => ({
      symbol: order.symbol,
      orderId: 101,
      status: 'FILLED',
      side: order.side,
      type: order.type,
      executedQty: 0.1,
      cummulativeQuoteQty: order.quoteOrderQty ?? 10,
      fills: [],
      transactTime: Date.now(),
      avgPrice: 100,
    }))
    const { runTradingCycle, strategyOverrideState } =
      await import('./demo-trading-engine')

    const res = await runTradingCycle({
      client: fakeClient({ placeOrder }) as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        quotePerTrade: 40,
      },
    })

    expect(strategyOverrideState().active).toHaveLength(0)
    expect(res.ran).toBe(true)
    expect(
      res.actions.some(
        (action) =>
          action.action === 'BLOCKED' &&
          action.reason.includes('manual_strategy_override'),
      ),
    ).toBe(false)
    expect(placeOrder).toHaveBeenCalled()
  })

  it('applies manual reduce-size overrides before guardian checks', async () => {
    await setMode('testnet_execute')
    const placedOrders: Array<any> = []
    const { setStrategyOverride, runTradingCycle } =
      await import('./demo-trading-engine')
    setStrategyOverride({
      strategyId: 'rsi_reversion',
      overrideAction: 'reduce_size',
      multiplier: 0.5,
      reason: 'halve until reviewed',
    })

    const res = await runTradingCycle({
      client: fakeClient({
        placeOrder: async (order: any) => {
          placedOrders.push(order)
          return {
            symbol: order.symbol,
            orderId: 100,
            status: 'FILLED',
            side: order.side,
            type: order.type,
            executedQty: 0.05,
            cummulativeQuoteQty: order.quoteOrderQty ?? 5,
            fills: [],
            transactTime: Date.now(),
            avgPrice: 100,
          }
        },
      }) as never,
      config: {
        symbols: ['BTCUSDT'],
        enabledStrategies: ['rsi_reversion'],
        quotePerTrade: 40,
      },
    })

    expect(res.ran).toBe(true)
    expect(placedOrders[0]).toMatchObject({ side: 'BUY', quoteOrderQty: 5 })
  })

  it('applies validation recommendations as active overrides without duplicating equivalent existing overrides', async () => {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const updatedAt = new Date().toISOString()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 3,
        wins: 0,
        losses: 3,
        totalPnlQuote: -9,
        score: -1,
        winRate: 0,
        avgPnlQuote: -3,
        lossStreak: 0,
        updatedAt,
      },
      {
        kind: 'demo_strategy_score',
        strategyId: 'sma_crossover',
        trades: 3,
        wins: 1,
        losses: 2,
        totalPnlQuote: 1,
        score: 0,
        winRate: 1 / 3,
        avgPnlQuote: 1 / 3,
        lossStreak: 0,
        updatedAt,
      },
    ] as any
    store.writeFinanceStore(db)
    const { applyStrategyOverrideRecommendations } =
      await import('./demo-trading-engine')

    const first = applyStrategyOverrideRecommendations()
    const second = applyStrategyOverrideRecommendations()

    expect(first.result.applied.filter((item) => item.changed)).toHaveLength(2)
    expect(first.result.activeOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyId: 'rsi_reversion',
          mode: 'disabled',
        }),
        expect.objectContaining({
          strategyId: 'sma_crossover',
          mode: 'reduce_size',
          multiplier: 0.5,
        }),
      ]),
    )
    expect(first.result.history).toHaveLength(2)
    expect(second.result.applied).toHaveLength(0)
    expect(second.result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyId: 'rsi_reversion',
          recommendation: 'disable_until_review',
        }),
        expect.objectContaining({
          strategyId: 'sma_crossover',
          recommendation: 'reduce_size',
        }),
      ]),
    )
    expect(second.result.activeOverrides).toHaveLength(2)
    expect(second.result.history).toHaveLength(2)
  })

  it('does not loosen a stricter manual reduce-size override', async () => {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'sma_crossover',
        trades: 3,
        wins: 1,
        losses: 2,
        totalPnlQuote: 1,
        score: 0,
        winRate: 1 / 3,
        avgPnlQuote: 1 / 3,
        lossStreak: 0,
        updatedAt: new Date().toISOString(),
      },
    ] as any
    store.writeFinanceStore(db)
    const { applyStrategyOverrideRecommendations, setStrategyOverride } =
      await import('./demo-trading-engine')
    setStrategyOverride({
      strategyId: 'sma_crossover',
      overrideAction: 'reduce_size',
      multiplier: 0.25,
      reason: 'manual tighter',
    })

    const result = applyStrategyOverrideRecommendations()
    const active = result.result.activeOverrides.find(
      (override) => override.strategyId === 'sma_crossover',
    )

    expect(active).toMatchObject({
      mode: 'reduce_size',
      multiplier: 0.25,
      reason: 'manual tighter',
    })
    expect(result.result.applied).toHaveLength(0)
    expect(result.result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyId: 'sma_crossover',
          recommendation: 'reduce_size',
          reason: expect.stringContaining('as strict or stricter'),
        }),
      ]),
    )
    expect(result.result.history).toHaveLength(1)
  })
})

describe('decisionQualityReport', () => {
  it('reports insufficient data before closed trades exist', async () => {
    const { decisionQualityReport } = await import('./demo-trading-engine')

    const report = decisionQualityReport()

    expect(report.status).toBe('insufficient_data')
    expect(report.recommendedAdjustments.recommendedMode).toBe('paper_trade')
    expect(report.recommendedAdjustments.pauseLive).toBe(true)
    expect(
      report.findings.some((finding) =>
        finding.title.includes('More paper/testnet evidence'),
      ),
    ).toBe(true)
  })

  it('allows testnet validation after enough positive closed-trade evidence', async () => {
    const store = await import('./finance-store')
    const now = Date.now()
    const closedAt = (index: number) =>
      new Date(now + index * 1000).toISOString()
    const db = store.readFinanceStore()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 5,
        wins: 3,
        losses: 2,
        totalPnlQuote: 7,
        score: 0.7,
        winRate: 0.6,
        avgPnlQuote: 1.4,
        lossStreak: 0,
        updatedAt: closedAt(5),
      },
      ...[3, 3, -1, 3, -1].map((pnl, index) => ({
        kind: 'demo_trade_log',
        id: `trade_${index}`,
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 100 + pnl,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 100 + pnl,
        pnlQuote: pnl,
        feesQuote: 0,
        reason: 'test close',
        openedAt: closedAt(index),
        closedAt: closedAt(index + 1),
        executionMode: 'paper',
      })),
    ] as any
    store.writeFinanceStore(db)
    const { decisionQualityReport } = await import('./demo-trading-engine')

    const report = decisionQualityReport()

    expect(report.status).toBe('ready_for_testnet')
    expect(report.validations.enoughDataForTestnet).toBe(true)
    expect(report.recommendedAdjustments.recommendedMode).toBe(
      'testnet_execute',
    )
    expect(report.recommendedAdjustments.pauseLive).toBe(true)
  })

  it('flags losing streaks and keeps live paused', async () => {
    const store = await import('./finance-store')
    const now = Date.now()
    const closedAt = (index: number) =>
      new Date(now + index * 1000).toISOString()
    const db = store.readFinanceStore()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 3,
        wins: 0,
        losses: 3,
        totalPnlQuote: -9,
        score: -1,
        winRate: 0,
        avgPnlQuote: -3,
        lossStreak: 3,
        updatedAt: closedAt(3),
      },
      ...[-3, -2, -4].map((pnl, index) => ({
        kind: 'demo_trade_log',
        id: `loss_${index}`,
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 100 + pnl,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 100 + pnl,
        pnlQuote: pnl,
        feesQuote: 0,
        reason: 'test close',
        openedAt: closedAt(index),
        closedAt: closedAt(index + 1),
        executionMode: 'paper',
      })),
    ] as any
    store.writeFinanceStore(db)
    const { decisionQualityReport } = await import('./demo-trading-engine')

    const report = decisionQualityReport()

    expect(report.status).toBe('insufficient_data')
    expect(report.recommendedAdjustments.pauseLive).toBe(true)
    expect(
      report.findings.some(
        (finding) =>
          finding.severity === 'critical' &&
          finding.title.includes('loss-streak'),
      ),
    ).toBe(true)
    expect(report.byStrategy[0]?.recommendation).toBe('cooldown')
  })

  it('compares paired actual trades against paper shadow trades', async () => {
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const closedAt = new Date().toISOString()
    db.strategy_results = [
      {
        kind: 'demo_trade_log',
        id: 'actual',
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 99,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 99,
        pnlQuote: -1,
        feesQuote: 0,
        reason: 'actual close',
        openedAt: closedAt,
        closedAt,
        executionMode: 'testnet',
        groupId: 'group-1',
      },
      {
        kind: 'demo_trade_log',
        id: 'shadow',
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 101,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 101,
        pnlQuote: 1,
        feesQuote: 0,
        reason: 'shadow close',
        openedAt: closedAt,
        closedAt,
        executionMode: 'shadow_paper',
        groupId: 'group-1',
        shadowOfGroupId: 'group-1',
      },
    ] as any
    store.writeFinanceStore(db)
    const { decisionQualityReport } = await import('./demo-trading-engine')

    const report = decisionQualityReport()

    expect(report.sample.pairedShadowTrades).toBe(1)
    expect(report.metrics.shadowVsActualAvgSlippageQuote).toBe(-2)
    expect(
      report.findings.some((finding) =>
        finding.title.includes('underperform paper shadow'),
      ),
    ).toBe(true)
  })
})

describe('applyRecommendedSafeguards', () => {
  it('applies insufficient-data safeguards idempotently', async () => {
    const { applyRecommendedSafeguards } = await import('./demo-trading-engine')

    const first = applyRecommendedSafeguards()
    const second = applyRecommendedSafeguards()

    expect(first.applied.tradingMode).toBe('paper_trade')
    expect(first.applied.executionAccount).toBe('paper')
    expect(first.applied.quotePerTrade).toBe(6.25)
    expect(second.applied.quotePerTrade).toBe(6.25)
    expect(second.applied.baseQuotePerTrade).toBe(25)
  })

  it('records safeguard history without duplicating identical no-op applies', async () => {
    const { applyRecommendedSafeguards, safeguardHistory } =
      await import('./demo-trading-engine')

    applyRecommendedSafeguards()
    applyRecommendedSafeguards()
    const history = safeguardHistory()

    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      status: 'insufficient_data',
      recommendedMode: 'paper_trade',
      appliedTradingMode: 'paper_trade',
      executionAccount: 'paper',
      liveTradingEnabled: false,
      baseQuotePerTrade: 25,
      appliedQuotePerTrade: 6.25,
      positionSizeMultiplier: 0.25,
      pauseLive: true,
      liveRecommendationDeferred: false,
    })
    expect(history[0].previousQuotePerTrade).toBe(25)
  })

  it('defers a live recommendation unless live has already been explicitly armed', async () => {
    await seedLiveReadyEvidence()
    const { applyRecommendedSafeguards } = await import('./demo-trading-engine')

    const result = applyRecommendedSafeguards()

    expect(result.applied.recommendedMode).toBe('live_manual_approval')
    expect(result.applied.liveRecommendationDeferred).toBe(true)
    expect(result.applied.tradingMode).toBe('testnet_execute')
    expect(result.applied.liveTradingEnabled).toBe(false)
  })

  it('keeps live manual mode only when live was already armed and quality is ready', async () => {
    await armLiveMode()
    await seedLiveReadyEvidence()
    const { applyRecommendedSafeguards } = await import('./demo-trading-engine')

    const result = applyRecommendedSafeguards()

    expect(result.applied.recommendedMode).toBe('live_manual_approval')
    expect(result.applied.liveRecommendationDeferred).toBe(false)
    expect(result.applied.tradingMode).toBe('live_manual_approval')
    expect(result.applied.executionAccount).toBe('binance_live')
    expect(result.applied.liveTradingEnabled).toBe(true)
  })
})

describe('learning cycle', () => {
  it('auto-applies conservative learning candidates only in paper mode', async () => {
    await setMode('paper_trade')
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const base = Date.now()
    const closedAt = (index: number) =>
      new Date(base + index * 1000).toISOString()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 3,
        wins: 0,
        losses: 3,
        totalPnlQuote: -9,
        score: -1,
        winRate: 0,
        avgPnlQuote: -3,
        lossStreak: 3,
        updatedAt: closedAt(4),
      },
      ...[-3, -2, -4].map((pnl, index) => ({
        kind: 'demo_trade_log',
        id: `paper_loss_${index}`,
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 100 + pnl,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 100 + pnl,
        pnlQuote: pnl,
        feesQuote: 0,
        reason: 'paper loss',
        openedAt: closedAt(index),
        closedAt: closedAt(index + 1),
        executionMode: 'paper',
      })),
    ] as any
    store.writeFinanceStore(db)
    const { learningReport, runLearningCycle } =
      await import('./demo-trading-engine')

    const result = runLearningCycle()
    const nextDb = store.readFinanceStore()

    expect(result.generatedCandidate?.status).toBe('paper_applied')
    expect(result.appliedCandidate?.status).toBe('paper_applied')
    expect((nextDb.settings.demoTrading as any).quotePerTrade).toBe(6.25)
    expect(
      (nextDb.settings.demoTrading as any).strategyOverrides.active,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyId: 'rsi_reversion',
          mode: 'disabled',
        }),
      ]),
    )
    expect(learningReport().latestCandidate?.status).toBe('paper_applied')
  })

  it('does not auto-apply learning candidates outside paper mode', async () => {
    await setMode('testnet_execute')
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const base = Date.now()
    const closedAt = (index: number) =>
      new Date(base + index * 1000).toISOString()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 3,
        wins: 0,
        losses: 3,
        totalPnlQuote: -9,
        score: -1,
        winRate: 0,
        avgPnlQuote: -3,
        lossStreak: 3,
        updatedAt: closedAt(4),
      },
      ...[-3, -2, -4].map((pnl, index) => ({
        kind: 'demo_trade_log',
        id: `testnet_loss_${index}`,
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 100 + pnl,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 100 + pnl,
        pnlQuote: pnl,
        feesQuote: 0,
        reason: 'testnet loss',
        openedAt: closedAt(index),
        closedAt: closedAt(index + 1),
        executionMode: 'testnet',
      })),
    ] as any
    store.writeFinanceStore(db)
    const { runLearningCycle } = await import('./demo-trading-engine')

    const result = runLearningCycle()
    const nextDb = store.readFinanceStore()

    expect(result.generatedCandidate?.status).toBe('proposed')
    expect(result.appliedCandidate).toBeNull()
    expect(result.skippedReason).toMatch(/paper_trade/)
    expect(nextDb.settings.tradingMode).toBe('testnet_execute')
    expect((nextDb.settings.demoTrading as any)?.quotePerTrade).toBeUndefined()
    expect(
      (nextDb.settings.demoTrading as any)?.strategyOverrides?.active ?? [],
    ).toHaveLength(0)
  })

  it('auto-applies conservative learning candidates in testnet_execute when explicitly opted in', async () => {
    await setMode('testnet_execute')
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    // learningPolicy.autoApplyModes stays ['paper_trade'] by default (see
    // the previous test) — this test exercises the explicit opt-in path via
    // the same knob set_demo_config exposes at src/routes/api/finance.ts.
    db.settings.demoTrading = {
      learningPolicy: { autoApplyModes: ['paper_trade', 'testnet_execute'] },
    } as any
    const base = Date.now()
    const closedAt = (index: number) =>
      new Date(base + index * 1000).toISOString()
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 3,
        wins: 0,
        losses: 3,
        totalPnlQuote: -9,
        score: -1,
        winRate: 0,
        avgPnlQuote: -3,
        lossStreak: 3,
        updatedAt: closedAt(4),
      },
      ...[-3, -2, -4].map((pnl, index) => ({
        kind: 'demo_trade_log',
        id: `testnet_opted_in_loss_${index}`,
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 100 + pnl,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 100 + pnl,
        pnlQuote: pnl,
        feesQuote: 0,
        reason: 'testnet loss',
        openedAt: closedAt(index),
        closedAt: closedAt(index + 1),
        executionMode: 'testnet',
      })),
    ] as any
    store.writeFinanceStore(db)
    const { learningReport, runLearningCycle } =
      await import('./demo-trading-engine')

    const result = runLearningCycle()
    const nextDb = store.readFinanceStore()

    // Same risk-reducing-only patch as the paper-mode test — quotePerTrade
    // can only be Math.min-clamped down, and strategyOverrides can only be
    // 'disabled'/'reduce_size' — testnet_execute doesn't unlock anything new.
    expect(result.generatedCandidate?.status).toBe('testnet_applied')
    expect(result.appliedCandidate?.status).toBe('testnet_applied')
    expect((nextDb.settings.demoTrading as any).quotePerTrade).toBe(6.25)
    expect(
      (nextDb.settings.demoTrading as any).strategyOverrides.active,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyId: 'rsi_reversion',
          mode: 'disabled',
        }),
      ]),
    )
    expect(learningReport().latestCandidate?.status).toBe('testnet_applied')
  })

  it('creates testnet-ready recommendations after conservative paper stability without changing mode', async () => {
    await setMode('paper_trade')
    const store = await import('./finance-store')
    const db = store.readFinanceStore()
    const base = Date.UTC(2026, 0, 1)
    const closedAt = (index: number) =>
      new Date(base + index * 12 * 60 * 60_000).toISOString()
    const pnls = [
      ...Array.from({ length: 6 }, () => [2, 2, 2, -1]).flat(),
      ...Array.from({ length: 6 }, () => 2),
    ]
    db.strategy_results = [
      {
        kind: 'demo_strategy_score',
        strategyId: 'rsi_reversion',
        trades: 30,
        wins: 24,
        losses: 6,
        totalPnlQuote: 42,
        score: 4.2,
        winRate: 0.8,
        avgPnlQuote: 1.4,
        lossStreak: 0,
        updatedAt: closedAt(31),
      },
      ...pnls.map((pnl, index) => ({
        kind: 'demo_trade_log',
        id: `stable_${index}`,
        symbol: 'BTCUSDT',
        strategyId: 'rsi_reversion',
        entryPrice: 100,
        exitPrice: 100 + pnl,
        quantity: 1,
        entryQuote: 100,
        exitQuote: 100 + pnl,
        pnlQuote: pnl,
        feesQuote: 0,
        reason: 'stable paper result',
        openedAt: closedAt(index),
        closedAt: closedAt(index + 1),
        executionMode: 'paper',
      })),
    ] as any
    store.writeFinanceStore(db)
    const { runLearningCycle } = await import('./demo-trading-engine')

    const result = runLearningCycle()
    const nextDb = store.readFinanceStore()

    expect(result.generatedCandidate?.status).toBe('testnet_ready')
    expect(result.generatedCandidate?.promotion).toMatchObject({
      eligibleFor: 'testnet_review',
      requiresApproval: true,
    })
    expect(result.appliedCandidate).toBeNull()
    expect(nextDb.settings.tradingMode).toBe('paper_trade')
    expect(nextDb.settings.executionAccount).toBe('paper')
    expect(nextDb.settings.liveTradingEnabled).toBe(false)
  })
})
