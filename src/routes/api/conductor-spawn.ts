import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { dashboardFetch, ensureGatewayProbed } from '../../server/gateway-capabilities'
import { sanitizeConductorMissionGoal } from '../../server/conductor-mission-sanitize'
import { getSwarmMission, recordMissionCheckpoint  } from '../../server/swarm-missions'
import { getSwarmProfilePath } from '../../server/swarm-foundation'
import { readWorkerMessages } from '../../server/swarm-chat-reader'
import { newestCheckpointFromMessages } from '../../server/swarm-checkpoints'
import { checkpointFromRuntimeSnapshot, dispatchSwarmAssignments, readRuntimeCheckpointSnapshot, runtimeCheckpointSignature } from './swarm-dispatch'
import type { SwarmMission } from '../../server/swarm-missions'

let cachedSkill: string | null = null

export const NATIVE_CONDUCTOR_MODE_NOTE = 'Native-swarm is the official Workspace-native Swarm fallback when the dashboard Conductor API is unavailable.'

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
    ...(home ? [resolve(home, '.hermes/skills/workspace-dispatch/SKILL.md')] : []),
    ...(home ? [resolve(home, '.openclaw/workspace/skills/workspace-dispatch/SKILL.md')] : []),
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
  const outputPrefix = outputBase === '/tmp' ? '/tmp/dispatch-<slug>' : `${outputBase}/dispatch-<slug>`
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
    ...(options.orchestratorModel ? ['', `Use model: ${options.orchestratorModel} for the orchestrator`] : []),
    ...(options.workerModel ? ['', `Use model: ${options.workerModel} for all workers`] : []),
    ...(options.maxParallel > 1
      ? ['', `Run up to ${options.maxParallel} workers in parallel when tasks are independent`]
      : ['', 'Spawn workers one at a time. Do NOT wait for workers to finish — the UI handles tracking.']),
    ...(options.supervised ? ['', 'Supervised mode is enabled. Require approval before each task.'] : []),
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

