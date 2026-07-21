import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(10_000)
const RefSchema = z.string().trim().min(1).max(2_048)
const TimestampSchema = z.string().datetime({ offset: true })

export const StrategicAdvisorResponseSchema = z.object({
  advisorId: IdSchema,
  status: z.enum(['answered', 'abstained', 'blocked', 'failed']),
  response: TextSchema.nullable(),
  dissent: z.boolean(),
  evidenceRefs: z.array(RefSchema).min(1).max(50),
}).strict().superRefine((response, context) => {
  if (response.status === 'answered' && response.response === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['response'], message: 'Answered advisor response requires preserved content.' })
  }
  if (response.status !== 'answered' && response.response !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['response'], message: `${response.status} advisor response must not fabricate answer content.` })
  }
  if (response.dissent && response.status !== 'answered') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dissent'], message: 'Only a preserved substantive answer may be marked as dissent.' })
  }
})

export const StrategicDecisionPayloadSchema = z.object({
  contractVersion: z.literal('strategic-decision-v1'),
  decisionId: IdSchema,
  question: TextSchema,
  expectedAdvisorIds: z.array(IdSchema).min(1).max(50),
  responses: z.array(StrategicAdvisorResponseSchema).min(1).max(50),
  juliusSynthesis: z.object({
    authorId: z.literal('julius'),
    summary: TextSchema,
    recommendation: TextSchema,
    dissentAdvisorIds: z.array(IdSchema).max(50),
    abstentionAdvisorIds: z.array(IdSchema).max(50),
  }).strict(),
  decisionState: z.enum(['awaiting_dlv', 'decided']),
  dlvDecision: z.object({
    deciderId: z.literal('DLV'),
    decision: TextSchema,
    decidedAt: TimestampSchema,
  }).strict().nullable(),
}).strict().superRefine((payload, context) => {
  if (new Set(payload.expectedAdvisorIds).size !== payload.expectedAdvisorIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedAdvisorIds'], message: 'Expected advisor IDs must be unique.' })
  }
  const responseIds = payload.responses.map((response) => response.advisorId)
  if (new Set(responseIds).size !== responseIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['responses'], message: 'Exactly one response record is allowed per advisor.' })
  }
  const expected = [...payload.expectedAdvisorIds].sort()
  const actual = [...responseIds].sort()
  if (expected.join('\n') !== actual.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['responses'], message: 'Responses must cover exactly every expected advisor.' })
  }
  const dissentIds = payload.responses.filter((response) => response.dissent).map((response) => response.advisorId).sort()
  const declaredDissentIds = [...payload.juliusSynthesis.dissentAdvisorIds].sort()
  if (dissentIds.join('\n') !== declaredDissentIds.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['juliusSynthesis', 'dissentAdvisorIds'], message: 'Julius synthesis must preserve every dissenting advisor ID exactly.' })
  }
  const abstentionIds = payload.responses.filter((response) => response.status === 'abstained').map((response) => response.advisorId).sort()
  const declaredAbstentionIds = [...payload.juliusSynthesis.abstentionAdvisorIds].sort()
  if (abstentionIds.join('\n') !== declaredAbstentionIds.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['juliusSynthesis', 'abstentionAdvisorIds'], message: 'Julius synthesis must preserve every abstention exactly.' })
  }
  if (payload.decisionState === 'awaiting_dlv' && payload.dlvDecision !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dlvDecision'], message: 'An awaiting_dlv Packet cannot contain a final decision.' })
  }
  if (payload.decisionState === 'decided' && payload.dlvDecision === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dlvDecision'], message: 'Only an explicit DLV decision may complete the Packet.' })
  }
})

export type StrategicAdvisorResponse = z.infer<typeof StrategicAdvisorResponseSchema>
export type StrategicDecisionPayload = z.infer<typeof StrategicDecisionPayloadSchema>
