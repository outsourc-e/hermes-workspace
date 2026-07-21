import { describe, expect, it } from 'vitest'
import {
  RosterAvailabilityPayloadSchema,
  isRosterAvailabilityFresh,
} from './roster-availability'

export function validPayload() {
  return {
    contractVersion: 'roster-availability-v1' as const,
    executionPlanPacketId: 'packet-plan-roster-1',
    stepId: 'step-roster',
    routingDecisionId: 'routing-decision-1',
    observedAt: '2026-07-19T08:00:00.000Z',
    expiresAt: '2026-07-19T08:01:00.000Z',
    reporter: { roomId: 'pantheon-quarters', agentId: 'pantheon-roster' },
    profiles: [
      {
        profileId: 'kimi-code-worker',
        availability: 'available' as const,
        observedAt: '2026-07-19T08:00:00.000Z',
        provenanceRefs: ['runtime://workers/kimi-code-worker'],
      },
      {
        profileId: 'codex-ui-builder',
        availability: 'busy' as const,
        observedAt: '2026-07-19T08:00:00.000Z',
        provenanceRefs: ['runtime://workers/codex-ui-builder'],
      },
    ],
    assignmentAuthority: 'hermes' as const,
    reportsAvailabilityOnly: true as const,
  }
}

describe('RosterAvailabilityPayloadSchema', () => {
  it('accepts one short-TTL availability-only snapshot', () => {
    expect(RosterAvailabilityPayloadSchema.parse(validPayload())).toEqual(validPayload())
    expect(isRosterAvailabilityFresh(validPayload(), '2026-07-19T08:00:59.999Z')).toBe(true)
    expect(isRosterAvailabilityFresh(validPayload(), '2026-07-19T08:01:00.000Z')).toBe(false)
  })

  it('rejects TTL above 60 seconds and duplicate profiles', () => {
    const payload = validPayload()
    expect(RosterAvailabilityPayloadSchema.safeParse({
      ...payload,
      expiresAt: '2026-07-19T08:01:00.001Z',
    }).success).toBe(false)
    expect(RosterAvailabilityPayloadSchema.safeParse({
      ...payload,
      profiles: [payload.profiles[0], payload.profiles[0]],
    }).success).toBe(false)
    expect(RosterAvailabilityPayloadSchema.safeParse({
      ...payload,
      profiles: [{ ...payload.profiles[0], observedAt: '2026-07-19T07:59:59.999Z' }, payload.profiles[1]],
    }).success).toBe(false)
  })

  it('cannot select, assign, spawn or route a worker', () => {
    expect(RosterAvailabilityPayloadSchema.safeParse({
      ...validPayload(),
      selectedProfileId: 'kimi-code-worker',
      spawn: true,
    }).success).toBe(false)
  })
})
