import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { runControlledLiveAgentChatFlow } from '../../../../lib/war-room/body'
import { Route, readLiveAgentChatRequestPayload } from './live-chat'
import type * as WarRoomBodyModule from '../../../../lib/war-room/body'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../../../lib/war-room/body', async () => {
  const actual = await vi.importActual<typeof WarRoomBodyModule>('../../../../lib/war-room/body')
  return {
    ...actual,
    getAgentConnectionState: vi.fn(() => ({
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      activeRunIds: [],
    })),
    getWarRoomBodyState: vi.fn(() => ({ agents: [], tasks: [], events: [] })),
    runControlledLiveAgentChatFlow: vi.fn(),
  }
})

type RouteWithHandlers = typeof Route & {
  options: {
    server: {
      handlers: {
        POST: (ctx: { request: Request }) => Promise<Response>
      }
    }
  }
}

const handler = (Route as RouteWithHandlers).options.server.handlers.POST
const mockIsAuthenticated = vi.mocked(isAuthenticated)
const mockRunControlledLiveAgentChatFlow = vi.mocked(runControlledLiveAgentChatFlow)

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/war-room/agent-control/live-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockRunControlledLiveAgentChatFlow.mockResolvedValue({
    ok: true,
    runId: 'live-chat-terra-test',
    agentId: 'terra',
    result: {
      ok: true,
      runId: 'live-chat-terra-test',
      agentId: 'terra',
      durationMs: 12,
      usage: {
        mode: 'real_hermes_one_shot',
        budget: 'one Hermes CLI model call, max-turns=1',
        timeoutMs: 45_000,
        toolsets: 'none',
        commandPreview: 'hermes chat --max-turns 1 -t none -q <live-agent-chat-json-prompt>',
        reportedCost: null,
        reportedUsageLine: 'usage: fake',
        note: 'fake',
      },
      output: {
        agentId: 'terra',
        status: 'completed_local_only',
        answer: 'קיבלתי. Terra עונה עכשיו כ-AI רק כשכותבים לה.',
        summary: 'Terra answered on demand.',
        nextSafeStep: 'Open Model Hunt.',
        blockedActions: ['background autonomous usage'],
        confidence: 90,
      },
      rawStdout: '{}',
      rawStderr: '',
    },
    control: {
      mode: 'frozen',
      frozen: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      activeRunIds: [],
    },
    state: { agents: [], tasks: [], events: [] },
  } as never)
})

describe('POST /api/war-room/agent-control/live-chat', () => {
  it('returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await handler({ request: makeRequest({ agentId: 'terra', operatorNote: 'שלום' }) })
    expect(response.status).toBe(401)
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
    expect(mockRunControlledLiveAgentChatFlow).not.toHaveBeenCalled()
  })

  it('accepts Terra live-on-message chat and passes a bounded operator note', async () => {
    const response = await handler({
      request: makeRequest({ agentId: 'terra', operatorNote: 'חפשי לי מודל להדפסה' }),
    })
    expect(response.status).toBe(200)
    expect(mockRunControlledLiveAgentChatFlow).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'terra',
      operatorNote: 'חפשי לי מודל להדפסה',
    }))
  })

  it('accepts every currently rendered Living V3 agent id, not only old controlled profiles', () => {
    expect(readLiveAgentChatRequestPayload({ agentId: 'terra' }).agentId).toBe('terra')
    expect(readLiveAgentChatRequestPayload({ agentId: 'loki' }).agentId).toBe('loki')
    expect(readLiveAgentChatRequestPayload({ agentId: 'ares' }).agentId).toBe('ares')
  })

  it('rejects unsupported agent ids', () => {
    expect(() => readLiveAgentChatRequestPayload({ agentId: 'missing-agent' })).toThrow(/Unsupported live agent chat id/)
  })
})
