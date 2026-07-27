/**
 * Signed Binance SPOT clients.
 *
 * BinanceDemoClient remains hard-locked to the Binance demo/testnet hosts.
 * BinanceLiveClient is separate and only builds against the approved production
 * host after explicit environment approval. Keeping the clients separate avoids
 * turning a testnet URL change into a real-money order path.
 */
import crypto from 'node:crypto'
import { recordConnectivityOutcome } from './connectivity-breaker'

const ALLOWED_DEMO_HOSTS = new Set([
  'demo-api.binance.com',
  'testnet.binance.vision',
])

const PRODUCTION_HOSTS = new Set([
  'api.binance.com',
  'api1.binance.com',
  'api2.binance.com',
  'api3.binance.com',
  'api4.binance.com',
  'data-api.binance.vision',
])

const ALLOWED_LIVE_HOSTS = new Set([
  'api.binance.com',
])

export type OrderSide = 'BUY' | 'SELL'
export type OrderType = 'MARKET' | 'LIMIT'
export type BinanceExecutionEnvironment = 'paper' | 'testnet' | 'live'

export interface DemoBalance {
  asset: string
  free: number
  locked: number
}

export interface DemoAccount {
  accountType: string
  canTrade: boolean
  balances: Array<DemoBalance>
  uid?: number
}

export interface DemoOrderResult {
  symbol: string
  orderId: number
  status: string
  side: OrderSide
  type: OrderType
  executedQty: number
  cummulativeQuoteQty: number
  fills: Array<{ price: number; qty: number; commission: number; commissionAsset: string }>
  transactTime: number
  avgPrice: number
}

export type BinanceAccount = DemoAccount
export type BinanceOrderResult = DemoOrderResult

export interface BinanceOrderInput {
  symbol: string
  side: OrderSide
  type: OrderType
  quantity?: number
  quoteOrderQty?: number
  price?: number
}

export interface SymbolFilters {
  stepSize: number
  minQty: number
  minNotional: number
}

/**
 * Floor a quantity to the symbol's LOT_SIZE step, decimal-safe. Binance
 * rejects SELL quantities that aren't an exact multiple of stepSize, and
 * naive floating-point division (0.07992 / 0.0001) can land a hair under
 * the true step count — the epsilon guards against that.
 */
export function floorToStep(quantity: number, stepSize: number): number {
  if (!(stepSize > 0) || !Number.isFinite(quantity) || quantity <= 0) return 0
  const steps = Math.floor(quantity / stepSize + 1e-9)
  return parseFloat((steps * stepSize).toFixed(8))
}

export interface BinanceExecutionClient {
  readonly host: string
  readonly environment: BinanceExecutionEnvironment
  ping: () => Promise<boolean>
  getPrice: (symbol: string) => Promise<number>
  getKlines: (
    symbol: string,
    interval?: string,
    limit?: number,
  ) => Promise<
    Array<{
      openTime: number
      open: number
      high: number
      low: number
      close: number
      volume: number
    }>
  >
  getAccount: () => Promise<BinanceAccount>
  placeOrder: (input: BinanceOrderInput) => Promise<BinanceOrderResult>
  testOrder?: (input: BinanceOrderInput) => Promise<void>
  /** LOT_SIZE/NOTIONAL exchange filters; optional so paper/test fakes can omit it. */
  getSymbolFilters?: (symbol: string) => Promise<SymbolFilters>
  buildUserDataStreamSubscribeParams: () => Record<string, unknown>;
}

export class DemoEnvironmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DemoEnvironmentError'
  }
}

function normalizedBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase()
  } catch {
    throw new DemoEnvironmentError(`Invalid Binance base URL: ${baseUrl}`)
  }
}

/** Extract and validate the host of a demo/testnet base URL, or throw. */
export function assertDemoBaseUrl(baseUrl: string): string {
  const host = hostOf(baseUrl)
  if (PRODUCTION_HOSTS.has(host)) {
    throw new DemoEnvironmentError(
      `Refusing to build a demo trading client against production host "${host}". ` +
        'Execution is restricted to the Binance demo environment.',
    )
  }
  if (!ALLOWED_DEMO_HOSTS.has(host)) {
    throw new DemoEnvironmentError(
      `Host "${host}" is not a recognized Binance demo host ` +
        `(${[...ALLOWED_DEMO_HOSTS].join(', ')}).`,
    )
  }
  return host
}

/** Extract and validate the host of a live Binance base URL, or throw. */
export function assertLiveBaseUrl(baseUrl: string): string {
  const host = hostOf(baseUrl)
  if (ALLOWED_DEMO_HOSTS.has(host) || host === 'data-api.binance.vision') {
    throw new DemoEnvironmentError(
      `Refusing to build a live trading client against non-production host "${host}".`,
    )
  }
  if (!ALLOWED_LIVE_HOSTS.has(host)) {
    throw new DemoEnvironmentError(
      `Host "${host}" is not an approved Binance live host (${[...ALLOWED_LIVE_HOSTS].join(', ')}).`,
    )
  }
  return host
}

