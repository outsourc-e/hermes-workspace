/**
 * MCP Hub unified search — Phase 3.0 MVP + Phase 3.2 user sources.
 *
 * Aggregates results from enabled sources in parallel (Promise.allSettled),
 * deduplicates by `${source}:${name}`, marks installed entries by comparing
 * against config.yaml mcp_servers names, and falls back to local-file only
 * when all remote sources fail.
 *
 * Phase 3.2: at runtime, loads user-defined sources from readHubSources()
 * and routes them through the generic-json adapter.
 */
import { readHubSources } from '../mcp-hub-sources-store'
import { fetchLocalFile } from './sources/local-file'
import { fetchMcpGet } from './sources/mcp-get'
import { fetchGenericJson } from './sources/generic-json'
import type { HubMcpEntry, HubSource, HubTrust } from './types'

export type { HubMcpEntry }

export type SearchSource = 'all' | HubSource

export interface UnifiedSearchResult {
  results: Array<HubMcpEntry>
  source: string
  total: number
  warnings?: Array<string>
}

const PER_SOURCE_TIMEOUT_MS = 8_000

// -----------------------------------------------------------------------
// Installed-name lookup
// -----------------------------------------------------------------------

/** Read installed mcp server names from config via server-side getConfig. */
async function getInstalledNames(): Promise<Set<string>> {
  try {
    // Lazy import to avoid circular deps and keep server-only
    const { getConfig } = await import('../claude-dashboard-api')
    const config = await getConfig()

    // Config may be wrapped in { config: {...} } shape
    const root =
      config && typeof config === 'object' && 'config' in config
        ? config.config
        : config

    const mcp =
      root && typeof root === 'object'
        ? (root as Record<string, unknown>).mcp_servers
        : undefined

    if (!mcp || typeof mcp !== 'object' || Array.isArray(mcp)) {
      return new Set()
    }

    return new Set(Object.keys(mcp as Record<string, unknown>))
  } catch {
    return new Set()
  }
}

// -----------------------------------------------------------------------
// Source fetchers with per-source timeout
// -----------------------------------------------------------------------

interface SourceResult {
  entries: Array<HubMcpEntry>
  warnings?: Array<string>
  /** Mirrors McpGetResult.degraded — true when the source had a soft failure */
  degraded?: boolean
  sourceLabel: string
}

async function fetchWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs)
  return fn(signal)
}

async function fetchSource(source: HubSource): Promise<SourceResult> {
  if (source === 'local') {
    const res = await fetchLocalFile()
    return {
      entries: res.entries,
      warnings: res.warnings,
      sourceLabel: 'local',
    }
  }
  if (source === 'mcp-get') {
    const res = await fetchWithTimeout(
      (signal) => fetchMcpGet(signal),
      PER_SOURCE_TIMEOUT_MS,
    )
    return {
      entries: res.entries,
      warnings: res.warnings,
      degraded: res.degraded,
      sourceLabel: 'mcp-get',
    }
  }
  return { entries: [], sourceLabel: source }
}

// -----------------------------------------------------------------------
// User source fetchers (Phase 3.2)
// -----------------------------------------------------------------------

interface UserSourceSpec {
  id: string
  url: string
  trust: HubTrust
}

async function fetchUserSource(spec: UserSourceSpec): Promise<SourceResult> {
  const res = await fetchWithTimeout(
    (signal) => fetchGenericJson(spec.id, spec.url, spec.trust, signal),
    PER_SOURCE_TIMEOUT_MS,
  )
  return {
    entries: res.entries,
    warnings: res.warnings,
    degraded: res.degraded,
    sourceLabel: spec.id,
  }
}

// -----------------------------------------------------------------------
// Query matching
// -----------------------------------------------------------------------

function matchesQuery(entry: HubMcpEntry, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    entry.tags.some((t) => t.toLowerCase().includes(q))
  )
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

