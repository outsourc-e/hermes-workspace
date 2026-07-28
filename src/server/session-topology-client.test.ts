import { describe, expect, it, vi } from 'vitest'

import { SessionTopologyClient } from './session-topology-client'

function topologyRow(
  id: string,
  relationship:
    | 'root'
    | 'continuation'
    | 'branch'
    | 'delegate'
    | 'child'
    | 'orphan',
  parentSessionId: string | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    parent_session_id: parentSessionId,
    source: relationship === 'delegate' ? 'tool' : 'cli',
    started_at: '2026-07-27T10:00:00+00:00',
    ended_at: null,
    end_reason: null,
    archived: false,
    relationship,
    ...overrides,
  }
}

describe('SessionTopologyClient', () => {
  it('uses the private bearer and aggregates one authenticated snapshot across pages, including archives', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessions: [
              topologyRow('root', 'root', null, {
                archived: true,
                ended_at: '2026-07-27T10:05:00+00:00',
                end_reason: 'compression',
              }),
              topologyRow('continuation', 'continuation', 'root'),
            ],
            snapshot: 'snapshot-one',
            next_cursor: 'cursor-one',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessions: [
              topologyRow('branch', 'branch', 'root'),
              topologyRow('delegate', 'delegate', 'root'),
              topologyRow('child', 'child', 'root'),
              topologyRow('orphan', 'orphan'),
            ],
            snapshot: 'snapshot-one',
            next_cursor: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    const client = new SessionTopologyClient({
      baseUrl: 'http://topology.internal:8080',
      token: 'private-token',
      fetch: fetchMock,
      pageSize: 500,
    })

    const result = await client.listAll()

    expect(result.snapshot).toBe('snapshot-one')
    expect(result.sessions.map((row) => row.id)).toEqual([
      'root',
      'continuation',
      'branch',
      'delegate',
      'child',
      'orphan',
    ])
    expect(result.sessions[0]).toMatchObject({ id: 'root', archived: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = fetchMock.mock.calls[0]!
    const [secondUrl, secondInit] = fetchMock.mock.calls[1]!
    expect(String(firstUrl)).toBe(
      'http://topology.internal:8080/v1/session-topology?limit=500',
    )
    expect(String(secondUrl)).toBe(
      'http://topology.internal:8080/v1/session-topology?limit=500&cursor=cursor-one&snapshot=snapshot-one',
    )
    for (const init of [firstInit, secondInit]) {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer private-token')
      expect(headers.get('accept')).toBe('application/json')
    }
  })

  it.each([
    {
      name: 'authentication failure',
      response: new Response(JSON.stringify({ error: 'secret auth detail' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    },
    {
      name: 'malformed response schema',
      response: new Response(
        JSON.stringify({
          sessions: [
            {
              ...topologyRow('unsafe-orphan', 'orphan'),
              parent_session_id: 'invented-parent',
            },
          ],
          snapshot: 'snapshot-one',
          next_cursor: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    },
  ])(
    'fails closed without disclosing configuration on $name',
    async ({ response }) => {
      const client = new SessionTopologyClient({
        baseUrl: 'http://topology.internal:8080',
        token: 'private-token',
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
      })

      const rejection = client.listAll()
      await expect(rejection).rejects.toThrow('Session topology is unavailable')
      await expect(rejection).rejects.not.toThrow(
        /private-token|topology\.internal|secret auth detail/,
      )
    },
  )

  it('rejects snapshot changes, duplicate identities, and dangling authoritative parents', async () => {
    const cases = [
      [
        {
          sessions: [topologyRow('root', 'root')],
          snapshot: 'first',
          next_cursor: 'next',
        },
        {
          sessions: [topologyRow('child', 'child', 'root')],
          snapshot: 'changed',
          next_cursor: null,
        },
      ],
      [
        {
          sessions: [topologyRow('root', 'root')],
          snapshot: 'same',
          next_cursor: 'next',
        },
        {
          sessions: [topologyRow('root', 'root')],
          snapshot: 'same',
          next_cursor: null,
        },
      ],
      [
        {
          sessions: [topologyRow('child', 'child', 'missing')],
          snapshot: 'same',
          next_cursor: null,
        },
      ],
    ]

    for (const pages of cases) {
      const fetchMock = vi.fn<typeof fetch>()
      for (const body of pages) {
        fetchMock.mockResolvedValueOnce(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      const client = new SessionTopologyClient({
        baseUrl: 'http://topology.internal:8080',
        token: 'private-token',
        fetch: fetchMock,
      })
      await expect(client.listAll()).rejects.toThrow(
        'Session topology is unavailable',
      )
    }
  })

  it('invalidates an in-flight snapshot so the next read refetches', async () => {
    let releaseFirst!: (response: Response) => void
    const firstResponse = new Promise<Response>((resolve) => {
      releaseFirst = resolve
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessions: [topologyRow('fresh', 'root')],
            snapshot: 'fresh-snapshot',
            next_cursor: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    const client = new SessionTopologyClient({
      baseUrl: 'http://topology.internal:8080',
      token: 'private-token',
      fetch: fetchMock,
    })

    const staleRead = client.listAll()
    client.invalidate()
    const freshRead = client.listAll()
    releaseFirst(
      new Response(
        JSON.stringify({
          sessions: [topologyRow('stale', 'root')],
          snapshot: 'stale-snapshot',
          next_cursor: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(staleRead).resolves.toMatchObject({
      snapshot: 'stale-snapshot',
    })
    await expect(freshRead).resolves.toMatchObject({
      snapshot: 'fresh-snapshot',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
