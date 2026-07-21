import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProfilesDir } from '../../server/claude-paths'

const VT_REPO_DIR = '/root/Code/vt-capital'
const VT_QUEUES_DIR = path.join(VT_REPO_DIR, 'queues')
const VT_ORDER_PROPOSED_PATH = path.join(VT_QUEUES_DIR, 'order.proposed.jsonl')
const VT_ORDER_EXECUTED_PATH = path.join(VT_QUEUES_DIR, 'order.executed.jsonl')
const VT_DEMO_STATE_PATH = path.join(
  VT_REPO_DIR,
  'data/demo_guardian_loop/state.json',
)
const TRADING_NOTES_DIR = '/root/hermes-vault/03-Trading-Notes'
const SESSION_NOTES_DIR = '/root/hermes-vault/01-Sessioni'
const HOURLY_BIAS_PATH = path.join(
  TRADING_NOTES_DIR,
  'crypto-hourly-bias.jsonl',
)
const PRECHECK_PATH = path.join(
  TRADING_NOTES_DIR,
  'crypto-council-precheck.jsonl',
)
const VT_WORKERS = [
  'hermesmain',
  'tradinganalyst',
  'macronewsscout',
  'riskmanager',
  'strategyreviewer',
  'operationswatcher',
]

type JsonRecord = Record<string, unknown>

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath)
  } catch {
    return null
  }
}

function readLastLines(filePath: string, limit = 8): Array<JsonRecord> {
  if (!fs.existsSync(filePath)) return []
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as JsonRecord
        } catch {
          return { raw: line }
        }
      })
  } catch {
    return []
  }
}

function listRecentNotes(): Array<{
  title: string
  path: string
  mtimeMs: number
  size: number
}> {
  const notes: Array<{
    title: string
    path: string
    mtimeMs: number
    size: number
  }> = []
  for (const dir of [TRADING_NOTES_DIR, SESSION_NOTES_DIR]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const lower = name.toLowerCase()
      if (!lower.endsWith('.md')) continue
      if (!lower.includes('vt-capital') && !lower.includes('crypto')) continue
      const filePath = path.join(dir, name)
      const stat = safeStat(filePath)
      if (stat?.isFile())
        notes.push({
          title: name.replace(/\.md$/, ''),
          path: filePath,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        })
    }
  }
  return notes.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 8)
}

function readWorkerRuntime(workerId: string): JsonRecord {
  const profilePath = path.join(getProfilesDir(), workerId)
  const runtimePath = path.join(profilePath, 'runtime.json')
  const memoryPath = path.join(profilePath, 'memory', 'MEMORY.md')
  const identityPath = path.join(profilePath, 'memory', 'IDENTITY.md')
  let runtime: JsonRecord = {}
  try {
    runtime = fs.existsSync(runtimePath)
      ? (JSON.parse(fs.readFileSync(runtimePath, 'utf8')) as JsonRecord)
      : {}
  } catch {
    runtime = {}
  }
  return {
    workerId,
    profilePath,
    state: typeof runtime.state === 'string' ? runtime.state : 'unknown',
    role: typeof runtime.role === 'string' ? runtime.role : workerId,
    currentTask:
      typeof runtime.currentTask === 'string' ? runtime.currentTask : null,
    lastSummary:
      typeof runtime.lastSummary === 'string' ? runtime.lastSummary : null,
    memoryExists: fs.existsSync(memoryPath),
    identityExists: fs.existsSync(identityPath),
    runtimeExists: fs.existsSync(runtimePath),
  }
}

function summarizeLatestBias(records: Array<JsonRecord>): JsonRecord | null {
  if (records.length === 0) return null
  const latest = records[records.length - 1]
  const candidates = Array.isArray(latest.council_candidates)
    ? latest.council_candidates
    : Array.isArray(latest.assets)
      ? latest.assets
      : []
  return {
    generatedAt:
      latest.generated_at ?? latest.generatedAt ?? latest.timestamp ?? null,
    source: latest.source ?? 'crypto-hourly-bias',
    candidateCount: candidates.length,
    candidates,
    raw: latest,
  }
}

function readJsonFile(filePath: string): JsonRecord | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord
  } catch {
    return null
  }
}

