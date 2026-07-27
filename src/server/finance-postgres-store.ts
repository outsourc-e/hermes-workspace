import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { FinanceDatabase } from './finance-store'

const HERMES_HOME =
  process.env.HERMES_HOME ??
  process.env.CLAUDE_HOME ??
  path.join(os.homedir(), '.hermes')
const FINANCE_PG_DATABASE = process.env.HERMES_FINANCE_PG_DATABASE || 'finance'
const PSQL_CANDIDATES = [
  '/home/ubuntu/.pg0/installation/18.1.0/bin/psql',
  'psql',
]

interface PgConn {
  host: string
  port: string
  user: string
  password: string
}

export interface FinancePostgresStatus {
  enabled: boolean
  available: boolean
  database: string
  snapshotAvailable: boolean
  reason?: string
  lastWriteError?: string
}

export interface FinanceAuditEntry {
  id: string
  action: string
  details: Record<string, unknown>
  source: string
  createdAt: string
}

let schemaReady = false
let lastWriteError: string | null = null

function financePostgresEnabled(): boolean {
  // Test files isolate the JSON store via a $HOME override, but that does
  // nothing for this module's Postgres connection (reads HERMES_PG_*
  // directly) — without this guard, any test calling writeFinanceStore()
  // silently overwrites the real production Postgres finance database.
  // Confirmed live 2026-07-27: settings.demoTradingGrid held test-fixture
  // values (gridCount: 3, single symbol) for 2+ days with zero audit trail,
  // consistent with a stray test write bypassing the real API path.
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return false
  return process.env.HERMES_FINANCE_STORE !== 'json'
}

function envFileValues(): Record<string, string> {
  const values: Record<string, string> = {}
  try {
    const env = fs.readFileSync(path.join(HERMES_HOME, '.env'), 'utf8')
    for (const line of env.split('\n')) {
      const match = line.match(/^HERMES_PG_(PASSWORD|HOST|PORT|USER)=(.*)$/)
      if (!match) continue
      values[`HERMES_PG_${match[1]}`] = match[2].trim().replace(/^"|"$/g, '')
    }
  } catch {
    return values
  }
  return values
}

function pgConn(): PgConn | null {
  if (!financePostgresEnabled()) return null
  const file = envFileValues()
  const password = process.env.HERMES_PG_PASSWORD || file.HERMES_PG_PASSWORD
  if (!password) return null
  return {
    host: process.env.HERMES_PG_HOST || file.HERMES_PG_HOST || '127.0.0.1',
    port: process.env.HERMES_PG_PORT || file.HERMES_PG_PORT || '5432',
    user: process.env.HERMES_PG_USER || file.HERMES_PG_USER || 'hermes_app',
    password,
  }
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
    throw new Error(`Unsafe Postgres identifier: ${value}`)
  return `"${value.replace(/"/g, '""')}"`
}

function sqlJsonb(value: unknown): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
  return `convert_from(decode(${sqlText(encoded)}, 'base64'), 'UTF8')::jsonb`
}

function sqlNullableText(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? sqlText(value) : 'NULL'
}

function sqlNullableNumber(value: unknown): string {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) ? String(number) : 'NULL'
}

function sqlNumber(value: unknown, fallback = 0): string {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : fallback
  return Number.isFinite(number) ? String(number) : String(fallback)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function firstText(
  row: Record<string, unknown>,
  keys: Array<string>,
  fallback = '',
): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value)
  }
  return fallback
}

function firstNumber(
  row: Record<string, unknown>,
  keys: Array<string>,
  fallback?: number,
): number | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

function firstBoolean(
  row: Record<string, unknown>,
  keys: Array<string>,
  fallback = false,
): boolean {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string')
      return ['1', 'true', 'yes', 'disabled'].includes(value.toLowerCase())
  }
  return fallback
}

function timestampValue(
  row: Record<string, unknown>,
  keys: Array<string>,
  fallback: string,
): string {
  return firstText(row, keys, fallback)
}

function stableId(
  row: Record<string, unknown>,
  table: string,
  index: number,
  parts: Array<string | undefined>,
): string {
  const id = firstText(row, ['id'])
  if (id) return id
  const suffix = parts.filter(Boolean).join(':')
  return suffix ? `${table}:${suffix}` : `${table}:${index + 1}`
}

