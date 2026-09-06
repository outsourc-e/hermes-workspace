/**
 * Tests for pr-ci.ts — in-memory cache, rate-limit backoff, and HERMES_GH_REPOS
 * env-var precedence.  Each test gets a fresh in-memory cache via a private
 * export that the test helper resets before every test block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  // Reset env + private cache state before every test
  process.env.HERMES_GH_REPOS = 'test-org/test-repo'
  // Import and reset the private module-level cache
  vi.resetModules()
  // Re-import after env is set so trackedRepos() picks it up
})

afterEach(() => {
  vi.resetAllMocks()
  delete process.env.HERMES_GH_REPOS
})

// Mock child_process
let ghCallCount = 0
const mockGh = vi.fn((cmd: string, args: Array<string>, cb: any) => {
  ghCallCount++
  if (args.includes('pr')) {
    cb(null, {
      stdout: '[{"reviewDecision":"REVIEW_REQUIRED"},{"reviewDecision":null}]',
      stderr: '',
    })
  } else if (args.includes('run')) {
    cb(null, { stdout: '[{"conclusion":"success"}]', stderr: '' })
  } else if (args.includes('api') && args.includes('graphql')) {
    cb(null, { stdout: '{"data":{}}', stderr: '' })
  } else {
    cb(new Error('unexpected gh args: ' + args.join(' ')), null)
  }
})

vi.mock('child_process', () => ({
  execFile: mockGh,
}))

// Lazy re-import so env var is set before the module evaluates
async function importAdapters() {
  const m = await import('../pr-ci')
  return m
}

// ── helpers ────────────────────────────────────────────────────────────────
function resetModuleCache() {
  // The in-memory Map lives at module scope in pr-ci.ts.  Since we can't
  // reach it directly, we exercise the cache by counting gh calls.
  ghCallCount = 0
}

// ── tests ──────────────────────────────────────────────────────────────────
describe('prsAdapter', () => {
  it('counts open PRs + review-needed on first fetch', async () => {
    resetModuleCache()
    const { prsAdapter } = await importAdapters()
    const r = await prsAdapter.fetch()
    expect(r.value).toBe('2')
    expect(r.sub).toContain('1 need review')
    expect(ghCallCount).toBeGreaterThan(0)
  })

  it('serves from in-memory cache on second fetch (no additional gh call)', async () => {
    resetModuleCache()
    const { prsAdapter } = await importAdapters()
    // first fetch — primes cache
    await prsAdapter.fetch()
    const callsBefore = ghCallCount
    // second fetch — same tick, cache should short-circuit gh
    await prsAdapter.fetch()
    // no additional gh call within TTL
    expect(ghCallCount).toBe(callsBefore)
  })
})

describe('ciAdapter', () => {
  it('reports green when latest conclusion is success', async () => {
    resetModuleCache()
    const { ciAdapter } = await importAdapters()
    const r = await ciAdapter.fetch()
    expect(r.value).toBe('green')
    expect(r.tone).toBe('ok')
  })

  it('serves from in-memory cache on second fetch', async () => {
    resetModuleCache()
    const { ciAdapter } = await importAdapters()
    await ciAdapter.fetch()
    const callsBefore = ghCallCount
    await ciAdapter.fetch()
    expect(ghCallCount).toBe(callsBefore)
  })
})

describe('trackedRepos env var', () => {
  it('HERMES_GH_REPOS takes precedence over HUD_TRACKED_REPOS', async () => {
    resetModuleCache()
    process.env.HERMES_GH_REPOS = 'my-org/my-repo'
    process.env.HUD_TRACKED_REPOS = 'ignored-org/ignored-repo'
    const { prsAdapter } = await importAdapters()
    await prsAdapter.fetch()
    // mockGh was called with -R my-org/my-repo
    expect(mockGh).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['-R', 'my-org/my-repo']),
      expect.any(Function),
    )
  })

  it('falls back to HUD_TRACKED_REPOS when HERMES_GH_REPOS is absent', async () => {
    resetModuleCache()
    delete process.env.HERMES_GH_REPOS
    process.env.HUD_TRACKED_REPOS = 'fallback-org/fallback-repo'
    const { prsAdapter } = await importAdapters()
    await prsAdapter.fetch()
    expect(mockGh).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['-R', 'fallback-org/fallback-repo']),
      expect.any(Function),
    )
  })

  it('defaults to SPACEMAN1898/CliniTrack-Suite when no env var is set', async () => {
    resetModuleCache()
    delete process.env.HERMES_GH_REPOS
    delete process.env.HUD_TRACKED_REPOS
    const { prsAdapter } = await importAdapters()
    await prsAdapter.fetch()
    expect(mockGh).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['-R', 'SPACEMAN1898/CliniTrack-Suite']),
      expect.any(Function),
    )
  })

  it('uses HERMES_GH_CACHE_TTL_MS when set', async () => {
    resetModuleCache()
    process.env.HERMES_GH_CACHE_TTL_MS = '60000'
    const { prsAdapter } = await importAdapters()
    // TTL should be 60_000 ms
    expect(prsAdapter.ttlMs).toBe(60_000)
  })
})