function payloadOf(record: JsonRecord | null): JsonRecord | null {
  if (!record) return null
  const payload = record.payload
  return payload && typeof payload === 'object' ? (payload as JsonRecord) : record
}

function sourceProposal(record: JsonRecord | null): JsonRecord | null {
  const payload = payloadOf(record)
  if (!payload) return null
  const source = payload.source_proposal
  return source && typeof source === 'object' ? (source as JsonRecord) : payload
}

function flattenExecutedOrder(record: JsonRecord | null): JsonRecord | null {
  const payload = payloadOf(record)
  if (!payload) return null
  const order = payload.order && typeof payload.order === 'object' ? (payload.order as JsonRecord) : {}
  const proposal = sourceProposal(record) ?? {}
  return {
    ...proposal,
    ...order,
    approval_id: order.approval_id ?? proposal.approval_id ?? null,
    book: order.book ?? proposal.book ?? null,
    strategy_id: order.strategy_id ?? proposal.strategy_id ?? null,
    intent: order.intent ?? proposal.intent ?? null,
    position_horizon: order.position_horizon ?? proposal.position_horizon ?? null,
  }
}

function summariseDemoState(): JsonRecord {
  const state = readJsonFile(VT_DEMO_STATE_PATH)
  const orders = Array.isArray(state?.orders) ? (state.orders as Array<JsonRecord>) : []
  const lastOrder = orders.length > 0 ? orders[orders.length - 1] : null
  return {
    trackedOrders: orders.length,
    openOrders: orders.filter((order) => order.status === 'open').length,
    lastOrder,
  }
}

function recentGuardianBlocks(records: Array<JsonRecord>): Array<JsonRecord> {
  return records
    .map(payloadOf)
    .filter((payload): payload is JsonRecord => Boolean(payload))
    .filter((payload) =>
      Boolean(payload.reason_code || payload.reason || payload.error || payload.rejected),
    )
    .slice(-5)
}

export const Route = createFileRoute('/api/vt-capital')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const biasRecords = readLastLines(HOURLY_BIAS_PATH, 10)
        const precheckRecords = readLastLines(PRECHECK_PATH, 12)
        const proposedRecords = readLastLines(VT_ORDER_PROPOSED_PATH, 10)
        const executedRecords = readLastLines(VT_ORDER_EXECUTED_PATH, 10)
        const biasStat = safeStat(HOURLY_BIAS_PATH)
        const precheckStat = safeStat(PRECHECK_PATH)
        const lastOrderProposed = sourceProposal(
          proposedRecords.at(-1) ?? null,
        )
        const lastOrderExecuted = flattenExecutedOrder(
          executedRecords.at(-1) ?? null,
        )
        const lastRiskCheck = lastOrderProposed ?? sourceProposal(
          executedRecords.at(-1) ?? null,
        )
        return json({
          ok: true,
          checkedAt: Date.now(),
          plugin: {
            name: 'vt-capital',
            version: '0.1.0',
            mode: 'observe_only',
            executionEnabled: false,
          },
          paths: {
            vault: '/root/hermes-vault',
            tradingNotes: TRADING_NOTES_DIR,
            hourlyBias: HOURLY_BIAS_PATH,
            councilPrecheck: PRECHECK_PATH,
            profilesDir: getProfilesDir(),
            home: os.homedir(),
          },
          marketBias: {
            fileExists: Boolean(biasStat),
            updatedAt: biasStat?.mtimeMs ?? null,
            sizeBytes: biasStat?.size ?? 0,
            latest: summarizeLatestBias(biasRecords),
            recent: biasRecords.slice(-5),
          },
          council: {
            fileExists: Boolean(precheckStat),
            updatedAt: precheckStat?.mtimeMs ?? null,
            sizeBytes: precheckStat?.size ?? 0,
            recent: precheckRecords.slice(-8),
          },
          workers: VT_WORKERS.map(readWorkerRuntime),
          guardian: {
            requireOrderScope: true,
            executionMode: 'demo_guardian',
            liveBlocked: true,
            executionEnabled: false,
            lastRiskCheck,
            lastOrderProposed,
            lastOrderExecuted,
            demoState: summariseDemoState(),
            recentBlocks: recentGuardianBlocks([
              ...proposedRecords,
              ...executedRecords,
              ...precheckRecords,
            ]),
          },
          notes: listRecentNotes(),
        })
      },
    },
  },
})
