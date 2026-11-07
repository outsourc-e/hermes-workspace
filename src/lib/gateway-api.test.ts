import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchSessions,
  fetchSessionHistory,
  fetchSessionStatus,
  sendToSession,
  fetchModels,
} from './gateway-api'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSessions', () => {
  it('returns sessions payload on same-origin endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ sessions: [{ key: 'a' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await fetchSessions()
    expect(fetchMock.mock.calls[0][0]).toContain('/api/sessions')
    expect(res.sessions).toHaveLength(1)
  })

  it('throws readable error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'down' }, 502)))
    await expect(fetchSessions()).rejects.toThrow('down')
  })
})

describe('fetchSessionHistory', () => {
  it('encodes key + limit params and never throws', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, messages: [{ role: 'assistant', text: 'hi' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await fetchSessionHistory('agent:main:ops-sage', { limit: 50 })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/session-history?')
    expect(url).toContain('key=agent%3Amain%3Aops-sage')
    expect(url).toContain('limit=50')
    expect(res.messages).toHaveLength(1)
  })

  it('returns ok:false envelope instead of throwing on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'gone' }, 404)))
    const res = await fetchSessionHistory('missing')
    expect(res.ok).toBe(false)
    expect(res.messages).toEqual([])
  })
})

describe('fetchSessionStatus', () => {
  it('unwraps payload envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ payload: { status: 'idle' } })),
    )
    const res = await fetchSessionStatus('k')
    expect(res).toMatchObject({ status: 'idle' })
  })

  it('passes through bare payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 'active' })))
    const res = await fetchSessionStatus('k')
    expect(res).toMatchObject({ status: 'active' })
  })
})

describe('sendToSession', () => {
  it('POSTs sessionKey + message as JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await sendToSession('agent:main:ops-sage', 'Run your primary task now')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/session-send')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      sessionKey: 'agent:main:ops-sage',
    })
  })

  it('throws backend error message on ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'nope' })))
    await expect(sendToSession('k', 'hi')).rejects.toThrow('nope')
  })
})

describe('fetchModels', () => {
  it('normalizes models + providers arrays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ ok: true, models: [{ id: 'ternary-bonsai-2-27b:q2_0' }], configuredProviders: ['ollama'] }),
      ),
    )
    const res = await fetchModels()
    expect(res.models).toHaveLength(1)
    expect(res.configuredProviders).toEqual(['ollama'])
  })

  it('throws on ok:false catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'bad' })))
    await expect(fetchModels()).rejects.toThrow('bad')
  })
})
