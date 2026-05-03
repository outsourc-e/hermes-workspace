/**
 * mcp-get registry source adapter (Phase 3.0 MVP).
 *
 * Fetches https://registry.mcp.run/v1/manifests with conditional-GET support:
 *   - If-None-Match (ETag)
 *   - If-Modified-Since
 *
 * On 304: returns cached payload + bumps fetchedAt via touchCache.
 * On 200: parses JSON, persists new ETag/lastModified via setCache.
 * On 403: reads X-RateLimit-Remaining + X-RateLimit-Reset headers, returns
 *          cached payload + warning (no exception).
 * Network errors: returns cached payload + warning (no exception).
 */
import { getCache, setCache, touchCache } from '../cache'
import { normalizeTemplate } from '../trust'
import type { HubMcpEntry } from '../types'

const SOURCE_ID = 'mcp-get'
// Smithery is the actively-hosted public MCP registry. The original
// `registry.mcp.run` URL was speculative and never resolved (NXDOMAIN).
const REGISTRY_URL = 'https://registry.smithery.ai/servers'

export interface McpGetResult {
  entries: HubMcpEntry[]
  warnings?: string[]
  /**
   * True when the adapter encountered a non-fatal error (network, 403, etc.)
   * and is returning stale/empty data. Callers can use this to decide whether
   * to trigger a local-file fallback.
   */
  degraded?: boolean
}

// Shape of a single manifest entry from registry.mcp.run
interface RawManifestEntry {
  name?: unknown
  description?: unknown
  homepage?: unknown
  tags?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  url?: unknown
  transport?: unknown
  transportType?: unknown
  [key: string]: unknown
}

function parseManifestEntries(data: unknown): HubMcpEntry[] {
  // The registry may return { manifests: [...] } or a top-level array
  let items: unknown[]
  if (Array.isArray(data)) {
    items = data
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const candidate = d.manifests ?? d.servers ?? d.packages ?? d.items ?? d.results
    items = Array.isArray(candidate) ? candidate : []
  } else {
    return []
  }

  const entries: HubMcpEntry[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item as RawManifestEntry

    // Smithery entries use `qualifiedName` (e.g. "smithery-ai/github");
    // legacy/manual manifests may use `name`. Prefer qualified, fall back.
    const rawAny = raw as Record<string, unknown>
    const qualified =
      typeof rawAny.qualifiedName === 'string' ? rawAny.qualifiedName.trim() : ''
    const display =
      typeof rawAny.displayName === 'string' ? rawAny.displayName.trim() : ''
    const fallbackName = typeof raw.name === 'string' ? raw.name.trim() : ''
    const name = qualified || fallbackName || display
    if (!name) continue

    const description = typeof raw.description === 'string' ? raw.description.trim() : ''
    const homepage =
      typeof raw.homepage === 'string' && raw.homepage.startsWith('http')
        ? raw.homepage
        : null

    const tags: string[] = Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === 'string')
      : []

    // Smithery surfaces a `verified: boolean` flag; promote verified entries
    // to 'official', everything else stays 'community'.
    const verified = rawAny.verified === true
    const trust = verified ? ('official' as const) : ('community' as const)

    // Build a template object from raw manifest fields
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
      env: raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env) ? raw.env : undefined,
      url: typeof raw.url === 'string' ? raw.url : undefined,
    }

    const normalized = normalizeTemplate(rawTemplate, trust)
    if (!normalized.ok) {
      // Skip entries that fail trust normalization silently (per plan)
      continue
    }

    entries.push({
      id: `mcp-get:${name}`,
      name,
      description,
      source: 'mcp-get' as const,
      homepage,
      tags,
      trust,
      template: normalized.template,
      installed: false,
    })
  }

  return entries
}

export async function fetchMcpGet(signal?: AbortSignal): Promise<McpGetResult> {
  const cached = getCache(SOURCE_ID)
  const warnings: string[] = []

  // Build request headers with conditional-GET
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
    response = await fetch(REGISTRY_URL, { headers, signal })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`mcp-get: network error: ${msg}`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  // 304 Not Modified — return cached payload, bump fetchedAt
  if (response.status === 304) {
    touchCache(SOURCE_ID)
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
      `mcp-get: rate limited (403); remaining=${remaining ?? '?'}, reset=${resetAt ?? '?'}`,
    )

    // Update cache metadata with rate-limit info but keep existing payload
    if (cached) {
      setCache(SOURCE_ID, {
        ...cached,
        ...(remainingNum !== undefined ? { rateLimitRemaining: remainingNum } : {}),
        ...(resetAtNum !== undefined ? { rateLimitResetAt: resetAtNum } : {}),
      })
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  // Non-200/304/403 errors
  if (!response.ok) {
    warnings.push(`mcp-get: unexpected status ${response.status}`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  // 200 OK — parse and persist
  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`mcp-get: failed to parse JSON: ${msg}`)
    if (cached) {
      return { entries: cached.payload as HubMcpEntry[], warnings, degraded: true }
    }
    return { entries: [], warnings, degraded: true }
  }

  const entries = parseManifestEntries(data)

  const newEtag = response.headers.get('ETag') ?? undefined
  const newLastModified = response.headers.get('Last-Modified') ?? undefined

  setCache(SOURCE_ID, {
    payload: entries,
    ...(newEtag ? { etag: newEtag } : {}),
    ...(newLastModified ? { lastModified: newLastModified } : {}),
  })

  return { entries, ...(warnings.length > 0 ? { warnings } : {}) }
}