function jsonText(value: unknown): string {
  return JSON.stringify(value ?? [])
}

function insertRows(
  table: string,
  columns: Array<string>,
  values: Array<Array<string>>,
): string {
  if (values.length === 0) return ''
  const columnSql = columns.map(sqlIdentifier).join(', ')
  const valuesSql = values.map((row) => `(${row.join(', ')})`).join(',\n')
  return `INSERT INTO ${sqlIdentifier(table)} (${columnSql}) VALUES\n${valuesSql};`
}

function tradingPlanRows(
  db: FinanceDatabase,
  updatedAt: string,
): Array<Array<string>> {
  return rows(db.trading_plans).map((row, index) => {
    const reason = firstText(row, ['reason'], 'No reason recorded')
    const decision = firstText(row, ['decision'], 'HOLD')
    return [
      sqlText(
        stableId(row, 'trading_plans', index, [
          firstText(row, ['platform']),
          firstText(row, ['symbol']),
          decision,
        ]),
      ),
      sqlText(firstText(row, ['platform'], 'binance')),
      sqlText(firstText(row, ['symbol'], 'UNKNOWN')),
      sqlText(firstText(row, ['assetType', 'asset_type'], 'crypto')),
      sqlText(decision),
      sqlText(reason),
      sqlText(firstText(row, ['riskLevel', 'risk_level'], 'medium_risk')),
      sqlNumber(firstNumber(row, ['riskScore', 'risk_score']), 0),
      sqlNumber(firstNumber(row, ['confidenceScore', 'confidence_score']), 0),
      sqlNullableNumber(
        firstNumber(row, ['suggestedEntryPrice', 'suggested_entry_price']),
      ),
      sqlNullableNumber(
        firstNumber(row, ['suggestedExitPrice', 'suggested_exit_price']),
      ),
      sqlNullableNumber(firstNumber(row, ['stopLoss', 'stop_loss'])),
      sqlNullableNumber(firstNumber(row, ['takeProfit', 'take_profit'])),
      sqlNullableNumber(firstNumber(row, ['positionSize', 'position_size'])),
      sqlNullableText(
        firstText(row, ['expectedHoldingPeriod', 'expected_holding_period']),
      ),
      sqlNullableNumber(
        firstNumber(row, ['maximumAcceptableLoss', 'maximum_acceptable_loss']),
      ),
      sqlText(jsonText(row.dataUsed ?? row.data_used)),
      sqlText(jsonText(row.newsReviewed ?? row.news_reviewed)),
      sqlNullableText(firstText(row, ['expectedOutcome', 'expected_outcome'])),
      sqlNullableText(
        firstText(row, ['alternativeOption', 'alternative_option']),
      ),
      sqlText(
        firstText(row, ['finalRecommendation', 'final_recommendation'], reason),
      ),
      sqlText(firstText(row, ['status'], 'draft')),
      sqlText(
        firstText(
          row,
          ['userApprovalStatus', 'user_approval_status'],
          'not_required',
        ),
      ),
      sqlText(
        firstText(
          row,
          ['executionStatus', 'execution_status'],
          'not_executable',
        ),
      ),
      sqlNullableText(firstText(row, ['actualOutcome', 'actual_outcome'])),
      sqlNullableNumber(firstNumber(row, ['profitLoss', 'profit_loss'])),
      sqlNullableText(firstText(row, ['strategyUsed', 'strategy_used'])),
      sqlNullableText(firstText(row, ['agentNotes', 'agent_notes'])),
      sqlText(firstText(row, ['source'], 'finance_store')),
      sqlText(timestampValue(row, ['createdAt', 'created_at'], updatedAt)),
      sqlText(timestampValue(row, ['updatedAt', 'updated_at'], updatedAt)),
    ]
  })
}

