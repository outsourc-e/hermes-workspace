import { z } from 'zod'
import type { AgentIntent } from './domain'

const IdSchema = z.string().trim().min(1).max(160)
const TextSchema = z.string().trim().min(1).max(2400)
const MetadataFields = {
  runId: IdSchema.optional(),
  correlationId: IdSchema.optional(),
  source: z.enum(['ui', 'hermes', 'dispatcher', 'test']).optional(),
}

export const AgentIntentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('say'),
    agentId: IdSchema,
    text: TextSchema,
    roomId: IdSchema.optional(),
    stationId: IdSchema.optional(),
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('move_to_room'),
    agentId: IdSchema,
    roomId: IdSchema,
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('move_to_station'),
    agentId: IdSchema,
    roomId: IdSchema,
    stationId: IdSchema,
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('work_at_station'),
    agentId: IdSchema,
    roomId: IdSchema,
    stationId: IdSchema,
    taskId: IdSchema.optional(),
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('carry_packet'),
    agentId: IdSchema,
    packetId: IdSchema,
    fromStationId: IdSchema,
    toStationId: IdSchema,
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('request_approval'),
    agentId: IdSchema,
    taskId: IdSchema,
    reason: TextSchema,
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('raise_alert'),
    agentId: IdSchema,
    severity: z.enum(['info', 'warning', 'blocked']),
    text: TextSchema,
    ...MetadataFields,
  }),
  z.object({
    type: z.literal('rest'),
    agentId: IdSchema,
    ...MetadataFields,
  }),
]) as z.ZodType<AgentIntent>

export const CreateTaskSchema = z.object({
  taskId: IdSchema.optional(),
  label: TextSchema,
  roomId: IdSchema,
  stationId: IdSchema.optional(),
  assignedAgentId: IdSchema.optional(),
  ...MetadataFields,
})

export const ApprovalEvidenceSchema = z.object({
  evidenceId: IdSchema,
  label: TextSchema,
  kind: z.enum(['note', 'file', 'url', 'snapshot', 'metric']),
  uri: z.string().trim().min(1).max(2048).optional(),
})

export const ApprovalRequestSchema = z.object({
  agentId: IdSchema,
  taskId: IdSchema.optional(),
  roomId: IdSchema.optional(),
  stationId: IdSchema.optional(),
  reason: TextSchema,
  evidence: z.array(ApprovalEvidenceSchema).default([]),
  riskLevel: z.enum(['low', 'medium', 'high', 'blocked']).default('medium'),
  requestedAction: TextSchema.optional(),
  allowedAction: TextSchema.optional(),
  lockedAction: TextSchema.optional(),
  operatorNote: TextSchema.optional(),
  ...MetadataFields,
})

export const ApprovalResolutionSchema = z.object({
  approvalId: IdSchema,
  status: z.enum(['approved', 'approved_local_only', 'rejected', 'blocked']),
  operatorNote: TextSchema.optional(),
  ...MetadataFields,
})
