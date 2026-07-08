/**
 * Phone push notifications via ntfy (https://ntfy.sh).
 *
 * Reserved for IMPORTANT events only: refuted verifications, goal
 * done/failed, blocked workers, watchdog service-down. Routine chatter
 * stays in Discord/timeline.
 *
 * Config (~/.hermes/.env):
 *   HERMES_NTFY_TOPIC=<private-topic-name>   — required; unset = disabled
 *   HERMES_NTFY_SERVER=https://ntfy.sh       — optional override
 *   HERMES_NTFY_TOKEN=<access token>         — optional (self-hosted/auth)
 *
 * Fire-and-forget; never throws, never blocks dispatch.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type PushInput = {
  title: string
  message: string
  /** ntfy priority: 5=max/urgent, 4=high, 3=default. Important events use 4+. */
  priority?: 3 | 4 | 5
  /** ntfy tags → emoji on the phone, e.g. ['rotating_light'] */
  tags?: Array<string>
}

function readHermesEnv(name: string): string {
  try {
    const envFile = readFileSync(join(homedir(), '.hermes', '.env'), 'utf8')
    return (
      envFile
        .split('\n')
        .find((l) => l.startsWith(`${name}=`))
        ?.slice(name.length + 1)
        .replace(/^["']|["']$/g, '')
        .trim() ?? ''
    )
  } catch {
    return ''
  }
}

export function pushConfigured(): boolean {
  return Boolean(readHermesEnv('HERMES_NTFY_TOPIC'))
}

/**
 * Send a push notification to the operator's phone. Returns false when
 * push is not configured (HERMES_NTFY_TOPIC unset) — callers should treat
 * that as "fine, Discord still covers it".
 */
export function notifyPhone(input: PushInput): boolean {
  try {
    const topic = readHermesEnv('HERMES_NTFY_TOPIC')
    if (!topic) return false
    const server = readHermesEnv('HERMES_NTFY_SERVER') || 'https://ntfy.sh'
    const token = readHermesEnv('HERMES_NTFY_TOKEN')
    const headers: Record<string, string> = {
      Title: input.title.slice(0, 120),
      Priority: String(input.priority ?? 4),
      Tags: (input.tags ?? []).join(',').slice(0, 120),
    }
    if (token) headers.Authorization = `Bearer ${token}`
    void fetch(`${server.replace(/\/$/, '')}/${topic}`, {
      method: 'POST',
      headers,
      body: input.message.slice(0, 3800),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {})
    return true
  } catch {
    return false
  }
}
