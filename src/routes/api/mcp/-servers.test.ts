import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { loadMcpServersFromConfig } from './servers'

const originalFetch = global.fetch

describe('loadMcpServersFromConfig', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('loads MCP servers from the dashboard config service before falling back to the gateway', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://127.0.0.1:9119/api/config') {
        return new Response(
          JSON.stringify({
            config: {
              mcp_servers: {
                github: {
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-github'],
                  env: { GITHUB_TOKEN: 'secret' },
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response('not found', { status: 404 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await loadMcpServersFromConfig()

    expect(result).toEqual({
      ok: true,
      servers: [
        {
          name: 'github',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'secret' },
          auth: undefined,
          connectTimeout: undefined,
          headers: undefined,
          timeout: undefined,
          url: undefined,
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9119/api/config',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://127.0.0.1:8642/api/config',
      expect.anything(),
    )
  })

  it('falls back to legacy gateway config when dashboard config is unavailable', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://127.0.0.1:9119/api/config') {
        return new Response('missing', { status: 404 })
      }
      if (url === 'http://127.0.0.1:8642/api/config') {
        return new Response(
          JSON.stringify({
            mcp_servers: {
              docs: { url: 'https://mcp.example.com', headers: { Authorization: 'Bearer x' } },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await loadMcpServersFromConfig()

    expect(result).toMatchObject({
      ok: true,
      servers: [
        {
          name: 'docs',
          transport: 'http',
          url: 'https://mcp.example.com',
          headers: { Authorization: 'Bearer x' },
        },
      ],
    })
  })
})
