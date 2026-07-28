import * as https from 'node:https'
import {
  appendAuditLog,
  ensureFinanceStore,
  writeFinanceStore,
} from './finance-store'
import type { FinanceDatabase } from './finance-store'

// Binance API endpoints for market data (using data-api.binance.vision to avoid rate limits on the main API)
const BINANCE_SPOT_API = 'https://data-api.binance.vision'

// Outbound-request guards so a hung/oversized upstream can never hang or OOM the API handler.
const REQUEST_TIMEOUT_MS = 8000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MARKET_PRICE_RETENTION_PER_SYMBOL = 500
const CANDLE_RETENTION_PER_SYMBOL_INTERVAL = 1000

/**
 * GETs a URL and returns the parsed JSON body, bounded by a hard timeout and a
 * maximum response size. Rejects (aborting the socket) on timeout, oversized
 * body, network error, or invalid JSON.
 */
function httpsGetJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      let bytes = 0
      res.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > MAX_RESPONSE_BYTES) {
          req.destroy(
            new Error('Binance response exceeded maximum allowed size'),
          )
          return
        }
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T)
        } catch (err) {
          reject(new Error(`Failed to parse Binance response: ${err}`))
        }
      })
    })
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(
        new Error(`Binance request timed out after ${REQUEST_TIMEOUT_MS}ms`),
      )
    })
    req.on('error', (err) => {
      reject(new Error(`Failed to fetch from Binance: ${err}`))
    })
  })
}

// Types for Binance API responses
interface BinanceTickerPrice {
  symbol: string
  price: string
}

interface BinanceOrderBook {
  lastUpdateId: number
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}

type CandleInput = {
  open: number
  high: number
  low: number
  close: number
  volume: number
  openTime: number
  closeTime?: number
}

type MarketObservationResult = {
  symbol: string
  interval: string
  platform: string
  priceUpserted: boolean
  candlesInserted: number
  candlesUpdated: number
  marketPriceCount: number
  candleCount: number
}

function finiteNumber(value: unknown): number | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) ? number : null
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function quoteCurrency(symbol: string): string {
  const normalized = normalizeSymbol(symbol)
  const quotes = [
    'USDT',
    'FDUSD',
    'USDC',
    'BUSD',
    'BTC',
    'ETH',
    'BNB',
    'EUR',
    'GBP',
    'AUD',
    'TRY',
    'BRL',
    'DAI',
  ]
  return quotes.find((quote) => normalized.endsWith(quote)) ?? 'USDT'
}

function intervalMs(interval: string): number {
  const match = interval.match(/^(\d+)([mhdwM])$/)
  if (!match) return 0
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return 0
  const unit = match[2]
  if (unit === 'm') return value * 60_000
  if (unit === 'h') return value * 60 * 60_000
  if (unit === 'd') return value * 24 * 60 * 60_000
  if (unit === 'w') return value * 7 * 24 * 60 * 60_000
  if (unit === 'M') return value * 30 * 24 * 60 * 60_000
  return 0
}

function candleCloseMs(
  openTime: number,
  closeTime: unknown,
  interval: string,
): number {
  const explicit = finiteNumber(closeTime)
  if (explicit != null && explicit >= openTime) return explicit
  const duration = intervalMs(interval)
  return duration > 0 ? openTime + duration - 1 : openTime
}

function minuteBucketIso(date: Date): string {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000).toISOString()
}

function marketPriceId(
  platform: string,
  symbol: string,
  observedAt: string,
): string {
  return `${platform}:${normalizeSymbol(symbol)}:price:${observedAt}`
}

function candleId(
  platform: string,
  symbol: string,
  interval: string,
  openTime: number,
): string {
  return `${platform}:${normalizeSymbol(symbol)}:${interval}:${openTime}`
}

function pruneByKey<T>(
  rows: Array<T>,
  keyOf: (row: T) => string,
  timeOf: (row: T) => string,
  limit: number,
): Array<T> {
  const groups = new Map<string, Array<T>>()
  for (const row of rows) {
    const key = keyOf(row)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].flatMap((group) =>
    group
      .sort((a, b) => Date.parse(timeOf(b)) - Date.parse(timeOf(a)))
      .slice(0, limit)
      .sort((a, b) => Date.parse(timeOf(a)) - Date.parse(timeOf(b))),
  )
}

