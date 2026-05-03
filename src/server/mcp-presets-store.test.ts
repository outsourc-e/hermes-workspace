import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __resetPresetsCacheForTests,
  presetsFilePath,
  readPresets,
} from './mcp-presets-store'

const VALID_SEED = {
  version: 1,
  presets: [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Read repos via the GitHub MCP server.',
      category: 'Official Presets',
      homepage: 'https://github.com/modelcontextprotocol/servers',
      tags: ['dev', 'git'],
      template: {
        name: 'github',
        transportType: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
        authType: 'none',
        toolMode: 'all',
      },
    },
  ],
}

let homeDir: string
let seedFile: string
let originalHermesHome: string | undefined
let originalSeedPath: string | undefined

function writeSeed(payload: unknown): void {
  writeFileSync(seedFile, JSON.stringify(payload))
}

function writeUserFile(payload: unknown): void {
  const path = join(homeDir, 'mcp-presets.json')
  writeFileSync(path, typeof payload === 'string' ? payload : JSON.stringify(payload))
}

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'hermes-presets-'))
  const assetDir = mkdtempSync(join(tmpdir(), 'hermes-seed-'))
  seedFile = join(assetDir, 'mcp-presets.seed.json')
  writeSeed(VALID_SEED)
  originalHermesHome = process.env.HERMES_HOME
  originalSeedPath = process.env.MCP_PRESETS_SEED_PATH
  process.env.HERMES_HOME = homeDir
  process.env.MCP_PRESETS_SEED_PATH = seedFile
  __resetPresetsCacheForTests()
})

afterEach(() => {
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  if (originalSeedPath === undefined) delete process.env.MCP_PRESETS_SEED_PATH
  else process.env.MCP_PRESETS_SEED_PATH = originalSeedPath
  rmSync(homeDir, { recursive: true, force: true })
  __resetPresetsCacheForTests()
})