async function createDashboardConductorMission(payload: { name: string; prompt: string }): Promise<{
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
  let data: { id?: string; name?: string; session_id?: string; error?: string; detail?: string } = {}
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

type NativeConductorAssignment = {
  workerId: string
  task: string
  rationale: string
  reviewRequired?: boolean
  direct?: boolean
  raw?: boolean
}

function clipText(value: string, max = 8000): string {
  return value.length <= max ? value : `${value.slice(0, max - 20)}\n...[truncated]`
}

export function buildNativeConductorAssignments(goal: string, options: { maxParallel: number; supervised: boolean }): Array<NativeConductorAssignment> {
  const maxParallel = Math.min(5, Math.max(1, options.maxParallel || 1))
  const normalizedGoal = goal.toLowerCase()
  const wantsOps = /production|ready|harden|audit|clean|fix|bug|test|build|release|deploy|operational|runtime|gateway|tmux|service|health/.test(normalizedGoal)
  const wantsDocs = /doc|handoff|readme|spec|plan|summary|knowledge|note/.test(normalizedGoal)
  const assignments: Array<NativeConductorAssignment> = []

  const pushUnique = (assignment: NativeConductorAssignment) => {
    if (!assignments.some((existing) => existing.workerId === assignment.workerId)) assignments.push(assignment)
  }

  pushUnique({
    workerId: wantsOps ? 'ops-watch' : 'builder',
    rationale: wantsOps ? 'Ops Watch owns runtime health, service quality, and production blockers.' : 'Builder owns scoped implementation and concrete progress.',
    reviewRequired: false,
    direct: true,
    task: [
      `Conductor mission: ${goal}`,
      '',
      wantsOps ? 'Lane: Ops Watch / runtime quality.' : 'Lane: Builder / primary implementation.',
      wantsOps
        ? 'Diagnose the runtime path, make the smallest safe operational improvement, and return proof. Avoid destructive changes unless explicitly approved.'
        : 'Find the smallest safe execution plan, make concrete progress, and produce a checkpoint. If code changes are required, keep them scoped and testable.',
      options.supervised ? 'Supervised mode: stop before destructive writes or commits and report the exact approval needed.' : 'Do not ask for confirmation unless blocked; start immediately.',
    ].join('\n'),
  })

  if (maxParallel >= 2) {
    pushUnique({
      workerId: wantsOps ? 'builder' : 'reviewer',
      rationale: wantsOps
        ? 'Builder executes implementation or patch work in parallel with runtime analysis.'
        : 'Reviewer provides the second-lane quality gate for implementation work.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        wantsOps ? 'Lane: Builder.' : 'Lane: Reviewer / quality gate.',
        wantsOps
          ? 'Implement or prototype the concrete fix/feature path. Avoid broad refactors. Report files changed, tests run, and remaining risks.'
          : 'Review the execution path and any changes. Look for regressions, missing tests, unsafe assumptions, and production-readiness gaps.',
        options.supervised ? 'Supervised mode: prepare patches but stop before destructive writes or commits if approval is needed.' : 'Proceed without asking unless blocked.',
      ].join('\n'),
    })
  }

  if (maxParallel >= 3) {
    pushUnique({
      workerId: wantsOps ? 'reviewer' : 'qa',
      rationale: wantsOps
        ? 'Reviewer independently checks correctness, regressions, and merge risk.'
        : 'QA validates user-visible behavior with focused smoke checks.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        wantsOps ? 'Lane: Reviewer / quality gate.' : 'Lane: QA.',
        wantsOps
          ? 'Review the implementation plan and any changes from Ops/Builder. Look for regressions, missing tests, unsafe assumptions, and production-readiness gaps. Do not make broad edits unless needed to unblock correctness.'
          : 'Run or design focused verification. Prefer targeted tests/build/smoke checks. Report exact commands and results. If tests are missing, identify the minimal regression coverage needed.',
      ].join('\n'),
    })
  }

  if (maxParallel >= 4) {
    pushUnique({
      workerId: wantsOps ? 'qa' : 'ops-watch',
      rationale: wantsOps
        ? 'QA validates behavior with targeted tests and smoke checks.'
        : 'Ops Watch checks runtime/service risks for implementation missions.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        wantsOps ? 'Lane: QA.' : 'Lane: Ops Watch / runtime quality.',
        wantsOps
          ? 'Run or design focused verification. Prefer targeted tests/build/smoke checks. Report exact commands and results. If tests are missing, identify the minimal regression coverage needed.'
          : 'Check runtime, service, deployment, and operational risk. Report only concrete blockers, verification gaps, and safe next actions.',
      ].join('\n'),
    })
  }

  if (maxParallel >= 5 || wantsDocs) {
    pushUnique({
      workerId: 'km-agent',
      rationale: 'KM Agent captures handoff, docs, and durable knowledge notes without leaking secrets.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        'Lane: KM Agent / handoff and knowledge hygiene.',
        'Create a concise handoff/status note: what changed, how to operate it, verification, caveats, and next actions. Do not expose secrets.',
        options.supervised ? 'Supervised mode: stop before destructive writes or commits and report the exact approval needed.' : 'Proceed without asking unless blocked.',
      ].join('\n'),
    })
  }

  const selected = assignments.slice(0, maxParallel)
  if (wantsDocs && !selected.some((assignment) => assignment.workerId === 'km-agent')) {
    selected[selected.length - 1] = {
      workerId: 'km-agent',
      rationale: 'KM Agent captures handoff, docs, and durable knowledge notes without leaking secrets.',
      reviewRequired: false,
      direct: true,
      task: [
        `Conductor mission: ${goal}`,
        '',
        'Lane: KM Agent / handoff and knowledge hygiene.',
        'Create a concise handoff/status note: what changed, how to operate it, verification, caveats, and next actions. Do not expose secrets.',
        options.supervised ? 'Supervised mode: stop before destructive writes or commits and report the exact approval needed.' : 'Proceed without asking unless blocked.',
      ].join('\n'),
    }
  }

  return selected
}