/**
 * Search across enabled MCP Hub sources, deduplicate, mark installed.
 *
 * @param query      Free-text filter (empty = return all)
 * @param sources    Which sources to query ('all' | 'mcp-get' | 'local')
 * @param limit      Max results returned (default 20)
 */
export async function unifiedSearch(
  query: string,
  sources: SearchSource = 'all',
  limit = 20,
  offset = 0,
): Promise<UnifiedSearchResult> {
  // Load user-defined sources at runtime (Phase 3.2)
  let userSources: Array<UserSourceSpec> = []
  try {
    const hubSources = await readHubSources()
    userSources = hubSources.sources
      .filter((s) => !s.builtin && s.enabled && s.format === 'generic-json')
      .map((s) => ({ id: s.id, url: s.url, trust: s.trust as HubTrust }))
  } catch {
    // Non-fatal — user sources unavailable, continue with built-ins
  }

  const builtinSourcesToQuery: Array<HubSource> =
    sources === 'all' ? ['mcp-get', 'local'] : [sources]

  // Fetch all sources in parallel; tolerate individual failures
  const builtinPromises = builtinSourcesToQuery.map((s) => fetchSource(s))
  const userPromises =
    sources === 'all' ? userSources.map((s) => fetchUserSource(s)) : []

  const allPromises = [...builtinPromises, ...userPromises]
  const allSourceLabels = [
    ...builtinSourcesToQuery,
    ...userSources.map((s) => s.id),
  ]

  const settledResults = await Promise.allSettled(allPromises)

  const warnings: Array<string> = []
  const allEntries: Array<HubMcpEntry> = []
  let anyRemoteSucceeded = false

  for (let i = 0; i < settledResults.length; i++) {
    const settled = settledResults[i]
    const sourceId = allSourceLabels[i]

    if (settled.status === 'rejected') {
      const reason =
        settled.reason instanceof Error
          ? settled.reason.message
          : String(settled.reason)
      warnings.push(`${sourceId}: failed — ${reason}`)
      continue
    }

    const res = settled.value
    if (res.warnings) warnings.push(...res.warnings)
    allEntries.push(...res.entries)

    // A source that returned degraded=true is treated as a soft failure:
    // it resolved (not rejected) but had a network/403/etc. error. We only
    // count it as "succeeded" for fallback purposes when it is NOT degraded.
    if (sourceId !== 'local' && !res.degraded) {
      anyRemoteSucceeded = true
    }
  }

  // Fallback: if all remote sources failed, ensure local-file is included
  const localWasRequested = builtinSourcesToQuery.includes('local')
  if (!anyRemoteSucceeded && !localWasRequested) {
    try {
      const localRes = await fetchLocalFile()
      if (localRes.warnings) warnings.push(...localRes.warnings)
      allEntries.push(...localRes.entries)
      warnings.push('all remote sources failed — local-file fallback used')
    } catch (err) {
      warnings.push(
        `local-file fallback also failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Deduplicate by `${source}:${id}:${name}` so user sources with the same
  // server name as a built-in source are NOT collapsed, and two different
  // user sources with the same server name are also kept distinct.
  // (LOW fix: include entry.id in dedupe key to prevent collision)
  const seen = new Set<string>()
  const deduped: Array<HubMcpEntry> = []
  for (const entry of allEntries) {
    const key = `${entry.source}:${entry.id}:${entry.name}`
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(entry)
    }
  }

  // Mark installed
  const installedNames = await getInstalledNames()
  const withInstalled = deduped.map((entry) => ({
    ...entry,
    installed: installedNames.has(entry.name),
  }))

  // Filter by query
  const filtered = withInstalled.filter((e) => matchesQuery(e, query))

  // Build source label for response
  const activeSourceLabels = settledResults
    .map((r, i) => (r.status === 'fulfilled' ? allSourceLabels[i] : null))
    .filter(Boolean)
    .join(',')

  const limited = filtered.slice(offset, offset + limit)

  return {
    results: limited,
    source: activeSourceLabels || 'local',
    total: filtered.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}
