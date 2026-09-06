import { promises as fs } from 'node:fs'
import { join } from 'node:path'

interface CachedEntry<T> {
  data: T
  fetchedAt: number
  ttlMs: number
}

interface CacheReadResult<T> extends CachedEntry<T> {
  isStale: boolean
}

export class HUDCache {
  constructor(
    private dir: string = process.env.HUD_CACHE_DIR ||
      '/root/.hermes/hud-cache',
  ) {}

  private file(key: string): string {
    return join(this.dir, `${key}.json`)
  }

  async get<T>(key: string): Promise<CacheReadResult<T> | null> {
    try {
      const raw = await fs.readFile(this.file(key), 'utf8')
      if (!raw.trim()) {
        // Empty file (zero-bytes is a common crash mode for cache files when a
        // writer is interrupted mid-flush). Treat as a cache miss rather than
        // surfacing a 500 from JSON.parse('').
        return null
      }
      const entry = JSON.parse(raw) as CachedEntry<T>
      const age = Date.now() - entry.fetchedAt
      return { ...entry, isStale: age > entry.ttlMs }
    } catch (e: any) {
      if (e.code === 'ENOENT') return null
      // Corrupted cache entry — treat as miss so the aggregator re-fetches.
      if (e instanceof SyntaxError) return null
      throw e
    }
  }

  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const entry: CachedEntry<T> = { data, fetchedAt: Date.now(), ttlMs }
    await fs.writeFile(this.file(key), JSON.stringify(entry), 'utf8')
  }
}
