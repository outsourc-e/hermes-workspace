/**
 * Standing goals: autonomous plan → pipeline → assess loop.
 *
 * The operator states a goal ("raise test coverage on the swarm modules").
 * Each step (driven by the lifecycle sweep) the engine either:
 *   - PLAN:    no pipeline yet → strategist produces a JSON pipeline plan →
 *              plan launches through the normal pipeline machinery
 *   - WAIT:    pipeline still running → do nothing
 *   - ASSESS:  pipeline finished → strategist judges goal completion from
 *              the stage results → done, or a new plan for the next iteration
 *
 * Bounded: maxIterations (default 5) pipelines per goal, one goal stepped
 * per sweep cycle, and the post-Clear-All dispatch pause is honored. Every
 * transition lands in the goal's notes for auditability.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { notifyPhone } from './notify'
import { enqueueAutopsy } from './swarm-selftune'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import {
  listPipelineRuns,
  parsePipelineStages,
  renderStageContext,
} from './swarm-pipeline'
import type { PipelineStage } from './swarm-pipeline'
import { automatedDispatchPausedUntil } from './swarm-runtime-reset'

export type SwarmGoal = {
  id: string
  goal: string
  state: 'active' | 'paused' | 'done' | 'failed'
  createdAt: number
  updatedAt: number
  iterations: number
  maxIterations: number
  currentPipelineId: string | null
  notes: Array<string>
}

export function goalsPath(): string {
  return (
    process.env.HERMES_SWARM_GOALS_PATH ||
    join(SWARM_CANONICAL_REPO, '.runtime', 'swarm-goals.json')
  )
}

type GoalsFile = { goals: Array<SwarmGoal> }

function loadGoals(): GoalsFile {
  try {
    if (existsSync(goalsPath())) {
      const parsed = JSON.parse(readFileSync(goalsPath(), 'utf8')) as GoalsFile
      if (Array.isArray(parsed.goals)) return parsed
    }
  } catch {
    /* corrupt — start fresh */
  }
  return { goals: [] }
}

function saveGoals(file: GoalsFile): void {
  file.goals = file.goals.slice(-100)
  mkdirSync(dirname(goalsPath()), { recursive: true })
  const tmp = `${goalsPath()}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2))
  renameSync(tmp, goalsPath())
}

function note(goal: SwarmGoal, text: string): void {
  goal.notes.push(`${new Date().toISOString()} ${text}`)
  goal.notes = goal.notes.slice(-40)
  goal.updatedAt = Date.now()
}

export function listGoals(): Array<SwarmGoal> {
  return loadGoals().goals.slice().reverse()
}

export function createGoal(input: {
  goal: string
  maxIterations?: number
}): SwarmGoal {
  const text = input.goal.trim().slice(0, 2000)
  if (!text) throw new Error('goal required')
  const goal: SwarmGoal = {
    id: `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    goal: text,
    state: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    iterations: 0,
    maxIterations: Math.max(1, Math.min(10, input.maxIterations ?? 5)),
    currentPipelineId: null,
    notes: [],
  }
  const file = loadGoals()
  file.goals.push(goal)
  saveGoals(file)
  return goal
}

export function updateGoalState(
  id: string,
  state: SwarmGoal['state'],
): SwarmGoal | null {
  const file = loadGoals()
  const goal = file.goals.find((g) => g.id === id)
  if (!goal) return null
  goal.state = state
  note(goal, `state → ${state} (operator)`)
  saveGoals(file)
  return goal
}

/** Extract the first JSON object from LLM output (fenced or bare). */
export function extractJson(text: string): unknown | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidates = [fenced?.[1], text]
  for (const candidate of candidates) {
    if (!candidate) continue
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) continue
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch {
      /* try next */
    }
  }
  return null
}

const WORKER_HINT =
  'Available workers: researcher (investigation), builder (code changes), maintainer (repo fixes), qa (testing), reviewer (verification), km-agent (docs/knowledge), security-auditor (security), ops-watch (infra checks).'

function planPrompt(goal: SwarmGoal, context: string): string {
  return [
    `You are the swarm strategist. Standing goal: "${goal.goal}"`,
    context ? `\n${context}\n` : '',
    `Iteration ${goal.iterations + 1} of ${goal.maxIterations}. Design the next pipeline to advance this goal.`,
    'IMPORTANT: You are the PLANNER. Do NOT perform the goal yourself, do NOT run',
    'commands, do NOT create or edit files. Your entire job is to output the plan.',
    WORKER_HINT,
    'Rules: 1-3 stages, 1-2 assignments per stage, each task concrete and self-contained',
    '(a worker sees only its task text). Workers doing git work must use an isolated',
    'worktree, never switch the live repo branch.',
    'Reply with ONLY a fenced JSON block, shape:',
    '```json',
    '{"stages":[{"label":"Investigate","assignments":[{"workerId":"researcher","task":"..."}]}]}',
    '```',
  ].join('\n')
}

function assessPrompt(goal: SwarmGoal, context: string): string {
  return [
    `You are the swarm strategist. Standing goal: "${goal.goal}"`,
    `A pipeline just finished. Results:\n${context}`,
    `Iterations used: ${goal.iterations} of ${goal.maxIterations}.`,
    'IMPORTANT: You are the ASSESSOR. Do NOT do any work yourself, do NOT run',
    'commands. Judge only from the results above.',
    'Judge honestly: is the goal achieved? Reply with ONLY a fenced JSON block:',
    '```json',
    '{"done": true, "summary": "one-line judgement"}',
    '```',
    'or, if not done and another iteration is worthwhile:',
    '```json',
    `{"done": false, "summary": "what's missing", "stages": [{"label": "...", "assignments": [{"workerId": "...", "task": "..."}]}]}`,
    '```',
  ].join('\n')
}