function tradeOrderRows(
  db: FinanceDatabase,
  updatedAt: string,
): Array<Array<string>> {
  return rows(db.trade_orders).map((row, index) => [
    sqlText(
      stableId(row, 'trade_orders', index, [
        firstText(row, ['planId', 'plan_id']),
        firstText(row, ['side']),
      ]),
    ),
    sqlNullableText(firstText(row, ['planId', 'plan_id'])),
    sqlText(firstText(row, ['platform'], 'binance')),
    sqlText(firstText(row, ['symbol'], 'UNKNOWN')),
    sqlText(firstText(row, ['side'], 'buy')),
    sqlNumber(firstNumber(row, ['quantity']), 0),
    sqlText(firstText(row, ['orderType', 'order_type'], 'market')),
    sqlText(firstText(row, ['status'], 'pending')),
    sqlNullableText(firstText(row, ['brokerOrderId', 'broker_order_id'])),
    sqlText(firstText(row, ['source'], 'finance_store')),
    sqlText(timestampValue(row, ['createdAt', 'created_at'], updatedAt)),
    sqlText(timestampValue(row, ['updatedAt', 'updated_at'], updatedAt)),
  ])
}

function tradeExecutionRows(
  db: FinanceDatabase,
  updatedAt: string,
): Array<Array<string>> {
  return rows(db.trade_executions).map((row, index) => [
    sqlText(
      stableId(row, 'trade_executions', index, [
        firstText(row, ['orderId', 'order_id']),
        firstText(row, ['executedAt', 'executed_at']),
      ]),
    ),
    sqlNullableText(firstText(row, ['orderId', 'order_id'])),
    sqlNullableText(firstText(row, ['planId', 'plan_id'])),
    sqlText(firstText(row, ['platform'], 'binance')),
    sqlText(firstText(row, ['symbol'], 'UNKNOWN')),
    sqlText(firstText(row, ['side'], 'buy')),
    sqlNumber(firstNumber(row, ['quantity']), 0),
    sqlNumber(firstNumber(row, ['price']), 0),
    sqlNumber(firstNumber(row, ['fees', 'fee']), 0),
    sqlText(timestampValue(row, ['executedAt', 'executed_at'], updatedAt)),
    sqlText(firstText(row, ['source'], 'finance_store')),
    sqlText(timestampValue(row, ['createdAt', 'created_at'], updatedAt)),
    sqlText(timestampValue(row, ['updatedAt', 'updated_at'], updatedAt)),
  ])
}

function marketPriceRows(
  db: FinanceDatabase,
  updatedAt: string,
): Array<Array<string>> {
  return rows(db.market_prices).map((row, index) => [
    sqlText(
      stableId(row, 'market_prices', index, [
        firstText(row, ['platform']),
        firstText(row, ['symbol']),
        firstText(row, ['observedAt', 'observed_at']),
      ]),
    ),
    sqlText(firstText(row, ['platform'], 'binance')),
    sqlText(firstText(row, ['symbol'], 'UNKNOWN')),
    sqlNumber(firstNumber(row, ['price']), 0),
    sqlNullableNumber(firstNumber(row, ['bid'])),
    sqlNullableNumber(firstNumber(row, ['ask'])),
    sqlNullableNumber(firstNumber(row, ['spread'])),
    sqlNullableNumber(firstNumber(row, ['volume'])),
    sqlText(firstText(row, ['currency'], 'USDT')),
    sqlText(timestampValue(row, ['observedAt', 'observed_at'], updatedAt)),
    sqlText(firstText(row, ['source'], 'finance_store')),
    sqlText(timestampValue(row, ['createdAt', 'created_at'], updatedAt)),
    sqlText(timestampValue(row, ['updatedAt', 'updated_at'], updatedAt)),
  ])
}

function historicalCandleRows(
  db: FinanceDatabase,
  updatedAt: string,
): Array<Array<string>> {
  return rows(db.historical_candles).map((row, index) => [
    sqlText(
      stableId(row, 'historical_candles', index, [
        firstText(row, ['platform']),
        firstText(row, ['symbol']),
        firstText(row, ['interval']),
        firstText(row, ['openedAt', 'opened_at', 'openTime']),
      ]),
    ),
    sqlText(firstText(row, ['platform'], 'binance')),
    sqlText(firstText(row, ['symbol'], 'UNKNOWN')),
    sqlText(firstText(row, ['interval'], '1m')),
    sqlNumber(firstNumber(row, ['open']), 0),
    sqlNumber(firstNumber(row, ['high']), 0),
    sqlNumber(firstNumber(row, ['low']), 0),
    sqlNumber(firstNumber(row, ['close']), 0),
    sqlNumber(firstNumber(row, ['volume']), 0),
    sqlText(
      timestampValue(row, ['openedAt', 'opened_at', 'openTime'], updatedAt),
    ),
    sqlText(
      timestampValue(row, ['closedAt', 'closed_at', 'closeTime'], updatedAt),
    ),
    sqlText(firstText(row, ['source'], 'finance_store')),
    sqlText(timestampValue(row, ['createdAt', 'created_at'], updatedAt)),
    sqlText(timestampValue(row, ['updatedAt', 'updated_at'], updatedAt)),
  ])
}

