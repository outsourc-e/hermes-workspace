/**
 * LLM-based trading signal engine — structurally different from every other
 * engine here: `trading-strategies.ts`'s `Strategy.evaluate()` is
 * synchronous, an LLM call is not, so this can't be a `Strategy` any more
 * than the grid could be. Own cadence (hourly, not every 5-15 min — cost
 * and latency control; market-reasoning doesn't need higher frequency),
 * own settings key (`settings.demoTradingLlm`), own finance-store kinds,
 * own lock. Executes real signed testnet orders via binance-demo-client.ts,
 * same as the rebalancing bot — this goes straight to testnet_execute.
 *
 * Model selection respects the existing 5-tier HARP routing
 * (harp-select-route.py) instead of hardcoding a provider — this only
 * implements the OpenRouter call path (what HARP's free/cheap tiers
 * resolve to in practice); if routing selects something else, the cycle
 * logs why and skips rather than guessing at an unsupported provider.
 *
 * Every decision (applied or not) is logged to research.llm_decisions —
 * given the sanity backtest here is deliberately lower-rigor than the
 * deterministic strategies' full-candle backtests, this live decision log
 * is the main way confidence in this engine grows over time.
 */
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createDemoClientFromEnv } from './binance-demo-client'
import { appendAuditLog, readFinanceStore, writeFinanceStore } from './finance-store'
import { isConnectivityBreakerTripped } from './connectivity-breaker'
import { recordLlmDecision } from './research-store'
import { atr, rsi, sma } from './trading-strategies'
import type { BinanceExecutionClient } from './binance-demo-client'
import type { Candle } from './trading-strategies'

export interface LlmSignalConfig {
  /**
   * Separate from tradingMode/kill switch: this engine shares the council's
   * global settings.tradingMode (already testnet_execute in production), so
   * without its own flag deployment + a cron tick would arm it immediately
   * with no distinct sign-off step. Off by default.
   */
  enabled: boolean
  symbols: Array<string>
  quotePerTrade: number
  minConfidence: number
  maxOpenPositions: number
  maxDailyLossQuote: number
  harpTask: string
  harpRisk: string
}

export const DEFAULT_LLM_SIGNAL_CONFIG: LlmSignalConfig = {
  enabled: false,
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'],
  quotePerTrade: 10,
  minConfidence: 0.6,
  maxOpenPositions: 3,
  maxDailyLossQuote: 50,
  harpTask: 'structured_output',
  harpRisk: 'standard',
}

export function resolveLlmSignalConfig(settingsOverride: unknown): LlmSignalConfig {
  const fromSettings =
    settingsOverride && typeof settingsOverride === 'object'
      ? (settingsOverride as Partial<LlmSignalConfig>)
      : {}
  return { ...DEFAULT_LLM_SIGNAL_CONFIG, ...fromSettings }
}

const SR_KIND_LLM_POSITION = 'demo_llm_position'
const SR_KIND_LLM_TRADE = 'demo_llm_trade'
const LLM_TRADE_LOG_CAP = 500

export interface LlmPosition {
  kind: typeof SR_KIND_LLM_POSITION
  id: string
  symbol: string
  entryPrice: number
  quantity: number
  entryQuote: number
  openedAt: string
  reasoning: string
}

export interface LlmTrade {
  kind: typeof SR_KIND_LLM_TRADE
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  price: number
  quantity: number
  notionalQuote: number
  pnlQuote?: number
  reasoning: string
  createdAt: string
}

export type LlmDecisionSignal = 'BUY' | 'SELL' | 'HOLD'

export interface ParsedLlmDecision {
  signal: LlmDecisionSignal
  confidence: number
  reasoning: string
}

/** Compact numeric context an LLM can reason over without needing raw candles. */
export function buildContextSummary(symbol: string, candles: Array<Candle>) {
  const closes = candles.map((c) => c.close)
  const last = candles[candles.length - 1]
  const sma20 = sma(closes, 20)
  const sma50 = sma(closes, 50)
  const rsi14 = rsi(closes, 14)
  const atr14 = atr(candles, 14)
  const first = candles[0]
  return {
    symbol,
    lastPrice: last.close,
    periodChangePct: ((last.close - first.close) / first.close) * 100,
    sma20,
    sma50,
    rsi14,
    atr14,
    candleCount: candles.length,
  }
}

