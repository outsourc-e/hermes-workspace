import { z } from 'zod'

import {
  GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION,
  GoblinOpportunityV1InputSchema,
  GoblinOpportunityV1SourceSchema,
  goblinOpportunityV1ToWorkspacePacket,
} from '../../workspace-kernel/packets/adapters/goblin-opportunity-v1'
import type { GoblinOpportunityV1Input } from '../../workspace-kernel/packets/adapters/goblin-opportunity-v1'

export const GOBLIN_OPPORTUNITY_REQUEST_SCHEMA_VERSION = 'goblin-opportunity-request-v1' as const
export { GOBLIN_OPPORTUNITY_PACKET_SCHEMA_VERSION }

const boundedText = (max: number) => z.string().trim().min(1).max(max)

export const GoblinOpportunityRequestSchema = z.object({
  schemaVersion: z.literal(GOBLIN_OPPORTUNITY_REQUEST_SCHEMA_VERSION),
  requestId: boundedText(120),
  requestedAtMs: z.number().int().nonnegative(),
  query: boundedText(2_000),
  scope: z.enum(['shop', 'product', 'niche', 'mixed']),
  market: z.string().trim().max(240).optional(),
  constraints: z.array(boundedText(400)).max(20).default([]),
  sourceHints: z.array(z.string().trim().max(2_000)).max(20).default([]),
  maxCandidates: z.number().int().min(1).max(25).default(10),
}).strict()

// Compatibility aliases for one migration release. Shared Packet validation lives in
// workspace-kernel/packets/adapters/goblin-opportunity-v1.ts.
export const GoblinOpportunitySourceSchema = GoblinOpportunityV1SourceSchema
export const GoblinOpportunityPacketSchema = GoblinOpportunityV1InputSchema
export const adaptGoblinOpportunityPacketV1 = goblinOpportunityV1ToWorkspacePacket

export type GoblinOpportunityRequest = z.infer<typeof GoblinOpportunityRequestSchema>
export type GoblinOpportunityPacket = GoblinOpportunityV1Input
