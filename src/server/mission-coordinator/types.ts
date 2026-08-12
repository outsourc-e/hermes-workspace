import { z } from 'zod'

export const NodeStateSchema = z.enum([
  'blocked_by_dependency',
  'ready',
  'leased',
  'dispatched',
  'running',
  'verifying',
  'review',
  'done',
  'blocked',
  'needs_input',
  'retry_wait',
  'failed',
  'cancelled',
])
export type NodeState = z.infer<typeof NodeStateSchema>

export const MissionNodeSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(500),
  role: z.string().trim().min(1).max(100),
  objective: z.string().trim().min(1).max(8000),
  dependsOn: z.array(z.string().trim().min(1).max(160)).default([]),
  locks: z.array(z.string().trim().min(1).max(500)).default([]),
  readOnly: z.boolean().default(false),
  state: NodeStateSchema.default('blocked_by_dependency'),
  hermesTaskId: z.string().trim().max(200).nullable().default(null),
  claimedAt: z.number().int().nullable().default(null),
  dispatchedAt: z.number().int().nullable().default(null),
  retries: z.number().int().min(0).default(0),
  evidence: z.object({
    runId: z.union([z.string(), z.number()]).nullable().default(null),
    runStatus: z.string().nullable().default(null),
    outcome: z.string().nullable().default(null),
    summary: z.string().nullable().default(null),
    checkpoint: z.string().nullable().default(null),
    verifiedAt: z.number().int().nullable().default(null),
  }).default({}),
})
export type MissionNode = z.infer<typeof MissionNodeSchema>

export const MissionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(500),
  version: z.number().int().positive().default(1),
  maxParallelism: z.number().int().positive().default(1),
  nodes: z.array(MissionNodeSchema).min(1).max(500),
})
export type Mission = z.infer<typeof MissionSchema>

export type PreflightResult = {
  missionId: string
  version: number
  valid: boolean
  errors: Array<string>
  ready: Array<string>
  waiting: Array<{ nodeId: string; dependsOn: Array<string> }>
  conflicts: Array<{ nodeId: string; locks: Array<string>; reason: string }>
}

export type Lease = {
  resource: string
  owner: string
  expiresAt: number
}
