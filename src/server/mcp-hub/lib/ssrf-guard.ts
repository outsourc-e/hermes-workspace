/**
 * SSRF guard helpers for the MCP Hub generic-json adapter.
 *
 * Resolves all A/AAAA records for a hostname before fetching and rejects
 * any URL that resolves to a private, loopback, or link-local address.
 *
 * Cross-process locking is not needed here — this is stateless.
 */
import { lookup } from 'node:dns/promises'

// ---------------------------------------------------------------------------
// Private / reserved range checkers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given IPv4 address string falls within a private,
 * loopback, link-local, or otherwise reserved range.
 */
function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true // malformed — treat as unsafe
  }
  const [a, b] = parts

  // 127.0.0.0/8 — loopback
  if (a === 127) return true
  // 10.0.0.0/8 — private
  if (a === 10) return true
  // 172.16.0.0/12 — private
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true
  // 169.254.0.0/16 — link-local
  if (a === 169 && b === 254) return true
  // 0.0.0.0
  if (a === 0) return true

  return false
}

/**
 * Returns true when the given IPv6 address string is a loopback, ULA, or
 * link-local address.
 *
 * Handles both full and compressed notation (Node's dns.lookup always returns
 * normalised strings, so we can rely on consistent formatting).
 */
function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase()

  // ::1 — loopback
  if (lower === '::1') return true

  // fe80::/10 — link-local (fe80 through febf)
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true

  // fc00::/7 — ULA (fc00 through fdff)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true

  return false
}

/**
 * Returns true when the IP address (v4 or v6) is private/loopback/link-local.
 */
export function isPrivateAddress(ip: string): boolean {
  // Determine address family by presence of ':'
  if (ip.includes(':')) return isPrivateIPv6(ip)
  return isPrivateIPv4(ip)
}

// ---------------------------------------------------------------------------
// Public assertion helper
// ---------------------------------------------------------------------------

/**
 * Resolves ALL A and AAAA records for the hostname in `url` and throws if
 * ANY of them resolve to a private/loopback/link-local address.
 *
 * Also throws if the URL uses a non-HTTPS scheme or contains an IP literal
 * that is private (avoids the DNS lookup for raw-IP URLs).
 *
 * @throws {Error} with a descriptive message when SSRF risk is detected.
 */
export async function assertNotPrivate(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`SSRF guard: invalid URL "${url}"`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`SSRF guard: only HTTPS URLs are allowed (got "${parsed.protocol}")`)
  }

  const hostname = parsed.hostname

  // If hostname is already an IP literal (IPv6 brackets stripped by URL)
  // check it directly without a DNS lookup.
  const isIpLiteral = /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(hostname) || hostname.includes(':')
  if (isIpLiteral) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`SSRF guard: IP address "${hostname}" is in a private/reserved range`)
    }
    return
  }

  // Resolve both A (IPv4) and AAAA (IPv6) records.
  const results = await Promise.allSettled([
    lookup(hostname, { all: true, family: 4 }),
    lookup(hostname, { all: true, family: 6 }),
  ])

  const addresses: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const entry of r.value) {
        addresses.push(entry.address)
      }
    }
  }

  if (addresses.length === 0) {
    throw new Error(`SSRF guard: could not resolve hostname "${hostname}"`)
  }

  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new Error(
        `SSRF guard: hostname "${hostname}" resolves to private address "${addr}"`,
      )
    }
  }
}
