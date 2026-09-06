import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const BRIEF_JOB_ID = process.env.HERMES_BRIEF_JOB_ID || 'efe4f56a22ea'
const OUTPUT_DIR = '/root/.hermes/cron/output/' + BRIEF_JOB_ID

interface BriefData {
  text: string
  generatedAt: number
}

export function parseBriefContent(raw: string): string {
  const marker = '## Response'
  const idx = raw.indexOf(marker)
  if (idx < 0) return raw.trim()
  return raw.slice(idx + marker.length).trim()
}

export async function readLatestBrief(dir: string): Promise<BriefData> {
  const entries = await fs.readdir(dir)
  if (entries.length === 0) throw new Error('no brief output yet')
  // Filename pattern YYYY-MM-DD_HH-MM-SS.md sorts chronologically by lexicographic order
  const sorted = entries.sort().reverse()
  const latest = sorted[0]
  const path = join(dir, latest)
  const stat = await fs.stat(path)
  const text = await fs.readFile(path, 'utf8')
  return { text: parseBriefContent(text), generatedAt: stat.mtimeMs }
}

export const briefAdapter: SourceAdapter<BriefData> = {
  id: 'brief',
  ttlMs: 24 * 3600_000,
  async fetch() {
    return readLatestBrief(OUTPUT_DIR)
  },
}

registerAdapter(briefAdapter)
