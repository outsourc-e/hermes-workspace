import { promises as fs } from 'node:fs'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawPlaud {
  id: string
  name?: string
  created_at?: string
  transcribed?: boolean // placeholder shape (back-compat)
}

interface PlaudResponse {
  type?: string
  data?: Array<RawPlaud>
}

interface PlaudData {
  value: string
  sub: string
  tone: 'ok' | 'info'
}

// "Needs attention" = transcribed: false (explicit) OR name matches PLAUD default
// (untitled timestamp / "New Recording N")
function needsAttention(r: RawPlaud): boolean {
  if (r.transcribed === false) return true
  if (r.transcribed === true) return false
  const n = r.name || ''
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(n)) return true
  if (/^New Recording/i.test(n)) return true
  return false
}

export function computePlaudStat(
  input: Array<RawPlaud> | PlaudResponse,
): PlaudData {
  const recordings: Array<RawPlaud> = Array.isArray(input)
    ? input
    : (input.data ?? [])
  const count = recordings.filter(needsAttention).length
  const total = recordings.length
  return {
    value: String(count),
    sub: total > 0 ? `untitled · ${total} total` : 'untranscribed',
    tone: count === 0 ? 'ok' : 'info',
  }
}

export const plaudAdapter: SourceAdapter<PlaudData> = {
  id: 'plaud',
  ttlMs: 600_000,
  async fetch() {
    const raw = await fs.readFile(
      '/root/.hermes/hud-cache/plaud-recent.json',
      'utf8',
    )
    return computePlaudStat(JSON.parse(raw))
  },
}

registerAdapter(plaudAdapter)
