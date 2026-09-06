import { promises as fs } from 'node:fs'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawClinikoToday {
  count?: number
  appointments: Array<unknown>
  generatedAt?: string
}

interface ClinikoData {
  value: string
  sub: string
  tone: 'info'
}

export function computeClinikoStat(data: RawClinikoToday): ClinikoData {
  const count = data.count
  return {
    value: String(count),
    sub: 'today',
    tone: 'info',
  }
}

export const clinikoTodayAdapter: SourceAdapter<ClinikoData> = {
  id: 'cliniko',
  ttlMs: 60_000,
  async fetch() {
    const raw = await fs.readFile(
      '/root/.hermes/hud-cache/cliniko-today.json',
      'utf8',
    )
    return computeClinikoStat(JSON.parse(raw))
  },
}

registerAdapter(clinikoTodayAdapter)