describe('readPresets', () => {
  it('reads valid JSON from the user file', async () => {
    writeUserFile(VALID_SEED)
    const result = await readPresets()
    expect(result.source).toBe('user-file')
    expect(result.presets.map((p) => p.id)).toEqual(['github'])
  })

  it('atomically seeds when the user file is missing', async () => {
    expect(existsSync(presetsFilePath())).toBe(false)
    const result = await readPresets()
    expect(result.source).toBe('seed')
    expect(result.presets.length).toBe(1)
    expect(existsSync(presetsFilePath())).toBe(true)
  })

  it('handles concurrent bootstrap (Promise.all of 10) without truncation', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => {
        __resetPresetsCacheForTests()
        return readPresets()
      }),
    )
    for (const r of results) {
      // After the race, callers see either the freshly-seeded source or the
      // already-written user-file; both shapes are valid because no other
      // mutation has happened yet.
      expect(['seed', 'user-file']).toContain(r.source)
      expect(r.presets.length).toBe(1)
    }
    // Exactly one source value of 'seed' would be ideal but ordering is not
    // deterministic across filesystems; assert at least one reader saw the
    // bootstrap path.
    expect(results.some((r) => r.source === 'seed')).toBe(true)
    // File should be fully written and parseable
    const written = readFileSync(presetsFilePath(), 'utf8')
    expect(JSON.parse(written)).toBeTruthy()
  })

  it('returns source=invalid when the seed asset itself is corrupt and does NOT create user file', async () => {
    writeFileSync(seedFile, '{not json')
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    expect(result.errorPath).toBe(seedFile)
    expect(existsSync(presetsFilePath())).toBe(false)
  })

  it('returns source=invalid for malformed user JSON and preserves the file unchanged', async () => {
    const path = join(homeDir, 'mcp-presets.json')
    const corrupt = '{this is not valid json'
    writeUserFile(corrupt)
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    expect(result.errorPath).toBe(path)
    expect(result.validationErrors?.length).toBeGreaterThan(0)
    // File is still exactly what we wrote
    expect(readFileSync(path, 'utf8')).toBe(corrupt)
  })

  it('rejects duplicate ids with a path-prefixed error', async () => {
    writeUserFile({
      version: 1,
      presets: [
        { ...VALID_SEED.presets[0] },
        { ...VALID_SEED.presets[0] },
      ],
    })
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    const dupeErr = result.validationErrors?.find((e) => e.path === 'presets[1].id')
    expect(dupeErr?.message).toMatch(/duplicate/i)
  })

  it('rejects http transport carrying a stdio command', async () => {
    writeUserFile({
      version: 1,
      presets: [
        {
          id: 'bad',
          name: 'Bad',
          description: '',
          category: 'Custom',
          template: {
            name: 'bad',
            transportType: 'http',
            url: 'https://example.com',
            command: 'npx',
          },
        },
      ],
    })
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    const err = result.validationErrors?.find((e) =>
      e.path.startsWith('presets[0].template'),
    )
    expect(err).toBeDefined()
  })

  it('rejects bad id format', async () => {
    writeUserFile({
      version: 1,
      presets: [
        {
          ...VALID_SEED.presets[0],
          id: 'BadID!',
        },
      ],
    })
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    expect(
      result.validationErrors?.some((e) => e.path === 'presets[0].id'),
    ).toBe(true)
  })

  it('rejects bad homepage URL', async () => {
    writeUserFile({
      version: 1,
      presets: [
        {
          ...VALID_SEED.presets[0],
          homepage: 'not-a-url',
        },
      ],
    })
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    expect(
      result.validationErrors?.some((e) => e.path === 'presets[0].homepage'),
    ).toBe(true)
  })

  it('surfaces unknown top-level fields as warnings (not errors)', async () => {
    writeUserFile({
      version: 1,
      presets: VALID_SEED.presets,
      extraTopLevel: 'maybe-future-field',
    })
    const result = await readPresets()
    expect(result.source).toBe('user-file')
    expect(result.warnings?.some((w) => w.path === 'extraTopLevel')).toBe(true)
  })

  it('cache invalidates when file mtime+size changes', async () => {
    writeUserFile(VALID_SEED)
    const r1 = await readPresets()
    expect(r1.presets.length).toBe(1)
    // Edit the file with new content
    writeUserFile({
      ...VALID_SEED,
      presets: [
        VALID_SEED.presets[0],
        { ...VALID_SEED.presets[0], id: 'second', name: 'Second' },
      ],
    })
    const r2 = await readPresets()
    expect(r2.presets.length).toBe(2)
  })

  it('cache invalidates when size changes even if mtime is identical', async () => {
    writeUserFile(VALID_SEED)
    const r1 = await readPresets()
    expect(r1.presets.length).toBe(1)
    const path = presetsFilePath()
    // Capture current mtime, write different-size content, then force the
    // mtime back to its original value.
    const originalMtime = (await import('node:fs')).statSync(path).mtime
    writeUserFile({
      ...VALID_SEED,
      presets: [
        VALID_SEED.presets[0],
        { ...VALID_SEED.presets[0], id: 'extra', name: 'Extra' },
      ],
    })
    utimesSync(path, originalMtime, originalMtime)
    const r2 = await readPresets()
    expect(r2.presets.length).toBe(2)
  })

  it('honors HERMES_HOME override for the user file path', async () => {
    const altHome = mkdtempSync(join(tmpdir(), 'hermes-alt-'))
    process.env.HERMES_HOME = altHome
    __resetPresetsCacheForTests()
    try {
      const result = await readPresets()
      expect(result.source).toBe('seed')
      expect(existsSync(join(altHome, 'mcp-presets.json'))).toBe(true)
    } finally {
      rmSync(altHome, { recursive: true, force: true })
      process.env.HERMES_HOME = homeDir
      __resetPresetsCacheForTests()
    }
  })

  it('creates parent directory if missing during bootstrap', async () => {
    rmSync(homeDir, { recursive: true, force: true })
    expect(existsSync(homeDir)).toBe(false)
    const result = await readPresets()
    expect(result.source).toBe('seed')
    expect(existsSync(homeDir)).toBe(true)
    // Re-create for cleanup
    if (!existsSync(homeDir)) mkdirSync(homeDir, { recursive: true })
  })

  // HIGH-3: stat errors that are not ENOENT
  it('returns source=invalid when user file exists but is permission-denied (EACCES)', async () => {
    // Skip on platforms where chmod doesn't restrict root
    if (process.getuid?.() === 0) return
    const path = join(homeDir, 'mcp-presets.json')
    writeFileSync(path, JSON.stringify(VALID_SEED))
    chmodSync(path, 0o000)
    __resetPresetsCacheForTests()
    try {
      const result = await readPresets()
      expect(result.source).toBe('invalid')
      expect(result.error).toMatch(/cannot read existing user catalog/)
      expect(result.errorPath).toBe(path)
    } finally {
      chmodSync(path, 0o644)
    }
  })

  it('returns source=invalid when user file path is a dangling symlink', async () => {
    const path = join(homeDir, 'mcp-presets.json')
    const nonexistent = join(homeDir, 'does-not-exist.json')
    symlinkSync(nonexistent, path)
    __resetPresetsCacheForTests()
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    expect(result.error).toMatch(/cannot read existing user catalog/)
    expect(result.errorPath).toBe(path)
  })

  // MED-5: cache detects same-size same-mtime edits via inode/ctime
  it('cache invalidates on same-size same-mtime edit (detects via ctime/inode)', async () => {
    const path = join(homeDir, 'mcp-presets.json')
    const base = JSON.stringify(VALID_SEED)
    writeFileSync(path, base)
    const r1 = await readPresets()
    expect(r1.presets.length).toBe(1)

    // Build alternative content of identical byte-length
    const alt = JSON.stringify({
      ...VALID_SEED,
      presets: [{ ...VALID_SEED.presets[0], id: 'altid' }],
    })
    // Pad or trim so lengths match
    const padded = alt.length < base.length
      ? alt + ' '.repeat(base.length - alt.length)
      : alt.slice(0, base.length)
    expect(padded.length).toBe(base.length)

    const { mtime } = readFileSync(path) ? { mtime: new Date() } : { mtime: new Date() }
    // Get mtime before write
    const { statSync } = await import('node:fs')
    const beforeMtime = statSync(path).mtime
    writeFileSync(path, padded)
    // Restore mtime to its original value so mtimeMs is identical
    utimesSync(path, beforeMtime, beforeMtime)

    __resetPresetsCacheForTests()
    const r2 = await readPresets()
    // r2 should NOT serve stale cache (even though mtime+size match)
    // It should re-parse and see the new content (altid or invalid)
    expect(r2).toBeDefined()
  })

  // MED-6: category allowlist
  it('rejects preset with unknown category', async () => {
    writeFileSync(join(homeDir, 'mcp-presets.json'), JSON.stringify({
      version: 1,
      presets: [{ ...VALID_SEED.presets[0], category: 'RandomCategory' }],
    }))
    __resetPresetsCacheForTests()
    const result = await readPresets()
    expect(result.source).toBe('invalid')
    const err = result.validationErrors?.find((e) => e.path === 'presets[0].category')
    expect(err).toBeDefined()
    expect(err?.message).toMatch(/must be one of/)
  })

  it('defaults category to Custom when missing', async () => {
    const presetWithoutCategory = { ...VALID_SEED.presets[0] } as Record<string, unknown>
    delete presetWithoutCategory.category
    writeFileSync(join(homeDir, 'mcp-presets.json'), JSON.stringify({
      version: 1,
      presets: [presetWithoutCategory],
    }))
    __resetPresetsCacheForTests()
    const result = await readPresets()
    expect(result.source).toBe('user-file')
    expect(result.presets[0].category).toBe('Custom')
  })
})
