import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const execFileP = promisify(execFile)

interface VMHealthData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}

export const vmHealthAdapter: SourceAdapter<VMHealthData> = {
  id: 'vm-health',
  ttlMs: 30000,
  async fetch() {
    const meminfo = await fs.readFile('/proc/meminfo', 'utf8')
    const total = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] ?? '0', 10)
    const avail = parseInt(
      meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] ?? '0',
      10,
    )
    const memPct = total > 0 ? Math.round(((total - avail) / total) * 100) : 0

    const { stdout } = await execFileP('df', ['-P', '/'])
    const diskMatch = stdout.split('\n')[1]?.match(/(\d+)%/)
    const diskPct = parseInt(diskMatch?.[1] ?? '0', 10)

    const tone: 'ok' | 'warn' | 'err' =
      memPct > 90 || diskPct > 90
        ? 'err'
        : memPct > 75 || diskPct > 75
          ? 'warn'
          : 'ok'

    return {
      value: `${memPct}%`,
      sub: `mem · ${diskPct}% disk`,
      tone,
    }
  },
}

registerAdapter(vmHealthAdapter)
