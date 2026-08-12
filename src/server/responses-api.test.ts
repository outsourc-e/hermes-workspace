import { afterEach, describe, expect, it, vi } from 'vitest'

import { streamResponses } from './responses-api'

function completedResponse(): Response {
  return new Response('data: {"type":"response.completed"}\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('streamResponses', () => {
  it('omits the Gateway virtual hermes-agent alias', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completedResponse())
    vi.stubGlobal('fetch', fetchMock)

    for await (const _event of streamResponses({
      input: 'hello',
      model: 'hermes-agent',
    })) {
      // Consume the stream so the request is issued.
    }

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).not.toHaveProperty('model')
  })

  it('preserves a real explicitly selected model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completedResponse())
    vi.stubGlobal('fetch', fetchMock)

    for await (const _event of streamResponses({
      input: 'hello',
      model: 'gpt-5.6-terra',
    })) {
      // Consume the stream so the request is issued.
    }

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body)).model).toBe('gpt-5.6-terra')
  })
})
