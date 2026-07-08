import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createGoal,
  extractJson,
  listGoals,
  stepGoals,
  updateGoalState,
} from './swarm-goals'

let dir: string
const prevEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  process.env.HERMES_DISPATCH_PAUSE_PATH = join(tmpdir(), 'no-pause-' + Date.now())
  dir = mkdtempSync(join(tmpdir(), 'swarm-goals-'))
  for (const key of ['HERMES_SWARM_GOALS_PATH', 'HERMES_SWARM_PIPELINES_PATH']) {
    prevEnv[key] = process.env[key]
  }
  process.env.HERMES_SWARM_GOALS_PATH = join(dir, 'goals.json')
  process.env.HERMES_SWARM_PIPELINES_PATH = join(dir, 'pipelines.json')
})

afterAll(() => {
  for (const [key, value] of Object.entries(prevEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('extractJson', () => {
  it('parses fenced and bare JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('noise {"b":2} trailing')).toEqual({ b: 2 })
    expect(extractJson('no json here')).toBeNull()
  })
})

describe('goal lifecycle', () => {
  it('plans a pipeline from strategist JSON and tracks iterations', async () => {
    const goal = createGoal({ goal: 'test goal: improve X', maxIterations: 2 })
    expect(listGoals()[0].id).toBe(goal.id)

    const outcome = await stepGoals({
      dispatch: async () =>
        '```json\n{"stages":[{"label":"Do","assignments":[{"workerId":"builder","task":"do X"}]}]}\n```',
      startPipeline: async () => 'pl-test-1',
    })
    expect(outcome).toContain('pl-test-1')
    const after = listGoals().find((g) => g.id === goal.id)
    expect(after?.iterations).toBe(1)
    expect(after?.currentPipelineId).toBe('pl-test-1')

    // Pipeline unknown to the (empty) pipelines store → engine replans safely.
    const wait = await stepGoals({
      dispatch: async () => '',
      startPipeline: async () => 'unused',
    })
    expect(wait).toContain('replan')

    updateGoalState(goal.id, 'paused')
    const idle = await stepGoals({
      dispatch: async () => '',
      startPipeline: async () => 'unused',
    })
    expect(idle).toBe('no active goals')
  })

  it('survives unparseable plans', async () => {
    createGoal({ goal: 'another goal entirely' })
    const outcome = await stepGoals({
      dispatch: async () => 'I refuse to answer in JSON.',
      startPipeline: async () => 'unused',
    })
    expect(outcome).toBe('plan unparseable')
  })
})
