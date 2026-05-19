/**
 * In-memory + disk-backed cache of last-known MCP probe results, keyed by server name.
 *
 * Populated by /api/mcp/test (which shells out to `hermes mcp test <name>`
 * in fallback mode) and read by /api/mcp GET to hydrate per-server tool
 * counts so cards display non-zero counts without forcing a fresh probe.
 *
 * US-504: persist to ~/.hermes/cache/mcp-tools.json on each setProbe via
 * atomic tmp+linkSync (mirroring mcp-presets-store bootstrapSeed pattern).
 * On module load, prime in-memory cache from disk if file is valid JSON.
 * TTL: 24h default, override via MCP_TOOLS_CACHE_TTL_MS env.
 * HERMES_HOME env override for path resolution.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { getStateDir } from './workspace-state-dir'

export interface CachedProbe {
  status: 'connected' | 'failed' | 'unknown'
  toolCount: number
  toolNames: Array<string>
  latencyMs: number | null
  error: string | null
  testedAt: number
  /** True when the entry is older than the configured TTL. */
  stale?: boolean
}

interface DiskSchema {
  version: 1
  probes: Record<string, CachedProbe>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 24-hour default TTL in milliseconds. */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function getTtlMs(): number {
  const override = process.env.MCP_TOOLS_CACHE_TTL_MS?.trim()
  if (override) {
    const n = Number(override)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_TTL_MS
}

export function cacheFilePath(): string {
  return join(getStateDir(), 'cache', 'mcp-tools.json')
}

// ---------------------------------------------------------------------------
// Disk I/O helpers
// ---------------------------------------------------------------------------

function readDisk(): Record<string, CachedProbe> {
  const path = cacheFilePath()
  if (!existsSync(path)) return {}
  try {
    const text = readFileSync(path, 'utf8')
    const parsed = JSON.parse(text) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (parsed as DiskSchema).version !== 1 ||
      typeof (parsed as DiskSchema).probes !== 'object'
    ) {
      return {}
    }
    return (parsed as DiskSchema).probes as Record<string, CachedProbe>
  } catch {
    // Corrupt or unreadable — start fresh
    return {}
  }
}

function writeDisk(probes: Record<string, CachedProbe>): void {
  const path = cacheFilePath()
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })

  const payload: DiskSchema = { version: 1, probes }
  const bytes = JSON.stringify(payload)

  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, bytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }

  // Atomic link: replace target by unlink+link (POSIX rename would be ideal,
  // but linkSync + unlinkSync mirrors the presets-store pattern used here).
  try {
    // Remove existing file if present so linkSync doesn't fail with EEXIST.
    try { unlinkSync(path) } catch { /* not present */ }
    linkSync(tmp, path)
  } finally {
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// In-memory cache — primed from disk at module load
// ---------------------------------------------------------------------------

const cache = new Map<string, CachedProbe>(Object.entries(readDisk()))

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setProbe(name: string, entry: Omit<CachedProbe, 'testedAt' | 'stale'>): void {
  const probe: CachedProbe = { ...entry, testedAt: Date.now() }
  cache.set(name, probe)

  // Persist entire cache to disk atomically.
  const probes: Record<string, CachedProbe> = {}
  for (const [k, v] of cache.entries()) {
    probes[k] = v
  }
  try {
    writeDisk(probes)
  } catch {
    // Non-fatal: in-memory cache still works if disk write fails
  }
}

export function getProbe(name: string): CachedProbe | null {
  const entry = cache.get(name)
  if (!entry) return null
  const ttl = getTtlMs()
  if (Date.now() - entry.testedAt > ttl) {
    return { ...entry, stale: true }
  }
  return entry
}

export function clearProbe(name: string): void {
  cache.delete(name)
}

export function listProbes(): Map<string, CachedProbe> {
  return new Map(cache)
}

/**
 * Test-only helper: reset the in-memory cache without touching disk.
 */
export function __resetCacheForTests(): void {
  cache.clear()
}
