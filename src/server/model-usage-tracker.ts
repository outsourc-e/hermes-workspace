import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { HermesConfigPaths } from './hermes-config-migration'

// ── public types ──────────────────────────────────────────────────────────────

export type ModelUsageRecord = {
  id: string
  ts: number           // unix ms
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  latency_ms: number
  success: boolean
  error?: string
}

export type RecordUsageOpts = {
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  latency_ms: number
  success: boolean
  error?: string
  /** Injected for testing — omit to use the default ~/.hermes path. */
  paths?: Pick<HermesConfigPaths, 'hermesHome'>
}

// ── cost table (USD per 1 000 tokens) ────────────────────────────────────────

type TokenCost = { input: number; output: number }

const COST_TABLE: Record<string, TokenCost> = {
  // Anthropic
  'claude-opus-4-8':    { input: 0.015,    output: 0.075   },
  'claude-opus-4-7':    { input: 0.015,    output: 0.075   },
  'claude-sonnet-4-6':  { input: 0.003,    output: 0.015   },
  'claude-haiku-4-5':   { input: 0.00025,  output: 0.00125 },
  // OpenAI
  'gpt-5.4':            { input: 0.002,    output: 0.008   },
  'gpt-4o':             { input: 0.0025,   output: 0.01    },
  'codex-mini-latest':  { input: 0.0015,   output: 0.006   },
  // Google
  'gemini-2.5-pro':     { input: 0.00125,  output: 0.005   },
  'gemini-2.5-flash':   { input: 0.000075, output: 0.0003  },
  // DeepSeek
  'deepseek-chat':      { input: 0.00027,  output: 0.0011  },
  'deepseek-reasoner':  { input: 0.00055,  output: 0.00219 },
  // Local — zero cost
  'llama3.2':           { input: 0,        output: 0       },
  'llama3.1':           { input: 0,        output: 0       },
}

const FALLBACK_COST: TokenCost = { input: 0.002, output: 0.008 }

function lookupCost(model: string): TokenCost {
  if (COST_TABLE[model]) return COST_TABLE[model]
  for (const key of Object.keys(COST_TABLE)) {
    if (model.startsWith(key)) return COST_TABLE[key]
  }
  return FALLBACK_COST
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const { input, output } = lookupCost(model)
  return (inputTokens / 1000) * input + (outputTokens / 1000) * output
}

// ── persistence ───────────────────────────────────────────────────────────────

function defaultHermesHome(): string {
  return (
    process.env.HERMES_HOME ??
    process.env.CLAUDE_HOME ??
    path.join(os.homedir(), '.hermes')
  )
}

function resolveHermesHome(paths?: Pick<HermesConfigPaths, 'hermesHome'>): string {
  return paths?.hermesHome ?? defaultHermesHome()
}

function usageFilePath(hermesHome: string): string {
  return path.join(hermesHome, 'model-usage.json')
}

function readRecords(filePath: string): ModelUsageRecord[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ModelUsageRecord[]) : []
  } catch {
    return []
  }
}

function writeRecords(filePath: string, records: ModelUsageRecord[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8')
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Append a usage record to ~/.hermes/model-usage.json.
 * Returns the completed record. Never throws — a tracker failure must not
 * disrupt the response path.
 */
export function recordUsage(opts: RecordUsageOpts): ModelUsageRecord {
  const record: ModelUsageRecord = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    provider: opts.provider,
    model: opts.model,
    input_tokens: opts.input_tokens,
    output_tokens: opts.output_tokens,
    cost_usd: estimateCost(opts.model, opts.input_tokens, opts.output_tokens),
    latency_ms: opts.latency_ms,
    success: opts.success,
    ...(opts.error !== undefined ? { error: opts.error } : {}),
  }

  try {
    const filePath = usageFilePath(resolveHermesHome(opts.paths))
    const existing = readRecords(filePath)
    writeRecords(filePath, [...existing, record])
  } catch {
    // Silently swallowed — usage tracking must never fail a chat response
  }

  return record
}

/**
 * Read all usage records from disk, oldest first.
 * Returns an empty array when the file is absent or unreadable.
 */
export function readUsageLog(
  paths?: Pick<HermesConfigPaths, 'hermesHome'>,
): ModelUsageRecord[] {
  return readRecords(usageFilePath(resolveHermesHome(paths)))
}

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Sum estimated cost (USD) for records from today, optionally filtered
 * by provider and/or model.
 */
export function sumCostToday(
  filter: { provider?: string; model?: string } = {},
  paths?: Pick<HermesConfigPaths, 'hermesHome'>,
): number {
  const cutoff = startOfTodayMs()
  let total = 0
  for (const r of readUsageLog(paths)) {
    if (r.ts < cutoff) continue
    if (filter.provider !== undefined && r.provider !== filter.provider) continue
    if (filter.model !== undefined && r.model !== filter.model) continue
    total += r.cost_usd
  }
  return total
}

/**
 * USD spent today on any model whose name contains "opus".
 * Convenience wrapper consumed by the executive router budget check.
 */
export function getOpusSpendToday(
  paths?: Pick<HermesConfigPaths, 'hermesHome'>,
): number {
  const cutoff = startOfTodayMs()
  let total = 0
  for (const r of readUsageLog(paths)) {
    if (r.ts < cutoff) continue
    if (!r.model.toLowerCase().includes('opus')) continue
    total += r.cost_usd
  }
  return total
}
