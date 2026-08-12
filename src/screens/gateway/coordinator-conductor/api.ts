import type {
  ListResponse,
  MetricsResponse,
  Snapshot,
  SpawnResponse,
} from './types'

export async function fetchMissionList(): Promise<ListResponse> {
  const response = await fetch('/api/mission-coordinator', {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Coordinator returned ${response.status}`)
  return (await response.json()) as ListResponse
}

export async function fetchMissionMetrics(): Promise<MetricsResponse> {
  const response = await fetch('/api/mission-coordinator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'metrics' }),
  })
  if (!response.ok) throw new Error(`Metrics returned ${response.status}`)
  return (await response.json()) as MetricsResponse
}

export async function fetchMissionSnapshot(
  missionId: string,
): Promise<Snapshot> {
  const response = await fetch(
    `/api/mission-coordinator?missionId=${encodeURIComponent(missionId)}`,
    { cache: 'no-store' },
  )
  if (!response.ok)
    throw new Error(`Mission snapshot returned ${response.status}`)
  return (await response.json()) as Snapshot
}

export async function coordinatorAction(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch('/api/mission-coordinator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as Record<string, unknown>
  if (!response.ok || payload.ok === false) {
    throw new Error(
      String(payload.error ?? `Coordinator returned ${response.status}`),
    )
  }
  return payload
}

export async function conductorSpawn(
  body: Record<string, unknown>,
): Promise<SpawnResponse> {
  const response = await fetch('/api/conductor-spawn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as SpawnResponse
  if (!response.ok || payload.ok === false) {
    throw new Error(
      String(payload.error ?? `Conductor spawn returned ${response.status}`),
    )
  }
  return payload
}
