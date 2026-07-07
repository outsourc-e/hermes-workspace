/**
 * Multi-stage dispatch pipelines: research → build → QA without a human
 * relaying results between workers.
 *
 * A pipeline is an ordered list of stages; each stage holds 1..4 parallel
 * assignments. When a stage finishes, a compact summary of its checkpoint
 * results is appended to every next-stage task under "## Previous stage
 * results", so downstream workers start with upstream context.
 *
 * Execution is fire-and-forget server-side (stages can take many minutes);
 * progress is persisted to .runtime/swarm-pipelines.json and shows up in the
 * timeline via normal dispatch outcomes. State transitions: running →
 * completed | failed (a stage with zero successful assignments aborts the
 * rest).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'

export type PipelineAssignment = {
  workerId: string
  task: string
}

export type PipelineStage = {
  label: string
  assignments: Array<PipelineAssignment>
}

export type PipelineStageResult = {
  label: string
  startedAt: number
  finishedAt: number | null
  results: Array<{
    workerId: string
    ok: boolean
    summary: string
  }>
}

export type PipelineRun = {
  id: string
  title: string
  state: 'running' | 'completed' | 'failed'
  createdAt: number
  finishedAt: number | null
  stages: Array<PipelineStageResult>
}

export function pipelinesPath(): string {
  return (
    process.env.HERMES_SWARM_PIPELINES_PATH ||
    join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-pipelines.json')
  )
}

const MAX_RUNS = 50
const MAX_STAGES = 5
const MAX_PARALLEL = 4

type PipelinesFile = { runs: Array<PipelineRun> }

function loadRuns(): PipelinesFile {
  try {
    if (existsSync(pipelinesPath())) {
      const parsed = JSON.parse(
        readFileSync(pipelinesPath(), 'utf8'),
      ) as PipelinesFile
      if (Array.isArray(parsed.runs)) return parsed
    }
  } catch {
    /* corrupt — start fresh */
  }
  return { runs: [] }
}

function saveRuns(file: PipelinesFile): void {
  file.runs = file.runs.slice(-MAX_RUNS)
  mkdirSync(dirname(pipelinesPath()), { recursive: true })
  const tmp = `${pipelinesPath()}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2))
  renameSync(tmp, pipelinesPath())
}

export function listPipelineRuns(): Array<PipelineRun> {
  return loadRuns().runs.slice().reverse()
}

function upsertRun(run: PipelineRun): void {
  const file = loadRuns()
  const idx = file.runs.findIndex((r) => r.id === run.id)
  if (idx >= 0) file.runs[idx] = run
  else file.runs.push(run)
  saveRuns(file)
}

/** Validate and normalize raw stage input. Throws on structural problems. */
export function parsePipelineStages(raw: unknown): Array<PipelineStage> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('stages[] required')
  }
  if (raw.length > MAX_STAGES) {
    throw new Error(`Maximum ${MAX_STAGES} stages`)
  }
  return raw.map((stage, i) => {
    const s = stage as {
      label?: unknown
      assignments?: unknown
    }
    const assignmentsRaw = Array.isArray(s.assignments) ? s.assignments : []
    if (assignmentsRaw.length === 0 || assignmentsRaw.length > MAX_PARALLEL) {
      throw new Error(
        `Stage ${i + 1}: 1–${MAX_PARALLEL} assignments required`,
      )
    }
    const assignments = assignmentsRaw.map((a) => {
      const item = a as { workerId?: unknown; task?: unknown }
      const workerId =
        typeof item.workerId === 'string' ? item.workerId.trim() : ''
      const task = typeof item.task === 'string' ? item.task.trim() : ''
      if (!workerId || !task) {
        throw new Error(`Stage ${i + 1}: workerId and task required`)
      }
      return { workerId, task }
    })
    return {
      label:
        typeof s.label === 'string' && s.label.trim()
          ? s.label.trim().slice(0, 80)
          : `Stage ${i + 1}`,
      assignments,
    }
  })
}

/** Render upstream results as a context block for the next stage's tasks. */
export function renderStageContext(stage: PipelineStageResult): string {
  const lines = [`## Previous stage results (${stage.label})`]
  for (const r of stage.results) {
    lines.push(
      `- ${r.workerId} [${r.ok ? 'DONE' : 'FAILED'}]: ${r.summary.slice(0, 800)}`,
    )
  }
  return lines.join('\n')
}

export type StageDispatcher = (assignments: Array<PipelineAssignment>) => Promise<
  Array<{ workerId: string; ok: boolean; summary: string }>
>

/**
 * Run a pipeline. The dispatcher is injected so the route can pass the real
 * dispatch pipeline while tests pass a stub. Returns the finished run.
 */
export async function runPipeline(input: {
  title: string
  stages: Array<PipelineStage>
  dispatcher: StageDispatcher
}): Promise<PipelineRun> {
  const run: PipelineRun = {
    id: `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.slice(0, 160) || 'Pipeline',
    state: 'running',
    createdAt: Date.now(),
    finishedAt: null,
    stages: [],
  }
  upsertRun(run)

  let context = ''
  for (const stage of input.stages) {
    const stageResult: PipelineStageResult = {
      label: stage.label,
      startedAt: Date.now(),
      finishedAt: null,
      results: [],
    }
    run.stages.push(stageResult)
    upsertRun(run)

    const assignments = stage.assignments.map((a) => ({
      workerId: a.workerId,
      task: context ? `${a.task}\n\n${context}` : a.task,
    }))
    try {
      stageResult.results = await input.dispatcher(assignments)
    } catch (error) {
      stageResult.results = assignments.map((a) => ({
        workerId: a.workerId,
        ok: false,
        summary: error instanceof Error ? error.message : String(error),
      }))
    }
    stageResult.finishedAt = Date.now()

    if (!stageResult.results.some((r) => r.ok)) {
      run.state = 'failed'
      run.finishedAt = Date.now()
      upsertRun(run)
      return run
    }
    context = renderStageContext(stageResult)
    upsertRun(run)
  }

  run.state = 'completed'
  run.finishedAt = Date.now()
  upsertRun(run)
  return run
}
