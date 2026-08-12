export type A2ATaskRequest = {
  skillId: string
  input: Record<string, unknown>
}

function omniRouteUrl(): string {
  return (process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128').replace(
    /\/+$/,
    '',
  )
}

export async function discoverA2AAgent(): Promise<Record<string, unknown>> {
  const response = await fetch(`${omniRouteUrl()}/.well-known/agent.json`, {
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok)
    throw new Error(`A2A discovery failed: HTTP ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

export async function sendA2ATask(
  request: A2ATaskRequest,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = process.env.OMNIROUTE_API_KEY?.trim()
  if (key) headers.Authorization = `Bearer ${key}`
  const response = await fetch(`${omniRouteUrl()}/a2a`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: request,
      id: Date.now(),
    }),
  })
  if (!response.ok)
    throw new Error(`A2A request failed: HTTP ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}
