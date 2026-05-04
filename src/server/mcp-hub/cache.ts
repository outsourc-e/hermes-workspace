/**
 * Two-tier cache for MCP Hub source responses.
 *
 * Tier 1 — in-memory: 30 min TTL (env MCP_HUB_CACHE_TTL_MS overrides).
 * Tier 2 — disk: ~/.hermes/cache/mcp-hub/<source>.json, 24 h TTL.
 *
 * Disk writes are atomic via tmp+rename, mirroring the Phase 2 preset-store
 * pattern.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface CachePayload {
  etag?: string
  lastModified?: string
  fetchedAt: number
  /** In-memory expiry (30 min TTL). Disk entries use expiresAtDisk. */
  expiresAt: number
  /**
   * Disk expiry (24 h TTL). Present on entries read from disk so callers
   * can distinguish mem-TTL from disk-TTL without re-reading the file.
   */
  expiresAtDisk?: number
  payload: unknown
  rateLimitRemaining?: number
  rateLimitResetAt?: number
}

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

const MEM_TTL_MS = (() => {
  const v = parseInt(process.env.MCP_HUB_CACHE_TTL_MS ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : 30 * 60 * 1_000 // 30 min
})()

const DISK_TTL_MS = 24 * 60 * 60 * 1_000 // 24 h

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function hermesHome(): string {
  return process.env.HERMES_HOME?.trim() || process.env.CLAUDE_HOME?.trim() || join(homedir(), '.hermes')
}

function cacheDir(): string {
  return join(hermesHome(), 'cache', 'mcp-hub')
}

function cacheFilePath(source: string): string {
  // Sanitize source to a safe filename segment
  const safe = source.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(cacheDir(), `${safe}.json`)
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, content)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmp, path)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
}

// ------------------------------------------------------------------
// In-memory store
// ------------------------------------------------------------------

const _memStore = new Map<string, CachePayload>()

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Read a cached entry. Returns null when missing or expired at all tiers.
 * Disk entries are promoted back to memory when found there.
 */
export function getCache(source: string): CachePayload | null {
  const now = Date.now()

  // 1. Memory tier
  const mem = _memStore.get(source)
  if (mem) {
    if (mem.expiresAt > now) return mem
    _memStore.delete(source)
  }

  // 2. Disk tier
  const path = cacheFilePath(source)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    const entry = JSON.parse(raw) as CachePayload
    if (!entry.expiresAt || entry.expiresAt <= now) {
      // Expired on disk — leave it; next setCache will overwrite
      return null
    }
    // Promote to memory with a fresh mem-TTL so we don't thrash disk.
    // Preserve the original disk expiresAt in expiresAtDisk so touchCache
    // can write a correct 24h disk TTL without collapsing it to mem-TTL.
    const diskExpiresAt = entry.expiresAtDisk ?? entry.expiresAt
    const promoted: CachePayload = {
      ...entry,
      expiresAt: Math.min(diskExpiresAt, now + MEM_TTL_MS),
      expiresAtDisk: diskExpiresAt,
    }
    _memStore.set(source, promoted)
    return promoted
  } catch {
    return null
  }
}

/**
 * Persist a cache entry to both memory and disk.
 */
export function setCache(source: string, data: Omit<CachePayload, 'fetchedAt' | 'expiresAt'> & Partial<Pick<CachePayload, 'fetchedAt' | 'expiresAt'>>): void {
  const now = Date.now()
  const entry: CachePayload = {
    fetchedAt: now,
    expiresAt: now + MEM_TTL_MS,
    ...data,
  }

  // Memory
  _memStore.set(source, entry)

  // Disk (24h TTL) — store expiresAtDisk so promotions can preserve it
  const diskExpiresAt = now + DISK_TTL_MS
  const diskEntry: CachePayload = {
    ...entry,
    expiresAt: diskExpiresAt,
    expiresAtDisk: diskExpiresAt,
  }
  try {
    atomicWrite(cacheFilePath(source), JSON.stringify(diskEntry, null, 2))
  } catch {
    // Disk write failure is non-fatal — memory cache still works
  }
}

/**
 * Bump fetchedAt on a cached entry without changing payload or TTL.
 * Used when a 304 Not Modified is returned by the remote.
 *
 * Memory and disk TTLs are tracked independently:
 *   - Memory entry gets a fresh 30-min window from now.
 *   - Disk entry gets a fresh 24-h window from now.
 *
 * This prevents a promoted-from-disk entry (which already has a short
 * in-memory expiresAt) from collapsing the disk TTL down to 30 min.
 */
export function touchCache(source: string): void {
  // Read the disk entry directly so we don't lose the original 24-h TTL.
  // getCache() may return a memory-promoted copy with a shortened expiresAt.
  const now = Date.now()

  // Re-read the entry payload/etag from memory or disk
  const entry = getCache(source)
  if (!entry) return

  // Update memory entry with fresh mem-TTL
  const memEntry: CachePayload = {
    ...entry,
    fetchedAt: now,
    expiresAt: now + MEM_TTL_MS,
  }
  _memStore.set(source, memEntry)

  // Write disk entry with fresh disk-TTL (independent of mem-TTL)
  const freshDiskExpiresAt = now + DISK_TTL_MS
  const diskEntry: CachePayload = {
    ...entry,
    fetchedAt: now,
    expiresAt: freshDiskExpiresAt,
    expiresAtDisk: freshDiskExpiresAt,
  }
  try {
    atomicWrite(cacheFilePath(source), JSON.stringify(diskEntry, null, 2))
  } catch {
    // non-fatal
  }
}

/** Test helper — clear all in-memory cache entries. */
export function __resetHubCacheForTests(): void {
  _memStore.clear()
}
