import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runControlledCouncilFollowUp, runControlledCouncilRound } from './controlled-council-runner'
import { CONTROLLED_COUNCIL_AGENT_IDS } from './controlled-athena-runner'

let tempDirs: Array<string> = []
let oldVaultDir: string | undefined
let oldHermesCli: string | undefined

function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function writeNote(root: string, relativePath: string, text: string) {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, text, 'utf8')
}

function createFakeHermes(dir: string, options: { exitAfterJson?: boolean } = {}) {
  const fakeHermes = path.join(dir, 'hermes-fake.js')
  writeFileSync(fakeHermes, `#!/usr/bin/env node
const prompt = process.argv[process.argv.indexOf('-q') + 1] || ''
const phase = prompt.includes('single-follow-up') ? 'single-follow-up' : prompt.includes('synthesis') ? 'synthesis' : prompt.includes('council-turn') ? 'council-turn' : prompt.includes('peer-vote') ? 'peer-vote' : 'opinion'
console.log(JSON.stringify({
  agentId: 'council-hannibal',
  status: 'completed_local_only',
  summary: 'Hannibal returned a real bounded council answer.',
  nextSafeStep: 'Review the flank before handoff.',
  blockedActions: ['external actions', 'file edits', 'worker fan-out'],
  confidence: 87,
  council: {
    generalId: 'hannibal',
    phase,
    chatSummary: 'תקציר קצר: לשמור עומק בפרטי ולא להציף את הצ׳אט.',
    opinion: 'הפלנק: אם מציגים הכל בבת אחת, DLV יאבד נוחות. צריך תקציר פשוט ו-drill-down.',
    vote: 'neutral',
    voteReason: 'בעד רק אם הממשק נשאר נוח ולא מזייף תשובות.',
    recommendedOption: prompt.includes('חדר') ? 'Command Room / Mission Control' : 'Council UX',
    confidence: 89,
    personalitySignal: 'flank and hidden-risk lens',
    contextUsed: ['Council of Strategists - מקור אמת'],
    peerReadback: ['Saw peer opinions when provided'],
    riskFlags: ['UI overload'],
    suggestedDecisionPatch: 'Keep council summary simple and hide depth behind drill-down.',
    suggestedFollowUp: 'מה הדבר הראשון שיכול לשבור את זה?'
  }
}))
console.log('session_id: fake-council')
console.error('usage: 111 tokens fake')
${options.exitAfterJson ? 'process.exit(1)' : ''}
`, 'utf8')
  chmodSync(fakeHermes, 0o755)
  return fakeHermes
}

beforeEach(() => {
  oldVaultDir = process.env.WORKSPACE_OBSIDIAN_VAULT_DIR
  oldHermesCli = process.env.WAR_ROOM_CONTROLLED_HERMES_CLI
  const vault = tempDir('workspace-council-vault-')
  writeNote(vault, 'wiki/hot.md', '# Hot Cache\nDecision: Council must use real AI and no fake responses.')
  writeNote(vault, '01 Projects/War Room/Council of Strategists - מקור אמת 2026-06-27.md', '# Council of Strategists\nDecision: equal AI advisors read Obsidian, vote, and expose drill-down.')
  process.env.WORKSPACE_OBSIDIAN_VAULT_DIR = vault
  process.env.WAR_ROOM_CONTROLLED_HERMES_CLI = createFakeHermes(tempDir('workspace-council-hermes-'))
})

afterEach(() => {
  if (oldVaultDir === undefined) delete process.env.WORKSPACE_OBSIDIAN_VAULT_DIR
  else process.env.WORKSPACE_OBSIDIAN_VAULT_DIR = oldVaultDir
  if (oldHermesCli === undefined) delete process.env.WAR_ROOM_CONTROLLED_HERMES_CLI
  else process.env.WAR_ROOM_CONTROLLED_HERMES_CLI = oldHermesCli
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs = []
})

