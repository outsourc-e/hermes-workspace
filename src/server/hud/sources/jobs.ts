import { promises as fs } from 'node:fs'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawJob {
  id: string
  last_run_at: string | null
  last_status: string | null
  enabled: boolean
}
interface JobsFile {
  jobs: Array<RawJob>
}

interface JobsStat {
  ok24h: number
  failed24h: number
}

export function computeJobsStat(file: JobsFile): JobsStat {
  const cutoff = Date.now() - 24 * 3600 * 1000
  let ok = 0,
    fail = 0
  for (const j of file.jobs) {
    if (!j.last_run_at) continue
    if (new Date(j.last_run_at).getTime() < cutoff) continue
    if (j.last_status === 'ok') ok++
    else if (j.last_status === 'error' || j.last_status === 'fail') fail++
  }
  return { ok24h: ok, failed24h: fail }
}

interface JobsData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}

export const jobsAdapter: SourceAdapter<JobsData> = {
  id: 'jobs',
  ttlMs: 30000,
  async fetch() {
    const raw = await fs.readFile('/root/.hermes/cron/jobs.json', 'utf8')
    const stat = computeJobsStat(JSON.parse(raw))
    return {
      value: `${stat.ok24h} ✓`,
      sub: stat.failed24h > 0 ? `${stat.failed24h} fail` : 'all green',
      tone: stat.failed24h === 0 ? 'ok' : stat.failed24h < 3 ? 'warn' : 'err',
    }
  },
}

registerAdapter(jobsAdapter)
