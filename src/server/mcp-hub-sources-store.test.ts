/**
 * Tests for mcp-hub-sources-store — Phase 3.2.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __resetHubSourcesCacheForTests,
  readHubSources,
  addHubSource,
  updateHubSource,
  deleteHubSource,
  validateSourceEntry,
  BUILTIN_IDS,
  BUILTIN_SOURCES,
  hubSourcesFilePath,
} from './mcp-hub-sources-store'

let homeDir: string
let originalHermesHome: string | undefined

function writeSourcesFile(payload: unknown): void {
  const path = join(homeDir, 'mcp-hub-sources.json')
  writeFileSync(path, typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2))
}

const VALID_USER_SOURCE = {
  version: 1,
  sources: [
    {
      id: 'internal',
      name: 'Internal Catalog',
      url: 'https://corp.local/mcp.json',
      trust: 'community',
      format: 'generic-json',
      enabled: true,
    },
  ],
}

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'hermes-hub-sources-'))
  originalHermesHome = process.env.HERMES_HOME
  process.env.HERMES_HOME = homeDir
  __resetHubSourcesCacheForTests()
})

afterEach(() => {
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  rmSync(homeDir, { recursive: true, force: true })
  __resetHubSourcesCacheForTests()
})

describe('readHubSources', () => {
  it('bootstraps empty user file and returns built-in sources', async () => {
    const result = await readHubSources()
    expect(result.source).toBe('seed')
    expect(result.sources).toHaveLength(BUILTIN_SOURCES.length)
    expect(result.sources.map((s) => s.id)).toContain('mcp-get')
    expect(result.sources.map((s) => s.id)).toContain('local-file')
  })

  it('creates the file on disk when bootstrapping', async () => {
    await readHubSources()
    const path = hubSourcesFilePath()
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    expect(raw.version).toBe(1)
    expect(raw.sources).toEqual([])
  })

  it('reads valid user file and merges with built-ins', async () => {
    writeSourcesFile(VALID_USER_SOURCE)
    const result = await readHubSources()
    expect(result.source).toBe('user-file')
    expect(result.sources.some((s) => s.id === 'internal')).toBe(true)
    expect(result.sources.some((s) => s.id === 'mcp-get')).toBe(true)
  })

  it('returns source=invalid for malformed JSON, preserves file', async () => {
    writeSourcesFile('not-json{{{{')
    const before = readFileSync(join(homeDir, 'mcp-hub-sources.json'), 'utf8')
    const result = await readHubSources()
    expect(result.source).toBe('invalid')
    expect(result.error).toBeTruthy()
    // File is preserved
    const after = readFileSync(join(homeDir, 'mcp-hub-sources.json'), 'utf8')
    expect(after).toBe(before)
  })

  it('returns source=invalid for wrong version', async () => {
    writeSourcesFile({ version: 2, sources: [] })
    const result = await readHubSources()
    expect(result.source).toBe('invalid')
    expect(result.validationErrors?.some((e) => e.path === 'version')).toBe(true)
  })

  it('returns source=invalid for bad id format', async () => {
    writeSourcesFile({
      version: 1,
      sources: [{ id: 'BAD_ID', name: 'x', url: 'https://x.com', trust: 'community', format: 'generic-json', enabled: true }],
    })
    const result = await readHubSources()
    expect(result.source).toBe('invalid')
    expect(result.validationErrors?.some((e) => e.path.includes('id'))).toBe(true)
  })

  it('returns source=invalid for http:// url', async () => {
    writeSourcesFile({
      version: 1,
      sources: [{ id: 'insecure', name: 'x', url: 'http://insecure.example.com', trust: 'community', format: 'generic-json', enabled: true }],
    })
    const result = await readHubSources()
    expect(result.source).toBe('invalid')
    expect(result.validationErrors?.some((e) => e.message.includes('https'))).toBe(true)
  })

  it('rejects duplicate ids', async () => {
    writeSourcesFile({
      version: 1,
      sources: [
        { id: 'alpha', name: 'A', url: 'https://a.example.com', trust: 'community', format: 'generic-json', enabled: true },
        { id: 'alpha', name: 'B', url: 'https://b.example.com', trust: 'community', format: 'generic-json', enabled: true },
      ],
    })
    const result = await readHubSources()
    expect(result.source).toBe('invalid')
    expect(result.validationErrors?.some((e) => e.message.includes('duplicate'))).toBe(true)
  })

  it('rejects reserved built-in ids', async () => {
    writeSourcesFile({
      version: 1,
      sources: [{ id: 'mcp-get', name: 'Hijack', url: 'https://evil.example.com', trust: 'community', format: 'generic-json', enabled: true }],
    })
    const result = await readHubSources()
    expect(result.source).toBe('invalid')
    expect(result.validationErrors?.some((e) => e.message.includes('reserved'))).toBe(true)
  })

  it('uses mtime+size cache', async () => {
    writeSourcesFile(VALID_USER_SOURCE)
    const r1 = await readHubSources()
    const r2 = await readHubSources()
    expect(r1).toBe(r2) // same object reference = cache hit
  })

  it('invalidates cache after file changes', async () => {
    writeSourcesFile(VALID_USER_SOURCE)
    const r1 = await readHubSources()
    expect(r1.source).toBe('user-file')

    // Write different content
    writeSourcesFile({ version: 1, sources: [] })
    __resetHubSourcesCacheForTests()
    const r2 = await readHubSources()
    expect(r2.source).toBe('user-file')
    expect(r2.sources.filter((s) => !s.builtin)).toHaveLength(0)
  })

  it('built-in sources always present even when user file has custom entries', async () => {
    writeSourcesFile(VALID_USER_SOURCE)
    const result = await readHubSources()
    for (const builtinId of BUILTIN_IDS) {
      expect(result.sources.some((s) => s.id === builtinId)).toBe(true)
    }
  })
})

describe('validateSourceEntry', () => {
  it('accepts valid entry', () => {
    const r = validateSourceEntry({ id: 'my-source', name: 'My Source', url: 'https://example.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(r.ok).toBe(true)
  })

  it('rejects non-https url', () => {
    const r = validateSourceEntry({ id: 'bad', name: 'X', url: 'http://insecure.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.path === 'url')).toBe(true)
  })

  it('rejects bad id format', () => {
    const r = validateSourceEntry({ id: '0bad', name: 'X', url: 'https://ok.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(r.ok).toBe(false)
  })

  it('rejects builtin ids', () => {
    const r = validateSourceEntry({ id: 'local-file', name: 'X', url: 'https://ok.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.message.includes('reserved'))).toBe(true)
  })

  it('rejects invalid trust value', () => {
    const r = validateSourceEntry({ id: 'ok', name: 'X', url: 'https://ok.com', trust: 'trusted', format: 'generic-json', enabled: true })
    expect(r.ok).toBe(false)
  })

  it('rejects invalid format value', () => {
    const r = validateSourceEntry({ id: 'ok', name: 'X', url: 'https://ok.com', trust: 'community', format: 'csv', enabled: true })
    expect(r.ok).toBe(false)
  })
})

describe('addHubSource', () => {
  it('appends a valid source', async () => {
    const result = await addHubSource({
      id: 'my-corp',
      name: 'Corp Catalog',
      url: 'https://catalog.corp.com/mcp.json',
      trust: 'official',
      format: 'generic-json',
      enabled: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.sources.some((s) => s.id === 'my-corp')).toBe(true)
    }
  })

  it('rejects duplicate id', async () => {
    const input = { id: 'dup', name: 'Dup', url: 'https://dup.example.com', trust: 'community' as const, format: 'generic-json' as const, enabled: true }
    await addHubSource(input)
    const r2 = await addHubSource(input)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.errors.some((e) => e.message.includes('duplicate'))).toBe(true)
  })

  it('rejects built-in id', async () => {
    const result = await addHubSource({ id: 'mcp-get', name: 'X', url: 'https://x.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(result.ok).toBe(false)
  })

  it('rejects http:// url', async () => {
    const result = await addHubSource({ id: 'insecure', name: 'X', url: 'http://x.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(result.ok).toBe(false)
  })
})

describe('updateHubSource', () => {
  it('updates an existing user source', async () => {
    await addHubSource({ id: 'to-update', name: 'Old', url: 'https://old.example.com', trust: 'community', format: 'generic-json', enabled: true })
    const result = await updateHubSource('to-update', { name: 'New', url: 'https://new.example.com', trust: 'official', format: 'generic-json', enabled: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const updated = result.sources.find((s) => s.id === 'to-update')
      expect(updated?.name).toBe('New')
      expect(updated?.enabled).toBe(false)
    }
  })

  it('rejects updating a built-in source', async () => {
    const result = await updateHubSource('mcp-get', { name: 'X', url: 'https://x.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 404 for unknown source id', async () => {
    const result = await updateHubSource('nonexistent', { name: 'X', url: 'https://x.com', trust: 'community', format: 'generic-json', enabled: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })
})

describe('deleteHubSource', () => {
  it('removes an existing user source', async () => {
    await addHubSource({ id: 'to-delete', name: 'D', url: 'https://d.example.com', trust: 'community', format: 'generic-json', enabled: true })
    const result = await deleteHubSource('to-delete')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.sources.some((s) => s.id === 'to-delete')).toBe(false)
    }
  })

  it('rejects deleting a built-in source mcp-get', async () => {
    const result = await deleteHubSource('mcp-get')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.errors.some((e) => e.message.includes('built-in'))).toBe(true)
    }
  })

  it('rejects deleting a built-in source local-file', async () => {
    const result = await deleteHubSource('local-file')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('returns 404 for unknown source id', async () => {
    const result = await deleteHubSource('no-such-source')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// MEDIUM-1: Concurrent CRUD mutex
// ---------------------------------------------------------------------------

describe('concurrent CRUD mutex', () => {
  it('5 concurrent addHubSource calls all succeed without overwriting each other', async () => {
    const ids = ['src-a', 'src-b', 'src-c', 'src-d', 'src-e']
    const inputs = ids.map((id) => ({
      id,
      name: `Source ${id}`,
      url: `https://${id}.example.com/mcp.json`,
      trust: 'community' as const,
      format: 'generic-json' as const,
      enabled: true,
    }))

    // Fire all 5 adds concurrently
    const results = await Promise.all(inputs.map((inp) => addHubSource(inp)))

    // All should succeed
    for (const r of results) {
      expect(r.ok).toBe(true)
    }

    // Final file must contain all 5 sources
    const final = await readHubSources()
    for (const id of ids) {
      expect(final.sources.some((s) => s.id === id)).toBe(true)
    }
  })

  it('concurrent add + delete leaves state consistent', async () => {
    // Pre-seed one source
    await addHubSource({ id: 'pre-seed', name: 'Pre', url: 'https://pre.example.com/mcp.json', trust: 'community', format: 'generic-json', enabled: true })

    // Concurrently add two more and delete the pre-seed
    const [addA, addB, del] = await Promise.all([
      addHubSource({ id: 'new-a', name: 'A', url: 'https://a.example.com/mcp.json', trust: 'community', format: 'generic-json', enabled: true }),
      addHubSource({ id: 'new-b', name: 'B', url: 'https://b.example.com/mcp.json', trust: 'community', format: 'generic-json', enabled: true }),
      deleteHubSource('pre-seed'),
    ])

    expect(addA.ok).toBe(true)
    expect(addB.ok).toBe(true)
    expect(del.ok).toBe(true)

    const final = await readHubSources()
    expect(final.sources.some((s) => s.id === 'pre-seed')).toBe(false)
    expect(final.sources.some((s) => s.id === 'new-a')).toBe(true)
    expect(final.sources.some((s) => s.id === 'new-b')).toBe(true)
  })
})
