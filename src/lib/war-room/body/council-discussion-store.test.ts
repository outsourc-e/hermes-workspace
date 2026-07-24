import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearActiveCouncilDiscussion,
  loadCouncilDrawingBoardStore,
  recordCouncilFollowUpResult,
  recordCouncilReconsiderationRoundResult,
  recordCouncilRoundResult,
} from './council-discussion-store'
import type { ControlledCouncilFollowUpResult, ControlledCouncilRoundResult, ControlledCouncilTurn } from './controlled-council-runner'

let tempDirs: Array<string> = []

function tempStoreDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'workspace-council-drawing-board-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs = []
})

function turn(partial: Partial<ControlledCouncilTurn> = {}): ControlledCouncilTurn {
  return {
    agentId: 'council-hannibal',
    generalId: 'hannibal',
    label: 'Hannibal',
    phase: 'opinion',
    status: 'completed_local_only',
    chatSummary: 'Stored short council bubble.',
    opinion: 'A real stored council opinion.',
    vote: 'for',
    voteReason: 'It keeps the workspace visual and honest.',
    recommendedOption: 'Persistent Drawing Board',
    confidence: 91,
    personalitySignal: 'risk-hunting',
    contextUsed: ['Obsidian/Council source note.md'],
    peerReadback: ['Julius asked for ownership.'],
    riskFlags: ['do not fake responses'],
    suggestedDecisionPatch: 'Show thinking and saved rounds.',
    suggestedFollowUp: 'Who should rethink this?',
    durationMs: 12,
    usageReadback: 'fake-test-usage',
    independentRunId: 'run-council-test-council-hannibal-opinion',
    ...partial,
  }
}

function roundResult(topic = 'Make the Council real'): ControlledCouncilRoundResult {
  const openingTurn = turn({ phase: 'opinion' })
  const voteTurn = turn({ phase: 'peer-vote', opinion: 'After reading peers, keep it saved and visual.' })
  return {
    ok: true,
    runId: 'run-council-test',
    topic,
    dataOrigin: 'controlled-real-ai-one-shot',
    noFakeResponses: true,
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    contextPacket: {
      packetId: 'context-council-test',
      version: 'obsidian-context-packet-v1',
      createdAtMs: 1,
      targetRoomId: 'council-strategists',
      mission: 'Council test context',
      sourceNotes: [],
      decisions: [],
      safetyRails: [],
      allowedActions: ['read local context'],
      forbiddenActions: ['fake council responses'],
      artifacts: [],
      nextAction: 'Continue with a stored Council round.',
      localOnly: true,
      writebackAllowed: false,
    },
    openingTurns: [openingTurn],
    voteTurns: [voteTurn],
    stats: {
      total: 1,
      completed: 1,
      blocked: 0,
      failed: 0,
      for: 1,
      neutral: 0,
      against: 0,
      abstain: 0,
      consensus: 'for',
    },
    recommendation: {
      title: 'Persistent Drawing Board',
      summary: 'Store every real Council round.',
      supportLine: 'Hannibal supports Persistent Drawing Board',
      nextStep: 'Persist the round and show it in the UI.',
      reason: 'The Council must survive leaving and returning.',
      supportedBy: ['Hannibal'],
      options: [{
        label: 'Persistent Drawing Board',
        support: 1,
        voters: ['Hannibal'],
        voteBreakdown: { for: 1, neutral: 0, against: 0, abstain: 0 },
      }],
    },
    summary: 'Persistent Drawing Board wins.',
    decisionPacket: {
      packetId: 'packet-council-test',
      topic,
      verdict: 'Persistent Drawing Board',
      voteLine: '1 for',
      summary: 'Persistent Drawing Board wins.',
      recommendation: {
        title: 'Persistent Drawing Board',
        summary: 'Store every real Council round.',
        supportLine: 'Hannibal supports Persistent Drawing Board',
        nextStep: 'Persist the round and show it in the UI.',
        reason: 'The Council must survive leaving and returning.',
        supportedBy: ['Hannibal'],
        options: [{
          label: 'Persistent Drawing Board',
          support: 1,
          voters: ['Hannibal'],
          voteBreakdown: { for: 1, neutral: 0, against: 0, abstain: 0 },
        }],
      },
      sourceContextPacketId: 'context-council-test',
      noFakeResponses: true,
    },
    lockedActions: ['fake council responses', 'uncontrolled worker fan-out'],
  }
}

function followUpResult(): ControlledCouncilFollowUpResult {
  return {
    ok: true,
    runId: 'run-council-follow-up-test',
    topic: 'Make the Council real',
    question: 'Hannibal, what did the others miss?',
    dataOrigin: 'controlled-real-ai-one-shot',
    noFakeResponses: true,
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    contextPacket: roundResult().contextPacket,
    turn: turn({ phase: 'single-follow-up', opinion: 'The hidden risk is pretending saved state exists when it does not.' }),
    lockedActions: ['fake council responses', 'uncontrolled worker fan-out'],
  }
}

describe('council drawing board store', () => {
  it('persists discussions, reconsideration rounds, follow-ups, sources, and general stats', async () => {
    const rootDir = tempStoreDir()

    await recordCouncilRoundResult({
      discussionId: 'discussion-test',
      result: roundResult(),
      nowMs: 100,
    }, { rootDir, nowMs: 100 })

    await recordCouncilReconsiderationRoundResult({
      discussionId: 'discussion-test',
      roundId: 'round-rethink',
      question: 'Rethink after Hannibal found a risk.',
      result: roundResult('Rethink after Hannibal found a risk.'),
      nowMs: 200,
    }, { rootDir, nowMs: 200 })

    await recordCouncilFollowUpResult({
      discussionId: 'discussion-test',
      roundId: 'round-private-hannibal',
      question: 'Hannibal, what did the others miss?',
      targetAgentId: 'council-hannibal',
      result: followUpResult(),
      nowMs: 300,
    }, { rootDir, nowMs: 300 })

    const store = await loadCouncilDrawingBoardStore({ rootDir, nowMs: 400 })
    expect(store.activeDiscussionId).toBe('discussion-test')
    expect(store.discussions).toHaveLength(1)
    expect(store.discussions[0]).toMatchObject({
      discussionId: 'discussion-test',
      status: 'ready',
    })
    expect(store.discussions[0].rounds.map((round) => round.kind)).toEqual(['reconsideration', 'private-follow-up'])
    expect(store.discussions[0].sourcesUsed).toEqual(expect.arrayContaining(['Obsidian', 'Obsidian/Council source note.md']))
    expect(store.generalStats.hannibal.participated).toBe(1)
    expect(store.generalStats.hannibal.votes).toBeGreaterThanOrEqual(3)
    expect(store.generalStats.hannibal.wins).toBeGreaterThanOrEqual(1)

    const cleared = await clearActiveCouncilDiscussion({ rootDir, nowMs: 500 })
    expect(cleared.activeDiscussionId).toBeUndefined()
    expect(cleared.activeDiscussionClearedAtMs).toBe(500)

    const reloaded = await loadCouncilDrawingBoardStore({ rootDir, nowMs: 600 })
    expect(reloaded.discussions).toHaveLength(1)
    expect(reloaded.activeDiscussionId).toBeUndefined()
    expect(reloaded.activeDiscussionClearedAtMs).toBe(500)
  })
})