function upsertMarketPrice(
  db: FinanceDatabase,
  input: {
    symbol: string
    price: number
    bid?: number
    ask?: number
    volume?: number
    platform: string
    source: string
    observedAt?: string
  },
): boolean {
  const now = new Date().toISOString()
  const symbol = normalizeSymbol(input.symbol)
  const observedAt = input.observedAt ?? minuteBucketIso(new Date())
  const id = marketPriceId(input.platform, symbol, observedAt)
  const existingIndex = db.market_prices.findIndex((row) => row.id === id)
  const existing =
    existingIndex >= 0 ? db.market_prices[existingIndex] : undefined
  const row = {
    id,
    platform: input.platform,
    symbol,
    price: input.price,
    bid: input.bid,
    ask: input.ask,
    spread:
      input.bid != null && input.ask != null
        ? input.ask - input.bid
        : undefined,
    volume: input.volume,
    currency: quoteCurrency(symbol),
    observedAt,
    source: input.source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  if (existingIndex >= 0) db.market_prices[existingIndex] = row
  else db.market_prices.push(row)
  db.market_prices = pruneByKey(
    db.market_prices,
    (priceRow) => `${priceRow.platform}:${priceRow.symbol}`,
    (priceRow) => priceRow.observedAt,
    MARKET_PRICE_RETENTION_PER_SYMBOL,
  )
  return existingIndex < 0
}

function upsertCandles(
  db: FinanceDatabase,
  input: {
    symbol: string
    interval: string
    candles: Array<CandleInput>
    platform: string
    source: string
  },
): { inserted: number; updated: number } {
  const now = new Date().toISOString()
  const symbol = normalizeSymbol(input.symbol)
  let inserted = 0
  let updated = 0
  for (const candle of input.candles) {
    const openTime = finiteNumber(candle.openTime)
    const open = finiteNumber(candle.open)
    const high = finiteNumber(candle.high)
    const low = finiteNumber(candle.low)
    const close = finiteNumber(candle.close)
    const volume = finiteNumber(candle.volume)
    if (
      openTime == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      volume == null
    )
      continue
    const id = candleId(input.platform, symbol, input.interval, openTime)
    const existingIndex = db.historical_candles.findIndex(
      (row) => row.id === id,
    )
    const existing =
      existingIndex >= 0 ? db.historical_candles[existingIndex] : undefined
    const row = {
      id,
      platform: input.platform,
      symbol,
      interval: input.interval,
      open,
      high,
      low,
      close,
      volume,
      openedAt: new Date(openTime).toISOString(),
      closedAt: new Date(
        candleCloseMs(openTime, candle.closeTime, input.interval),
      ).toISOString(),
      source: input.source,
      createdAt:
        typeof existing?.createdAt === 'string' ? existing.createdAt : now,
      updatedAt: now,
    }
    if (existingIndex >= 0) {
      db.historical_candles[existingIndex] = row
      updated += 1
    } else {
      db.historical_candles.push(row)
      inserted += 1
    }
  }
  db.historical_candles = pruneByKey(
    db.historical_candles,
    (row) => `${row.platform}:${row.symbol}:${row.interval}`,
    (row) => (typeof row.openedAt === 'string' ? row.openedAt : ''),
    CANDLE_RETENTION_PER_SYMBOL_INTERVAL,
  )
  return { inserted, updated }
}

/**
 * Fetches the latest ticker price for a symbol from Binance
 */
export async function fetchBinanceTickerPrice(
  symbol: string,
): Promise<{ price: number; bid?: number; ask?: number }> {
  const url = `${BINANCE_SPOT_API}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`
  const parsed = await httpsGetJson<BinanceTickerPrice>(url)
  // The ticker/price endpoint doesn't provide bid/ask, we leave them undefined.
  return { price: parseFloat(parsed.price) }
}

/**
 * Fetches the order book (depth) for a symbol from Binance
 * @param symbol Trading pair symbol (e.g., BTCUSDT)
 * @param limit Limit of orders to return (default 100, max 1000)
 */
export async function fetchBinanceOrderBook(
  symbol: string,
  limit: number = 100,
): Promise<{
  bids: Array<{ price: number; quantity: number }>
  asks: Array<{ price: number; quantity: number }>
}> {
  const cappedLimit = Math.max(1, Math.min(limit, 1000))
  const url = `${BINANCE_SPOT_API}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${cappedLimit}`
  const parsed = await httpsGetJson<BinanceOrderBook>(url)
  return {
    bids: parsed.bids.map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
    })),
    asks: parsed.asks.map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
    })),
  }
}