function strategyResultRows(
  db: FinanceDatabase,
  updatedAt: string,
): Array<Array<string>> {
  return rows(db.strategy_results).map((row, index) => {
    const strategyId = firstText(
      row,
      ['strategyId', 'strategy_id'],
      firstText(row, ['kind'], 'unknown'),
    )
    const trades = firstNumber(row, ['trades'])
    const wins = firstNumber(row, ['wins'])
    const losses = firstNumber(row, ['losses'])
    const winRate = firstNumber(
      row,
      ['winRate', 'win_rate'],
      trades && wins !== undefined ? wins / trades : undefined,
    )
    const lossRate = firstNumber(
      row,
      ['lossRate', 'loss_rate'],
      trades && losses !== undefined ? losses / trades : undefined,
    )
    return [
      sqlText(
        stableId(row, 'strategy_results', index, [
          firstText(row, ['kind']),
          strategyId,
          // Bucket-style kinds (e.g. pattern-veto stats) are distinguished by
          // a `key` field; without it here every id-less bucket collapsed to
          // the same synthetic id and broke the whole mirror transaction.
          firstText(row, ['key']),
          firstText(row, ['at', 'updatedAt', 'updated_at']),
        ]),
      ),
      sqlText(strategyId),
      sqlNullableNumber(winRate),
      sqlNullableNumber(lossRate),
      sqlNullableNumber(
        firstNumber(row, [
          'averageProfit',
          'average_profit',
          'avgProfitQuote',
          'avgPnlQuote',
        ]),
      ),
      sqlNullableNumber(
        firstNumber(row, ['averageLoss', 'average_loss', 'avgLossQuote']),
      ),
      sqlNullableNumber(firstNumber(row, ['profitFactor', 'profit_factor'])),
      sqlNullableNumber(firstNumber(row, ['maxDrawdown', 'max_drawdown'])),
      sqlNullableNumber(firstNumber(row, ['confidence', 'score'])),
      firstBoolean(row, ['disabled']) ? '1' : '0',
      sqlText(firstText(row, ['source', 'kind'], 'finance_store')),
      sqlText(
        timestampValue(
          row,
          [
            'createdAt',
            'created_at',
            'at',
            'openedAt',
            'closedAt',
            'updatedAt',
            'updated_at',
          ],
          updatedAt,
        ),
      ),
      sqlText(
        timestampValue(
          row,
          ['updatedAt', 'updated_at', 'at', 'closedAt', 'openedAt'],
          updatedAt,
        ),
      ),
      sqlJsonb(row),
    ]
  })
}

