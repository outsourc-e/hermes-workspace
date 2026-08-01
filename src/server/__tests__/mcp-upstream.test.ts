import { describe, expect, it, vi } from 'vitest'

import { MCP_LIST_PATH, MCP_LIST_PATH_LEGACY, fetchMcpList } from '../mcp-upstream'

const ok = (body: unknown = { servers: [] }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('fetchMcpList', () => {
  it('requests /api/mcp/servers first', async () => {
    const fetcher = vi.fn(async () => ok())

    const res = await fetchMcpList(fetcher)

    expect(res.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(MCP_LIST_PATH, undefined)
  })

  it('falls back to /api/mcp when the gateway 404s the new path', async () => {
    const fetcher = vi.fn(async (path: string) =>
      path === MCP_LIST_PATH ? new Response('not found', { status: 404 }) : ok(),
    )

    const res = await fetchMcpList(fetcher)

    expect(res.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenNthCalledWith(1, MCP_LIST_PATH, undefined)
    expect(fetcher).toHaveBeenNthCalledWith(2, MCP_LIST_PATH_LEGACY, undefined)
  })

  it('returns 404 when neither path exists', async () => {
    const fetcher = vi.fn(async () => new Response('not found', { status: 404 }))

    const res = await fetchMcpList(fetcher)

    expect(res.status).toBe(404)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403, 500, 502])('does not retry on %i', async (status) => {
    const fetcher = vi.fn(async () => new Response('', { status }))

    const res = await fetchMcpList(fetcher)

    // Only 404 means "wrong path" — masking anything else behind a second
    // request would hide auth and upstream failures from the caller.
    expect(res.status).toBe(status)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('forwards init to both attempts', async () => {
    const init: RequestInit = { method: 'GET', headers: { 'x-test': '1' } }
    const fetcher = vi.fn(async (path: string) =>
      path === MCP_LIST_PATH ? new Response('', { status: 404 }) : ok(),
    )

    await fetchMcpList(fetcher, init)

    expect(fetcher).toHaveBeenNthCalledWith(1, MCP_LIST_PATH, init)
    expect(fetcher).toHaveBeenNthCalledWith(2, MCP_LIST_PATH_LEGACY, init)
  })
})
