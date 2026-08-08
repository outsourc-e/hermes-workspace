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

/** Chemin de la route de renouvellement — un seul endroit à modifier en cas de repli (§5.1). */
export const AUTH_REFRESH_PATH = '/api/auth/refresh'

export type SessionRefreshResult = {
  ok: boolean
  authRequired: boolean
  authenticated: boolean
  /** Expiration absolue de la session (unix-ms), présent seulement en mode mot de passe. */
  expiresAt?: number
}

/**
 * Renouvelle la session serveur. Ne throw JAMAIS sur un 401 : renvoie
 * `{ ok:false, authRequired:true, authenticated:false }` pour que l'appelant
 * bascule proprement sur le LoginScreen. Throw uniquement sur erreur réseau.
 */
export async function refreshSession(
  timeoutMs = 5_000,
): Promise<SessionRefreshResult> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(AUTH_REFRESH_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
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

  if (res.status === 401) {
    return { ok: false, authRequired: true, authenticated: false }
  }

  return (await res.json()) as SessionRefreshResult
}
