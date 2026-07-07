import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  listPipelineRuns,
  parsePipelineStages,
  renderStageContext,
  runPipeline,
} from './swarm-pipeline'

let dir: string
let prev: string | undefined

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarm-pipeline-'))
  prev = process.env.HERMES_SWARM_PIPELINES_PATH
  process.env.HERMES_SWARM_PIPELINES_PATH = join(dir, 'pipelines.json')
})

afterAll(() => {
  if (prev === undefined) delete process.env.HERMES_SWARM_PIPELINES_PATH
  else process.env.HERMES_SWARM_PIPELINES_PATH = prev
  rmSync(dir, { recursive: true, force: true })
})

describe('parsePipelineStages', () => {
  it('rejects empty and oversized inputs', () => {
    expect(() => parsePipelineStages([])).toThrow()
    expect(() =>
      parsePipelineStages([{ assignments: [] }]),
    ).toThrow()
    expect(() =>
      parsePipelineStages([{ assignments: [{ workerId: 'qa' }] }]),
    ).toThrow()
  })

  it('normalizes labels', () => {
    const stages = parsePipelineStages([
      { assignments: [{ workerId: 'qa', task: 'test it' }] },
    ])
    expect(stages[0].label).toBe('Stage 1')
  })
})

describe('runPipeline', () => {
  it('threads context between stages and completes', async () => {
    const seenTasks: Array<string> = []
    const run = await runPipeline({
      title: 'test run',
      stages: [
        { label: 'Research', assignments: [{ workerId: 'researcher', task: 'find X' }] },
        { label: 'Build', assignments: [{ workerId: 'builder', task: 'build X' }] },
      ],
      dispatcher: async (assignments) => {
        seenTasks.push(assignments[0].task)
        return assignments.map((a) => ({
          workerId: a.workerId,
          ok: true,
          summary: `did ${a.workerId}`,
        }))
      },
    })
    expect(run.state).toBe('completed')
    expect(seenTasks[0]).toBe('find X')
    expect(seenTasks[1]).toContain('## Previous stage results (Research)')
    expect(seenTasks[1]).toContain('did researcher')
    expect(listPipelineRuns()[0].id).toBe(run.id)
  })

  it('fails fast when a stage has zero successes', async () => {
    const run = await runPipeline({
      title: 'fail run',
      stages: [
        { label: 'A', assignments: [{ workerId: 'qa', task: 't' }] },
        { label: 'B', assignments: [{ workerId: 'qa', task: 't2' }] },
      ],
      dispatcher: async (assignments) =>
        assignments.map((a) => ({ workerId: a.workerId, ok: false, summary: 'boom' })),
    })
    expect(run.state).toBe('failed')
    expect(run.stages.length).toBe(1)
  })
})

describe('renderStageContext', () => {
  it('renders results as markdown bullets', () => {
    const text = renderStageContext({
      label: 'Research',
      startedAt: 0,
      finishedAt: 1,
      results: [{ workerId: 'r1', ok: true, summary: 'found things' }],
    })
    expect(text).toContain('- r1 [DONE]: found things')
  })
})
