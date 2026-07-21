import { z } from 'zod'
import { WORKSPACE_PACKET_TYPES } from '../types'

const NonEmptyTextSchema = z.string().trim().min(1).max(4_096)
const IdSchema = z.string().trim().min(1).max(256)
const TextListSchema = z.array(NonEmptyTextSchema).max(500)

export const ExecutionPlanStepSchema = z.object({
  stepId: IdSchema,
  title: NonEmptyTextSchema,
  roomId: IdSchema,
  agentId: IdSchema.nullable(),
  dependsOnStepIds: z.array(IdSchema).max(500),
  mayRunInParallel: z.boolean(),
  inputPacketTypes: z.array(z.enum(WORKSPACE_PACKET_TYPES)).max(WORKSPACE_PACKET_TYPES.length),
  outputPacketType: z.enum(WORKSPACE_PACKET_TYPES),
  approvalGate: IdSchema.nullable(),
  acceptanceCriteriaIds: z.array(IdSchema).max(500),
}).strict()

export const ExecutionPlanPayloadSchema = z.object({
  objective: NonEmptyTextSchema,
  requestSummary: NonEmptyTextSchema,
  scope: z.object({
    included: TextListSchema,
    excluded: TextListSchema,
  }).strict(),
  constraints: TextListSchema,
  stopConditions: TextListSchema,
  retryPolicy: z.object({
    maxSafeRetriesPerStep: z.number().int().nonnegative().max(100),
    retryableFailureCodes: z.array(IdSchema).max(500),
  }).strict(),
  steps: z.array(ExecutionPlanStepSchema).min(1).max(500),
  planDiffFromPacketId: IdSchema.nullable(),
  planDiffSummary: TextListSchema,
}).strict().superRefine((plan, context) => {
  const included = new Set(plan.scope.included)
  plan.scope.excluded.forEach((item, index) => {
    if (included.has(item)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Scope item cannot be both included and excluded: ${item}`,
        path: ['scope', 'excluded', index],
      })
    }
  })

  const stepIds = new Set<string>()
  plan.steps.forEach((step, index) => {
    if (stepIds.has(step.stepId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate stepId: ${step.stepId}`,
        path: ['steps', index, 'stepId'],
      })
    }
    stepIds.add(step.stepId)
  })

  plan.steps.forEach((step, stepIndex) => {
    const dependencyIds = new Set<string>()
    step.dependsOnStepIds.forEach((dependencyId, dependencyIndex) => {
      if (dependencyIds.has(dependencyId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate dependency: ${dependencyId}`,
          path: ['steps', stepIndex, 'dependsOnStepIds', dependencyIndex],
        })
      }
      dependencyIds.add(dependencyId)
      if (dependencyId === step.stepId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step ${step.stepId} cannot depend on itself.`,
          path: ['steps', stepIndex, 'dependsOnStepIds', dependencyIndex],
        })
      } else if (!stepIds.has(dependencyId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing dependency: ${dependencyId}`,
          path: ['steps', stepIndex, 'dependsOnStepIds', dependencyIndex],
        })
      }
    })
  })

  const dependencies = new Map(plan.steps.map((step) => [step.stepId, step.dependsOnStepIds]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (stepId: string): boolean => {
    if (visiting.has(stepId)) return true
    if (visited.has(stepId)) return false
    visiting.add(stepId)
    for (const dependencyId of dependencies.get(stepId) ?? []) {
      if (dependencies.has(dependencyId) && visit(dependencyId)) return true
    }
    visiting.delete(stepId)
    visited.add(stepId)
    return false
  }
  for (const step of plan.steps) {
    if (visit(step.stepId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Execution plan dependency cycle detected.',
        path: ['steps'],
      })
      break
    }
  }

  if (plan.planDiffFromPacketId && plan.planDiffSummary.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A plan revision requires a visible diff summary.',
      path: ['planDiffSummary'],
    })
  }
  if (!plan.planDiffFromPacketId && plan.planDiffSummary.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A plan diff summary requires planDiffFromPacketId.',
      path: ['planDiffFromPacketId'],
    })
  }
})

export type ExecutionPlanStep = z.infer<typeof ExecutionPlanStepSchema>
export type ExecutionPlanPayload = z.infer<typeof ExecutionPlanPayloadSchema>
