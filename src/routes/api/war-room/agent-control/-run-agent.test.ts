import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../../../server/auth-middleware'
import { CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS, runControlledAgentFlow } from '../../../../lib/war-room/body'
import { createSmartIntakeMission } from '../../../../lib/war-room/living-v3/smart-intake-v2'
import { Route, readRunAgentRequestPayload } from './run-agent'
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
    runControlledAgentFlow: vi.fn(),
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
const mockRunControlledAgentFlow = vi.mocked(runControlledAgentFlow)

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/war-room/agent-control/run-agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  mockRunControlledAgentFlow.mockResolvedValue({
    ok: true,
    runId: 'smart-intake-ui-test',
    agentId: 'smart-intake',
    result: {
      ok: true,
      runId: 'smart-intake-ui-test',
      agentId: 'smart-intake',
      durationMs: 12,
      usage: {
        mode: 'real_hermes_one_shot',
        budget: 'one Hermes CLI model call, max-turns=1',
        timeoutMs: 45_000,
        toolsets: 'none',
        commandPreview: 'hermes chat --max-turns 1 -t none -q <controlled-json-prompt>',
        reportedCost: null,
        reportedUsageLine: 'usage: fake',
        note: 'fake',
      },
      output: {
        agentId: 'smart-intake',
        status: 'completed_local_only',
        summary: 'Smart Intake guidance returned.',
        nextSafeStep: 'Review locally.',
        blockedActions: ['Etsy live actions'],
        confidence: 90,
        smartIntake: {
          missionId: 'mission-route',
          dataOrigin: 'controlled-smart-intake-local',
          sourceReadback: [],
          refinedProductMatches: [],
          dossierMarkdownAdditions: [],
          shotLabPrepNotes: [],
          missingEvidence: [],
          warnings: [],
        },
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

describe('POST /api/war-room/agent-control/run-agent', () => {
  it('returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await handler({ request: makeRequest({ agentId: 'smart-intake' }) })
    expect(response.status).toBe(401)
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
    expect(mockRunControlledAgentFlow).not.toHaveBeenCalled()
  })

  it('accepts bounded Smart Intake payload and passes context to the controlled flow', async () => {
    const mission = createSmartIntakeMission('Find bow necklace\nhttps://docs.google.com/spreadsheets/d/private/edit', 5_000)
    const response = await handler({
      request: makeRequest({
        agentId: 'smart-intake',
        operatorNote: 'review mission',
        smartIntakeInput: 'Find bow necklace',
        smartIntakeMission: mission,
      }),
    })
    expect(response.status).toBe(200)
    expect(mockRunControlledAgentFlow).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'smart-intake',
      operatorNote: 'review mission',
      smartIntakeContext: expect.objectContaining({
        input: 'Find bow necklace',
        mission: expect.objectContaining({ missionId: mission.missionId }),
      }),
    }))
  })

  it('truncates overlong Smart Intake input at the route payload boundary', () => {
    const parsed = readRunAgentRequestPayload({
      agentId: 'smart-intake',
      smartIntakeInput: 'x'.repeat(CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS + 25),
      smartIntakeMission: createSmartIntakeMission('Find bow necklace', 6_000),
    })
    expect(parsed.smartIntakeContext?.input).toHaveLength(CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS)
  })
})