function financeMirrorSql(db: FinanceDatabase, updatedAt: string): string {
  return `
DELETE FROM trade_executions;
DELETE FROM trade_orders;
DELETE FROM trading_plans;
DELETE FROM market_prices;
DELETE FROM historical_candles;
DELETE FROM strategy_results;

${insertRows(
  'trading_plans',
  [
    'id',
    'platform',
    'symbol',
    'asset_type',
    'decision',
    'reason',
    'risk_level',
    'risk_score',
    'confidence_score',
    'suggested_entry_price',
    'suggested_exit_price',
    'stop_loss',
    'take_profit',
    'position_size',
    'expected_holding_period',
    'maximum_acceptable_loss',
    'data_used',
    'news_reviewed',
    'expected_outcome',
    'alternative_option',
    'final_recommendation',
    'status',
    'user_approval_status',
    'execution_status',
    'actual_outcome',
    'profit_loss',
    'strategy_used',
    'agent_notes',
    'source',
    'created_at',
    'updated_at',
  ],
  tradingPlanRows(db, updatedAt),
)}

${insertRows(
  'trade_orders',
  [
    'id',
    'plan_id',
    'platform',
    'symbol',
    'side',
    'quantity',
    'order_type',
    'status',
    'broker_order_id',
    'source',
    'created_at',
    'updated_at',
  ],
  tradeOrderRows(db, updatedAt),
)}

${insertRows(
  'trade_executions',
  [
    'id',
    'order_id',
    'plan_id',
    'platform',
    'symbol',
    'side',
    'quantity',
    'price',
    'fees',
    'executed_at',
    'source',
    'created_at',
    'updated_at',
  ],
  tradeExecutionRows(db, updatedAt),
)}

${insertRows(
  'market_prices',
  [
    'id',
    'platform',
    'symbol',
    'price',
    'bid',
    'ask',
    'spread',
    'volume',
    'currency',
    'observed_at',
    'source',
    'created_at',
    'updated_at',
  ],
  marketPriceRows(db, updatedAt),
)}

${insertRows(
  'historical_candles',
  [
    'id',
    'platform',
    'symbol',
    'interval',
    'open',
    'high',
    'low',
    'close',
    'volume',
    'opened_at',
    'closed_at',
    'source',
    'created_at',
    'updated_at',
  ],
  historicalCandleRows(db, updatedAt),
)}

${insertRows(
  'strategy_results',
  [
    'id',
    'strategy_id',
    'win_rate',
    'loss_rate',
    'average_profit',
    'average_loss',
    'profit_factor',
    'max_drawdown',
    'confidence',
    'disabled',
    'source',
    'created_at',
    'updated_at',
    'extra',
  ],
  strategyResultRows(db, updatedAt),
)}
`
}

