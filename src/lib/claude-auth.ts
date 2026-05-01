export interface AuthStatus {
  authenticated: boolean
  authRequired: boolean
  error?: string
}

export async function fetchClaudeAuthStatus(
  timeoutMs = 5_000,
): Promise<AuthStatus> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch('/api/auth-check', { signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out after 5 seconds')
    }

    throw error instanceof Error
      ? error
      : new Error('Failed to connect to Hermes Agent')
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  return (await res.json()) as AuthStatus
}
