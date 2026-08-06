import { describe, expect, it } from 'vitest'

import {
  MISSION_CHECKPOINT_VERSION,
  parseMissionCheckpoint,
  validateMissionCheckpointCardOwnership,
} from './mission-checkpoint'
import type { MissionCheckpoint } from './mission-checkpoint'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'

function checkpoint(
  overrides: Partial<MissionCheckpoint> = {},
): MissionCheckpoint {
  return {
    version: MISSION_CHECKPOINT_VERSION,
    id: 'mission-1',
    label: 'Mission 1',
    name: 'Mission 1',
    goal: 'Verify Card ownership',
    status: 'running',
    processType: 'parallel',
    budgetLimit: '',
    startedAt: 1,
    updatedAt: 2,
    team: [
      {
        id: 'agent-1',
        name: 'Agent 1',
        modelId: 'model',
        roleDescription: 'worker',
        goal: 'Verify',
        backstory: '',
      },
    ],
    tasks: [],
    agentCardIdMap: { 'agent-1': 'remote:card-child' },
    agentParentCardIdMap: { 'agent-1': 'remote:card-root' },
    agentCardTitleMap: { 'agent-1': 'Persisted title' },
    agentCardModelMap: { 'agent-1': 'model' },
    ...overrides,
  }
}

function projection(): SessionCardListWire {
  return {
    cards: [
      {
        cardId: 'remote:card-root',
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        title: 'Root',
        titleSource: 'manual',
        canonicalSegmentKey: 'remote:runtime-root',
        continuationSegmentKeys: ['remote:card-root', 'remote:runtime-root'],
        continuationCount: 2,
        relationshipKind: 'root',
        childNodes: [
          {
            cardId: 'remote:card-child',
            sessionKey: 'remote:runtime-child',
            continuationSegmentKeys: [
              'remote:card-child',
              'remote:runtime-child',
            ],
            continuationCount: 2,
            relationshipKind: 'child',
            title: 'Authoritative child',
            status: 'running',
            updatedAt: 2,
          },
        ],
        updatedAt: 2,
        archived: false,
        pinned: false,
      },
    ],
    cardResolutions: [
      {
        cardId: 'remote:card-root',
        completeness: 'complete',
        retryable: false,
      },
    ],
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

describe('Mission checkpoint Card ownership', () => {
  it('parses production source-qualified Card ownership fixtures', () => {
    expect(parseMissionCheckpoint(checkpoint())).not.toBeNull()
  })

  it('accepts only an exact Card and exact child parent from the authoritative projection', () => {
    const validated = validateMissionCheckpointCardOwnership(
      checkpoint(),
      projection(),
    )

    expect(validated).not.toBeNull()
    expect(validated?.agentCardTitleMap['agent-1']).toBe('Authoritative child')
    expect(
      validateMissionCheckpointCardOwnership(
        checkpoint({ agentParentCardIdMap: {} }),
        projection(),
      ),
    ).toBeNull()
  })

  it('rejects current-version canonical and continuation transport strings injected as Card IDs', () => {
    for (const injected of ['remote:runtime-root', 'remote:runtime-child']) {
      expect(
        validateMissionCheckpointCardOwnership(
          checkpoint({
            agentCardIdMap: { 'agent-1': injected },
            agentParentCardIdMap: {},
          }),
          projection(),
        ),
      ).toBeNull()
    }
  })

  it('removes legacy raw-identity payloads fail closed before Card validation', () => {
    const legacy = parseMissionCheckpoint({
      ...checkpoint({
        agentCardIdMap: { 'agent-1': 'remote:runtime-child' },
        agentParentCardIdMap: {},
      }),
      version: 1,
    })

    expect(legacy).toBeNull()
  })
})
