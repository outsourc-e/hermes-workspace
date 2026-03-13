import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '@/server/auth-middleware'
import { gatewayRpc } from '@/server/gateway'
import { isGatewayMethodUnavailable } from '@/server/usage-cost'

const FALLBACK_MESSAGE =
  'Gateway logs not available via RPC — check gateway.logs config'

type NormalizedLogEntry = {
  id: string
  timestamp: number | null
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  source: string
  message: string
  raw: string
}

type NormalizedLogPayload = {
  entries: Array<NormalizedLogEntry>
  filePath: string | null
  method: string
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
    }
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeLevel(value: unknown, raw?: string): NormalizedLogEntry['level'] {
  const source = `${readString(value)} ${raw || ''}`.toLowerCase()
  if (source.includes('fatal')) return 'fatal'
  if (source.includes('error')) return 'error'
  if (source.includes('warn')) return 'warn'
  if (source.includes('debug')) return 'debug'
  if (source.includes('trace')) return 'trace'
  return 'info'
}

function parseLine(line: string, index: number): NormalizedLogEntry {
  const trimmed = line.trim()
  const timestampMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/,
  )
  const levelMatch = trimmed.match(/\b(trace|debug|info|warn|warning|error|fatal)\b/i)
  const sourceMatch = trimmed.match(/\[([a-z0-9:_./-]+)\]/i)
  const level = normalizeLevel(levelMatch?.[1], trimmed)

  return {
    id: `line-${index}`,
    timestamp: timestampMatch ? readTimestamp(timestampMatch[1]) : null,
    level,
    source: sourceMatch?.[1] || 'gateway',
    message: trimmed,
    raw: line,
  }
}

function normalizeEntry(value: unknown, index: number): NormalizedLogEntry {
  if (typeof value === 'string') {
    return parseLine(value, index)
  }

  const record = toRecord(value)
  const raw =
    readString(record.raw) ||
    readString(record.line) ||
    readString(record.message) ||
    readString(record.msg) ||
    JSON.stringify(record)

  return {
    id: readString(record.id) || `entry-${index}`,
    timestamp: readTimestamp(
      record.timestamp ??
        record.ts ??
        record.time ??
        record.createdAt ??
        record.date,
    ),
    level: normalizeLevel(record.level ?? record.severity, raw),
    source:
      readString(
        record.source ??
          record.logger ??
          record.component ??
          record.module ??
          record.category,
      ) || 'gateway',
    message:
      readString(
        record.message ??
          record.msg ??
          record.text ??
          record.summary ??
          record.line,
      ) || raw,
    raw,
  }
}

function normalizePayload(method: string, payload: unknown): NormalizedLogPayload {
  const record = toRecord(payload)
  const rawEntries =
    (Array.isArray(record.entries) && record.entries) ||
    (Array.isArray(record.logs) && record.logs) ||
    (Array.isArray(record.items) && record.items) ||
    (Array.isArray(record.lines) && record.lines) ||
    null
  const textBlob =
    readString(record.text) ||
    readString(record.raw) ||
    readString(record.contents) ||
    readString(record.content)
  const entriesSource =
    rawEntries ??
    (textBlob
      ? textBlob
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter(Boolean)
      : [])

  return {
    entries: entriesSource.map(normalizeEntry),
    filePath:
      readString(
        record.filePath ?? record.logPath ?? record.path ?? record.logFile,
      ) || null,
    method,
  }
}

async function fetchGatewayLogs(limit: number): Promise<NormalizedLogPayload> {
  const methods = ['gateway.logs', 'logs.list']
  let unavailableCount = 0

  for (const method of methods) {
    try {
      const payload = await gatewayRpc(method, { limit })
      return normalizePayload(method, payload)
    } catch (error) {
      if (isGatewayMethodUnavailable(error)) {
        unavailableCount += 1
        continue
      }
      throw error
    }
  }

  if (unavailableCount === methods.length) {
    const error = new Error(FALLBACK_MESSAGE)
    throw error
  }

  throw new Error(FALLBACK_MESSAGE)
}

export const Route = createFileRoute('/api/gateway/logs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const rawLimit = Number(url.searchParams.get('limit') || '500')
        const limit =
          Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), 2000)
            : 500

        try {
          const data = await fetchGatewayLogs(limit)
          return json({ ok: true, data })
        } catch (error) {
          if (isGatewayMethodUnavailable(error) || error instanceof Error && error.message === FALLBACK_MESSAGE) {
            return json(
              {
                ok: false,
                unavailable: true,
                error: FALLBACK_MESSAGE,
              },
              { status: 501 },
            )
          }

          return json(
            {
              ok: false,
              error:
                error instanceof Error && error.message
                  ? error.message
                  : 'Failed to load gateway logs',
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
