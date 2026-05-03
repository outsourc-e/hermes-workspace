/**
 * Tests for unifiedSearch with user-defined sources — Phase 3.2.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./sources/local-file', () => ({
  fetchLocalFile: vi.fn(),
}))
vi.mock('./sources/mcp-get', () => ({
  fetchMcpGet: vi.fn(),
}))
vi.mock('./sources/generic-json', () => ({
  fetchGenericJson: vi.fn(),
}))
vi.mock('../mcp-hub-sources-store', () => ({
  readHubSources: vi.fn(),
}))
vi.mock('../claude-dashboard-api', () => ({
  getConfig: vi.fn(),
}))

import { fetchLocalFile } from './sources/local-file'
import { fetchMcpGet } from './sources/mcp-get'
import { fetchGenericJson } from './sources/generic-json'
import { readHubSources } from '../mcp-hub-sources-store'
import { getConfig } from '../claude-dashboard-api'
import { unifiedSearch } from './index'
import type { HubMcpEntry } from './types'

const mockFetchLocalFile = vi.mocked(fetchLocalFile)
const mockFetchMcpGet = vi.mocked(fetchMcpGet)
const mockFetchGenericJson = vi.mocked(fetchGenericJson)
const mockReadHubSources = vi.mocked(readHubSources)
const mockGetConfig = vi.mocked(getConfig)

function makeEntry(name: string, source: 'local' | 'mcp-get' = 'mcp-get'): HubMcpEntry {
  return {
    id: `${source}:${name}`,
    name,
    description: `${name} description`,
    source,
    homepage: null,
    tags: [],
    trust: 'community',
    template: { name, transportType: 'stdio', command: 'npx', args: ['-y', name] },
    installed: false,
  }
}

const BUILTIN_SOURCES_RESULT = {
  sources: [
    { id: 'mcp-get', name: 'Smithery', url: 'https://registry.smithery.ai/servers', trust: 'community', format: 'smithery', enabled: true, builtin: true },
    { id: 'local-file', name: 'Local', url: 'file://~/.hermes/mcp-presets.json', trust: 'official', format: 'generic-json', enabled: true, builtin: true },
  ],
  source: 'seed' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetConfig.mockResolvedValue({})
  mockFetchMcpGet.mockResolvedValue({ entries: [] })
  mockFetchLocalFile.mockResolvedValue({ entries: [] })
  mockReadHubSources.mockResolvedValue(BUILTIN_SOURCES_RESULT as never)
})

describe('unifiedSearch with user sources', () => {
  it('includes results from user-defined enabled sources', async () => {
    const userEntry = makeEntry('user-server')
    mockReadHubSources.mockResolvedValue({
      sources: [
        ...BUILTIN_SOURCES_RESULT.sources,
        { id: 'corp', name: 'Corp', url: 'https://corp.example.com/mcp.json', trust: 'community', format: 'generic-json', enabled: true, builtin: false },
      ],
      source: 'user-file' as const,
    } as never)
    mockFetchGenericJson.mockResolvedValue({ entries: [userEntry] })
    mockFetchMcpGet.mockResolvedValue({ entries: [makeEntry('smithery-server')] })
    mockFetchLocalFile.mockResolvedValue({ entries: [] })

    const result = await unifiedSearch('', 'all', 100)
    expect(result.results.some((e) => e.name === 'user-server')).toBe(true)
    expect(result.results.some((e) => e.name === 'smithery-server')).toBe(true)
    expect(mockFetchGenericJson).toHaveBeenCalledWith('corp', 'https://corp.example.com/mcp.json', 'community', expect.anything())
  })

  it('skips disabled user sources', async () => {
    mockReadHubSources.mockResolvedValue({
      sources: [
        ...BUILTIN_SOURCES_RESULT.sources,
        { id: 'disabled-source', name: 'Disabled', url: 'https://disabled.example.com/mcp.json', trust: 'community', format: 'generic-json', enabled: false, builtin: false },
      ],
      source: 'user-file' as const,
    } as never)

    await unifiedSearch('', 'all', 100)
    expect(mockFetchGenericJson).not.toHaveBeenCalled()
  })

  it('skips smithery-format user sources (only generic-json routed to adapter)', async () => {
    mockReadHubSources.mockResolvedValue({
      sources: [
        ...BUILTIN_SOURCES_RESULT.sources,
        { id: 'smithery-user', name: 'Smithery User', url: 'https://smithery.example.com', trust: 'community', format: 'smithery', enabled: true, builtin: false },
      ],
      source: 'user-file' as const,
    } as never)

    await unifiedSearch('', 'all', 100)
    // smithery format not routed through generic-json adapter
    expect(mockFetchGenericJson).not.toHaveBeenCalled()
  })

  it('continues with built-in sources when user sources fail', async () => {
    mockReadHubSources.mockResolvedValue({
      sources: [
        ...BUILTIN_SOURCES_RESULT.sources,
        { id: 'failing', name: 'Failing', url: 'https://failing.example.com', trust: 'community', format: 'generic-json', enabled: true, builtin: false },
      ],
      source: 'user-file' as const,
    } as never)
    mockFetchGenericJson.mockRejectedValue(new Error('network timeout'))
    const builtinEntry = makeEntry('builtin-server')
    mockFetchMcpGet.mockResolvedValue({ entries: [builtinEntry] })

    const result = await unifiedSearch('', 'all', 100)
    expect(result.results.some((e) => e.name === 'builtin-server')).toBe(true)
    expect(result.warnings?.some((w) => w.includes('failing'))).toBe(true)
  })

  it('continues normally when readHubSources itself throws', async () => {
    mockReadHubSources.mockRejectedValue(new Error('store read failed'))
    mockFetchMcpGet.mockResolvedValue({ entries: [makeEntry('smithery-server')] })

    const result = await unifiedSearch('', 'all', 100)
    // Should still get built-in results
    expect(result.results.some((e) => e.name === 'smithery-server')).toBe(true)
  })

  it('deduplicates entries with same source:name key', async () => {
    mockReadHubSources.mockResolvedValue({
      sources: [
        ...BUILTIN_SOURCES_RESULT.sources,
        { id: 'dup-source', name: 'Dup', url: 'https://dup.example.com', trust: 'community', format: 'generic-json', enabled: true, builtin: false },
      ],
      source: 'user-file' as const,
    } as never)
    // mcp-get and user source both return same name+source combo
    const entry = makeEntry('my-server', 'mcp-get')
    mockFetchMcpGet.mockResolvedValue({ entries: [entry] })
    mockFetchGenericJson.mockResolvedValue({ entries: [entry] }) // same id

    const result = await unifiedSearch('', 'all', 100)
    const count = result.results.filter((e) => e.name === 'my-server' && e.source === 'mcp-get').length
    expect(count).toBe(1)
  })
})
