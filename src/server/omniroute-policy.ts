export type OmniRoutePolicySnapshot = {
  healthy: boolean
  budgetRemainingUsd: number | null
  circuitOpen: boolean
  degraded: boolean
  reason: string | null
  checkedAt: number
}

function baseUrl(): string {
  return (process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128').replace(
    /\/+$/,
    '',
  )
}

async function getJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const headers: Record<string, string> = {}
    const key = process.env.OMNIROUTE_API_KEY?.trim()
    if (key) headers.Authorization = `Bearer ${key}`
    const response = await fetch(`${baseUrl()}${path}`, {
      headers,
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as unknown
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export async function getOmniRoutePolicySnapshot(): Promise<OmniRoutePolicySnapshot> {
  const [health, monitoring, budget] = await Promise.all([
    getJson('/api/health'),
    getJson('/api/monitoring/health'),
    getJson('/api/usage/budget'),
  ])
  const circuitBreakers = Array.isArray(monitoring?.circuitBreakers)
    ? monitoring.circuitBreakers
    : []
  const circuitOpen = circuitBreakers.some(
    (item) =>
      item &&
      typeof item === 'object' &&
      String((item as Record<string, unknown>).state).toUpperCase() === 'OPEN',
  )
  const remaining = [
    budget?.remainingUsd,
    budget?.remaining_usd,
    budget?.remaining,
  ].find((value) => typeof value === 'number')
  const healthy =
    health?.ok === true || health?.status === 'ok' || health !== null
  const degraded = !healthy || circuitOpen
  return {
    healthy,
    budgetRemainingUsd: typeof remaining === 'number' ? remaining : null,
    circuitOpen,
    degraded,
    reason: !healthy
      ? 'OmniRoute health endpoint unavailable.'
      : circuitOpen
        ? 'One or more OmniRoute provider circuit breakers are open.'
        : null,
    checkedAt: Date.now(),
  }
}

export async function enforceOmniRoutePolicy(): Promise<OmniRoutePolicySnapshot> {
  const snapshot = await getOmniRoutePolicySnapshot()
  const minBudget = Number(process.env.OMNIROUTE_MIN_REMAINING_USD ?? '0')
  if (
    snapshot.circuitOpen &&
    process.env.OMNIROUTE_ALLOW_CIRCUIT_OPEN !== 'true'
  ) {
    throw new Error(snapshot.reason ?? 'OmniRoute circuit breaker is open.')
  }
  if (
    snapshot.budgetRemainingUsd !== null &&
    snapshot.budgetRemainingUsd < minBudget
  ) {
    throw new Error(
      `OmniRoute remaining budget ${snapshot.budgetRemainingUsd} is below policy minimum ${minBudget}.`,
    )
  }
  return snapshot
}
