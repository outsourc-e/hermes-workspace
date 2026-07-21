import { z } from 'zod'
import { ExecutionPlanPayloadSchema } from './execution-plan'
import type { UniversalPacketEnvelope } from '../types'

const NonEmptyTextSchema = z.string().trim().min(1).max(4_096)
const IdSchema = z.string().trim().min(1).max(256)
const RefListSchema = z.array(NonEmptyTextSchema).max(1_000)

export const RUN_READBACK_FINAL_STATUSES = [
  'completed',
  'partially_completed',
  'blocked',
  'failed',
  'cancelled',
] as const

export const RUN_READBACK_STEP_OUTCOMES = [
  'accepted',
  'blocked',
  'rejected',
  'skipped',
  'failed',
] as const

export const RunReadbackStepSchema = z.object({
  stepId: IdSchema,
  required: z.boolean(),
  packetRefs: RefListSchema,
  ackRefs: RefListSchema,
  expectedOutput: NonEmptyTextSchema,
  actualOutputRefs: RefListSchema,
  outcome: z.enum(RUN_READBACK_STEP_OUTCOMES),
}).strict()

export const RunReadbackPayloadSchema = z.object({
  executionPlanPacketId: IdSchema,
  executionPlanRevision: z.number().int().positive(),
  finalStatus: z.enum(RUN_READBACK_FINAL_STATUSES),
  steps: z.array(RunReadbackStepSchema).min(1).max(500),
  approvalGrantRefs: RefListSchema,
  artifactRefs: RefListSchema,
  deliveryReadbackRefs: RefListSchema,
  rollbackRefs: RefListSchema,
  unresolvedItems: RefListSchema,
  nextActions: RefListSchema,
}).strict().superRefine((readback, context) => {
  const seen = new Set<string>()
  readback.steps.forEach((step, index) => {
    if (seen.has(step.stepId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate stepId: ${step.stepId}`,
        path: ['steps', index, 'stepId'],
      })
    }
    seen.add(step.stepId)
  })

  if (readback.finalStatus === 'completed') {
    const incompleteSteps = readback.steps.filter((step) => !step.required || step.outcome !== 'accepted')
    if (incompleteSteps.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A completed Run requires every planned Step to be required and accepted: ${incompleteSteps.map((step) => step.stepId).join(', ')}.`,
        path: ['finalStatus'],
      })
    }
    if (readback.unresolvedItems.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A completed Run cannot contain unresolved items.',
        path: ['unresolvedItems'],
      })
    }
    readback.steps.forEach((step, index) => {
      if (step.required && step.outcome === 'accepted'
        && (step.packetRefs.length === 0 || step.ackRefs.length === 0 || step.actualOutputRefs.length === 0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Completed required Step ${step.stepId} requires Packet, ACK and actual-output proof refs.`,
          path: ['steps', index],
        })
      }
    })
  }

  if (readback.finalStatus === 'partially_completed') {
    const hasAccepted = readback.steps.some((step) => step.outcome === 'accepted')
    const hasIncomplete = readback.steps.some((step) => step.outcome !== 'accepted')
    if (!hasAccepted || !hasIncomplete || readback.unresolvedItems.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Partial completion requires accepted and incomplete outcomes plus unresolved items.',
        path: ['finalStatus'],
      })
    }
  }
})

export type RunReadbackStep = z.infer<typeof RunReadbackStepSchema>
export type RunReadbackPayload = z.infer<typeof RunReadbackPayloadSchema>

export function validateRunReadbackAgainstExecutionPlan(
  readbackInput: unknown,
  planInput: unknown,
  options: { sideEffectStepIds?: Array<string> } = {},
): RunReadbackPayload {
  const readback = RunReadbackPayloadSchema.parse(readbackInput)
  const plan = ExecutionPlanPayloadSchema.parse(planInput)
  const planStepIds = new Set(plan.steps.map((step) => step.stepId))
  const readbackByStepId = new Map(readback.steps.map((step) => [step.stepId, step]))

  const missingPlanSteps = plan.steps.filter((step) => !readbackByStepId.has(step.stepId))
  if (missingPlanSteps.length > 0) {
    throw new Error(`Run readback is missing plan Step IDs: ${missingPlanSteps.map((step) => step.stepId).join(', ')}.`)
  }
  const unknownReadbackSteps = readback.steps.filter((step) => !planStepIds.has(step.stepId))
  if (unknownReadbackSteps.length > 0) {
    throw new Error(`Run readback contains unknown Step IDs: ${unknownReadbackSteps.map((step) => step.stepId).join(', ')}.`)
  }

  for (const stepId of options.sideEffectStepIds ?? []) {
    if (!planStepIds.has(stepId)) throw new Error(`Unknown side-effect Step ID: ${stepId}.`)
    const stepReadback = readbackByStepId.get(stepId)
    const confirmedRefs = stepReadback?.actualOutputRefs.filter((ref) => readback.deliveryReadbackRefs.includes(ref)) ?? []
    if (confirmedRefs.length === 0) {
      throw new Error(`Side-effect Step ${stepId} is missing confirmed delivery/action readback proof.`)
    }
  }

  return readback
}

export function assertSingleRunReadbackLineage(
  existingPackets: ReadonlyArray<UniversalPacketEnvelope>,
  candidate: UniversalPacketEnvelope,
) {
  if (candidate.packetType !== 'run-readback') throw new Error('Candidate must be a run-readback Packet.')
  const conflicting = existingPackets.find((packet) => (
    packet.packetType === 'run-readback'
    && packet.runId === candidate.runId
    && packet.packetLineageId !== candidate.packetLineageId
  ))
  if (conflicting) {
    throw new Error(`Run ${candidate.runId} already has RunReadback lineage ${conflicting.packetLineageId}.`)
  }
}