function swarmMissionStatus(mission: SwarmMission): string {
  if (mission.state === 'cancelled') return 'cancelled'
  if (mission.state === 'complete') return 'completed'
  if (mission.state === 'blocked') return 'failed'
  return 'running'
}

function nativeMissionLines(mission: SwarmMission, maxLines: number): Array<string> {
  const lines = [
    `Native Workspace Swarm mission: ${mission.title}`,
    `mission_id: ${mission.id}`,
    `state: ${mission.state}`,
    ...mission.assignments.map((assignment) => {
      const result = assignment.checkpoint?.result ? ` — ${assignment.checkpoint.result}` : ''
      const blocker = assignment.checkpoint?.blocker ? ` — blocker: ${assignment.checkpoint.blocker}` : ''
      return `${assignment.workerId} ${assignment.state}: ${assignment.task.slice(0, 160)}${result}${blocker}`
    }),
    ...mission.events.slice(-20).map((event) => `${new Date(event.at).toISOString()} ${event.type}: ${event.message}`),
  ]
  return lines.slice(-maxLines)
}

export function toNativeConductorMissionRecord(mission: SwarmMission, maxLines = 400) {
  return {
    id: mission.id,
    name: mission.title,
    status: swarmMissionStatus(mission),
    error: mission.state === 'blocked' ? 'Native Workspace Swarm mission blocked' : null,
    session_id: null,
    lines: nativeMissionLines(mission, maxLines),
    exit_code: mission.state === 'blocked' || mission.state === 'cancelled' ? 1 : mission.state === 'complete' ? 0 : null,
    nativeSwarm: true,
    modeOfficialOotb: true,
    modeNote: NATIVE_CONDUCTOR_MODE_NOTE,
    assignments: mission.assignments,
    updatedAt: mission.updatedAt,
  }
}

function createNativeConductorMission(input: {
  goal: string
  missionName: string
  maxParallel: number
  supervised: boolean
}) {
  const assignments = buildNativeConductorAssignments(input.goal, {
    maxParallel: input.maxParallel,
    supervised: input.supervised,
  })
  const missionTitle = `Conductor: ${clipText(input.goal, 120)}`
  void dispatchSwarmAssignments({
    assignments,
    missionId: input.missionName,
    missionTitle,
    allowAsync: true,
    waitForCheckpoint: false,
    timeoutSeconds: 600,
    checkpointPollSeconds: 10,
    notifySessionKey: 'main',
  }).catch((error) => {
    console.error('[conductor] native swarm dispatch failed:', error instanceof Error ? error.message : String(error))
  })
  return { missionId: input.missionName, missionTitle, assignments }
}

