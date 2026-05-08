import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import { sanitizeConductorMissionGoal } from '../../server/conductor-mission-sanitize'

let cachedSkill: string | null = null

type ConductorSpawnBody = {
  goal?: unknown
  orchestratorModel?: unknown
  workerModel?: unknown
  projectsDir?: unknown
  maxParallel?: unknown
  supervised?: unknown
}

function repoRoot(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    return resolve(here, '..', '..', '..')
  } catch {
    return process.cwd()
  }
}

function loadDispatchSkill(): string {
  if (cachedSkill !== null) return cachedSkill
  const home = process.env.HOME ?? ''
  const candidates = [
    resolve(repoRoot(), 'skills/workspace-dispatch/SKILL.md'),
    resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
    ...(home
      ? [resolve(home, '.hermes/skills/workspace-dispatch/SKILL.md')]
      : []),
    ...(home
      ? [
          resolve(
            home,
            '.openclaw/workspace/skills/workspace-dispatch/SKILL.md',
          ),
        ]
      : []),
  ]
  for (const p of candidates) {
    try {
      cachedSkill = readFileSync(p, 'utf-8')
      return cachedSkill
    } catch {}
  }
  cachedSkill = ''
  return cachedSkill
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
  const outputPrefix =
    outputBase === '/tmp'
      ? '/tmp/dispatch-<slug>'
      : `${outputBase}/dispatch-<slug>`
  return [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill ||
      '(workspace-dispatch skill not found locally; proceed using create_task to spawn workers)',
    '',
    '## Mission',
    '',
    `Goal: ${goal}`,
    ...(options.orchestratorModel
      ? ['', `Use model: ${options.orchestratorModel} for the orchestrator`]
      : []),
    ...(options.workerModel
      ? ['', `Use model: ${options.workerModel} for all workers`]
      : []),
    ...(options.maxParallel > 1
      ? [
          '',
          `Run up to ${options.maxParallel} workers in parallel when tasks are independent`,
        ]
      : [
          '',
          'Spawn workers one at a time. Do NOT wait for workers to finish — the UI handles tracking.',
        ]),
    ...(options.supervised
      ? ['', 'Supervised mode is enabled. Require approval before each task.']
      : []),
    '',
    '## Critical Rules',
    '- Use create_task / delegate_task to create worker agents for each task',
    '- Do NOT do the work yourself — spawn workers',
    '- For simple tasks (single file, quick mockup), use ONLY 1 task with 1 worker — do not over-decompose',
    '- Do NOT ask for confirmation — start immediately',
    '- Label workers as "worker-<task-slug>" so the UI can track them',
    '- Each worker gets a self-contained prompt with the task + exit criteria',
    `- Workers should write output to ${outputPrefix} directories`,
    '- After spawning all workers, report your plan summary and finish. The UI tracks worker completion automatically.',
    '- Report a summary when all tasks are done',
  ].join('\n')
}

async function createDashboardConductorMission(payload: {
  name: string
  prompt: string
}): Promise<{
  id?: string
  name?: string
  sessionKey?: string
  error?: string
}> {
  const res = await dashboardFetch('/api/conductor/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: payload.name, prompt: payload.prompt }),
  })
  const text = await res.text()
  let data: {
    id?: string
    name?: string
    session_id?: string
    error?: string
    detail?: string
  } = {}
  try {
    data = JSON.parse(text)
  } catch {
    return { error: text || `HTTP ${res.status}` }
  }
  if (!res.ok || data.error || data.detail) {
    return { error: data.error || data.detail || `HTTP ${res.status}` }
  }
  return { id: data.id, name: data.name, sessionKey: data.session_id }
}

export const Route = createFileRoute('/api/conductor-spawn')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim()
        const requestedLines = Number(url.searchParams.get('lines') || '200')
        const lines = Number.isFinite(requestedLines)
          ? Math.min(2000, Math.max(1, requestedLines))
          : 200
        if (!missionId)
          return json(
            { ok: false, error: 'missionId required' },
            { status: 400 },
          )

        const capabilities = await ensureGatewayProbed()
        if (!capabilities.conductor) {
          return json(
            {
              ok: false,
              error:
                'Conductor dashboard mode is unavailable on this Hermes Agent build. Update Hermes Workspace to use portable mode for mission execution, or run a backend that exposes /api/conductor/missions.',
            },
            { status: 501 },
          )
        }

        const res = await dashboardFetch(
          `/api/conductor/missions/${encodeURIComponent(missionId)}?lines=${lines}`,
        )
        const text = await res.text()
        let mission: Record<string, unknown> = {}
        try {
          mission = JSON.parse(text) as Record<string, unknown>
        } catch {
          return json(
            { ok: false, error: text || `HTTP ${res.status}` },
            { status: res.ok ? 502 : res.status },
          )
        }
        if (!res.ok) {
          const error =
            typeof mission.detail === 'string'
              ? mission.detail
              : typeof mission.error === 'string'
                ? mission.error
                : `HTTP ${res.status}`
          return json({ ok: false, error }, { status: res.status })
        }
        return json({ ok: true, mission })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request))
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request
            .json()
            .catch(() => ({}))) as ConductorSpawnBody
          const rawGoal = readOptionalString(body.goal)
          const goalSanitization = sanitizeConductorMissionGoal(rawGoal)
          const goal = goalSanitization.goal
          const orchestratorModel = readOptionalString(body.orchestratorModel)
          const workerModel = readOptionalString(body.workerModel)
          const projectsDir = readOptionalString(body.projectsDir)
          const maxParallel = readMaxParallel(body.maxParallel)
          const supervised = body.supervised === true
          if (!goal)
            return json(
              {
                ok: false,
                error: goalSanitization.removedCloudflareErrorPage
                  ? 'mission goal only contained a Cloudflare 5xx HTML error page; enter the original mission goal and retry'
                  : 'goal required',
                warnings: goalSanitization.warnings,
              },
              { status: 400 },
            )

          const prompt = buildOrchestratorPrompt(goal, loadDispatchSkill(), {
            orchestratorModel,
            workerModel,
            projectsDir,
            maxParallel,
            supervised,
          })
          const missionName = `conductor-${Date.now()}`
          const capabilities = await ensureGatewayProbed()

          if (!capabilities.conductor) {
            return json({
              ok: true,
              mode: 'portable',
              prompt,
              missionId: null,
              sessionKey: missionName,
              sessionKeyPrefix: null,
              jobId: null,
              jobName: missionName,
              runId: null,
              warnings: goalSanitization.warnings,
            })
          }

          const result = await createDashboardConductorMission({
            name: missionName,
            prompt,
          })
          if (result.error)
            return json({ ok: false, error: result.error }, { status: 502 })
          const missionId = result.id ?? missionName
          return json({
            ok: true,
            mode: 'dashboard',
            prompt: null,
            missionId,
            sessionKey: result.sessionKey ?? null,
            sessionKeyPrefix: null,
            jobId: missionId,
            jobName: result.name ?? missionName,
            runId: null,
            warnings: goalSanitization.warnings,
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
