/**
 * Deep historical candle backfill for the demo trading engine + backtester.
 *
 * The finance store retains at most 1000 candles per symbol+interval
 * (CANDLE_RETENTION_PER_SYMBOL_INTERVAL in binance-market.service.ts), so this
 * script does two things:
 *   1. Fetches the full requested history from Binance's public data API
 *      (paginated, 1000 klines per request) and caches it as JSON under
 *      ~/.hermes/finance/candles-cache/ — the backtester reads from there.
 *   2. Upserts the most recent 1000 candles into the finance store through
 *      addBinanceCandles() so the live engine's market-learning layer sees a
 *      fully warmed dataset.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-candles.ts [--symbols BTCUSDT,ETHUSDT]
 *     [--intervals 1h,4h] [--days 365] [--skip-store]
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { addBinanceCandles } from '../src/server/binance-market.service'

const BINANCE_SPOT_API = 'https://data-api.binance.vision'
const PAGE_LIMIT = 1000
const PAGE_DELAY_MS = 350
const STORE_RETENTION = 1000

interface Kline {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: number
  takerBuyVolume: number
}

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback
}

function intervalMs(interval: string): number {
  const match = interval.match(/^(\d+)([mhdw])$/)
  if (!match) throw new Error(`unsupported interval: ${interval}`)
  const value = Number(match[1])
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[
    match[2] as 'm' | 'h' | 'd' | 'w'
  ]!
  return value * unit
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchKlinesPage(
  symbol: string,
  interval: string,
  startTime: number,
): Promise<Array<Kline>> {
  const url =
    `${BINANCE_SPOT_API}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}&startTime=${startTime}&limit=${PAGE_LIMIT}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok)
    throw new Error(`klines ${symbol} ${interval}: HTTP ${res.status}`)
  const rows = (await res.json()) as Array<Array<unknown>>
  return rows.map((k) => ({
    openTime: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
    closeTime: Number(k[6]),
    takerBuyVolume: parseFloat(String(k[9])),
  }))
}

async function fetchDeepHistory(
  symbol: string,
  interval: string,
  days: number,
): Promise<Array<Kline>> {
  const now = Date.now()
  const step = intervalMs(interval)
  let cursor = now - days * 86_400_000
  const all: Array<Kline> = []
  while (cursor < now) {
    const page = await fetchKlinesPage(symbol, interval, cursor)
    if (page.length === 0) break
    all.push(...page)
    const lastOpen = page[page.length - 1].openTime
    if (lastOpen + step <= cursor) break // no forward progress — bail out
    cursor = lastOpen + step
    if (page.length < PAGE_LIMIT) break // reached the present
    await sleep(PAGE_DELAY_MS)
  }
  // Dedupe by openTime (page boundaries can overlap) and drop the still-open
  // final candle so the backtester only ever sees closed candles.
  const byOpen = new Map<number, Kline>()
  for (const k of all) byOpen.set(k.openTime, k)
  return [...byOpen.values()]
    .sort((a, b) => a.openTime - b.openTime)
    .filter((k) => k.closeTime <= now)
}

async function main() {
  const symbols = arg('symbols', 'BTCUSDT,ETHUSDT')
    .split(',')
    .map((s) => s.trim().toUpperCase())
  const intervals = arg('intervals', '1h')
    .split(',')
    .map((s) => s.trim())
  const days = Number(arg('days', '365'))
  const skipStore = process.argv.includes('--skip-store')

  const cacheDir = path.join(
    os.homedir(),
    '.hermes',
    'finance',
    'candles-cache',
  )
  fs.mkdirSync(cacheDir, { recursive: true })

  for (const symbol of symbols) {
    for (const interval of intervals) {
      process.stdout.write(`Fetching ${symbol} ${interval} (${days}d)... `)
      const candles = await fetchDeepHistory(symbol, interval, days)
      const cachePath = path.join(cacheDir, `${symbol}-${interval}.json`)
      fs.writeFileSync(
        cachePath,
        JSON.stringify({
          symbol,
          interval,
          days,
          fetchedAt: new Date().toISOString(),
          candles,
        }),
      )
      console.log(`${candles.length} candles → ${cachePath}`)

      if (!skipStore) {
        const recent = candles.slice(-STORE_RETENTION)
        addBinanceCandles(
          symbol,
          interval,
          recent,
          'binance',
          'backfill-script',
        )
        console.log(
          `  store: upserted newest ${recent.length} candles into finance store`,
        )
      }
      await sleep(PAGE_DELAY_MS)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
