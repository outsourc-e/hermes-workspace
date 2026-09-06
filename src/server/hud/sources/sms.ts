import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const HEALTH_URL =
  process.env.HERMES_HEALTH_URL || 'http://127.0.0.1:8642/health/detailed'

interface SMSData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}
interface HealthResponse {
  platforms?: Record<string, { state?: string }>
}

export const smsAdapter: SourceAdapter<SMSData> = {
  id: 'sms',
  ttlMs: 60000,
  async fetch() {
    const res = await fetch(HEALTH_URL, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error('sms fetch failed: ' + res.status)
    const body = (await res.json()) as HealthResponse
    const state = body.platforms?.sms.state
    if (state === 'connected')
      return { value: 'up', sub: 'twilio gateway', tone: 'ok' }
    if (state) return { value: 'down', sub: state, tone: 'err' }
    return { value: '?', sub: 'unknown', tone: 'warn' }
  },
}

registerAdapter(smsAdapter)
