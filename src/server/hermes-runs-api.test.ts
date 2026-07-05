import { afterEach, describe, expect, it, vi } from 'vitest'

import { submitHermesRunApproval, streamHermesRun } from './hermes-runs-api'

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    },
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.HERMES_API_TOKEN
  delete process.env.CLAUDE_API_TOKEN
})

describe('streamHermesRun', () => {
  it('starts a run and normalizes approval request events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ run_id: 'run_123', status: 'started' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        createStreamResponse([
          'data: {"event":"message.delta","run_id":"run_123","delta":"Hello"}\n\n',
          'data: {"event":"approval.request","run_id":"run_123","command":"rm -rf /tmp/demo","description":"destructive command"}\n\n',
          'data: {"event":"approval.responded","run_id":"run_123","choice":"once"}\n\n',
          'data: {"event":"run.completed","run_id":"run_123","output":"Hello"}\n\n',
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    for await (const event of streamHermesRun({
      input: 'hello',
      conversationHistory: [{ role: 'user', content: 'previous' }],
      sessionId: 'main',
      model: 'hermes-agent',
    })) {
      events.push(event)
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8642/v1/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          input: 'hello',
          conversation_history: [{ role: 'user', content: 'previous' }],
          model: 'hermes-agent',
          session_id: 'main',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8642/v1/runs/run_123/events',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(events).toContainEqual({
      kind: 'approval.request',
      runId: 'run_123',
      approval: expect.objectContaining({
        id: 'run_123',
        approvalId: 'run_123',
        runId: 'run_123',
        command: 'rm -rf /tmp/demo',
        description: 'destructive command',
      }),
    })
  })
})

describe('submitHermesRunApproval', () => {
  it('posts the approval choice to the run approval endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await submitHermesRunApproval('run_123', 'session')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8642/v1/runs/run_123/approval',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ choice: 'session' }),
      }),
    )
  })
})
