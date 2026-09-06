import { promises as fs } from 'node:fs'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawDeadline {
  id: string
  unit: string
  title: string
  kind: 'due' | 'assessment'
  due: string
  source?: string
}

interface DeadlineFile {
  generatedAt: string
  items: Array<RawDeadline>
  error?: string
}

export interface UniData {
  label: string
  title: string
  sub: string
}

export function deriveNextDeadline(items: Array<RawDeadline>): UniData | null {
  const now = Date.now()
  const future = items
    .map((i) => ({ ...i, dueMs: new Date(i.due).getTime() }))
    .filter((i) => i.dueMs > now)
    .sort((a, b) => a.dueMs - b.dueMs)
  const next = future[0]
  if (future.length === 0) return null
  const daysOut = Math.ceil((next.dueMs - now) / 86400_000)
  return {
    label: 'UNI · ' + (daysOut <= 1 ? 'TOMORROW' : daysOut + 'D'),
    title: next.unit,
    sub: next.title + ' (' + next.kind + ')',
  }
}

export const uniDeadlinesAdapter: SourceAdapter<UniData | null> = {
  id: 'next-deadline',
  ttlMs: 5 * 60_000,
  async fetch() {
    const raw = await fs.readFile('/root/.hermes/uni-deadlines.json', 'utf8')
    const file = JSON.parse(raw) as DeadlineFile
    return deriveNextDeadline(file.items)
  },
}

registerAdapter(uniDeadlinesAdapter)