export function buildPrompt(
  contexts: Array<ReturnType<typeof buildContextSummary>>,
  openPositions: Array<{ symbol: string; entryPrice: number }>,
): string {
  return [
    'You are a conservative crypto trading signal generator for a Binance TESTNET (fake money) account.',
    'Given the market context below, choose exactly one action for at most one symbol per response.',
    'Respond with STRICT JSON only, no markdown, no prose outside the JSON object, matching exactly:',
    '{"symbol": "<one of the given symbols or null>", "signal": "BUY" | "SELL" | "HOLD", "confidence": <0..1>, "reasoning": "<one sentence>"}',
    'Prefer HOLD unless you see a clear, specific reason. Never suggest SELL for a symbol with no open position.',
    '',
    `Open positions: ${JSON.stringify(openPositions)}`,
    `Market context: ${JSON.stringify(contexts)}`,
  ].join('\n')
}

export function parseLlmResponse(raw: string): ParsedLlmDecision | null {
  const stripped = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const obj: unknown = JSON.parse(stripped)
    if (typeof obj !== 'object' || obj === null) return null
    const o = obj as Record<string, unknown>
    const signal = o.signal
    if (signal !== 'BUY' && signal !== 'SELL' && signal !== 'HOLD') return null
    const confidence = typeof o.confidence === 'number' ? o.confidence : 0
    const reasoning = typeof o.reasoning === 'string' ? o.reasoning : ''
    return {
      signal,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
    }
  } catch {
    return null
  }
}

export interface HarpRoute {
  model: string
  provider: string
  tier: string
}

/** First matching OpenRouter candidate only — kept for callers that just want "a" route. */
export function selectHarpRoute(task: string, risk: string): HarpRoute | null {
  return selectHarpRoutes(task, risk)[0] ?? null
}

/**
 * FREE-TIER OpenRouter candidates only, from HARP's fallback chain, in
 * priority order. Deliberately excludes `tier: "paid"` entries (e.g.
 * deepseek-v4-pro, gpt-5.5) — CLAUDE.md's own routing policy says paid
 * fallback tiers need cost confirmation with Naveen first, and this engine
 * has no mechanism for that mid-cycle. Confirmed directly while building
 * this: an unfiltered fallback chain silently spent real money on a paid
 * model the moment both free candidates were rate-limited. If every free
 * candidate is rate-limited, the right behavior is to skip the cycle, not
 * quietly escalate to a paid model.
 *
 * Also walks the WHOLE free-tier chain rather than just the first entry —
 * free models get rate-limited upstream often enough that trying only one
 * isn't reliable (same incident: both free candidates were briefly
 * rate-limited together, confirming the fallback loop is needed, not just
 * the tier filter).
 */
export function selectHarpRoutes(task: string, risk: string): Array<HarpRoute> {
  try {
    const result = spawnSync(
      'python3',
      ['/srv/projects/_hermes-control/scripts/harp-select-route.py', '--task', task, '--risk', risk, '--json'],
      { encoding: 'utf-8', timeout: 15_000 },
    )
    if (result.status !== 0 || !result.stdout) return []
    const parsed: unknown = JSON.parse(result.stdout)
    const fallbacks = (parsed as { fallbacks?: Array<HarpRoute> }).fallbacks
    return fallbacks?.filter((f) => f.provider === 'openrouter' && f.model && f.tier === 'free') ?? []
  } catch {
    return []
  }
}

function readOpenRouterKey(): string | null {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const envPath = path.join(os.homedir(), '.hermes', '.env')
    const content = fs.readFileSync(envPath, 'utf-8')
    const match = content.match(/^OPENROUTER_API_KEY=(.+)$/m)
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

export async function callOpenRouter(model: string, prompt: string): Promise<string | null> {
  const apiKey = readOpenRouterKey()
  if (!apiKey) {
    console.error('llm-signal-engine: no OpenRouter API key available')
    return null
  }
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!resp.ok) {
      console.error(`llm-signal-engine: OpenRouter call to ${model} failed: ${resp.status} ${resp.statusText}`)
      return null
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.error(`llm-signal-engine: OpenRouter call to ${model} threw:`, err)
    return null
  }
}

/**
 * Walks the HARP fallback chain in order, trying each candidate model until
 * one succeeds — free-tier models get rate-limited upstream often enough
 * that trying only the first candidate isn't reliable (confirmed directly:
 * the first sanity-check run failed 100% of calls on a single rate-limited
 * model before this fallback loop was added).
 */
export async function callWithFallback(
  routes: Array<HarpRoute>,
  prompt: string,
): Promise<{ content: string; model: string } | null> {
  for (const route of routes) {
    const content = await callOpenRouter(route.model, prompt)
    if (content) return { content, model: route.model }
  }
  return null
}

