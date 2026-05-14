import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { z } from 'zod'
import { SWARM_CANONICAL_REPO } from './swarm-environment'

export const SWARM_ROSTER_PATH = join(SWARM_CANONICAL_REPO, 'swarm.yaml')

const WORKER_ID_PATTERN = /^(swarm\d+|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/i

export function isSwarmWorkerId(value: unknown): value is string {
  return typeof value === 'string' && WORKER_ID_PATTERN.test(value.trim())
}

const WorkerIdSchema = z
  .string()
  .trim()
  .regex(WORKER_ID_PATTERN, 'worker id must look like swarm13 or a semantic profile id')

export const SwarmRosterWorkerSchema = z.object({
  id: WorkerIdSchema,
  name: z.string().default(''),
  role: z.string().default('Worker'),
  specialty: z.string().default(''),
  model: z.string().default('Worker'),
  mission: z.string().default('Awaiting orchestrator dispatch.'),
  profile: WorkerIdSchema.optional(),
  modes: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([]),
  pluginToolsets: z.array(z.string()).default([]),
  mcpServers: z.array(z.string()).default([]),
  wrapper: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  defaultCwd: z.string().optional(),
  preferredTaskTypes: z.array(z.string()).default([]),
  greenlightRequiredFor: z.array(z.string()).default([]),
  maxConcurrentTasks: z.number().int().positive().default(1),
  acceptsBroadcast: z.boolean().default(true),
  reviewRequired: z.boolean().default(false),
})

export const SwarmRosterSchema = z.object({
  version: z.number().int().positive().default(1),
  workers: z.array(SwarmRosterWorkerSchema).default([]),
})

export type SwarmRosterWorker = z.infer<typeof SwarmRosterWorkerSchema>
export type SwarmRoster = z.infer<typeof SwarmRosterSchema>

export const SwarmRosterUpsertSchema = SwarmRosterWorkerSchema.extend({
  id: WorkerIdSchema,
})

export type SwarmRosterUpsert = z.infer<typeof SwarmRosterUpsertSchema>

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function defaultRoleFromId(id: string): string {
  const n = id.match(/(\d+)/)?.[1] ?? ''
  switch (n) {
    case '1':
    case '12':
      return 'PR / Issues'
    case '2':
      return 'Backend Foundation'
    case '3':
      return 'Main Session Mirror'
    case '4':
      return 'Research'
    case '5':
    case '10':
      return 'Builder'
    case '6':
    case '11':
      return 'Reviewer'
    case '7':
      return 'Docs'
    case '8':
      return 'Ops'
    case '9':
      return 'Hackathon'
    default:
      return 'Worker'
  }
}

export function fallbackRoster(ids: Array<string> = []): SwarmRoster {
  return {
    version: 1,
    workers: ids.map((id) => ({
      id,
      name: id.replace(/^swarm/i, 'Swarm'),
      role: defaultRoleFromId(id),
      specialty: '',
      model: 'Worker',
      mission: 'Awaiting orchestrator dispatch.',
      skills: [],
      capabilities: [],
      defaultCwd: undefined,
      preferredTaskTypes: [],
      maxConcurrentTasks: 1,
      acceptsBroadcast: true,
      reviewRequired: false,
    })),
  }
}

export function readSwarmRoster(ids: Array<string> = []): SwarmRoster {
  if (!existsSync(SWARM_ROSTER_PATH)) return fallbackRoster(ids)
  try {
    const raw = yaml.parse(readFileSync(SWARM_ROSTER_PATH, 'utf-8')) as unknown
    const parsed = SwarmRosterSchema.parse(raw)
    const byId = new Map(parsed.workers.map((worker) => [worker.id, worker]))
    for (const fallback of fallbackRoster(ids).workers) {
      if (!byId.has(fallback.id)) byId.set(fallback.id, fallback)
    }
    return { version: parsed.version, workers: [...byId.values()] }
  } catch {
    return fallbackRoster(ids)
  }
}

export function writeSwarmRoster(roster: SwarmRoster): void {
  const parsed = SwarmRosterSchema.parse(roster)
  const doc = yaml.stringify(parsed, { lineWidth: 0 })
  writeFileSync(SWARM_ROSTER_PATH, doc)
}

export function upsertSwarmRosterWorker(input: SwarmRosterUpsert, ids: Array<string> = []): SwarmRoster {
  const nextWorker = SwarmRosterUpsertSchema.parse(input)
  const current = readSwarmRoster(ids)
  const byId = new Map(current.workers.map((worker) => [worker.id, worker]))
  byId.set(nextWorker.id, nextWorker)
  const next: SwarmRoster = {
    version: current.version || 1,
    workers: [...byId.values()].sort((a, b) => {
      const na = parseInt(a.id.replace(/\D/g, ''), 10) || 0
      const nb = parseInt(b.id.replace(/\D/g, ''), 10) || 0
      return na - nb
    }),
  }
  writeSwarmRoster(next)
  return next
}

export function rosterByWorkerId(ids: Array<string> = []): Map<string, SwarmRosterWorker> {
  return new Map(readSwarmRoster(ids).workers.map((worker) => [worker.id, worker]))
}

export function resolveSwarmWorkerDisplayName(workerId: string, worker?: Pick<SwarmRosterWorker, 'name'> | null): string {
  return worker ? worker.name.trim() || titleCase(workerId) : titleCase(workerId)
}

export function formatSwarmWorkerLabel(
  workerId: string,
  worker?: Pick<SwarmRosterWorker, 'name' | 'role'> | null,
): string {
  const displayName = resolveSwarmWorkerDisplayName(workerId, worker)
  const role = worker ? worker.role.trim() || defaultRoleFromId(workerId) : defaultRoleFromId(workerId)
  return `${displayName} — ${role}`
}
