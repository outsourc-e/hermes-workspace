import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const HEALTH_URL =
  process.env.HERMES_HEALTH_URL || 'http://127.0.0.1:8642/health/detailed'

interface AgentsData {
  value: string
  sub: string
  tone: 'ok' | 'info'
}
interface HealthResponse {
  active_agents?: number
  gateway_state?: string
}

export const agentsAdapter: SourceAdapter<AgentsData> = {
  id: 'agents',
  ttlMs: 60000,
  async fetch() {
    const res = await fetch(HEALTH_URL, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error('agents fetch failed: ' + res.status)
    const body = (await res.json()) as HealthResponse
    const active = body.active_agents ?? 0
    return {
      value: String(active),
      sub: body.gateway_state ?? 'unknown',
      tone: body.gateway_state === 'ready' ? 'ok' : 'info',
    }
  },
}

registerAdapter(agentsAdapter)
