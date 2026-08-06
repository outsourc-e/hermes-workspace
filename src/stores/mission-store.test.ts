// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import { useMissionStore } from './mission-store'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { MissionCheckpoint } from '@/screens/gateway/lib/mission-checkpoint'
import { MISSION_CHECKPOINT_VERSION } from '@/screens/gateway/lib/mission-checkpoint'

const ROOT_CARD_ID = 'remote:card-agent-1'
const CHILD_CARD_ID = 'remote:card-child'
const ROOT_RUNTIME_KEY = 'remote:runtime-agent-1'
const CHILD_RUNTIME_KEY = 'remote:runtime-child'

function checkpoint(cardId: string, parentCardId?: string): MissionCheckpoint {
  return {
    version: MISSION_CHECKPOINT_VERSION,
    id: 'mission-1',
    label: 'Mission 1',
    name: 'Mission 1',
    goal: 'Restore safely',
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
        goal: 'verify',
        backstory: '',
      },
    ],
    tasks: [],
    agentCardIdMap: { 'agent-1': cardId },
    agentParentCardIdMap: parentCardId ? { 'agent-1': parentCardId } : {},
    agentCardTitleMap: { 'agent-1': 'Persisted title' },
    agentCardModelMap: { 'agent-1': 'model' },
  }
}

function projection(): SessionCardListWire {
  return {
    cards: [
      {
        cardId: ROOT_CARD_ID,
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        title: 'Authoritative title',
        titleSource: 'manual',
        canonicalSegmentKey: ROOT_RUNTIME_KEY,
        continuationSegmentKeys: [ROOT_CARD_ID, ROOT_RUNTIME_KEY],
        continuationCount: 2,
        relationshipKind: 'root',
        childNodes: [
          {
            cardId: CHILD_CARD_ID,
            sessionKey: CHILD_RUNTIME_KEY,
            continuationSegmentKeys: [CHILD_CARD_ID, CHILD_RUNTIME_KEY],
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
        cardId: ROOT_CARD_ID,
        completeness: 'complete',
        retryable: false,
      },
    ],
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

function startMission(): void {
  useMissionStore.getState().startMission({
    id: 'mission-1',
    goal: 'Persist safely',
    name: 'Mission 1',
    team: [
      {
        id: 'agent-1',
        name: 'Agent 1',
        modelId: 'model',
        roleDescription: 'worker',
        goal: 'verify',
        backstory: '',
        status: 'available',
      },
    ],
    tasks: [],
    processType: 'parallel',
    budgetLimit: '',
    startedAt: 1,
  })
}

beforeEach(() => {
  localStorage.clear()
  useMissionStore.setState(useMissionStore.getInitialState(), true)
})

describe('mission-store Card-authoritative restore', () => {
  it('rejects a structurally valid current raw transport injection', () => {
    useMissionStore
      .getState()
      .restoreMission(checkpoint(ROOT_RUNTIME_KEY), projection())

    expect(useMissionStore.getState().activeMission).toBeNull()
    expect(useMissionStore.getState().agentCardIdMap).toEqual({})
    expect(localStorage.getItem('clawsuite:mission-store')).not.toContain(
      ROOT_RUNTIME_KEY,
    )
  })

  it('restores exact authoritative Card ownership and refreshes its title', () => {
    useMissionStore
      .getState()
      .restoreMission(checkpoint(ROOT_CARD_ID), projection())

    expect(useMissionStore.getState().agentCardIdMap).toEqual({
      'agent-1': ROOT_CARD_ID,
    })
    expect(useMissionStore.getState().agentCardTitleMap).toEqual({
      'agent-1': 'Authoritative title',
    })
  })

  it('requires an exact child parent and a complete projected owner', () => {
    useMissionStore
      .getState()
      .restoreMission(checkpoint(CHILD_CARD_ID), projection())
    expect(useMissionStore.getState().activeMission).toBeNull()

    useMissionStore
      .getState()
      .restoreMission(checkpoint(CHILD_CARD_ID, ROOT_CARD_ID), projection())
    expect(useMissionStore.getState().agentCardIdMap).toEqual({
      'agent-1': CHILD_CARD_ID,
    })
    expect(useMissionStore.getState().agentParentCardIdMap).toEqual({
      'agent-1': ROOT_CARD_ID,
    })

    const partial = projection()
    partial.cardResolutions[0] = {
      cardId: ROOT_CARD_ID,
      completeness: 'incomplete',
      retryable: true,
    }
    useMissionStore
      .getState()
      .restoreMission(checkpoint(CHILD_CARD_ID, ROOT_CARD_ID), partial)
    expect(useMissionStore.getState().activeMission).toBeNull()
  })

  it('persists owners only after exact complete projection validation', () => {
    startMission()
    const cards = projection()

    const rawAccepted = useMissionStore
      .getState()
      .setAgentCardOwner(
        'agent-1',
        { cardId: ROOT_RUNTIME_KEY, title: 'Forged transport owner' },
        cards,
      )
    expect(rawAccepted).toBe(false)
    expect(useMissionStore.getState().agentCardIdMap).toEqual({})
    expect(localStorage.getItem('clawsuite:mission-store')).not.toContain(
      ROOT_RUNTIME_KEY,
    )

    const partial = projection()
    partial.cardResolutions[0] = {
      cardId: ROOT_CARD_ID,
      completeness: 'incomplete',
      retryable: true,
    }
    const partialAccepted = useMissionStore
      .getState()
      .setAgentCardOwner(
        'agent-1',
        { cardId: ROOT_CARD_ID, title: 'Partial owner' },
        partial,
      )
    expect(partialAccepted).toBe(false)
    expect(useMissionStore.getState().agentCardIdMap).toEqual({})

    const exactAccepted = useMissionStore
      .getState()
      .setAgentCardOwner(
        'agent-1',
        { cardId: ROOT_CARD_ID, title: 'Forged persisted title' },
        cards,
      )
    expect(exactAccepted).toBe(true)
    expect(useMissionStore.getState().agentCardIdMap).toEqual({
      'agent-1': ROOT_CARD_ID,
    })
    expect(useMissionStore.getState().agentCardTitleMap).toEqual({
      'agent-1': 'Authoritative title',
    })
    const serialized = localStorage.getItem('clawsuite:mission-store') ?? ''
    expect(serialized).toContain(ROOT_CARD_ID)
    expect(serialized).not.toContain(ROOT_RUNTIME_KEY)
  })
})
