import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const RefSchema = z.string().trim().min(1).max(2_048)
const TimestampSchema = z.string().datetime({ offset: true })

export const ROSTER_AVAILABILITY_MAX_TTL_MS = 60_000

export const RosterAvailabilityProfileSchema = z.object({
  profileId: IdSchema,
  availability: z.enum(['available', 'busy', 'unavailable', 'unknown']),
  observedAt: TimestampSchema,
  provenanceRefs: z.array(RefSchema).min(1).max(50),
}).strict()

export const RosterAvailabilityPayloadSchema = z.object({
  contractVersion: z.literal('roster-availability-v1'),
  executionPlanPacketId: IdSchema,
  stepId: IdSchema,
  routingDecisionId: IdSchema,
  observedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  reporter: z.object({
    roomId: IdSchema,
    agentId: IdSchema,
  }).strict(),
  profiles: z.array(RosterAvailabilityProfileSchema).min(1).max(100),
  assignmentAuthority: z.literal('hermes'),
  reportsAvailabilityOnly: z.literal(true),
}).strict().superRefine((payload, context) => {
  const observedAtMs = Date.parse(payload.observedAt)
  const expiresAtMs = Date.parse(payload.expiresAt)
  const ttlMs = expiresAtMs - observedAtMs
  if (ttlMs <= 0 || ttlMs > ROSTER_AVAILABILITY_MAX_TTL_MS) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Roster availability TTL must be positive and no longer than 60 seconds.' })
  }
  const profileIds = payload.profiles.map((profile) => profile.profileId)
  if (new Set(profileIds).size !== profileIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Roster profile IDs must be unique.' })
  }
  payload.profiles.forEach((profile, index) => {
    const profileObservedAtMs = Date.parse(profile.observedAt)
    if (profileObservedAtMs > observedAtMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles', index, 'observedAt'], message: 'Profile observation cannot be later than the snapshot observation.' })
    }
    if (expiresAtMs - profileObservedAtMs > ROSTER_AVAILABILITY_MAX_TTL_MS) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles', index, 'observedAt'], message: 'Profile observation must remain no older than 60 seconds through snapshot expiry.' })
    }
  })
})

export type RosterAvailabilityPayload = z.infer<typeof RosterAvailabilityPayloadSchema>

export function isRosterAvailabilityFresh(payloadInput: unknown, now: string) {
  const payload = RosterAvailabilityPayloadSchema.parse(payloadInput)
  const nowMs = Date.parse(now)
  return Number.isFinite(nowMs)
    && nowMs >= Date.parse(payload.observedAt)
    && nowMs < Date.parse(payload.expiresAt)
}
