/**
 * Conductor mission spawn — Hermes-backed.
 *
 * Spawns a one-shot Hermes job whose prompt is the orchestrator instructions.
 * The orchestrator session, when it runs, uses the create_task / delegate
 * tools to spawn worker agents. The Conductor UI then polls /api/sessions
 * + /api/history to track workers.
 *
 * Replaces the previous OCPlatform JSON-RPC implementation
 * (gatewayRpc('cron.add', ...)) which only worked when the OCPlatform
 * gateway was running on ws://127.0.0.1:18789.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import {
  HERMES_API,
  BEARER_TOKEN,
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'

let cachedSkill: string | null = null

type ConductorSpawnBody = {
  goal?: unknown
  orchestratorModel?: unknown
  workerModel?: unknown
  projectsDir?: unknown
  maxParallel?: unknown
  supervised?: unknown
}

// Resolve the workspace root from this module's location so we find the
// bundled skill regardless of where the server is launched from.
function repoRoot(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // src/routes/api -> repo root (../..)
    return resolve(here, '..', '..', '..')
  } catch {
    return process.cwd()
  }
}

function loadDispatchSkill(): string {
  if (cachedSkill !== null) return cachedSkill
  const candidates = [
    resolve(repoRoot(), 'skills/workspace-dispatch/SKILL.md'),
    resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
    resolve(process.env.HOME ?? '~', '.hermes/skills/workspace-dispatch/SKILL.md'),
    resolve(
      process.env.HOME ?? '~',
      '.ocplatform/workspace/skills/workspace-dispatch/SKILL.md',
    ),
  ]
  for (const p of candidates) {
    try {
      cachedSkill = readFileSync(p, 'utf-8')
      return cachedSkill
    } catch {
      continue
    }
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
    outputBase === '/tmp' ? '/tmp/dispatch-<slug>' : `${outputBase}/dispatch-<slug>`

  return [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill || '(workspace-dispatch skill not found locally; proceed using create_task to spawn workers)',
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

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function nowPlusSecondsIso(seconds: number): string {
  const t = new Date(Date.now() + seconds * 1000)
  // Hermes accepts ISO-8601 timestamps; strip milliseconds for cleanliness
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function createHermesJob(payload: {
  name: string
  schedule: string
  prompt: string
  deliver?: string
}): Promise<{ id?: string; name?: string; error?: string }> {
  const body = JSON.stringify({
    name: payload.name,
    schedule: payload.schedule,
    prompt: payload.prompt,
    deliver: payload.deliver ?? 'local',
  })
  const capabilities = await ensureGatewayProbed()
  const res = capabilities.dashboard.available
    ? await dashboardFetch('/api/cron/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    : await fetch(`${HERMES_API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body,
      })
  const text = await res.text()
  let data: { job?: { id?: string; name?: string }; error?: string } = {}
  try {
    data = JSON.parse(text)
  } catch {
    return { error: text || `HTTP ${res.status}` }
  }
  if (!res.ok || data.error) {
    return { error: data.error || `HTTP ${res.status}` }
  }
  return { id: data.job?.id, name: data.job?.name }
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
          const body = (await request
            .json()
            .catch(() => ({}))) as ConductorSpawnBody
          const goal = readOptionalString(body.goal)
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
          // Schedule a one-shot job ~5s in the future so the cron loop
          // picks it up promptly without racing with the create response.
          const result = await createHermesJob({
            name: jobName,
            schedule: nowPlusSecondsIso(5),
            prompt,
            deliver: 'local',
          })

          if (result.error) {
            return json(
              { ok: false, error: result.error },
              { status: 502 },
            )
          }

          // Hermes runs cron jobs in sessions keyed `cron_<jobId>_<timestamp>`.
          // We can't know the timestamp until the cron loop fires, so we return
          // a prefix and the UI polls for any session whose key starts with it.
          const jobId = result.id ?? jobName
          return json({
            ok: true,
            sessionKey: `cron_${jobId}_pending`,
            sessionKeyPrefix: `cron_${jobId}_`,
            jobId,
            jobName: result.name ?? jobName,
            runId: null,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
