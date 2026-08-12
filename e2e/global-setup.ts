import type { FullConfig } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Authenticate with the workspace before running e2e tests.
 *
 * The workspace can be password-protected via HERMES_PASSWORD or
 * CLAUDE_PASSWORD. When protection is enabled, we POST to /api/auth
 * and save the resulting session cookie into a storageState file so
 * every test page starts already logged in.
 *
 * If the workspace is not password-protected, the file is still
 * written as an empty storage state; Playwright handles this fine.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.HERMES_WORKSPACE_URL ??
    'http://localhost:3000'

  // Try to load .env if present so HERMES_PASSWORD is available
  try {
    const dotenvPath = join(process.cwd(), '.env')
    if (existsSync(dotenvPath)) {
      const envText = new TextDecoder().decode(
        await import('node:fs').then((m) => m.readFileSync(dotenvPath)),
      )
      for (const line of envText.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
        if (match && process.env[match[1]] === undefined) {
          process.env[match[1]] = match[2]
        }
      }
    }
  } catch {
    // ignore .env parse errors
  }

  const password =
    process.env.HERMES_PASSWORD?.trim() ||
    process.env.CLAUDE_PASSWORD?.trim() ||
    ''

  const storageStatePath = 'e2e/.auth/session.json'
  const storageDir = dirname(storageStatePath)

  if (!existsSync(storageDir)) {
    mkdirSync(storageDir, { recursive: true })
  }

  if (!password) {
    writeFileSync(
      storageStatePath,
      JSON.stringify({ cookies: [], origins: [] }, null, 2),
    )
    return
  }

  const res = await fetch(`${baseURL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  const data = (await res.json().catch(() => ({}))) as { ok?: boolean }

  if (!res.ok || !data.ok) {
    throw new Error(
      `Failed to authenticate e2e test session: ${res.status} ${JSON.stringify(data)}`,
    )
  }

  const cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: 'Strict' | 'Lax' | 'None'
  }> = []

  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const cookie of setCookie) {
    const [nameValue, ...attrs] = cookie.split(/\s*;\s*/)
    const [name, value] = nameValue.split(/\s*=\s*/)
    if (!name || value === undefined) continue

    const attrMap = new Map(attrs.map((a) => a.split(/\s*=\s*/) as [string, string]))
    const httpOnly = attrs.some((a) => a.toLowerCase() === 'httponly')
    const secure = attrs.some((a) => a.toLowerCase() === 'secure')
    const sameSiteAttr = attrs
      .find((a) => a.toLowerCase().startsWith('samesite'))
      ?.toLowerCase()
    const sameSite: 'Strict' | 'Lax' | 'None' =
      sameSiteAttr === 'samesite=none'
        ? 'None'
        : sameSiteAttr === 'samesite=lax'
          ? 'Lax'
          : 'Strict'

    const maxAgeAttr = attrs
      .find((a) => a.toLowerCase().startsWith('max-age'))
      ?.toLowerCase()
    const maxAge = maxAgeAttr ? Number(maxAgeAttr.split('=')[1]) : NaN
    const expires = Number.isFinite(maxAge) ? Date.now() / 1000 + maxAge : -1

    const domain = new URL(baseURL).hostname
    cookies.push({
      name: name.trim(),
      value: value.trim(),
      domain: domain === 'localhost' ? 'localhost' : `.${domain}`,
      path: (attrMap.get('Path') ?? '/').trim(),
      expires,
      httpOnly,
      secure,
      sameSite,
    })
  }

  writeFileSync(
    storageStatePath,
    JSON.stringify({ cookies, origins: [] }, null, 2),
  )
}
