import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

export type ServiceHealthStatus = 'up' | 'down' | 'checking'

export type ServiceHealthItem = {
  name: string
  status: ServiceHealthStatus
  latencyMs?: number
}

type ServicesHealthProbe = {
  missionControlApi: { status: 'up' | 'down'; latencyMs?: number }
  clawSuiteUi: { status: 'up' | 'down'; latencyMs?: number }
  gateway: { status: 'up' | 'down'; latencyMs?: number }
  ollama: { status: 'up' | 'down'; latencyMs?: number }
}

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

async function timedJsonFetch<T>(
  url: string,
  timeoutMs = 2500,
): Promise<{
  ok: boolean
  statusCode: number
  latencyMs: number
  data: T | null
}> {
  const startedAt = nowMs()
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal })
    const latencyMs = Math.max(1, Math.round(nowMs() - startedAt))
    let data: T | null = null
    try {
      data = (await response.json()) as T
    } catch {
      data = null
    }
    return { ok: response.ok, statusCode: response.status, latencyMs, data }
  } catch {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Math.max(1, Math.round(nowMs() - startedAt)),
      data: null,
    }
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function fetchServicesHealthProbe(): Promise<ServicesHealthProbe> {
  const [uiProbe, hermesHealth] = await Promise.all([
    timedJsonFetch<Record<string, unknown>>('/api/ping', 2500),
    timedJsonFetch<Record<string, unknown>>(`${HERMES_API_URL}/health`, 2500),
  ])

  const clawSuiteUi = uiProbe.ok
    ? { status: 'up' as const, latencyMs: uiProbe.latencyMs }
    : { status: 'down' as const, latencyMs: uiProbe.latencyMs }

  const missionControlApi =
    hermesHealth.ok
      ? { status: 'up' as const, latencyMs: hermesHealth.latencyMs }
      : { status: 'down' as const, latencyMs: hermesHealth.latencyMs }

  const gateway = hermesHealth.ok
    ? { status: 'up' as const, latencyMs: hermesHealth.latencyMs }
    : { status: 'down' as const, latencyMs: hermesHealth.latencyMs }

  const ollamaProbe = await timedJsonFetch<{ ok?: boolean }>('/api/ollama-health', 2500)
  const ollama =
    ollamaProbe.ok && ollamaProbe.data?.ok === true
      ? { status: 'up' as const, latencyMs: ollamaProbe.latencyMs }
      : { status: 'down' as const, latencyMs: ollamaProbe.latencyMs }

  return { missionControlApi, clawSuiteUi, gateway, ollama }
}

export function useServicesHealth(gatewayConnected: boolean) {
  const query = useQuery({
    queryKey: ['dashboard', 'services-health'],
    queryFn: fetchServicesHealthProbe,
    retry: false,
    refetchInterval: 30_000,
  })

  const services = useMemo<Array<ServiceHealthItem>>(() => {
    const probe = query.data
    const isChecking = query.isLoading && !probe

    return [
      {
        name: 'Hermes Workspace UI',
        status: isChecking ? 'checking' : (probe?.clawSuiteUi.status ?? 'down'),
        latencyMs: probe?.clawSuiteUi.latencyMs,
      },
      {
        name: 'Hermes Agent',
        status: isChecking
          ? 'checking'
          : (probe?.gateway.status ?? (gatewayConnected ? 'up' : 'down')),
        latencyMs: probe?.gateway.latencyMs,
      },
      {
        name: 'Ollama',
        status: isChecking ? 'checking' : (probe?.ollama.status ?? 'down'),
        latencyMs: probe?.ollama.latencyMs,
      },
    ]
  }, [gatewayConnected, query.data, query.isLoading])

  return {
    ...query,
    services,
  }
}
