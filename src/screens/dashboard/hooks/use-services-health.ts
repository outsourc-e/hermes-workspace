import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

export type ServiceHealthStatus = 'up' | 'down' | 'checking'

export type ServiceHealthItem = {
  name: string
  status: ServiceHealthStatus
  latencyMs?: number
}

type GatewayStatusResponse = {
  ok?: boolean
}

type GatewayNodesResponse = {
  ok?: boolean
  data?: unknown
}

type ServicesHealthProbe = {
  missionControlApi: { status: 'up' | 'down'; latencyMs?: number }
  clawSuiteUi: { status: 'up' | 'down'; latencyMs?: number }
  gateway: { status: 'up' | 'down'; latencyMs?: number }
  ollama: { status: 'up' | 'down'; latencyMs?: number }
}

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

function extractNodeCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (!value || typeof value !== 'object') return 0
  const record = value as Record<string, unknown>
  if (Array.isArray(record.nodes)) return record.nodes.length
  if (Array.isArray(record.items)) return record.items.length
  if (Array.isArray(record.data)) return record.data.length
  return 0
}

async function fetchServicesHealthProbe(): Promise<ServicesHealthProbe> {
  const [uiProbe, gatewayStatus, gatewayNodes] = await Promise.all([
    timedJsonFetch<Record<string, unknown>>('/api/ping', 2500),
    timedJsonFetch<GatewayStatusResponse>('/api/gateway/status', 2500),
    timedJsonFetch<GatewayNodesResponse>('/api/gateway/nodes', 2500),
  ])

  const clawSuiteUi = uiProbe.ok
    ? { status: 'up' as const, latencyMs: uiProbe.latencyMs }
    : { status: 'down' as const, latencyMs: uiProbe.latencyMs }

  const missionControlApi =
    gatewayStatus.ok && gatewayStatus.data?.ok === true
      ? { status: 'up' as const, latencyMs: gatewayStatus.latencyMs }
      : { status: 'down' as const, latencyMs: gatewayStatus.latencyMs }

  const gateway = gatewayStatus.ok
    ? { status: 'up' as const, latencyMs: gatewayStatus.latencyMs }
    : { status: 'down' as const, latencyMs: gatewayStatus.latencyMs }

  const hasOllamaNodes =
    gatewayNodes.ok &&
    gatewayNodes.data?.ok === true &&
    extractNodeCount(gatewayNodes.data.data) > 0

  const ollamaProbe = hasOllamaNodes
    ? await timedJsonFetch<{ ok?: boolean }>('/api/ollama-health', 2500)
    : null

  const ollama =
    hasOllamaNodes && ollamaProbe?.ok && ollamaProbe.data?.ok === true
      ? { status: 'up' as const, latencyMs: ollamaProbe.latencyMs }
      : { status: 'down' as const, latencyMs: ollamaProbe?.latencyMs ?? gatewayNodes.latencyMs }

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
        name: 'OpenClaw Gateway',
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