describe('controlled council runner', () => {
  it('runs a no-fake council round through controlled Hermes and Obsidian context', async () => {
    const result = await runControlledCouncilRound({
      topic: 'איזה חדר כדאי לפתח עכשיו?',
      agentIds: ['council-hannibal'],
      includePeerVote: false,
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(true)
    expect(result.noFakeResponses).toBe(true)
    expect(result.dataOrigin).toBe('controlled-real-ai-one-shot')
    expect(result.contextPacket.sourceNotes.some((note) => note.relativePath.includes('Council of Strategists') && note.status === 'loaded')).toBe(true)
    expect(result.openingTurns).toHaveLength(1)
    expect(result.openingTurns[0]).toMatchObject({ generalId: 'hannibal', status: 'completed_local_only', vote: 'neutral' })
    expect(result.openingTurns[0].chatSummary).toBe('תקציר קצר: לשמור עומק בפרטי ולא להציף את הצ׳אט.')
    expect(result.openingTurns[0].opinion).toContain('הפלנק')
    expect(result.openingTurns[0].independentRunId).toContain('council-hannibal-turn-1')
    expect(result.stats).toMatchObject({ completed: 1, neutral: 1, consensus: 'neutral' })
    expect(result.recommendation).toMatchObject({
      title: 'Command Room / Mission Control',
      supportLine: '1/1 תמכו ב־Command Room / Mission Control',
    })
    expect(result.summary).toContain('הבחירה הברורה')
    expect(result.decisionPacket.verdict).toBe('Command Room / Mission Control')
    expect(result.decisionPacket.recommendation.title).toBe('Command Room / Mission Control')
    expect(result.lockedActions).toEqual(expect.arrayContaining(['fake council responses', 'uncontrolled worker fan-out']))
  })

  it('runs five independent advisors, a discussion pass, and Julius as chair synthesis', async () => {
    const result = await runControlledCouncilRound({
      topic: 'תוודא שכל חבר במועצה עובד לבד ומחזיר תשובה קצרה בצ׳אט.',
      agentIds: CONTROLLED_COUNCIL_AGENT_IDS,
      includePeerVote: true,
      timeoutMs: 5_000,
    })

    const nonChairIds = CONTROLLED_COUNCIL_AGENT_IDS.filter((agentId) => agentId !== 'council-julius')
    expect(result.openingTurns).toHaveLength(nonChairIds.length)
    expect(result.voteTurns).toHaveLength(nonChairIds.length + 1)
    expect(new Set(result.openingTurns.map((turn) => turn.agentId))).toEqual(new Set(nonChairIds))
    expect(new Set(result.openingTurns.map((turn) => turn.generalId)).size).toBe(nonChairIds.length)
    expect(new Set(result.openingTurns.map((turn) => turn.independentRunId)).size).toBe(nonChairIds.length)
    for (const turn of result.openingTurns) {
      expect(turn.status).toBe('completed_local_only')
      expect(turn.phase).toBe('opinion')
      expect(turn.independentRunId).toContain(turn.agentId)
      expect(turn.independentRunId).toContain('turn')
      expect(turn.chatSummary.length).toBeLessThanOrEqual(220)
      expect(turn.opinion.length).toBeGreaterThan(turn.chatSummary.length)
    }
    const discussionTurns = result.voteTurns.filter((turn) => turn.phase === 'council-turn')
    const chairTurn = result.voteTurns.find((turn) => turn.agentId === 'council-julius')
    expect(discussionTurns).toHaveLength(nonChairIds.length)
    expect(chairTurn).toMatchObject({ generalId: 'julius', phase: 'synthesis', status: 'completed_local_only' })
    expect(chairTurn?.independentRunId).toContain('chair-synthesis')
    expect(result.stats.completed).toBe(nonChairIds.length + 1)
  })

  it('runs a single-general follow-up through the same no-fake path', async () => {
    const result = await runControlledCouncilFollowUp({
      topic: 'Council follow-up topic',
      question: 'חניבעל, מה הפלנק?',
      agentId: 'council-hannibal',
      previousOpinions: [{ generalId: 'napoleon', label: 'Napoleon', opinion: 'Ship fast with metrics.', vote: 'for', voteReason: 'fast MVP' }],
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(true)
    expect(result.noFakeResponses).toBe(true)
    expect(result.turn).toMatchObject({ generalId: 'hannibal', phase: 'single-follow-up', status: 'completed_local_only' })
    expect(result.turn.chatSummary).toBe('תקציר קצר: לשמור עומק בפרטי ולא להציף את הצ׳אט.')
    expect(result.turn.independentRunId).toContain('council-hannibal')
    expect(result.turn.peerReadback.join(' ')).toContain('peer')
  })

  it('keeps a real council follow-up answer when the CLI exits non-zero after printing valid JSON', async () => {
    process.env.WAR_ROOM_CONTROLLED_HERMES_CLI = createFakeHermes(tempDir('workspace-council-hermes-dirty-exit-'), { exitAfterJson: true })

    const result = await runControlledCouncilFollowUp({
      topic: 'Council follow-up topic',
      question: 'Alexander, what should improve there?',
      agentId: 'council-hannibal',
      previousOpinions: [{ generalId: 'alexander', label: 'Alexander', opinion: 'Use a real table and less rectangle UI.', vote: 'neutral', voteReason: 'needs better UX' }],
      timeoutMs: 5_000,
    })

    expect(result.ok).toBe(true)
    expect(result.turn).toMatchObject({ phase: 'single-follow-up', status: 'completed_local_only' })
    expect(result.turn.opinion).toContain('הפלנק')
    expect(result.turn.riskFlags.join(' ')).toContain('controlled runner warning')
    expect(result.turn.error).toBeUndefined()
  })
})
