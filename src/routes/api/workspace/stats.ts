import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  safeErrorMessage,
} from '../../../server/rate-limit'

const WORKSPACE_DAEMON_ORIGIN = 'http://127.0.0.1:3099'

type ProjectRecord = {
  id?: string
}

type TaskRecord = {
  status?: string | null
}

type MissionRecord = {
  tasks?: Array<TaskRecord> | null
}

type PhaseRecord = {
  missions?: Array<MissionRecord> | null
}

type ProjectDetailRecord = {
  phases?: Array<PhaseRecord> | null
}

type AgentRecord = {
  status?: string | null
}

type TaskRunRecord = {
  started_at?: string | null
  completed_at?: string | null
  cost_cents?: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function daemonJson(path: string): Promise<unknown> {
  const response = await fetch(new URL(`/api${path}`, WORKSPACE_DAEMON_ORIGIN), {
    headers: {
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const payload = parseJson(text)

  if (!response.ok) {
    const record = asRecord(payload)
    throw new Error(
      typeof record?.error === 'string'
        ? record.error
        : typeof record?.message === 'string'
          ? record.message
          : `Workspace daemon request failed with status ${response.status}`,
    )
  }

  return payload
}

function extractItems<T>(payload: unknown, key: string): Array<T> {
  if (Array.isArray(payload)) return payload as Array<T>
  const record = asRecord(payload)
  const direct = record?.[key]
  if (Array.isArray(direct)) return direct as Array<T>
  if (Array.isArray(record?.data)) return record.data as Array<T>
  if (Array.isArray(record?.items)) return record.items as Array<T>
  return []
}

function extractProjectIds(payload: unknown): string[] {
  return extractItems<ProjectRecord>(payload, 'projects')
    .map((project) => (typeof project?.id === 'string' ? project.id : null))
    .filter((id): id is string => Boolean(id))
}

function extractTasksFromProject(detail: unknown): Array<TaskRecord> {
  const project = asRecord(detail) as ProjectDetailRecord | null
  const phases = Array.isArray(project?.phases) ? project.phases : []
  return phases.flatMap((phase) =>
    (Array.isArray(phase?.missions) ? phase.missions : []).flatMap((mission) =>
      Array.isArray(mission?.tasks) ? mission.tasks : [],
    ),
  )
}

function normalizeTaskBucket(status: string | null | undefined): 'running' | 'queued' | 'paused' | null {
  const normalized = status?.trim().toLowerCase()
  if (!normalized) return null

  if (['running', 'in_progress', 'active'].includes(normalized)) return 'running'
  if (['pending', 'ready', 'queued', 'waiting'].includes(normalized)) return 'queued'
  if (['paused', 'blocked', 'on_hold', 'hold'].includes(normalized)) return 'paused'

  return null
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()
  return date.toDateString() === now.toDateString()
}

export const Route = createFileRoute('/api/workspace/stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`workspace-stats-get:${ip}`, 120, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const [projectsPayload, agentsPayload, checkpointsPayload, taskRunsPayload] =
            await Promise.all([
              daemonJson('/projects'),
              daemonJson('/agents'),
              daemonJson('/checkpoints?status=pending'),
              daemonJson('/task-runs'),
            ])

          const projectIds = extractProjectIds(projectsPayload)
          const agents = extractItems<AgentRecord>(agentsPayload, 'agents')
          const checkpoints = extractItems<Record<string, unknown>>(
            checkpointsPayload,
            'checkpoints',
          )
          const taskRuns = extractItems<TaskRunRecord>(taskRunsPayload, 'task_runs')

          const projectDetails = await Promise.all(
            projectIds.map((projectId) =>
              daemonJson(`/projects/${encodeURIComponent(projectId)}`),
            ),
          )

          let running = 0
          let queued = 0
          let paused = 0

          for (const detail of projectDetails) {
            for (const task of extractTasksFromProject(detail)) {
              const bucket = normalizeTaskBucket(task?.status)
              if (bucket === 'running') running += 1
              if (bucket === 'queued') queued += 1
              if (bucket === 'paused') paused += 1
            }
          }

          const agentsOnline = agents.filter(
            (agent) => (agent?.status ?? 'offline') !== 'offline',
          ).length
          const costToday = taskRuns.reduce((total, run) => {
            if (!isToday(run?.started_at ?? run?.completed_at)) return total
            return total + (typeof run?.cost_cents === 'number' ? run.cost_cents / 100 : 0)
          }, 0)

          return json({
            projects: projectIds.length,
            agentsOnline,
            agentsTotal: agents.length,
            running,
            queued,
            paused,
            checkpointsPending: checkpoints.length,
            policyAlerts: 0,
            costToday,
          })
        } catch (error) {
          return json(
            { ok: false, error: safeErrorMessage(error) },
            { status: 502 },
          )
        }
      },
    },
  },
})