function orderParams(input: BinanceOrderInput): Record<string, string | number> {
  const params: Record<string, string | number> = {
    symbol: input.symbol,
    side: input.side,
    type: input.type,
  }
  if (input.type === 'LIMIT') {
    if (input.price == null || input.quantity == null) {
      throw new DemoEnvironmentError('LIMIT order requires price and quantity.')
    }
    params.timeInForce = 'GTC'
    params.price = input.price
    params.quantity = input.quantity
  } else {
    if (input.quoteOrderQty != null) params.quoteOrderQty = input.quoteOrderQty
    else if (input.quantity != null) params.quantity = input.quantity
    else throw new DemoEnvironmentError('MARKET order requires quantity or quoteOrderQty.')
  }
  return params
}

abstract class SignedBinanceClient implements BinanceExecutionClient {
  private readonly apiKey: string
  private readonly apiSecret: string
  private readonly base: string
  private readonly recvWindow: number
  private readonly fetchImpl: typeof fetch
  readonly host: string
  abstract readonly environment: BinanceExecutionEnvironment
  protected abstract assertBaseUrl(baseUrl: string): string
  protected abstract errorPrefix(): string
  buildUserDataStreamSubscribeParams(): Record<string, unknown> {
    return {}
  }

  constructor(config: { apiKey: string; apiSecret: string; baseUrl: string; recvWindow?: number; fetchImpl?: typeof fetch }) {
    if (!config.apiKey || !config.apiSecret) {
      throw new DemoEnvironmentError('Binance API key and secret are required.')
    }
    this.host = this.assertBaseUrl(config.baseUrl)
    this.base = normalizedBase(config.baseUrl)
    this.apiKey = config.apiKey.trim()
    this.apiSecret = config.apiSecret.trim()
    this.recvWindow = config.recvWindow ?? 10_000
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  private sign(query: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex')
  }

  private async signedRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<any> {
    this.assertBaseUrl(this.base)
    const timestamp = Date.now()
    const search = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      timestamp: String(timestamp),
      recvWindow: String(this.recvWindow),
    })
    const signature = this.sign(search.toString())
    search.append('signature', signature)
    const url = `${this.base}${path}?${search.toString()}`
    const res = await this.fetchImpl(url, {
      method,
      headers: { 'X-MBX-APIKEY': this.apiKey },
      signal: AbortSignal.timeout(15_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const code = (body)?.code
      const msg = (body)?.msg || res.statusText
      const errorMessage = `${this.errorPrefix()} ${path} failed (${res.status}${code ? ` code ${code}` : ''}): ${msg}`
      recordConnectivityOutcome(errorMessage)
      throw new DemoEnvironmentError(errorMessage)
    }
    recordConnectivityOutcome(null)
    return body
  }

  async ping(): Promise<boolean> {
    this.assertBaseUrl(this.base)
    const res = await this.fetchImpl(`${this.base}/api/v3/ping`, {
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  }

  async getPrice(symbol: string): Promise<number> {
    this.assertBaseUrl(this.base)
    const res = await this.fetchImpl(`${this.base}/api/v3/ticker/price?symbol=${symbol}`, {
      signal: AbortSignal.timeout(10_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new DemoEnvironmentError(`price ${symbol} failed (${res.status})`)
    return parseFloat((body).price)
  }

  async getKlines(symbol: string, interval = '1h', limit = 100): Promise<Array<{
    openTime: number; open: number; high: number; low: number; close: number; volume: number
  }>> {
    this.assertBaseUrl(this.base)
    const url = `${this.base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(12_000) })
    const rows = await res.json().catch(() => [])
    if (!res.ok || !Array.isArray(rows)) throw new DemoEnvironmentError(`klines ${symbol} failed (${res.status})`)
    return rows.map((r: any) => ({
      openTime: r[0],
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
    }))
  }

  private readonly symbolFiltersCache = new Map<string, SymbolFilters>()

  async getSymbolFilters(symbol: string): Promise<SymbolFilters> {
    const cached = this.symbolFiltersCache.get(symbol)
    if (cached) return cached
    this.assertBaseUrl(this.base)
    const url = `${this.base}/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(12_000) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new DemoEnvironmentError(`exchangeInfo ${symbol} failed (${res.status})`)
    }
    const info = (body).symbols?.[0]
    const filters: Array<any> = info?.filters || []
    const lotSize = filters.find((f) => f.filterType === 'LOT_SIZE')
    const notional = filters.find(
      (f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL',
    )
    const parsed: SymbolFilters = {
      stepSize: parseFloat(lotSize?.stepSize ?? '0') || 0,
      minQty: parseFloat(lotSize?.minQty ?? '0') || 0,
      minNotional: parseFloat(notional?.minNotional ?? '0') || 0,
    }
    this.symbolFiltersCache.set(symbol, parsed)
    return parsed
  }

  async getAccount(): Promise<BinanceAccount> {
    const raw = await this.signedRequest('GET', '/api/v3/account')
    return {
      accountType: raw.accountType,
      canTrade: raw.canTrade,
      uid: raw.uid,
      balances: (raw.balances || [])
        .map((b: any) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
        }))
        .filter((b: DemoBalance) => b.free > 0 || b.locked > 0),
    }
  }

  async testOrder(input: BinanceOrderInput): Promise<void> {
    await this.signedRequest('POST', '/api/v3/order/test', orderParams(input))
  }

  async placeOrder(input: BinanceOrderInput): Promise<BinanceOrderResult> {
    const raw = await this.signedRequest('POST', '/api/v3/order', orderParams(input))
    const fills = (raw.fills || []).map((f: any) => ({
      price: parseFloat(f.price),
      qty: parseFloat(f.qty),
      commission: parseFloat(f.commission),
      commissionAsset: f.commissionAsset,
    }))
    const executedQty = parseFloat(raw.executedQty || '0')
    const cummulativeQuoteQty = parseFloat(raw.cummulativeQuoteQty || '0')
    return {
      symbol: raw.symbol,
      orderId: raw.orderId,
      status: raw.status,
      side: raw.side,
      type: raw.type,
      executedQty,
      cummulativeQuoteQty,
      fills,
      transactTime: raw.transactTime,
      avgPrice: executedQty > 0 ? cummulativeQuoteQty / executedQty : 0,
    }
  }

  async cancelOrder(symbol: string, orderId: number): Promise<void> {
    await this.signedRequest('DELETE', '/api/v3/order', { symbol, orderId })
  }
}

export interface DemoClientConfig {
  apiKey: string
  apiSecret: string
  baseUrl: string
  /** Production creds, passed only so we can refuse if they collide. */
  productionApiKey?: string
  recvWindow?: number
  fetchImpl?: typeof fetch
}

export class BinanceDemoClient extends SignedBinanceClient {
  readonly environment: BinanceExecutionEnvironment = 'testnet'

  constructor(config: DemoClientConfig) {
    if (
      config.productionApiKey &&
      config.apiKey.trim() === config.productionApiKey.trim()
    ) {
      throw new DemoEnvironmentError(
        'Demo API key equals the production key - refusing to sign requests. ' +
          'Set BINANCE_TESTNET_API_KEY to your demo credentials.',
      )
    }
    super(config)
  }

  protected assertBaseUrl(baseUrl: string): string {
    return assertDemoBaseUrl(baseUrl)
  }

  protected errorPrefix(): string {
    return 'Binance demo'
  }
}

export interface LiveClientConfig {
  apiKey: string
  apiSecret: string
  baseUrl: string
  testnetApiKey?: string
  recvWindow?: number
  fetchImpl?: typeof fetch
}

export class BinanceLiveClient extends SignedBinanceClient {
  readonly environment: BinanceExecutionEnvironment = 'live'

  constructor(config: LiveClientConfig) {
    if (
      config.testnetApiKey &&
      config.apiKey.trim() === config.testnetApiKey.trim()
    ) {
      throw new DemoEnvironmentError(
        'Live API key equals the testnet key - refusing to sign production requests.',
      )
    }
    super(config)
  }

  protected assertBaseUrl(baseUrl: string): string {
    return assertLiveBaseUrl(baseUrl)
  }

  protected errorPrefix(): string {
    return 'Binance live'
  }
}

/**
 * Build a demo client from environment variables, or return null (with a
 * reason) when demo credentials are absent/misconfigured. Never throws for
 * missing config - callers degrade gracefully.
 */
export function createDemoClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { client: BinanceDemoClient | null; reason?: string } {
  const apiKey = env.BINANCE_TESTNET_API_KEY?.trim()
  const apiSecret = env.BINANCE_TESTNET_API_SECRET?.trim()
  const baseUrl = env.BINANCE_TESTNET_BASE_URL?.trim() || 'https://demo-api.binance.com'
  if (!apiKey || !apiSecret) {
    return { client: null, reason: 'BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET not set' }
  }
  try {
    const client = new BinanceDemoClient({
      apiKey,
      apiSecret,
      baseUrl,
      productionApiKey: env.BINANCE_API_KEY,
    })
    return { client }
  } catch (err) {
    return { client: null, reason: err instanceof Error ? err.message : String(err) }
  }
}

export function createLiveClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { client: BinanceLiveClient | null; reason?: string } {
  const apiKey = env.BINANCE_API_KEY?.trim()
  const apiSecret = env.BINANCE_API_SECRET?.trim()
  const baseUrl = env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com'
  if (!apiKey || !apiSecret) {
    return { client: null, reason: 'BINANCE_API_KEY / BINANCE_API_SECRET not set' }
  }
  if (env.BINANCE_ALLOW_LIVE_TRADING !== 'I_APPROVE_BINANCE_LIVE_TRADING') {
    return { client: null, reason: 'BINANCE_ALLOW_LIVE_TRADING approval is not set' }
  }
  try {
    const client = new BinanceLiveClient({
      apiKey,
      apiSecret,
      baseUrl,
      testnetApiKey: env.BINANCE_TESTNET_API_KEY,
    })
    return { client }
  } catch (err) {
    return { client: null, reason: err instanceof Error ? err.message : String(err) }
  }
}