function runPsql(
  database: string,
  sql: string,
): { ok: true; stdout: string } | { ok: false; reason: string } {
  const conn = pgConn()
  if (!conn)
    return { ok: false, reason: 'Postgres credentials are not configured' }
  for (const psql of PSQL_CANDIDATES) {
    const result = spawnSync(
      psql,
      [
        '-h',
        conn.host,
        '-p',
        conn.port,
        '-U',
        conn.user,
        '-d',
        database,
        '-tA',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '-',
      ],
      {
        env: { ...process.env, PGPASSWORD: conn.password },
        encoding: 'utf8',
        input: sql,
        timeout: 20_000,
        // Default 1MB stdout buffer is too small for a full finance-store
        // snapshot read (grows with market_prices/historical_candles/
        // strategy_results); undersizing this fails silently as ENOBUFS,
        // not a distinguishable Postgres error.
        maxBuffer: 64 * 1024 * 1024,
      },
    )
    if (
      result.error &&
      (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    )
      continue
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
    if (result.status === 0) return { ok: true, stdout }
    return {
      ok: false,
      reason: stderr || result.error?.message || `psql exited ${result.status}`,
    }
  }
  return { ok: false, reason: 'psql executable not found' }
}

function ensureFinanceDatabase(): boolean {
  const exists = runPsql(
    'postgres',
    `SELECT 1 FROM pg_database WHERE datname = ${sqlText(FINANCE_PG_DATABASE)};`,
  )
  if (!exists.ok) return false
  if (exists.stdout.trim() === '1') return true
  const created = runPsql(
    'postgres',
    `CREATE DATABASE ${sqlIdentifier(FINANCE_PG_DATABASE)};`,
  )
  return created.ok
}

function ensureFinancePostgresSchema(): boolean {
  if (schemaReady) return true
  if (!ensureFinanceDatabase()) return false
  const result = runPsql(
    FINANCE_PG_DATABASE,
    `
CREATE TABLE IF NOT EXISTS finance_store_snapshots (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details_json TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trading_plans (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  risk_score REAL NOT NULL,
  confidence_score REAL NOT NULL,
  suggested_entry_price REAL,
  suggested_exit_price REAL,
  stop_loss REAL,
  take_profit REAL,
  position_size REAL,
  expected_holding_period TEXT,
  maximum_acceptable_loss REAL,
  data_used TEXT NOT NULL,
  news_reviewed TEXT NOT NULL,
  expected_outcome TEXT,
  alternative_option TEXT,
  final_recommendation TEXT NOT NULL,
  status TEXT NOT NULL,
  user_approval_status TEXT NOT NULL,
  execution_status TEXT NOT NULL,
  actual_outcome TEXT,
  profit_loss REAL,
  strategy_used TEXT,
  agent_notes TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_orders (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES trading_plans(id),
  platform TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  order_type TEXT NOT NULL,
  status TEXT NOT NULL,
  broker_order_id TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_executions (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES trade_orders(id),
  plan_id TEXT,
  platform TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  fees REAL NOT NULL DEFAULT 0,
  executed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_prices (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  bid REAL,
  ask REAL,
  spread REAL,
  volume REAL,
  currency TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS historical_candles (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_results (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  win_rate REAL,
  loss_rate REAL,
  average_profit REAL,
  average_loss REAL,
  profit_factor REAL,
  max_drawdown REAL,
  confidence REAL,
  disabled INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  extra JSONB
);

ALTER TABLE strategy_results ADD COLUMN IF NOT EXISTS extra JSONB;
ALTER TABLE trade_executions ADD COLUMN IF NOT EXISTS plan_id TEXT;
CREATE INDEX IF NOT EXISTS market_prices_platform_symbol_observed_idx
  ON market_prices (platform, symbol, observed_at DESC);
CREATE INDEX IF NOT EXISTS historical_candles_platform_symbol_interval_opened_idx
  ON historical_candles (platform, symbol, interval, opened_at DESC);
`,
  )
  schemaReady = result.ok
  return result.ok
}

export function readFinancePostgresStore(): FinanceDatabase | null {
  if (!ensureFinancePostgresSchema()) return null
  const result = runPsql(
    FINANCE_PG_DATABASE,
    "SELECT data::text FROM finance_store_snapshots WHERE id = 'default';",
  )
  if (!result.ok || !result.stdout) return null
  try {
    return JSON.parse(result.stdout) as FinanceDatabase
  } catch {
    return null
  }
}

export function writeFinancePostgresStore(db: FinanceDatabase): boolean {
  if (!ensureFinancePostgresSchema()) return false
  const updatedAt = db.updatedAt || new Date().toISOString()
  const result = runPsql(
    FINANCE_PG_DATABASE,
    `
BEGIN;
INSERT INTO finance_store_snapshots (id, data, updated_at)
VALUES ('default', ${sqlJsonb(db)}, ${sqlText(updatedAt)})
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

INSERT INTO settings (id, data, updated_at)
VALUES (1, ${sqlJsonb(db.settings)}, ${sqlText(updatedAt)})
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

${financeMirrorSql(db, updatedAt)}
COMMIT;
`,
  )
  lastWriteError = result.ok ? null : result.reason
  return result.ok
}

export function appendFinanceAuditPostgres(entry: FinanceAuditEntry): boolean {
  if (!ensureFinancePostgresSchema()) return false
  const result = runPsql(
    FINANCE_PG_DATABASE,
    `
INSERT INTO audit_logs (id, action, actor, details_json, source, created_at, updated_at)
VALUES (
  ${sqlText(entry.id)},
  ${sqlText(entry.action)},
  'hermes-finance',
  ${sqlText(JSON.stringify(entry.details))},
  ${sqlText(entry.source)},
  ${sqlText(entry.createdAt)},
  ${sqlText(entry.createdAt)}
)
ON CONFLICT (id) DO NOTHING;
`,
  )
  return result.ok
}

export function financePostgresStatus(): FinancePostgresStatus {
  if (!financePostgresEnabled()) {
    return {
      enabled: false,
      available: false,
      database: FINANCE_PG_DATABASE,
      snapshotAvailable: false,
      reason: 'disabled by HERMES_FINANCE_STORE=json',
    }
  }
  if (!pgConn()) {
    return {
      enabled: true,
      available: false,
      database: FINANCE_PG_DATABASE,
      snapshotAvailable: false,
      reason: 'Postgres credentials are not configured',
    }
  }
  if (!ensureFinancePostgresSchema()) {
    return {
      enabled: true,
      available: false,
      database: FINANCE_PG_DATABASE,
      snapshotAvailable: false,
      reason: 'finance schema is not reachable',
    }
  }
  const snapshot = runPsql(
    FINANCE_PG_DATABASE,
    "SELECT 1 FROM finance_store_snapshots WHERE id = 'default';",
  )
  return {
    enabled: true,
    available: true,
    database: FINANCE_PG_DATABASE,
    snapshotAvailable: snapshot.ok && snapshot.stdout.trim() === '1',
    lastWriteError: lastWriteError ?? undefined,
  }
}
