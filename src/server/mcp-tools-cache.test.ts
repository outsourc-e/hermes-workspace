/**
 * US-504 — Disk persistence for tool-discovery cache.
 *
 * Tests:
 *  - write → read roundtrip (disk file matches in-memory)
 *  - corrupt file → empty cache, no throw
 *  - TTL stale flag
 *  - HERMES_HOME override for path resolution
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// We re-import the module fresh for each test using dynamic import + cache busting,
// but since Vitest caches modules, we use the exported reset helper instead.

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mcp-tools-cache-test-'))
  process.env.HERMES_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.MCP_TOOLS_CACHE_TTL_MS
  rmSync(tmpDir, { recursive: true, force: true })
  vi.resetModules()
})

async function loadCache() {
  // Fresh module import after resetModules() so HERMES_HOME is picked up
  return import('./mcp-tools-cache')
}

// ---------------------------------------------------------------------------
// Roundtrip: write → disk → re-import reads from disk
// ---------------------------------------------------------------------------

describe('write → read roundtrip', () => {
  it('persists probe to disk and re-read module loads it', async () => {
    const mod = await loadCache()

    mod.setProbe('my-server', {
      status: 'connected',
      toolCount: 3,
      toolNames: ['tool_a', 'tool_b', 'tool_c'],
      latencyMs: 42,
      error: null,
    })

    // Verify disk file was written
    const diskPath = mod.cacheFilePath()
    const raw = readFileSync(diskPath, 'utf8')
    const parsed = JSON.parse(raw) as { version: number; probes: Record<string, unknown> }
    expect(parsed.version).toBe(1)
    expect(parsed.probes['my-server']).toBeDefined()
    expect((parsed.probes['my-server'] as { toolCount: number }).toolCount).toBe(3)

    // Re-import module — should prime from disk
    vi.resetModules()
    const mod2 = await loadCache()
    const probe = mod2.getProbe('my-server')
    expect(probe).not.toBeNull()
    expect(probe?.toolCount).toBe(3)
    expect(probe?.status).toBe('connected')
  })
})

// ---------------------------------------------------------------------------
// Corrupt file → empty cache, no throw
// ---------------------------------------------------------------------------

describe('corrupt file → empty cache', () => {
  it('ignores corrupt JSON and starts with empty cache', async () => {
    // Write corrupt file before module load
    const cacheDir = join(tmpDir, 'cache')
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(join(cacheDir, 'mcp-tools.json'), '{ not valid json !!!', 'utf8')

    vi.resetModules()
    // Should not throw
    let mod: Awaited<ReturnType<typeof loadCache>>
    expect(() => {
      // loadCache() is async, but the module-level readDisk() runs synchronously
      // during import. We just need to confirm no unhandled error.
    }).not.toThrow()
    mod = await loadCache()

    // Cache should be empty (corrupt file ignored)
    expect(mod.getProbe('anything')).toBeNull()
  })

  it('ignores wrong schema (version != 1)', async () => {
    const cacheDir = join(tmpDir, 'cache')
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(
      join(cacheDir, 'mcp-tools.json'),
      JSON.stringify({ version: 99, probes: { 'my-server': { toolCount: 99 } } }),
      'utf8',
    )

    vi.resetModules()
    const mod = await loadCache()
    expect(mod.getProbe('my-server')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TTL stale flag
// ---------------------------------------------------------------------------

describe('TTL stale flag', () => {
  it('returns entry without stale flag when within TTL', async () => {
    const mod = await loadCache()
    mod.setProbe('fresh', {
      status: 'connected',
      toolCount: 1,
      toolNames: ['t'],
      latencyMs: 10,
      error: null,
    })

    const probe = mod.getProbe('fresh')
    expect(probe).not.toBeNull()
    expect(probe?.stale).toBeFalsy()
  })

  it('returns entry with stale=true when beyond TTL', async () => {
    // Set TTL to 1ms so everything expires immediately
    process.env.MCP_TOOLS_CACHE_TTL_MS = '1'
    vi.resetModules()
    const mod = await loadCache()

    mod.setProbe('stale-server', {
      status: 'connected',
      toolCount: 2,
      toolNames: ['a', 'b'],
      latencyMs: 5,
      error: null,
    })

    // Wait briefly to exceed TTL
    await new Promise((r) => setTimeout(r, 5))

    const probe = mod.getProbe('stale-server')
    expect(probe).not.toBeNull()
    expect(probe?.stale).toBe(true)
    // Data still present
    expect(probe?.toolCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// HERMES_HOME override
// ---------------------------------------------------------------------------

describe('HERMES_HOME override for path resolution', () => {
  it('uses HERMES_HOME to resolve cache file path', async () => {
    const customHome = mkdtempSync(join(tmpdir(), 'custom-hermes-'))
    process.env.HERMES_HOME = customHome
    vi.resetModules()

    const mod = await loadCache()
    expect(mod.cacheFilePath()).toBe(join(customHome, 'cache', 'mcp-tools.json'))

    mod.setProbe('server-x', {
      status: 'failed',
      toolCount: 0,
      toolNames: [],
      latencyMs: null,
      error: 'timeout',
    })

    // File should be at the custom path
    const diskPath = mod.cacheFilePath()
    expect(diskPath).toContain(customHome)
    const raw = readFileSync(diskPath, 'utf8')
    expect(JSON.parse(raw)).toMatchObject({ version: 1 })

    rmSync(customHome, { recursive: true, force: true })
  })
})
