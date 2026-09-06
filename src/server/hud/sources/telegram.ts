import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const HEALTH_URL =
  process.env.HERMES_HEALTH_URL || 'http://127.0.0.1:8642/health/detailed'

interface TelegramData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}
interface HealthResponse {
  platforms?: Record<string, { state?: string }>
}

export const telegramAdapter: SourceAdapter<TelegramData> = {
  id: 'telegram',
  ttlMs: 60000,
  async fetch() {
    const res = await fetch(HEALTH_URL, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error('telegram fetch failed: ' + res.status)
    const body = (await res.json()) as HealthResponse
    const state = body.platforms?.telegram.state
    if (state === 'connected')
      return { value: 'up', sub: 'telegram bot', tone: 'ok' }
    if (state) return { value: 'down', sub: state, tone: 'err' }
    return { value: '?', sub: 'unknown', tone: 'warn' }
  },
}

registerAdapter(telegramAdapter)
