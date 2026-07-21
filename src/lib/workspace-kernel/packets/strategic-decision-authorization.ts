import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

import { canonicalizeWorkspacePacketContent, sha256Hex } from './canonical-json'
import { StrategicDecisionPayloadSchema } from './domain/strategic-decision'
import type { StrategicDecisionPayload } from './domain/strategic-decision'

export type DlvDecisionAuthorization = {
  contractVersion: 'dlv-decision-authorization-v1'
  decisionId: string
  awaitingPayloadHash: string
  finalDecisionHash: string
  operatorId: 'DLV'
  issuedAt: string
  expiresAt: string
  nonce: string
  signature: string
}

const FullIsoTimestampSchema = z.string().refine((value) => (
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value))
), 'Timestamp must be a full ISO timestamp.')

const DlvDecisionAuthorizationSchema = z.object({
  contractVersion: z.literal('dlv-decision-authorization-v1'),
  decisionId: z.string().trim().min(1).max(160),
  awaitingPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  finalDecisionHash: z.string().regex(/^[a-f0-9]{64}$/),
  operatorId: z.literal('DLV'),
  issuedAt: FullIsoTimestampSchema,
  expiresAt: FullIsoTimestampSchema,
  nonce: z.string().trim().min(8).max(256),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((authorization, context) => {
  if (Date.parse(authorization.expiresAt) <= Date.parse(authorization.issuedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'DLV authorization must expire after it is issued.' })
  }
  if (Date.parse(authorization.expiresAt) - Date.parse(authorization.issuedAt) > 5 * 60 * 1_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'DLV authorization cannot live longer than five minutes.' })
  }
})

function parseFullIsoTimestamp(value: string, label: string) {
  const parsed = FullIsoTimestampSchema.safeParse(value)
  if (!parsed.success) throw new Error(`${label} must be a full ISO timestamp.`)
  return parsed.data
}

export type IssueDlvDecisionAuthorizationInput = {
  authenticatedOperatorId: string
  decision: { decision: string; decidedAt: string }
  issuedAt: string
  expiresAt: string
  nonce: string
}

function assertServerSecret(serverSecret: string) {
  if (new TextEncoder().encode(serverSecret).length < 32) {
    throw new Error('DLV decision authorization requires a server secret of at least 32 bytes.')
  }
}

function authorizationContent(authorization: Omit<DlvDecisionAuthorization, 'signature'>) {
  return canonicalizeWorkspacePacketContent(authorization)
}

function signAuthorization(
  authorization: Omit<DlvDecisionAuthorization, 'signature'>,
  serverSecret: string,
) {
  return createHmac('sha256', serverSecret).update(authorizationContent(authorization)).digest('hex')
}

