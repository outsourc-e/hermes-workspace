/**
 * API Rate Limiter — prevents abuse of workspace API endpoints.
 * In-memory sliding window per IP address.
 * Production note: replace with Redis for multi-instance deployments.
 */

type Entry = { count: number; resetAt: number }

const _windows = new Map<string, Entry>()

const WINDOW_MS = 60_000 // 1-minute window
const MAX_REQUESTS = 120 // max 120 req/min per IP (generous for normal use)
const Burst_MAX = 20 // allow bursts up to 20 in 5 seconds

function cleanup(): void {
  const now = Date.now()
  for (const [ip, entry] of _windows) {
    if (entry.resetAt < now) _windows.delete(ip)
  }
}

// Run cleanup every 5 minutes
setInterval(cleanup, 5 * 60_000)

export function rateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  let entry = _windows.get(ip)

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    _windows.set(ip, entry)
  }

  entry.count++

  // Allow burst of Burst_MAX, then enforce MAX_REQUESTS
  const inBurstWindow =
    entry.count > Burst_MAX && entry.resetAt - now > WINDOW_MS - 5000

  if (entry.count > MAX_REQUESTS || inBurstWindow) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetAt: entry.resetAt,
  }
}

export function rateLimitHeaders(resetAt: number): Record<string, string> {
  const seconds = Math.ceil((resetAt - Date.now()) / 1000)
  return {
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
    'Retry-After': String(seconds),
  }
}