function executionModeAllowed(
  settings: Record<string, unknown>,
  config: LlmSignalConfig,
): { allowed: boolean; reason?: string } {
  if (settings.emergencyKillSwitch) return { allowed: false, reason: 'emergency kill switch is active' }
  if (isConnectivityBreakerTripped()) {
    return { allowed: false, reason: 'connectivity breaker tripped — repeated invalid-credential errors, needs manual reset' }
  }
  if (settings.tradingMode !== 'testnet_execute') {
    return { allowed: false, reason: `tradingMode is "${String(settings.tradingMode)}", not testnet_execute` }
  }
  if (!config.enabled) return { allowed: false, reason: 'llm signal engine is disabled (settings.demoTradingLlm.enabled)' }
  return { allowed: true }
}

let llmCycleInProgress = false

export interface LlmCycleResult {
  ran: boolean
  reason?: string
  decision?: ParsedLlmDecision & { symbol: string | null }
  trade?: LlmTrade
}

export interface LlmCycleOptions {
  client?: BinanceExecutionClient
  fetchKlines?: (symbol: string, interval: string, limit: number) => Promise<Array<Candle>>
  callModel?: (routes: Array<HarpRoute>, prompt: string) => Promise<{ content: string; model: string } | null>
}

async function runLlmCycleInner(options: LlmCycleOptions): Promise<LlmCycleResult> {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const config = resolveLlmSignalConfig(settings.demoTradingLlm)
  const gate = executionModeAllowed(settings, config)
  if (!gate.allowed) return { ran: false, reason: gate.reason };

  const rows = db.strategy_results
  const positions = rows.filter((r) => r.kind === SR_KIND_LLM_POSITION) as unknown as Array<LlmPosition>
  const existingTrades = rows.filter((r) => r.kind === SR_KIND_LLM_TRADE) as unknown as Array<LlmTrade>

  const today = new Date().toISOString().slice(0, 10)
  const dailyPnl = existingTrades
    .filter((t) => t.pnlQuote != null && t.createdAt.startsWith(today))
    .reduce((s, t) => s + (t.pnlQuote ?? 0), 0)
  if (dailyPnl <= -config.maxDailyLossQuote) {
    return { ran: false, reason: `daily loss halt: ${dailyPnl.toFixed(2)} <= -${config.maxDailyLossQuote}` }
  }

  const routes = selectHarpRoutes(config.harpTask, config.harpRisk)
  if (routes.length === 0) return { ran: false, reason: 'no HARP OpenRouter route available' }

  let client = options.client
  if (!client) {
    const created = createDemoClientFromEnv()
    if (!created.client) return { ran: false, reason: created.reason }
    client = created.client
  }
  const fetchKlines =
    options.fetchKlines ?? ((symbol: string, interval: string, limit: number) => client.getKlines(symbol, interval, limit))
  const callModel = options.callModel ?? callWithFallback

  const contexts = []
  for (const symbol of config.symbols) {
    const candles = await fetchKlines(symbol, '1h', 60)
    if (candles.length < 20) continue
    contexts.push(buildContextSummary(symbol, candles))
  }
  if (contexts.length === 0) return { ran: false, reason: 'no market context available' }

  const prompt = buildPrompt(
    contexts,
    positions.map((p) => ({ symbol: p.symbol, entryPrice: p.entryPrice })),
  )
  const callResult = await callModel(routes, prompt)
  if (!callResult) {
    await recordLlmDecision({
      symbol: 'N/A',
      contextSummary: contexts,
      model: routes[0].model,
      decision: 'HOLD',
      applied: false,
    })
    return { ran: false, reason: 'model call failed on every fallback candidate' }
  }
  const { content: raw, model: modelUsed } = callResult

  const parsedRaw: { symbol?: string | null } | null = (() => {
    try {
      return JSON.parse(raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '')) as { symbol?: string | null }
    } catch {
      return null
    }
  })()
  const decision = parseLlmResponse(raw)
  const decidedSymbol = parsedRaw?.symbol ?? null

  await recordLlmDecision({
    symbol: decidedSymbol ?? 'N/A',
    contextSummary: contexts,
    model: modelUsed,
    rawResponse: raw,
    decision: decision?.signal ?? 'HOLD',
    confidence: decision?.confidence,
    applied: false,
  })

  if (!decision || decision.signal === 'HOLD' || !decidedSymbol) {
    return { ran: true, decision: decision ? { ...decision, symbol: decidedSymbol } : undefined }
  }
  if (typeof decision.confidence !== "number" || !isFinite(decision.confidence) || decision.confidence < config.minConfidence) {
    return { ran: true, decision: { ...decision, symbol: decidedSymbol } }
  }
  if (!config.symbols.includes(decidedSymbol)) {
    return { ran: true, decision: { ...decision, symbol: decidedSymbol } }
  }

  const existingPosition = positions.find((p) => p.symbol === decidedSymbol)
  let trade: LlmTrade | undefined

  if (decision.signal === 'BUY') {
    if (existingPosition) {
      return { ran: true, decision: { ...decision, symbol: decidedSymbol } } // already long, skip
    }
    if (positions.length >= config.maxOpenPositions) {
      return { ran: true, decision: { ...decision, symbol: decidedSymbol } } // position cap
    }
    const order = await client.placeOrder({
      symbol: decidedSymbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: config.quotePerTrade,
    })
    const newPosition: LlmPosition = {
      kind: SR_KIND_LLM_POSITION,
      id: randomUUID(),
      symbol: decidedSymbol,
      entryPrice: order.avgPrice,
      quantity: order.executedQty,
      entryQuote: order.cummulativeQuoteQty,
      openedAt: new Date(order.transactTime).toISOString(),
      reasoning: decision.reasoning,
    }
    trade = {
      kind: SR_KIND_LLM_TRADE,
      id: randomUUID(),
      symbol: decidedSymbol,
      side: 'BUY',
      price: order.avgPrice,
      quantity: order.executedQty,
      notionalQuote: order.cummulativeQuoteQty,
      reasoning: decision.reasoning,
      createdAt: new Date(order.transactTime).toISOString(),
    }
    const others = rows.filter((r) => r.kind !== SR_KIND_LLM_POSITION && r.kind !== SR_KIND_LLM_TRADE)
    const mergedPositions = [...positions, newPosition]
    const mergedTrades = [...existingTrades, trade].slice(-LLM_TRADE_LOG_CAP)
    db.strategy_results = [...others, ...mergedPositions.map((p) => ({ ...p })), ...mergedTrades.map((t) => ({ ...t }))]
    db.updatedAt = new Date().toISOString()
    writeFinanceStore(db)
  } else if (existingPosition) {
    // Only 'BUY' | 'SELL' can reach here (HOLD returned earlier, 'BUY' handled above).
    const order = await client.placeOrder({
      symbol: decidedSymbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: existingPosition.quantity,
    })
    const pnlQuote = order.cummulativeQuoteQty - existingPosition.entryQuote
    trade = {
      kind: SR_KIND_LLM_TRADE,
      id: randomUUID(),
      symbol: decidedSymbol,
      side: 'SELL',
      price: order.avgPrice,
      quantity: order.executedQty,
      notionalQuote: order.cummulativeQuoteQty,
      pnlQuote,
      reasoning: decision.reasoning,
      createdAt: new Date(order.transactTime).toISOString(),
    }
    const remainingPositions = positions.filter((p) => p.symbol !== decidedSymbol)
    const others = rows.filter((r) => r.kind !== SR_KIND_LLM_POSITION && r.kind !== SR_KIND_LLM_TRADE)
    const mergedTrades = [...existingTrades, trade].slice(-LLM_TRADE_LOG_CAP)
    db.strategy_results = [...others, ...remainingPositions.map((p) => ({ ...p })), ...mergedTrades.map((t) => ({ ...t }))]
    db.updatedAt = new Date().toISOString()
    writeFinanceStore(db)
  }

  if (trade) {
    appendAuditLog('llm_signal_trade_executed', {
      symbol: trade.symbol,
      side: trade.side,
      notionalQuote: trade.notionalQuote,
      model: modelUsed,
      reasoning: trade.reasoning,
    })
    await recordLlmDecision({
      symbol: decidedSymbol,
      contextSummary: contexts,
      model: modelUsed,
      rawResponse: raw,
      decision: decision.signal,
      confidence: decision.confidence,
      applied: true,
    })
  }

  return { ran: true, decision: { ...decision, symbol: decidedSymbol }, trade }
}

export async function runLlmSignalCycle(options: LlmCycleOptions = {}): Promise<LlmCycleResult> {
  if (llmCycleInProgress) return { ran: false, reason: 'already in progress' }
  llmCycleInProgress = true
  try {
    return await runLlmCycleInner(options)
  } finally {
    llmCycleInProgress = false
  }
}

export function getLlmSignalState(): {
  config: LlmSignalConfig
  positions: Array<LlmPosition>
  trades: Array<LlmTrade>
} {
  const db = readFinanceStore()
  const settings = db.settings as Record<string, unknown>
  const rows = db.strategy_results
  return {
    config: resolveLlmSignalConfig(settings.demoTradingLlm),
    positions: rows.filter((r) => r.kind === SR_KIND_LLM_POSITION) as unknown as Array<LlmPosition>,
    trades: (rows.filter((r) => r.kind === SR_KIND_LLM_TRADE) as unknown as Array<LlmTrade>).slice(-50).reverse(),
  }
}
