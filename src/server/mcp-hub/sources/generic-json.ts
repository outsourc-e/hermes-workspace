/**
 * generic-json source adapter — Phase 3.2.
 *
 * Fetches any user-supplied HTTPS URL that returns a JSON MCP catalog.
 * Handles common shapes:
 *   { servers: [] }  |  []  |  { manifests: [] }  |  { packages: [] }  |  { items: [] }
 *
 * Same conditional-GET (ETag / If-Modified-Since), same trust normalization
 * via trust.ts, same per-source cache pattern as mcp-get.ts.
 *
 * Security hardening (Phase 3.2 Codex fixes):
 *   - SSRF guard: all A/AAAA records validated before fetch
 *   - Response size cap: 5 MB limit via streaming read
 *   - Cache key includes URL to auto-invalidate on URL change
 *   - Entry trust hard-capped at 'community' for user sources
 */
import { getCache, setCache, touchCache } from '../cache'
import { normalizeTemplate } from '../trust'
import { assertNotPrivate } from '../lib/ssrf-guard'
import type { HubMcpEntry, HubTrust } from '../types'

export interface GenericJsonResult {
  entries: HubMcpEntry[]
  warnings?: string[]
  /** True when adapter had a soft failure and may be returning stale/empty data. */
  degraded?: boolean
}

interface RawItem {
  name?: unknown
  displayName?: unknown
  qualifiedName?: unknown
  description?: unknown
  homepage?: unknown
  tags?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  url?: unknown
  transport?: unknown
  transportType?: unknown
  trust?: unknown
  verified?: unknown
  [key: string]: unknown
}

/** Maximum allowed response body size (5 MB). */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const candidate =
      d.servers ?? d.manifests ?? d.packages ?? d.items ?? d.results ?? d.entries
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function parseItems(items: unknown[], sourceId: string, defaultTrust: HubTrust): HubMcpEntry[] {
  const entries: HubMcpEntry[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as RawItem

    // Prefer qualifiedName → name → displayName
    const qualified = typeof raw.qualifiedName === 'string' ? raw.qualifiedName.trim() : ''
    const display = typeof raw.displayName === 'string' ? raw.displayName.trim() : ''
    const fallback = typeof raw.name === 'string' ? raw.name.trim() : ''
    const name = qualified || fallback || display
    if (!name) continue

    const description =
      typeof raw.description === 'string' ? raw.description.trim() : ''

    const homepage =
      typeof raw.homepage === 'string' && raw.homepage.startsWith('http')
        ? raw.homepage
        : null

    const tags: string[] = Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === 'string')
      : []

    // MEDIUM-3: Hard-cap entry trust at 'community' for user sources.
    // User sources may claim 'official' in their payload, but we never
    // emit official trust from user-fetched data to prevent trust laundering.
    // The source.trust field still controls UI badges on the source itself.
    let trust: HubTrust = defaultTrust
    if (raw.verified === true) {
      trust = 'official'
    } else if (
      typeof raw.trust === 'string' &&
      (raw.trust === 'official' || raw.trust === 'community' || raw.trust === 'unverified')
    ) {
      trust = raw.trust
    }
    // Cap: user sources may not emit 'official' entries
    if (trust === 'official') trust = 'community'

    const transport =
      typeof raw.transportType === 'string'
        ? raw.transportType
        : typeof raw.transport === 'string'
          ? raw.transport
          : typeof raw.url === 'string'
            ? 'http'
            : 'stdio'

    const rawTemplate = {
      name,
      transportType: transport,
      command: typeof raw.command === 'string' ? raw.command : undefined,
      args: Array.isArray(raw.args) ? raw.args : undefined,
      env:
        raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env)
          ? raw.env
          : undefined,
      url: typeof raw.url === 'string' ? raw.url : undefined,
    }

    const normalized = normalizeTemplate(rawTemplate, trust)
    if (!normalized.ok) continue

    entries.push({
      id: `${sourceId}:${name}`,
      name,
      description,
      source: `user:${sourceId}` as HubMcpEntry['source'],
      homepage,
      tags,
      trust,
      template: normalized.template,
      installed: false,
    })
  }

  return entries
}

/**
 * Read the response body with a byte limit of MAX_RESPONSE_BYTES (5 MB).
 * Returns { text, truncated } — if truncated is true the body was cut short.
 */
