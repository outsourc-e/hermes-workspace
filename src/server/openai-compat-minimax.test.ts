import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({ existsSync: () => false, readFileSync: vi.fn() }))
vi.mock('./gateway-capabilities', () => ({ CLAUDE_API: 'http://gateway.test' }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('MiniMax outgoing chat requests', () => {
  it.each(['MiniMax-M2.7', 'minimax/MiniMax-M2.7', 'minimax-cn/MiniMax-M2.7'])(
    'uses Flash for an ordinary default catalog containing %s',
    async (id) => {
      vi.stubEnv('CLAUDE_DEFAULT_MODEL', '')
      const fetchMock = vi.fn(async (url: string) =>
        url.endsWith('/models')
          ? Response.json({ data: [{ id }] })
          : Response.json({ choices: [{ message: { content: 'ok' } }] }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const { openaiChat } = await import('./openai-compat-api')
      await openaiChat([{ role: 'user', content: 'hello' }], { stream: false })
      const [url, options] = fetchMock.mock.calls[1] as unknown as [
        string,
        RequestInit,
      ]
      expect(url).toBe('http://gateway.test/v1/chat/completions')
      expect(JSON.parse(options.body as string)).toEqual({
        model: id.replace('MiniMax-M2.7', 'MiniMax-M3.1-Flash'),
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      })
    },
  )

  it.each(['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7', 'custom/model'])(
    'preserves explicit %s and multimodal history at the HTTP boundary',
    async (model) => {
      const fetchMock = vi.fn(async () =>
        Response.json({ choices: [{ message: { content: 'ok' } }] }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const { openaiChat } = await import('./openai-compat-api')
      const messages = [
        { role: 'assistant', content: 'previous answer' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url' as const,
              image_url: { url: 'data:image/png;base64,AA==' },
            },
          ],
        },
      ]
      await openaiChat(messages, { model, stream: false })
      const [, options] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ]
      expect(JSON.parse(options.body as string)).toEqual({
        model,
        messages,
        stream: false,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('streams Flash with unchanged history and no unsupported reasoning fields', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { openaiChat } = await import('./openai-compat-api')
    const messages = [{ role: 'user', content: 'hello' }]
    const stream = await openaiChat(messages, {
      model: 'MiniMax-M3.1-Flash',
      stream: true,
    })
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    expect(chunks).toEqual([{ type: 'content', text: 'ok' }])
    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(options.body as string)).toEqual({
      model: 'MiniMax-M3.1-Flash',
      messages,
      stream: true,
    })
  })

  it('preserves an explicit environment default', async () => {
    vi.stubEnv('CLAUDE_DEFAULT_MODEL', 'MiniMax-M2.7')
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: 'ok' } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { openaiChat } = await import('./openai-compat-api')
    await openaiChat([{ role: 'user', content: 'hello' }], { stream: false })
    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(options.body as string).model).toBe('MiniMax-M2.7')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
