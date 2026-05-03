/**
 * Tests for unifiedSearch.
 * Mocks source adapters and claude-dashboard-api to avoid I/O.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./sources/local-file', () => ({
  fetchLocalFile: vi.fn(),
}))
vi.mock('./sources/mcp-get', () => ({
  fetchMcpGet: vi.fn(),
}))
vi.mock('../claude-dashboard-api', () => ({
  getConfig: vi.fn(),
}))

import { fetchLocalFile } from './sources/local-file'
import { fetchMcpGet } from './sources/mcp-get'
import { getConfig } from '../claude-dashboard-api'
import { unifiedSearch } from './index'
import type { HubMcpEntry } from './types'

const mockFetchLocalFile = vi.mocked(fetchLocalFile)
const mockFetchMcpGet = vi.mocked(fetchMcpGet)
const mockGetConfig = vi.mocked(getConfig)

function makeEntry(name: string, source: 'local' | 'mcp-get' = 'mcp-get'): HubMcpEntry {
  return {
    id: `${source}:${name}`,
    name,
    description: `${name} server`,
    source,
    homepage: null,
    tags: [],
    trust: 'community',
    template: { name, transportType: 'stdio', command: 'npx', args: [] },
    installed: false,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetConfig.mockResolvedValue({})
})

describe('unifiedSearch — basic', () => {
  it('returns merged results from all sources', async () => {
    mockFetchMcpGet.mockResolvedValue({ entries: [makeEntry('github', 'mcp-get')] })
    mockFetchLocalFile.mockResolvedValue({ entries: [makeEntry('mypreset', 'local')] })

    const result = await unifiedSearch('', 'all', 20)
    expect(result.results).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('filters by query string', async () => {
    mockFetchMcpGet.mockResolvedValue({
      entries: [makeEntry('github', 'mcp-get'), makeEntry('slack', 'mcp-get')],
    })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('github', 'all', 20)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].name).toBe('github')
  })

  it('deduplicates by source:name key', async () => {
    const dup = makeEntry('github', 'mcp-get')
    mockFetchMcpGet.mockResolvedValue({ entries: [dup, dup] })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('', 'all', 20)
    expect(result.results).toHaveLength(1)
  })

  it('respects limit param', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(`server-${i}`, 'mcp-get'))
    mockFetchMcpGet.mockResolvedValue({ entries })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('', 'all', 3)
    expect(result.results).toHaveLength(3)
    expect(result.total).toBe(10)
  })
})

describe('unifiedSearch — installed flag', () => {
  it('marks installed=true when name matches config.yaml mcp_servers key', async () => {
    mockGetConfig.mockResolvedValue({
      mcp_servers: { github: {}, slack: {} },
    })
    mockFetchMcpGet.mockResolvedValue({
      entries: [makeEntry('github', 'mcp-get'), makeEntry('notion', 'mcp-get')],
    })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('', 'all', 20)
    const github = result.results.find((e) => e.name === 'github')
    const notion = result.results.find((e) => e.name === 'notion')
    expect(github?.installed).toBe(true)
    expect(notion?.installed).toBe(false)
  })

  it('handles config wrapped in { config: {...} } shape', async () => {
    mockGetConfig.mockResolvedValue({
      config: { mcp_servers: { github: {} } },
    })
    mockFetchMcpGet.mockResolvedValue({ entries: [makeEntry('github', 'mcp-get')] })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('', 'all', 20)
    expect(result.results[0].installed).toBe(true)
  })

  it('defaults installed=false when getConfig throws', async () => {
    mockGetConfig.mockRejectedValue(new Error('gateway down'))
    mockFetchMcpGet.mockResolvedValue({ entries: [makeEntry('github', 'mcp-get')] })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('', 'all', 20)
    expect(result.results[0].installed).toBe(false)
  })
})

describe('unifiedSearch — partial failure', () => {
  it('surfaces warnings when one source fails and others succeed', async () => {
    mockFetchMcpGet.mockRejectedValue(new Error('timeout'))
    mockFetchLocalFile.mockResolvedValue({ entries: [makeEntry('local-preset', 'local')] })

    const result = await unifiedSearch('', 'all', 20)
    expect(result.results).toHaveLength(1)
    expect(result.warnings).toBeDefined()
    expect(result.warnings!.some((w) => w.includes('mcp-get'))).toBe(true)
  })

  it('falls back to local-file when all remote sources fail', async () => {
    mockFetchMcpGet.mockRejectedValue(new Error('network error'))
    mockFetchLocalFile.mockResolvedValue({ entries: [makeEntry('fallback-preset', 'local')] })

    // Request only remote sources — unifiedSearch should auto-add local fallback
    const result = await unifiedSearch('', 'mcp-get', 20)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].name).toBe('fallback-preset')
    expect(result.warnings!.some((w) => w.includes('fallback'))).toBe(true)
  })

  it('returns empty results with warnings when all sources fail', async () => {
    mockFetchMcpGet.mockRejectedValue(new Error('net error'))
    mockFetchLocalFile.mockRejectedValue(new Error('disk error'))

    const result = await unifiedSearch('', 'all', 20)
    expect(result.results).toHaveLength(0)
    expect(result.warnings!.length).toBeGreaterThan(0)
  })
})

describe('unifiedSearch — single source', () => {
  it('queries only mcp-get when source=mcp-get', async () => {
    mockFetchMcpGet.mockResolvedValue({ entries: [makeEntry('pkg', 'mcp-get')] })

    const result = await unifiedSearch('', 'mcp-get', 20)
    expect(result.results).toHaveLength(1)
    expect(mockFetchLocalFile).not.toHaveBeenCalled()
  })

  it('queries only local when source=local', async () => {
    mockFetchLocalFile.mockResolvedValue({ entries: [makeEntry('preset', 'local')] })

    const result = await unifiedSearch('', 'local', 20)
    expect(result.results).toHaveLength(1)
    expect(mockFetchMcpGet).not.toHaveBeenCalled()
  })
})

describe('unifiedSearch — degraded fallback', () => {
  it('falls through to local-file when mcp-get returns degraded=true and only mcp-get is enabled', async () => {
    // mcp-get returns 403-style degraded result (resolves, not rejects)
    mockFetchMcpGet.mockResolvedValue({
      entries: [],
      warnings: ['mcp-get: rate limited (403); remaining=0, reset=9999999'],
      degraded: true,
    })
    mockFetchLocalFile.mockResolvedValue({ entries: [makeEntry('local-fallback', 'local')] })

    const result = await unifiedSearch('', 'mcp-get', 20)
    // Should have triggered local fallback
    expect(result.results).toHaveLength(1)
    expect(result.results[0].name).toBe('local-fallback')
    expect(result.warnings).toBeDefined()
    expect(result.warnings!.some((w) => w.includes('fallback'))).toBe(true)
  })

  it('does NOT trigger fallback when mcp-get returns clean results (degraded=undefined)', async () => {
    mockFetchMcpGet.mockResolvedValue({
      entries: [makeEntry('pkg', 'mcp-get')],
    })

    const result = await unifiedSearch('', 'mcp-get', 20)
    expect(result.results).toHaveLength(1)
    expect(mockFetchLocalFile).not.toHaveBeenCalled()
  })

  it('triggers fallback when mcp-get is degraded even though it returned stale entries', async () => {
    // Even with stale entries, degraded=true means local fallback adds its results
    mockFetchMcpGet.mockResolvedValue({
      entries: [makeEntry('stale-entry', 'mcp-get')],
      warnings: ['mcp-get: network error: ECONNREFUSED'],
      degraded: true,
    })
    mockFetchLocalFile.mockResolvedValue({ entries: [makeEntry('local-entry', 'local')] })

    const result = await unifiedSearch('', 'mcp-get', 20)
    expect(result.warnings!.some((w) => w.includes('fallback'))).toBe(true)
    // local-file fallback was invoked
    expect(mockFetchLocalFile).toHaveBeenCalled()
  })
})
