import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

let cachedSkill: string | null = null

type ConductorSpawnBody = {
  goal?: unknown
  orchestratorModel?: unknown
  workerModel?: unknown
  projectsDir?: unknown
  maxParallel?: unknown
  supervised?: unknown
}

function loadDispatchSkill(): string {
  if (cachedSkill) return cachedSkill
  try {
    const candidates = [
      resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
      resolve(process.env.HOME ?? '~', '.openclaw/workspace/skills/workspace-dispatch/SKILL.md'),
    ]
    for (const p of candidates) {
      try {
        cachedSkill = readFileSync(p, 'utf-8')
        return cachedSkill
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return ''
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readMaxParallel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(5, Math.max(1, Math.round(value)))
}

function buildOrchestratorPrompt(
  goal: string,
  skill: string,
  options: {
    orchestratorModel: string
    workerModel: string
    projectsDir: string
    maxParallel: number
    supervised: boolean
  },
): string {
  const outputBase = options.projectsDir || '/tmp'
  const outputPrefix = outputBase === '/tmp' ? '/tmp/dispatch-<slug>' : `${outputBase}/dispatch-<slug>`

  return [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill,
    '',
    '## Mission',
    '',
    `Goal: ${goal}`,
    ...(options.orchestratorModel ? ['', `Use model: ${options.orchestratorModel} for the orchestrator`] : []),
    ...(options.workerModel ? ['', `Use model: ${options.workerModel} for all workers`] : []),
    ...(options.maxParallel > 1
      ? ['', `Run up to ${options.maxParallel} workers in parallel when tasks are independent`]
      : ['', 'Spawn workers one at a time. Do NOT wait for workers to finish — the UI handles tracking.']),
    ...(options.supervised ? ['', 'Supervised mode is enabled. Require approval before each task.'] : []),
    '',
    '## Critical Rules',
    '- Use sessions_spawn to create worker agents for each task',
    '- Do NOT do the work yourself — spawn workers',
    '- For simple tasks (single file, quick mockup), use ONLY 1 task with 1 worker — do not over-decompose',
    '- Do NOT ask for confirmation — start immediately',
    '- Label workers as "worker-<task-slug>" so the UI can track them',
    '- Each worker gets a self-contained prompt with the task + exit criteria',
    `- Workers should write output to ${outputPrefix} directories`,
    '- Do NOT use sessions_yield — it will hang in this session type. Instead, spawn workers and let them run independently.',
    '- After spawning all workers, report your plan summary and finish. The UI tracks worker completion automatically.',
    '- Report a summary when all tasks are done',
  ].join('\n')
}

async function cronRpcWithFallback<T>(params: unknown): Promise<T> {
  const methods = ['cron.add', 'cron.jobs.add', 'scheduler.jobs.add']
  let lastError: unknown = null
  for (const method of methods) {
    try {
      return await gatewayRpc<T>(method, params)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('cron add failed')
}

export const Route = createFileRoute('/api/conductor-spawn')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as ConductorSpawnBody
          const goal = typeof body.goal === 'string' ? body.goal.trim() : ''
          const orchestratorModel = readOptionalString(body.orchestratorModel)
          const workerModel = readOptionalString(body.workerModel)
          const projectsDir = readOptionalString(body.projectsDir)
          const maxParallel = readMaxParallel(body.maxParallel)
          const supervised = body.supervised === true

          if (!goal) {
            return json({ ok: false, error: 'goal required' }, { status: 400 })
          }

          const skill = loadDispatchSkill()
          const prompt = buildOrchestratorPrompt(goal, skill, {
            orchestratorModel,
            workerModel,
            projectsDir,
            maxParallel,
            supervised,
          })

          const jobName = `conductor-${Date.now()}`

          const addResult = await cronRpcWithFallback<{ ok?: boolean; jobId?: string; id?: string; error?: string }>({
            job: {
              name: jobName,
              schedule: { kind: 'at', at: new Date().toISOString() },
              payload: {
                kind: 'agentTurn',
                message: prompt,
                timeoutSeconds: 600,
                ...(orchestratorModel ? { model: orchestratorModel } : {}),
              },
              sessionTarget: 'isolated',
              enabled: true,
              deleteAfterRun: true,
            },
          })

          const jobId = addResult.jobId ?? addResult.id ?? jobName

          setTimeout(() => {
            const removeMethods = ['cron.remove', 'cron.jobs.remove', 'scheduler.jobs.remove']
            for (const method of removeMethods) {
              gatewayRpc(method, { jobId }).then(() => {}).catch(() => {})
            }
          }, 30_000)

          return json({
            ok: true,
            sessionKey: `cron:${jobName}`,
            jobId,
            runId: null,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