export const Route = createFileRoute('/api/conductor-spawn')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim()
        const requestedLines = Number(url.searchParams.get('lines') || '200')
        const lines = Number.isFinite(requestedLines) ? Math.min(2000, Math.max(1, requestedLines)) : 200
        if (!missionId) return json({ ok: false, error: 'missionId required' }, { status: 400 })

        const nativeMission = getSwarmMission(missionId)
        if (nativeMission) {
          // For active native missions, check worker runtime.json for fresh
          // checkpoints that haven't been written back to the mission store yet.
          // This bridges the gap between fire-and-forget dispatch (waitForCheckpoint=false)
          // and the conductor UI polling for live status.
          if (nativeMission.state === 'executing') {
            for (const assignment of nativeMission.assignments) {
              if (assignment.state === 'dispatched' && assignment.workerId) {
                try {
                  const profilePath = getSwarmProfilePath(assignment.workerId)
                  // Check runtime.json first
                  const snapshot = readRuntimeCheckpointSnapshot(profilePath)
                  let checkpoint = checkpointFromRuntimeSnapshot(snapshot)

                  // Also check the worker's chat SQLite DB for checkpoint messages
                  // (tmux workers write checkpoints there)
                  if (!checkpoint || checkpoint.stateLabel === 'IN_PROGRESS') {
                    const chat = readWorkerMessages(profilePath, 50)
                    if (chat.ok) {
                      const msgCheckpoint = newestCheckpointFromMessages(chat.messages)
                      if (msgCheckpoint && msgCheckpoint.raw !== snapshot.checkpointRaw) {
                        checkpoint = msgCheckpoint
                      }
                    }
                  }

                  if (checkpoint && (checkpoint.stateLabel === 'DONE' || checkpoint.stateLabel === 'BLOCKED' || checkpoint.stateLabel === 'HANDOFF' || checkpoint.stateLabel === 'NEEDS_INPUT')) {
                    recordMissionCheckpoint({
                      missionId: nativeMission.id,
                      assignmentId: assignment.id,
                      workerId: assignment.workerId,
                      checkpoint,
                      source: 'conductor-poll',
                    })
                  }
                } catch {
                  // runtime.json might not exist yet or be temporarily unreadable
                }
              }
            }
          }
          // Re-read the mission from the store so the response reflects any
          // checkpoints just synced via recordMissionCheckpoint above.
          const updatedNative = getSwarmMission(missionId) ?? nativeMission
          return json({ ok: true, mode: 'native-swarm', mission: toNativeConductorMissionRecord(updatedNative, lines) })
        }

        const capabilities = await ensureGatewayProbed()
        if (!capabilities.dashboard.available || !capabilities.conductor) {
          return json({ ok: false, error: 'Conductor mission not found in native swarm store and dashboard Conductor API is unavailable' }, { status: 404 })
        }

        const res = await dashboardFetch(`/api/conductor/missions/${encodeURIComponent(missionId)}?lines=${lines}`)
        const text = await res.text()
        let mission: Record<string, unknown> = {}
        try {
          mission = JSON.parse(text) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: text || `HTTP ${res.status}` }, { status: res.ok ? 502 : res.status })
        }
        if (!res.ok) {
          const error = typeof mission.detail === 'string' ? mission.detail : typeof mission.error === 'string' ? mission.error : `HTTP ${res.status}`
          return json({ ok: false, error }, { status: res.status })
        }
        return json({ ok: true, mission })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as ConductorSpawnBody
          const rawGoal = readOptionalString(body.goal)
          const goalSanitization = sanitizeConductorMissionGoal(rawGoal)
          const goal = goalSanitization.goal
          const orchestratorModel = readOptionalString(body.orchestratorModel)
          const workerModel = readOptionalString(body.workerModel)
          const projectsDir = readOptionalString(body.projectsDir)
          const maxParallel = readMaxParallel(body.maxParallel)
          const supervised = body.supervised === true
          if (!goal) {
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
          }

          const prompt = buildOrchestratorPrompt(goal, loadDispatchSkill(), {
            orchestratorModel,
            workerModel,
            projectsDir,
            maxParallel,
            supervised,
          })
          const missionName = `conductor-${Date.now()}`
          const capabilities = await ensureGatewayProbed()

          if (!capabilities.dashboard.available || !capabilities.conductor) {
            const native = createNativeConductorMission({
              goal,
              missionName,
              maxParallel,
              supervised,
            })
            return json({
              ok: true,
              mode: 'native-swarm',
              modeOfficialOotb: true,
              modeNote: NATIVE_CONDUCTOR_MODE_NOTE,
              prompt: null,
              missionId: native.missionId,
              sessionKey: null,
              sessionKeyPrefix: null,
              jobId: native.missionId,
              jobName: native.missionTitle,
              runId: null,
              warnings: goalSanitization.warnings,
              assignments: native.assignments,
              results: null,
            })
          }

          const result = await createDashboardConductorMission({ name: missionName, prompt })
          if (result.error) return json({ ok: false, error: result.error }, { status: 502 })
          const missionId = result.id ?? missionName
          return json({
            ok: true,
            mode: 'dashboard',
            prompt: null,
            missionId,
            sessionKey: result.sessionKey ?? null,
            sessionKeyPrefix: (result as Record<string, unknown>).sessionKeyPrefix ?? null,
            jobId: missionId,
            jobName: result.name ?? missionName,
            runId: null,
            warnings: goalSanitization.warnings,
          })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
        }
      },
    },
  },
})
