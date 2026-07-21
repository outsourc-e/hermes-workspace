import { describe, expect, it } from 'vitest'

import { validStrategicDecisionPayloadFixture as validPayload } from './test-fixtures'
import {
  finalizeStrategicDecisionAsDlv,
  issueDlvDecisionAuthorization,
} from './strategic-decision-authorization'

const SERVER_SECRET = 'test-only-workspace-server-secret-32-bytes-minimum'
const FINAL_DECISION = {
  decision: 'Keep Milestone D blocked.',
  decidedAt: '2026-07-19T09:00:00.000Z',
}

function authorization(decision = FINAL_DECISION) {
  return issueDlvDecisionAuthorization(validPayload(), {
    authenticatedOperatorId: 'DLV',
    decision,
    issuedAt: '2026-07-19T08:59:00.000Z',
    expiresAt: '2026-07-19T09:01:00.000Z',
    nonce: 'nonce-decision-packet-persistence-1',
  }, SERVER_SECRET)
}

describe('DLV strategic-decision authorization', () => {
  it('finalizes only with a short-lived server signature bound to the exact awaiting payload', () => {
    const finalized = finalizeStrategicDecisionAsDlv(validPayload(), FINAL_DECISION, authorization(), SERVER_SECRET, '2026-07-19T09:00:00.000Z')
    expect(finalized).toMatchObject({
      decisionState: 'decided',
      dlvDecision: { deciderId: 'DLV', decision: 'Keep Milestone D blocked.' },
    })
  })

  it('rejects self-declared, expired, or payload-drifted DLV claims', () => {
    expect(() => issueDlvDecisionAuthorization(validPayload(), {
      authenticatedOperatorId: 'julius',
      decision: FINAL_DECISION,
      issuedAt: '2026-07-19T08:59:00.000Z',
      expiresAt: '2026-07-19T09:01:00.000Z',
      nonce: 'nonce-unauthorized',
    }, SERVER_SECRET)).toThrow(/not DLV/i)
    expect(() => finalizeStrategicDecisionAsDlv(validPayload(), {
      decision: 'Approve.', decidedAt: '2026-07-19T09:02:00.000Z',
    }, authorization(), SERVER_SECRET, '2026-07-19T09:02:00.000Z')).toThrow(/expired/i)
    expect(() => finalizeStrategicDecisionAsDlv({
      ...validPayload(),
      question: 'A changed question after authorization.',
    }, {
      decision: 'Approve.', decidedAt: '2026-07-19T09:00:00.000Z',
    }, authorization(), SERVER_SECRET, '2026-07-19T09:00:00.000Z')).toThrow(/exact awaiting payload/i)
    expect(() => finalizeStrategicDecisionAsDlv(validPayload(), {
      decision: 'Approve.', decidedAt: '2026-07-19T09:00:00.000Z',
    }, { ...authorization(), signature: '0'.repeat(64) }, SERVER_SECRET, '2026-07-19T09:00:00.000Z')).toThrow(/signature/i)
  })

  it('rejects reuse of an authorization for different final decision content', () => {
    expect(() => finalizeStrategicDecisionAsDlv(validPayload(), {
      decision: 'Approve Milestone D.',
      decidedAt: FINAL_DECISION.decidedAt,
    }, authorization(), SERVER_SECRET, FINAL_DECISION.decidedAt)).toThrow(/exact final decision/i)
  })

  it('rejects malformed, backwards, long-lived, or future decision timestamps', () => {
    for (const issuedAt of ['not-a-time', '2026-07-19']) {
      expect(() => issueDlvDecisionAuthorization(validPayload(), {
        authenticatedOperatorId: 'DLV',
        decision: FINAL_DECISION,
        issuedAt,
        expiresAt: '2026-07-19T09:01:00.000Z',
        nonce: 'nonce-invalid-time',
      }, SERVER_SECRET)).toThrow(/timestamp|issuedAt/i)
    }
    expect(() => issueDlvDecisionAuthorization(validPayload(), {
      authenticatedOperatorId: 'DLV',
      decision: FINAL_DECISION,
      issuedAt: '2026-07-19T09:02:00.000Z',
      expiresAt: '2026-07-19T09:01:00.000Z',
      nonce: 'nonce-backwards',
    }, SERVER_SECRET)).toThrow(/expiry|expire/i)
    expect(() => issueDlvDecisionAuthorization(validPayload(), {
      authenticatedOperatorId: 'DLV',
      decision: FINAL_DECISION,
      issuedAt: '2026-07-19T08:00:00.000Z',
      expiresAt: '2026-07-19T09:01:00.000Z',
      nonce: 'nonce-too-long',
    }, SERVER_SECRET)).toThrow(/five minutes/i)
    expect(() => finalizeStrategicDecisionAsDlv(validPayload(), {
      decision: 'Approve.', decidedAt: '2026-07-19T09:00:30.000Z',
    }, authorization(), SERVER_SECRET, '2026-07-19T09:00:00.000Z')).toThrow(/timestamp|window/i)
    expect(() => finalizeStrategicDecisionAsDlv(validPayload(), {
      decision: 'Approve.', decidedAt: 'not-a-time',
    }, authorization(), SERVER_SECRET, '2026-07-19T09:00:00.000Z')).toThrow(/timestamp|decidedAt/i)
  })
})
