/**
 * Health API — aggregates status from Hermes subsystems
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const HERMES_API = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

async function probe(url: string, timeoutMs = 3000): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return { ok: res.ok, latencyMs: Date.now() - start }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) }
  }
}

export const Route = createFileRoute('/api/hermes-health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const [api, models, skills, jobs, memory] = await Promise.all([
          probe(`${HERMES_API}/health`),
          probe(`${HERMES_API}/v1/models`),
          probe(`${HERMES_API}/api/skills`),
          probe(`${HERMES_API}/api/jobs`),
          probe(`${HERMES_API}/api/memory`),
        ])

        const allOk = api.ok && models.ok && skills.ok && jobs.ok && memory.ok

        return json({
          ok: true,
          status: allOk ? 'healthy' : 'degraded',
          services: {
            api: { ...api, label: 'Hermes API' },
            models: { ...models, label: 'Models' },
            skills: { ...skills, label: 'Skills' },
            jobs: { ...jobs, label: 'Jobs' },
            memory: { ...memory, label: 'Memory' },
          },
          timestamp: new Date().toISOString(),
        })
      },
    },
  },
})
