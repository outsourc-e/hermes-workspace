import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import { getSwarmProfilePath } from '../../server/swarm-foundation'
import { isSwarmWorkerId } from '../../server/swarm-roster'
import { appendSwarmMemoryEvent } from '../../server/swarm-memory'
import { checkpointFromRuntimeSnapshot, readRuntimeCheckpointSnapshot } from './swarm-dispatch'
import { publishSwarmCheckpointNotification } from '../../server/swarm-notifications'

type CheckpointRequest = {
  workerId?: unknown
  state?: unknown
  phase?: unknown
  currentTask?: unknown
  lastSummary?: unknown
  lastResult?: unknown
  nextAction?: unknown
  blockedReason?: unknown
  checkpointStatus?: unknown
  needsHuman?: unknown
  tasks?: unknown
  artifacts?: unknown
  previews?: unknown
}

const CheckpointBodySchema = z.object({
  workerId: z.string().trim().refine(isSwarmWorkerId, 'worker id must look like swarm13 or a semantic profile id'),
  state: z.enum(['idle', 'executing', 'thinking', 'writing', 'waiting', 'blocked', 'syncing', 'reviewing', 'offline']).optional(),
  phase: z.string().trim().max(200).nullable().optional(),
  currentTask: z.string().trim().max(16_000).nullable().optional(),
  lastSummary: z.string().trim().max(16_000).nullable().optional(),
  lastResult: z.string().trim().max(32_000).nullable().optional(),
  nextAction: z.string().trim().max(16_000).nullable().optional(),
  blockedReason: z.string().trim().max(16_000).nullable().optional(),
  checkpointStatus: z.enum(['none', 'in_progress', 'done', 'blocked', 'handoff', 'needs_input']).optional(),
  needsHuman: z.boolean().optional(),
  tasks: z.array(z.unknown()).optional(),
  artifacts: z.array(z.unknown()).optional(),
  previews: z.array(z.unknown()).optional(),
})

const ALLOWED_STATES = new Set(['idle', 'executing', 'thinking', 'writing', 'waiting', 'blocked', 'syncing', 'reviewing', 'offline'])
const ALLOWED_CHECKPOINTS = new Set(['none', 'in_progress', 'done', 'blocked', 'handoff', 'needs_input'])

function validateWorkerId(value: string): boolean {
  return isSwarmWorkerId(value)
}

function cleanString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed.slice(0, 16_000) : null
}

function cleanArray(value: unknown): Array<unknown> | undefined {
  return Array.isArray(value) ? value : undefined
}

function readCurrent(runtimePath: string): Record<string, unknown> {
  if (!existsSync(runtimePath)) return {}
  try {
    return JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeJsonAtomic(path: string, value: Record<string, unknown>): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  renameSync(tmp, path)
}

export const Route = createFileRoute('/api/swarm-checkpoint')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        let body: CheckpointRequest
        try {
          body = (await request.json()) as CheckpointRequest
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = CheckpointBodySchema.safeParse(body)
        if (!parsed.success) {
          return json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') }, { status: 400 })
        }
        const input = parsed.data
        const workerId = input.workerId

        const patch: Record<string, unknown> = {
          workerId,
          lastCheckIn: new Date().toISOString(),
          lastOutputAt: Date.now(),
        }

        for (const key of ['state', 'phase', 'currentTask', 'lastSummary', 'lastResult', 'nextAction', 'blockedReason', 'checkpointStatus', 'needsHuman', 'tasks', 'artifacts', 'previews'] as const) {
          if (input[key] !== undefined) patch[key] = input[key]
        }

        const profilePath = getSwarmProfilePath(workerId)
        mkdirSync(profilePath, { recursive: true })
        const runtimePath = join(profilePath, 'runtime.json')
        const current = readCurrent(runtimePath)
        const next = { ...current, ...patch }
        writeJsonAtomic(runtimePath, next)

        const missionId = typeof next.currentMissionId === 'string' ? next.currentMissionId : null
        const assignmentId = typeof next.currentAssignmentId === 'string' ? next.currentAssignmentId : null
        appendSwarmMemoryEvent({
          workerId,
          missionId,
          assignmentId,
          type: input.checkpointStatus === 'blocked' || input.state === 'blocked' ? 'blocked' : 'checkpoint',
          summary: input.lastResult ?? input.lastSummary ?? input.currentTask ?? 'Runtime checkpoint updated',
          event: {
            state: input.state ?? null,
            phase: input.phase ?? null,
            checkpointStatus: input.checkpointStatus ?? null,
            nextAction: input.nextAction ?? null,
            blockedReason: input.blockedReason ?? null,
          },
        })

        const runtimeSnapshot = readRuntimeCheckpointSnapshot(profilePath)
        const parsedCheckpoint = checkpointFromRuntimeSnapshot(runtimeSnapshot)
        const notification = parsedCheckpoint
          ? publishSwarmCheckpointNotification({
              workerId,
              missionId,
              assignmentId,
              checkpoint: parsedCheckpoint,
              notifySessionKey: typeof next.notifySessionKey === 'string' ? next.notifySessionKey : null,
            })
          : { published: false, sessionKey: typeof next.notifySessionKey === 'string' ? next.notifySessionKey : 'main' }

        return json({ ok: true, workerId, runtimePath, checkpoint: next, savedAt: Date.now(), notification })
      },
    },
  },
})
