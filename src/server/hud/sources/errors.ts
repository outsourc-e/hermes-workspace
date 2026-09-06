import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const execFileP = promisify(execFile)

interface ErrorsData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}

export const errorsAdapter: SourceAdapter<ErrorsData> = {
  id: 'errors',
  ttlMs: 30000,
  async fetch() {
    const { stdout } = await execFileP('journalctl', [
      '--since',
      '1 hour ago',
      '--priority=err',
      '--no-pager',
      '-q',
    ])
    const count = stdout.trim() ? stdout.trim().split('\n').length : 0
    return {
      value: String(count),
      sub: 'last 1h',
      tone: count === 0 ? 'ok' : count < 5 ? 'warn' : 'err',
    }
  },
}

registerAdapter(errorsAdapter)