function sameSignature(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

export function issueDlvDecisionAuthorization(
  awaitingPayloadInput: unknown,
  input: IssueDlvDecisionAuthorizationInput,
  serverSecret: string,
): DlvDecisionAuthorization {
  assertServerSecret(serverSecret)
  const awaitingPayload = StrategicDecisionPayloadSchema.parse(awaitingPayloadInput)
  if (awaitingPayload.decisionState !== 'awaiting_dlv' || awaitingPayload.dlvDecision !== null) {
    throw new Error('DLV authorization can only be issued for an awaiting_dlv decision.')
  }
  if (input.authenticatedOperatorId !== 'DLV') throw new Error('Authenticated operator is not DLV.')
  const nonce = input.nonce.trim()
  if (nonce.length < 8) throw new Error('DLV authorization nonce must contain at least eight characters.')
  const issuedAt = parseFullIsoTimestamp(input.issuedAt, 'DLV authorization issuedAt')
  const expiresAt = parseFullIsoTimestamp(input.expiresAt, 'DLV authorization expiresAt')
  const lifetimeMs = Date.parse(expiresAt) - Date.parse(issuedAt)
  if (lifetimeMs <= 0) throw new Error('DLV authorization expiry must follow issue time.')
  if (lifetimeMs > 5 * 60 * 1_000) throw new Error('DLV authorization cannot live longer than five minutes.')
  const decisionText = input.decision.decision.trim()
  if (!decisionText) throw new Error('DLV final decision text is required.')
  const decidedAt = parseFullIsoTimestamp(input.decision.decidedAt, 'DLV decision decidedAt')
  const decidedAtMs = Date.parse(decidedAt)
  if (decidedAtMs < Date.parse(issuedAt) || decidedAtMs >= Date.parse(expiresAt)) {
    throw new Error('DLV decision timestamp is outside the authorization window.')
  }
  const content = {
    contractVersion: 'dlv-decision-authorization-v1' as const,
    decisionId: awaitingPayload.decisionId,
    awaitingPayloadHash: sha256Hex(canonicalizeWorkspacePacketContent(awaitingPayload)),
    finalDecisionHash: sha256Hex(canonicalizeWorkspacePacketContent({ decision: decisionText, decidedAt })),
    operatorId: 'DLV' as const,
    issuedAt,
    expiresAt,
    nonce,
  }
  return DlvDecisionAuthorizationSchema.parse({
    ...content,
    signature: signAuthorization(content, serverSecret),
  })
}

export function finalizeStrategicDecisionAsDlv(
  awaitingPayloadInput: unknown,
  decision: { decision: string; decidedAt: string },
  authorization: DlvDecisionAuthorization,
  serverSecret: string,
  now: string,
): StrategicDecisionPayload {
  assertServerSecret(serverSecret)
  const awaitingPayload = StrategicDecisionPayloadSchema.parse(awaitingPayloadInput)
  if (awaitingPayload.decisionState !== 'awaiting_dlv' || awaitingPayload.dlvDecision !== null) {
    throw new Error('Only an awaiting_dlv decision may be finalized.')
  }
  const parsedAuthorization = DlvDecisionAuthorizationSchema.parse(authorization)
  const nowValue = parseFullIsoTimestamp(now, 'DLV authorization verification time')
  const decidedAt = parseFullIsoTimestamp(decision.decidedAt, 'DLV decision decidedAt')
  const nowMs = Date.parse(nowValue)
  const issuedAtMs = Date.parse(parsedAuthorization.issuedAt)
  const expiresAtMs = Date.parse(parsedAuthorization.expiresAt)
  const decidedAtMs = Date.parse(decidedAt)
  if (nowMs < issuedAtMs || nowMs >= expiresAtMs) {
    throw new Error('DLV decision authorization is inactive or expired.')
  }
  if (decidedAtMs < issuedAtMs || decidedAtMs >= expiresAtMs || decidedAtMs > nowMs) {
    throw new Error('DLV decision timestamp is outside the active authorization window.')
  }
  const { signature, ...content } = parsedAuthorization
  const expectedSignature = signAuthorization(content, serverSecret)
  if (!sameSignature(signature, expectedSignature)) throw new Error('DLV decision authorization signature is invalid.')
  const decisionText = decision.decision.trim()
  if (!decisionText) throw new Error('DLV final decision text is required.')
  const expectedAwaitingHash = sha256Hex(canonicalizeWorkspacePacketContent(awaitingPayload))
  const expectedFinalDecisionHash = sha256Hex(canonicalizeWorkspacePacketContent({ decision: decisionText, decidedAt }))
  if (
    parsedAuthorization.decisionId !== awaitingPayload.decisionId
    || parsedAuthorization.awaitingPayloadHash !== expectedAwaitingHash
  ) {
    throw new Error('DLV decision authorization is not bound to this exact awaiting payload.')
  }
  if (parsedAuthorization.finalDecisionHash !== expectedFinalDecisionHash) {
    throw new Error('DLV decision authorization is not bound to this exact final decision.')
  }
  return StrategicDecisionPayloadSchema.parse({
    ...awaitingPayload,
    decisionState: 'decided',
    dlvDecision: {
      deciderId: 'DLV',
      decision: decisionText,
      decidedAt,
    },
  })
}
