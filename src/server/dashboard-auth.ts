/**
 * Hermes Dashboard authentication (Basic provider).
 * Credentials and session cookies remain server-side.
 */

const username = process.env.HERMES_DASHBOARD_USERNAME || ''
const password = process.env.HERMES_DASHBOARD_PASSWORD || ''

const sessions = new Map<string, Map<string, string>>()
const loginPromises = new Map<string, Promise<void>>()

function sessionCookies(baseUrl: string): Map<string, string> {
  let cookies = sessions.get(baseUrl)
  if (!cookies) {
    cookies = new Map()
    sessions.set(baseUrl, cookies)
  }
  return cookies
}

export function dashboardBasicAuthEnabled(): boolean {
  return Boolean(username && password)
}

function saveCookies(baseUrl: string, response: Response): void {
  const cookies = sessionCookies(baseUrl)
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';')
    const separator = pair.indexOf('=')
    if (separator < 1) continue

    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    if (value) cookies.set(name, value)
    else cookies.delete(name)
  }
}

function cookieHeader(baseUrl: string): string {
  return [...sessionCookies(baseUrl)]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

async function login(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/auth/password-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'basic',
      username,
      password,
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`Hermes dashboard authentication failed: HTTP ${response.status}`)
  }

  saveCookies(baseUrl, response)

  if (!sessionCookies(baseUrl).has('hermes_session_at')) {
    throw new Error('Hermes dashboard did not return a session cookie')
  }
}

async function ensureLogin(baseUrl: string): Promise<void> {
  let pending = loginPromises.get(baseUrl)
  if (!pending) {
    pending = login(baseUrl).finally(() => {
      loginPromises.delete(baseUrl)
    })
    loginPromises.set(baseUrl, pending)
  }
  await pending
}

export async function authenticatedDashboardFetch(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(path, `${baseUrl}/`).toString()

  if (!dashboardBasicAuthEnabled()) {
    return fetch(url, init)
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!sessionCookies(baseUrl).has('hermes_session_at')) {
      await ensureLogin(baseUrl)
    }

    const headers = new Headers(init.headers)
    headers.set('Cookie', cookieHeader(baseUrl))

    const response = await fetch(url, { ...init, headers })
    saveCookies(baseUrl, response)

    if (response.status !== 401) {
      return response
    }

    sessionCookies(baseUrl).clear()
  }

  throw new Error('Hermes dashboard authentication expired or rejected')
}