export type GoalDispatcher = (task: string) => Promise<string> // returns checkpoint/result text
export type PipelineStarter = (input: {
  title: string
  stages: Array<PipelineStage>
}) => Promise<string> // returns run id (may resolve before pipeline ends)

/**
 * Advance at most one active goal by one step. Returns a human-readable
 * description of what happened (for sweep logs).
 */
export async function stepGoals(deps: {
  dispatch: GoalDispatcher
  startPipeline: PipelineStarter
}): Promise<string> {
  if (automatedDispatchPausedUntil()) return 'paused'
  const file = loadGoals()
  const goal = file.goals.find((g) => g.state === 'active')
  if (!goal) return 'no active goals'

  // WAIT: pipeline in flight?
  if (goal.currentPipelineId) {
    const run = listPipelineRuns().find((r) => r.id === goal.currentPipelineId)
    if (!run) {
      note(goal, `pipeline ${goal.currentPipelineId} vanished — replanning`)
      goal.currentPipelineId = null
      saveGoals(file)
      return 'pipeline missing, will replan'
    }
    if (run.state === 'running') return `waiting on ${run.id}`

    // ASSESS
    const context = run.stages.map(renderStageContext).join('\n')
    goal.currentPipelineId = null
    note(goal, `pipeline ${run.id} finished (${run.state}) — assessing`)
    saveGoals(file)
    if (run.state === 'failed') {
      enqueueAutopsy({
        kind: 'pipeline',
        subject: `Goal pipeline ${run.id}: ${goal.goal.slice(0, 120)}`,
        context: context.slice(0, 2500),
      })
    }
    const reply = await deps.dispatch(assessPrompt(goal, context.slice(0, 6000)))
    const verdict = extractJson(reply) as {
      done?: boolean
      summary?: string
      stages?: unknown
    } | null
    const fresh = loadGoals()
    const g = fresh.goals.find((x) => x.id === goal.id)
    if (!g) return 'goal vanished'
    if (!verdict) {
      note(g, `assessment unparseable — retry next cycle. Reply head: ${reply.slice(0, 200).replace(/\n/g, ' ')}`)
      saveGoals(fresh)
      return 'assessment unparseable'
    }
    if (verdict.done) {
      g.state = 'done'
      note(g, `DONE: ${verdict.summary ?? ''}`)
      saveGoals(fresh)
      notifyPhone({
        title: 'Goal achieved',
        message: `${g.goal.slice(0, 100)}\n${verdict.summary ?? ''}`,
        priority: 4,
        tags: ['dart', 'white_check_mark'],
      })
      return `goal done: ${verdict.summary ?? ''}`
    }
    if (g.iterations >= g.maxIterations) {
      g.state = 'failed'
      note(g, `iteration cap hit — needs operator: ${verdict.summary ?? ''}`)
      saveGoals(fresh)
      notifyPhone({
        title: 'Goal needs you',
        message: `Iteration cap hit: ${g.goal.slice(0, 100)}\n${verdict.summary ?? ''}`,
        priority: 4,
        tags: ['dart', 'warning'],
      })
      enqueueAutopsy({
        kind: 'goal',
        subject: g.goal,
        context: g.notes.slice(-10).join('\n'),
      })
      return 'iteration cap hit'
    }
    if (verdict.stages) {
      try {
        const stages = parsePipelineStages(verdict.stages)
        const runId = await deps.startPipeline({
          title: `Goal: ${g.goal.slice(0, 100)} (iter ${g.iterations + 1})`,
          stages,
        })
        g.iterations += 1
        g.currentPipelineId = runId
        note(g, `iteration ${g.iterations} started: ${runId} — ${verdict.summary ?? ''}`)
        saveGoals(fresh)
        return `next iteration started: ${runId}`
      } catch (error) {
        note(g, `bad next plan: ${error instanceof Error ? error.message : String(error)}`)
        saveGoals(fresh)
        return 'bad next plan'
      }
    }
    note(g, `not done, no next plan given: ${verdict.summary ?? ''}`)
    saveGoals(fresh)
    return 'not done, no plan — retry next cycle'
  }

  // PLAN: first pipeline for this goal
  if (goal.iterations >= goal.maxIterations) {
    goal.state = 'failed'
    note(goal, 'iteration cap hit before completion')
    saveGoals(file)
    return 'iteration cap hit'
  }
  const reply = await deps.dispatch(planPrompt(goal, ''))
  const plan = extractJson(reply) as { stages?: unknown } | null
  const fresh = loadGoals()
  const g = fresh.goals.find((x) => x.id === goal.id)
  if (!g) return 'goal vanished'
  if (!plan?.stages) {
    note(g, `plan unparseable — retry next cycle. Reply head: ${reply.slice(0, 200).replace(/\n/g, ' ')}`)
    saveGoals(fresh)
    return 'plan unparseable'
  }
  try {
    const stages = parsePipelineStages(plan.stages)
    const runId = await deps.startPipeline({
      title: `Goal: ${g.goal.slice(0, 100)} (iter ${g.iterations + 1})`,
      stages,
    })
    g.iterations += 1
    g.currentPipelineId = runId
    note(g, `iteration ${g.iterations} started: ${runId}`)
    saveGoals(fresh)
    return `pipeline started: ${runId}`
  } catch (error) {
    note(g, `bad plan: ${error instanceof Error ? error.message : String(error)}`)
    saveGoals(fresh)
    return 'bad plan'
  }
}