/**
 * Fetches historical klines (OHLCV) for a symbol and interval from Binance
 * @param symbol Trading pair symbol (e.g., BTCUSDT)
 * @param interval Kline interval (e.g., 1h, 1d, 15m)
 * @param limit Number of klines to retrieve (max 1000)
 */
export async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  limit: number = 500,
): Promise<
  Array<{
    openTime: number
    open: number
    high: number
    low: number
    close: number
    volume: number
    closeTime: number
    takerBuyVolume: number
  }>
> {
  const cappedLimit = Math.max(1, Math.min(limit, 1000))
  const url = `${BINANCE_SPOT_API}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${cappedLimit}`
  const parsed = await httpsGetJson<Array<Array<unknown>>>(url)
  return parsed.map((k) => ({
    openTime: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
    closeTime: Number(k[6]),
    // Binance kline field index 9 (takerBuyBaseAssetVolume) — aggressor buy
    // volume within the bar, used by the taker-imbalance strategy.
    takerBuyVolume: parseFloat(String(k[9])),
  }))
}

/**
 * Adds a market price record to the finance store
 */
export function addMarketPrice(
  symbol: string,
  price: number,
  bid: number | undefined,
  ask: number | undefined,
  volume: number | undefined,
  platform: string = 'binance',
  source: string = 'binance-public-api',
): FinanceDatabase {
  const db = ensureFinanceStore()
  const normalizedSymbol = normalizeSymbol(symbol)
  upsertMarketPrice(db, {
    symbol: normalizedSymbol,
    price,
    bid,
    ask,
    volume,
    platform,
    source,
  })
  writeFinanceStore(db)
  appendAuditLog('market_price_upserted', {
    symbol: normalizedSymbol,
    price,
    platform,
  })
  return db
}

/**
 * Persists a batch of historical candles to the finance store in a single write.
 * Batching avoids re-serializing the whole store once per candle.
 */
export function addBinanceCandles(
  symbol: string,
  interval: string,
  candles: Array<CandleInput>,
  platform: string = 'binance',
  source: string = 'binance-public-api',
): FinanceDatabase {
  const db = ensureFinanceStore()
  const normalizedSymbol = normalizeSymbol(symbol)
  const result = upsertCandles(db, {
    symbol: normalizedSymbol,
    interval,
    candles,
    platform,
    source,
  })
  writeFinanceStore(db)
  appendAuditLog('historical_candles_upserted', {
    symbol: normalizedSymbol,
    interval,
    requested: candles.length,
    inserted: result.inserted,
    updated: result.updated,
    platform,
  })
  return db
}

/**
 * Persists the exact market data a trading-engine cycle evaluated.
 * Candle IDs are deterministic by platform/symbol/interval/openTime, so repeated
 * cycles update existing candles instead of inflating the learning dataset.
 */
export function recordBinanceMarketObservation(input: {
  symbol: string
  interval: string
  candles: Array<CandleInput>
  price: number
  bid?: number
  ask?: number
  volume?: number
  platform?: string
  source?: string
}): MarketObservationResult {
  const db = ensureFinanceStore()
  const platform = input.platform ?? 'binance'
  const source = input.source ?? 'binance-trading-engine'
  const symbol = normalizeSymbol(input.symbol)
  const priceUpserted = upsertMarketPrice(db, {
    symbol,
    price: input.price,
    bid: input.bid,
    ask: input.ask,
    volume: input.volume,
    platform,
    source,
  })
  const candleResult = upsertCandles(db, {
    symbol,
    interval: input.interval,
    candles: input.candles,
    platform,
    source,
  })
  writeFinanceStore(db)
  const result = {
    symbol,
    interval: input.interval,
    platform,
    priceUpserted,
    candlesInserted: candleResult.inserted,
    candlesUpdated: candleResult.updated,
    marketPriceCount: db.market_prices.filter(
      (row) => row.platform === platform && row.symbol === symbol,
    ).length,
    candleCount: db.historical_candles.filter(
      (row) =>
        row.platform === platform &&
        row.symbol === symbol &&
        row.interval === input.interval,
    ).length,
  }
  appendAuditLog('market_observation_upserted', {
    symbol: result.symbol,
    interval: result.interval,
    platform: result.platform,
    priceUpserted: result.priceUpserted,
    candlesInserted: result.candlesInserted,
    candlesUpdated: result.candlesUpdated,
    source,
  })
  return result
}
