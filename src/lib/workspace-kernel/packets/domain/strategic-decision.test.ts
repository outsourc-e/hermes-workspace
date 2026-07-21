import { describe, expect, it } from 'vitest'
import { StrategicDecisionPayloadSchema } from './strategic-decision'

export function validPayload() {
  return {
    contractVersion: 'strategic-decision-v1' as const,
    decisionId: 'decision-packet-persistence',
    question: 'Should Packet persistence begin in Milestone D?',
    expectedAdvisorIds: ['alexander', 'napoleon', 'saladin'],
    responses: [
      {
        advisorId: 'alexander',
        status: 'answered' as const,
        response: 'Wait for explicit Milestone D approval.',
        dissent: false,
        evidenceRefs: ['council://turn/alexander'],
      },
      {
        advisorId: 'napoleon',
        status: 'abstained' as const,
        response: null,
        dissent: false,
        evidenceRefs: ['council://turn/napoleon-abstention'],
      },
      {
        advisorId: 'saladin',
        status: 'answered' as const,
        response: 'Prepare the migration artifact now.',
        dissent: true,
        evidenceRefs: ['council://turn/saladin'],
      },
    ],
    juliusSynthesis: {
      authorId: 'julius' as const,
      summary: 'Two substantive views and one abstention were preserved.',
      recommendation: 'Wait for DLV approval before Milestone D.',
      dissentAdvisorIds: ['saladin'],
      abstentionAdvisorIds: ['napoleon'],
    },
    decisionState: 'awaiting_dlv' as const,
    dlvDecision: null,
  }
}

describe('StrategicDecisionPayloadSchema', () => {
  it('preserves every answer, abstention and dissent while Julius only synthesizes', () => {
    expect(StrategicDecisionPayloadSchema.parse(validPayload())).toEqual(validPayload())
    expect(StrategicDecisionPayloadSchema.safeParse({ ...validPayload(), finalDecisionByJulius: true }).success).toBe(false)
  })

  it('requires exactly one response record for every expected advisor', () => {
    const payload = validPayload()
    expect(StrategicDecisionPayloadSchema.safeParse({
      ...payload,
      responses: payload.responses.slice(0, 2),
    }).success).toBe(false)
    expect(StrategicDecisionPayloadSchema.safeParse({
      ...payload,
      responses: [...payload.responses, payload.responses[0]],
    }).success).toBe(false)
  })

  it('does not allow abstentions or dissent to disappear from Julius synthesis', () => {
    const payload = validPayload()
    expect(StrategicDecisionPayloadSchema.safeParse({
      ...payload,
      juliusSynthesis: { ...payload.juliusSynthesis, dissentAdvisorIds: [] },
    }).success).toBe(false)
    expect(StrategicDecisionPayloadSchema.safeParse({
      ...payload,
      responses: [{ ...payload.responses[0], status: 'abstained', response: 'fabricated answer' }, ...payload.responses.slice(1)],
    }).success).toBe(false)
  })

  it('allows only DLV to move the Packet from awaiting_dlv to decided', () => {
    const payload = validPayload()
    expect(StrategicDecisionPayloadSchema.safeParse({
      ...payload,
      decisionState: 'decided',
      dlvDecision: {
        deciderId: 'DLV',
        decision: 'Approve Milestone D.',
        decidedAt: '2026-07-19T09:00:00.000Z',
      },
    }).success).toBe(true)
    expect(StrategicDecisionPayloadSchema.safeParse({
      ...payload,
      decisionState: 'decided',
      dlvDecision: {
        deciderId: 'julius',
        decision: 'Approve Milestone D.',
        decidedAt: '2026-07-19T09:00:00.000Z',
      },
    }).success).toBe(false)
  })
})
