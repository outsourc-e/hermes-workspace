import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  harvestSkillFromCheckpoint,
  matchSkillsForTask,
  taskKeywords,
} from './swarm-skills'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'

let vaultDir: string
let prevVault: string | undefined

beforeEach(() => {
  vaultDir = mkdtempSync(join(tmpdir(), 'swarm-skills-test-'))
  prevVault = process.env.HERMES_KNOWLEDGE_VAULT
  process.env.HERMES_KNOWLEDGE_VAULT = vaultDir
})

afterEach(() => {
  if (prevVault === undefined) delete process.env.HERMES_KNOWLEDGE_VAULT
  else process.env.HERMES_KNOWLEDGE_VAULT = prevVault
})

function doneCheckpoint(over?: Partial<ParsedSwarmCheckpoint>): ParsedSwarmCheckpoint {
  return {
    stateLabel: 'DONE',
    runtimeState: 'idle',
    checkpointStatus: 'done',
    filesChanged: 'src/foo.ts',
    commandsRun: 'npm test',
    result: 'Patched foo and verified with tests.',
    blocker: null,
    nextAction: null,
    raw: 'STATE: DONE',
    ...over,
  }
}

describe('taskKeywords', () => {
  it('extracts meaningful lowercased keywords, dropping stopwords', () => {
    const kws = taskKeywords('Fix the Discord digest cron and verify launchd')
    expect(kws).toContain('discord')
    expect(kws).toContain('digest')
    expect(kws).toContain('launchd')
    expect(kws).not.toContain('the')
    expect(kws).not.toContain('and')
  })
})

describe('harvestSkillFromCheckpoint', () => {
  it('writes a vault skill note for a DONE checkpoint with evidence', () => {
    const path = harvestSkillFromCheckpoint({
      workerId: 'swarm5',
      task: 'Fix the Discord digest cron schedule',
      checkpoint: doneCheckpoint(),
    })
    expect(path).not.toBeNull()
    const content = readFileSync(path!, 'utf8')
    expect(content).toContain('# Skill: Fix the Discord digest cron schedule')
    expect(content).toContain('npm test')
    expect(content).toContain('keywords:')
  })

  it('skips non-DONE checkpoints and DONE without evidence', () => {
    expect(
      harvestSkillFromCheckpoint({
        workerId: 'swarm5',
        task: 'blocked task',
        checkpoint: doneCheckpoint({ stateLabel: 'BLOCKED' }),
      }),
    ).toBeNull()
    expect(
      harvestSkillFromCheckpoint({
        workerId: 'swarm5',
        task: 'no evidence task',
        checkpoint: doneCheckpoint({ filesChanged: 'none', commandsRun: 'none' }),
      }),
    ).toBeNull()
  })
})

describe('matchSkillsForTask', () => {
  it('returns skills whose keywords overlap the new task', () => {
    harvestSkillFromCheckpoint({
      workerId: 'swarm5',
      task: 'Fix the Discord digest cron schedule',
      checkpoint: doneCheckpoint(),
    })
    harvestSkillFromCheckpoint({
      workerId: 'swarm2',
      task: 'Summarize quarterly market report',
      checkpoint: doneCheckpoint({ filesChanged: 'report.md' }),
    })

    const matches = matchSkillsForTask('Update the Discord digest formatting')
    expect(matches.length).toBe(1)
    expect(matches[0].title).toContain('Discord digest')
    expect(matches[0].snippet.length).toBeGreaterThan(0)
  })

  it('returns empty when nothing overlaps enough', () => {
    writeFileSync(
      join(vaultDir, 'unrelated.md'),
      '# Skill: something\nkeywords: alpha, beta\n',
    )
    expect(matchSkillsForTask('completely different work item')).toEqual([])
  })
})
