/**
 * Tests for the local-file source adapter.
 * Uses vi.mock to stub mcp-presets-store so no disk I/O occurs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../mcp-presets-store', () => ({
  readPresets: vi.fn(),
}))

import { readPresets } from '../../mcp-presets-store'
import { fetchLocalFile } from './local-file'
import type { ReadPresetsResult } from '../../mcp-presets-store'

const mockReadPresets = vi.mocked(readPresets)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchLocalFile', () => {
  it('converts valid presets to HubMcpEntry[] with source=local and trust=official', async () => {
    const presetsResult: ReadPresetsResult = {
      presets: [
        {
          id: 'github',
          name: 'github',
          description: 'GitHub MCP server',
          category: 'Official Presets',
          homepage: 'https://github.com/modelcontextprotocol/servers',
          tags: ['dev', 'git'],
          template: {
            name: 'github',
            transportType: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
          },
        },
      ],
      source: 'user-file',
    }
    mockReadPresets.mockResolvedValue(presetsResult)

    const result = await fetchLocalFile()

    expect(result.entries).toHaveLength(1)
    const entry = result.entries[0]
    expect(entry.source).toBe('local')
    expect(entry.trust).toBe('official')
    expect(entry.name).toBe('github')
    expect(entry.id).toBe('local:github')
    expect(entry.homepage).toBe('https://github.com/modelcontextprotocol/servers')
    expect(entry.tags).toEqual(['dev', 'git'])
    expect(entry.installed).toBe(false)
    expect(result.warnings).toBeUndefined()
  })

  it('returns empty entries with warning when source is invalid', async () => {
    mockReadPresets.mockResolvedValue({
      presets: [],
      source: 'invalid',
      error: 'User catalog file failed validation.',
      errorPath: '/home/user/.hermes/mcp-presets.json',
    })

    const result = await fetchLocalFile()
    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toBeDefined()
    expect(result.warnings![0]).toMatch(/local-file/)
    expect(result.warnings![0]).toMatch(/User catalog file failed validation/)
  })

  it('surfaces preset-store warnings without failing', async () => {
    mockReadPresets.mockResolvedValue({
      presets: [
        {
          id: 'myserver',
          name: 'myserver',
          description: 'test',
          category: 'Custom',
          template: { name: 'myserver', transportType: 'stdio', command: 'node', args: [] },
        },
      ],
      source: 'user-file',
      warnings: [{ path: 'presets[0].unknown', message: 'unknown field (ignored)' }],
    })

    const result = await fetchLocalFile()
    expect(result.entries).toHaveLength(1)
    expect(result.warnings).toBeDefined()
    expect(result.warnings![0]).toMatch(/local-file/)
  })

  it('returns no warnings field when there are no warnings', async () => {
    mockReadPresets.mockResolvedValue({
      presets: [
        {
          id: 'clean',
          name: 'clean',
          description: 'clean server',
          category: 'Custom',
          template: { name: 'clean', transportType: 'stdio', command: 'node', args: [] },
        },
      ],
      source: 'seed',
    })

    const result = await fetchLocalFile()
    expect(result.warnings).toBeUndefined()
  })

  it('maps preset homepage=undefined to null on entry', async () => {
    mockReadPresets.mockResolvedValue({
      presets: [
        {
          id: 'nohome',
          name: 'nohome',
          description: '',
          category: 'Custom',
          template: { name: 'nohome', transportType: 'stdio', command: 'node', args: [] },
        },
      ],
      source: 'seed',
    })

    const result = await fetchLocalFile()
    expect(result.entries[0].homepage).toBeNull()
  })
})
