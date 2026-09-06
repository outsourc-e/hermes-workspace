import { promises as fs } from 'node:fs'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

interface RawSessions {
  hosts: Array<{ host: string; activeLast1h: number }>
}
interface SessionsData {
  value: string
  sub: string
  tone: 'info'
}

export function computeSessionsStat(data: RawSessions): SessionsData {
  const active = data.hosts.filter((h) => h.activeLast1h > 0)
  const total = active.reduce((s, h) => s + h.activeLast1h, 0)
  return {
    value: String(total),
    sub: active.length + ' hosts',
    tone: 'info',
  }
}

export const sessionsAdapter: SourceAdapter<SessionsData> = {
  id: 'sessions',
  ttlMs: 15 * 60_000,
  async fetch() {
    const raw = await fs.readFile(
      '/root/.hermes/hud-cache/sessions-sidecar.json',
      'utf8',
    )
    return computeSessionsStat(JSON.parse(raw))
  },
}

registerAdapter(sessionsAdapter)