async function readBodyWithLimit(response: Response): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text()
    return { text, truncated: false }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let truncated = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > MAX_RESPONSE_BYTES) {
          truncated = true
          reader.cancel().catch(() => undefined)
          break
        }
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock()
  }

  const combined = new Uint8Array(totalBytes <= MAX_RESPONSE_BYTES ? totalBytes : MAX_RESPONSE_BYTES)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  const text = new TextDecoder().decode(combined)
  return { text, truncated }
}

/**
 * Fetch a user-configured generic-JSON source.
 *
 * @param sourceId   The user's source id (used as cache key prefix and entry id prefix)
 * @param url        The HTTPS URL to fetch
 * @param trust      Default trust level for entries from this source
 * @param signal     Optional AbortSignal for timeout
 */
export async function fetchGenericJson(
  sourceId: string,
  url: string,
  trust: HubTrust,
  signal?: AbortSignal,
): Promise<GenericJsonResult> {
  // MEDIUM-2: Cache key includes URL so a URL change auto-invalidates.
  const cacheKey = `${sourceId}:${url}`
  const cached = getCache(cacheKey)
  const warnings: string[] = []

  // HIGH-1: SSRF guard — validate hostname resolves to a public address.
  try {
    await assertNotPrivate(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`${sourceId}: ${msg}`)
    return { entries: [], warnings, degraded: true }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'hermes-workspace/1.0 mcp-hub',
  }
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag
  } else if (cached?.lastModified) {
    headers['If-Modified-Since'] = cached.lastModified
  }

  let response: Response
  try {
    // HIGH-1: disable redirects to prevent redirect-based SSRF bypass.
    response = await fetch(url, { headers, signal, redirect: 'error' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`${sourceId}: network error: ${msg}`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  // 304 Not Modified
  if (response.status === 304) {
    touchCache(cacheKey)
    const payload = cached ? (cached.payload as HubMcpEntry[]) : []
    return { entries: payload, ...(warnings.length > 0 ? { warnings } : {}) }
  }

  // 403 rate-limited
  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining')
    const resetAt = response.headers.get('X-RateLimit-Reset')
    const remainingNum = remaining !== null ? parseInt(remaining, 10) : undefined
    const resetAtNum = resetAt !== null ? parseInt(resetAt, 10) : undefined

    warnings.push(
      `${sourceId}: rate limited (403); remaining=${remaining ?? '?'}, reset=${resetAt ?? '?'}`,
    )

    if (cached) {
      setCache(cacheKey, {
        ...cached,
        ...(remainingNum !== undefined ? { rateLimitRemaining: remainingNum } : {}),
        ...(resetAtNum !== undefined ? { rateLimitResetAt: resetAtNum } : {}),
      })
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  if (!response.ok) {
    warnings.push(`${sourceId}: unexpected status ${response.status}`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  // HIGH-2: Stream body with 5 MB limit.
  const { text: bodyText, truncated } = await readBodyWithLimit(response)
  if (truncated) {
    warnings.push(`${sourceId}: Response too large (>5MB)`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  // 200 OK — parse
  let data: unknown
  try {
    data = JSON.parse(bodyText)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`${sourceId}: failed to parse JSON: ${msg}`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  const items = extractItems(data)
  const entries = parseItems(items, sourceId, trust)

  const newEtag = response.headers.get('ETag') ?? undefined
  const newLastModified = response.headers.get('Last-Modified') ?? undefined

  setCache(cacheKey, {
    payload: entries,
    ...(newEtag ? { etag: newEtag } : {}),
    ...(newLastModified ? { lastModified: newLastModified } : {}),
  })

  return { entries, ...(warnings.length > 0 ? { warnings } : {}) }
}

/**
 * Invalidate the cache entry for a user source.
 * Called by PUT handler when the URL of a source changes.
 *
 * @param sourceId  The user-source id
 * @param url       The current (old) URL — needed because cache key is `${sourceId}:${url}`
 */
export function invalidateUserSourceCache(sourceId: string, url: string): void {
  // setCache with an expired entry is not straightforward; instead we use the
  // cache module's internal store by writing a minimal expired entry.
  // The simplest approach: call setCache with an empty payload so the next
  // fetch will bypass any disk-cached version. Since setCache always updates
  // both memory and disk, this effectively evicts the old entry.
  const cacheKey = `${sourceId}:${url}`
  setCache(cacheKey, { payload: [] })
}
