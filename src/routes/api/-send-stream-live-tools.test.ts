import { describe, expect, it } from 'vitest'

import {
  SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES,
  SYNTHETIC_LIVE_TOOL_ID_LIMIT,
  SYNTHETIC_LIVE_TOOL_RESULT_MAX_BYTES,
  collectSyntheticLiveToolEvents,
  createSyntheticLiveToolTracker,
} from './-send-stream-live-tools'

describe('collectSyntheticLiveToolEvents', () => {
  it('emits a live calling event as soon as an assistant tool call appears, before any tool result exists', () => {
    const tracker = createSyntheticLiveToolTracker()

    const events = collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_1',
              function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/AGENTS.md"}',
              },
            },
          ],
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    expect(events).toEqual([
      {
        phase: 'calling',
        name: 'read_file',
        toolCallId: 'toolu_1',
        args: { path: '/tmp/AGENTS.md' },
        result: undefined,
        sessionKey: 'session-1',
        runId: 'run-1',
      },
    ])
  })

  it('upgrades the same live tool card to complete when the matching tool result lands', () => {
    const tracker = createSyntheticLiveToolTracker()

    collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_1',
              function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/AGENTS.md"}',
              },
            },
          ],
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    const events = collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_1',
              function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/AGENTS.md"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'toolu_1',
          content: [{ type: 'text', text: 'file contents here' }],
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    expect(events).toEqual([
      {
        phase: 'complete',
        name: 'read_file',
        toolCallId: 'toolu_1',
        args: { path: '/tmp/AGENTS.md' },
        result: 'file contents here',
        sessionKey: 'session-1',
        runId: 'run-1',
      },
    ])
  })

  it('bounds retained IDs and payloads while still terminalizing a retained call', () => {
    const tracker = createSyntheticLiveToolTracker()
    const calls = Array.from(
      { length: SYNTHETIC_LIVE_TOOL_ID_LIMIT + 1 },
      (_, index) => ({
        id: `tool-${index}`,
        function: {
          name: `name-${index}`,
          arguments: JSON.stringify({
            payload: 'a'.repeat(SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES * 2),
          }),
        },
      }),
    )

    const calling = collectSyntheticLiveToolEvents({
      messages: [{ role: 'assistant', tool_calls: calls }],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })
    expect(calling).toHaveLength(SYNTHETIC_LIVE_TOOL_ID_LIMIT)
    expect(tracker.emittedPhaseByToolCallId.size).toBe(
      SYNTHETIC_LIVE_TOOL_ID_LIMIT,
    )
    expect(
      calling.some(
        ({ toolCallId }) =>
          toolCallId === `tool-${SYNTHETIC_LIVE_TOOL_ID_LIMIT}`,
      ),
    ).toBe(false)
    expect(
      Buffer.byteLength(JSON.stringify(calling[0]?.args), 'utf8'),
    ).toBeLessThanOrEqual(SYNTHETIC_LIVE_TOOL_ARGS_MAX_BYTES)

    const completed = collectSyntheticLiveToolEvents({
      messages: [
        { role: 'assistant', tool_calls: calls },
        {
          role: 'tool',
          tool_call_id: 'tool-0',
          content: 'r'.repeat(SYNTHETIC_LIVE_TOOL_RESULT_MAX_BYTES * 2),
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })
    expect(completed).toEqual([
      expect.objectContaining({ toolCallId: 'tool-0', phase: 'complete' }),
    ])
    expect(
      Buffer.byteLength(completed[0]?.result ?? '', 'utf8'),
    ).toBeLessThanOrEqual(SYNTHETIC_LIVE_TOOL_RESULT_MAX_BYTES)
  })

  it('does not surface raw tool failure text from persisted history', () => {
    const tracker = createSyntheticLiveToolTracker()
    const events = collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            { id: 'failed-tool', function: { name: 'shell', arguments: '{}' } },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'failed-tool',
          is_error: true,
          content: 'secret-token=do-not-emit',
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    expect(events).toEqual([
      expect.objectContaining({
        phase: 'error',
        toolCallId: 'failed-tool',
        result: 'Tool failed.',
      }),
    ])
    expect(JSON.stringify(events)).not.toContain('secret-token=do-not-emit')
  })
})
