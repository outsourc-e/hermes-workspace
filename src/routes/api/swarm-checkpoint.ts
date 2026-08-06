import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../server/auth-middleware'
import { getSwarmProfilePath } from '../../server/swarm-foundation'
import { isSwarmWorkerId } from '../../server/swarm-roster'
import { appendSwarmMemoryEvent } from '../../server/swarm-memory'
import { publishSwarmCheckpointNotification } from '../../server/swarm-notifications'
import { swarmMissionAssignmentAcceptsRuntimeMutation } from '../../server/swarm-missions'
import { mutateSwarmWorkerRuntime } from '../../server/swarm-runtime-reset'
import {
  parseSessionCardOperationBinding,
  resolveExactSessionCardOperationBinding,
} from '../../server/session-card-operation-binding'
import {
  checkpointFromRuntimeSnapshot,
  readRuntimeCheckpointSnapshot,
} from './swarm-dispatch'

type CheckpointRequest = {
  workerId?: unknown
  cardBinding?: unknown
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

type CheckpointCommit = {
  accepted: boolean
  checkpoint: Record<string, unknown>
  notification:
    | ReturnType<typeof publishSwarmCheckpointNotification>
    | { published: false; sessionKey: string }
}

const CheckpointBodySchema = z.object({
  workerId: z
    .string()
    .trim()
    .refine(
      isSwarmWorkerId,
      'worker id must look like swarm13 or a semantic profile id',
    ),
  state: z
    .enum([
      'idle',
      'executing',
      'thinking',
      'writing',
      'waiting',
      'blocked',
      'syncing',
      'reviewing',
      'offline',
    ])
    .optional(),
  phase: z.string().trim().max(200).nullable().optional(),
  currentTask: z.string().trim().max(16_000).nullable().optional(),
  lastSummary: z.string().trim().max(16_000).nullable().optional(),
  lastResult: z.string().trim().max(32_000).nullable().optional(),
  nextAction: z.string().trim().max(16_000).nullable().optional(),
  blockedReason: z.string().trim().max(16_000).nullable().optional(),
  checkpointStatus: z
    .enum(['none', 'in_progress', 'done', 'blocked', 'handoff', 'needs_input'])
    .optional(),
  needsHuman: z.boolean().optional(),
  tasks: z.array(z.unknown()).optional(),
  artifacts: z.array(z.unknown()).optional(),
  previews: z.array(z.unknown()).optional(),
})

const ALLOWED_STATES = new Set([
  'idle',
  'executing',
  'thinking',
  'writing',
  'waiting',
  'blocked',
  'syncing',
  'reviewing',
  'offline',
])
const ALLOWED_CHECKPOINTS = new Set([
  'none',
  'in_progress',
  'done',
  'blocked',
  'handoff',
  'needs_input',
])

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
          return json(
            { ok: false, error: 'Invalid JSON body' },
            { status: 400 },
          )
        }

        const parsed = CheckpointBodySchema.safeParse(body)
        if (!parsed.success) {
          return json(
            {
              ok: false,
              error: parsed.error.issues
                .map((issue) => issue.message)
                .join('; '),
            },
            { status: 400 },
          )
        }
        const input = parsed.data
        const workerId = input.workerId
        const cardBinding = parseSessionCardOperationBinding(body.cardBinding, {
          source: 'local',
          transport: 'tmux',
          canonicalSegmentKey: `local:${workerId}`,
        })
        if (!cardBinding) {
          return json(
            {
              ok: false,
              error: 'Valid Session Card checkpoint binding required',
            },
            { status: 400 },
          )
        }
        const bindingIsCurrent = async () =>
          Boolean(await resolveExactSessionCardOperationBinding(cardBinding))

        const patch: Record<string, unknown> = {
          workerId,
          lastCheckIn: new Date().toISOString(),
          lastOutputAt: Date.now(),
        }

        for (const key of [
          'state',
          'phase',
          'currentTask',
          'lastSummary',
          'lastResult',
          'nextAction',
          'blockedReason',
          'checkpointStatus',
          'needsHuman',
          'tasks',
          'artifacts',
          'previews',
        ] as const) {
          if (input[key] !== undefined) patch[key] = input[key]
        }

        const profilePath = getSwarmProfilePath(workerId)
        const expectedRuntime = readRuntimeCheckpointSnapshot(profilePath)
        if (!(await bindingIsCurrent())) {
          return json(
            {
              ok: false,
              error: 'Session Card ownership changed before checkpoint',
            },
            { status: 409 },
          )
        }
        const runtimePath = join(profilePath, 'runtime.json')
        if (!(await bindingIsCurrent())) {
          return json(
            {
              ok: false,
              error: 'Session Card ownership changed before checkpoint',
            },
            { status: 409 },
          )
        }
        const committed = mutateSwarmWorkerRuntime<CheckpointCommit>(
          profilePath,
          (current) => {
            const missionId =
              typeof current.currentMissionId === 'string'
                ? current.currentMissionId
                : null
            const assignmentId =
              typeof current.currentAssignmentId === 'string'
                ? current.currentAssignmentId
                : null
            const generationMatches =
              missionId === expectedRuntime.currentMissionId &&
              assignmentId === expectedRuntime.currentAssignmentId
            const missionAcceptsCheckpoint =
              !missionId && !assignmentId
                ? true
                : Boolean(
                    missionId &&
                    assignmentId &&
                    swarmMissionAssignmentAcceptsRuntimeMutation({
                      missionId,
                      assignmentId,
                      workerId,
                      binding: cardBinding,
                    }),
                  )
            if (
              current.acceptsCheckpoints === false ||
              !generationMatches ||
              !missionAcceptsCheckpoint
            ) {
              return {
                next: null,
                value: {
                  accepted: false as const,
                  checkpoint: current,
                  notification: { published: false, sessionKey: 'main' },
                },
              }
            }

            const next = { ...current, ...patch }
            const value: CheckpointCommit = {
              accepted: true as const,
              checkpoint: next,
              notification: {
                published: false,
                sessionKey:
                  typeof next.notifySessionKey === 'string'
                    ? next.notifySessionKey
                    : 'main',
              },
            }
            return {
              next,
              value,
              afterWrite: () => {
                // Reset uses this same lock, so no cancellation cleanup can land
                // between the commit and these attributed side effects.
                appendSwarmMemoryEvent({
                  workerId,
                  missionId,
                  assignmentId,
                  type:
                    input.checkpointStatus === 'blocked' ||
                    input.state === 'blocked'
                      ? 'blocked'
                      : 'checkpoint',
                  summary:
                    input.lastResult ??
                    input.lastSummary ??
                    input.currentTask ??
                    'Runtime checkpoint updated',
                  event: {
                    state: input.state ?? null,
                    phase: input.phase ?? null,
                    checkpointStatus: input.checkpointStatus ?? null,
                    nextAction: input.nextAction ?? null,
                    blockedReason: input.blockedReason ?? null,
                  },
                })

                const parsedCheckpoint = checkpointFromRuntimeSnapshot(
                  readRuntimeCheckpointSnapshot(profilePath),
                )
                if (parsedCheckpoint) {
                  value.notification = publishSwarmCheckpointNotification({
                    workerId,
                    missionId,
                    assignmentId,
                    checkpoint: parsedCheckpoint,
                    notifySessionKey:
                      typeof next.notifySessionKey === 'string'
                        ? next.notifySessionKey
                        : null,
                  })
                }
              },
            }
          },
        )

        if (!committed.accepted) {
          return json(
            {
              ok: false,
              retryable: false,
              error:
                'Checkpoint rejected because the runtime assignment is no longer active',
            },
            { status: 409 },
          )
        }

        return json({
          ok: true,
          workerId,
          runtimePath,
          checkpoint: committed.checkpoint,
          savedAt: Date.now(),
          notification: committed.notification,
        })
      },
    },
  },
})
