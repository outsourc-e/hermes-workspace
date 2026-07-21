import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const RefSchema = z.string().trim().min(1).max(2_048)
const RefListSchema = z.array(RefSchema).max(500)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const PrintModelBindingSchema = z.object({
  modelId: IdSchema,
  modelVersion: IdSchema,
  modelChecksum: Sha256Schema,
}).strict()

export const PrintConfigurationBindingSchema = z.object({
  printerId: IdSchema,
  printerModel: z.string().trim().min(1).max(512),
  material: z.string().trim().min(1).max(512),
  nozzleDiameterMm: z.number().finite().positive().max(5),
  machineProfileId: IdSchema,
  processProfileId: IdSchema,
  filamentProfileId: IdSchema,
}).strict()

const ValidationGateShape = {
  status: z.enum(['passed', 'failed', 'pending']),
  modelBinding: PrintModelBindingSchema,
  configurationBinding: PrintConfigurationBindingSchema,
  evidenceRefs: RefListSchema,
}

export const PrintValidationGateSchema = z.object(ValidationGateShape).strict().superRefine((gate, context) => {
  if (gate.status === 'passed' && gate.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'Passed print validation requires evidence.' })
  }
})

export const GcodeValidationSchema = z.object({
  ...ValidationGateShape,
  gcodeRef: RefSchema,
  gcodeChecksum: Sha256Schema,
}).strict().superRefine((gate, context) => {
  if (gate.status === 'passed' && gate.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'Passed G-code validation requires evidence.' })
  }
})

function bindingKey(value: unknown) {
  return JSON.stringify(value)
}

export const PrintReadyPayloadSchema = z.object({
  contractVersion: z.literal('print-ready-v1'),
  assetProductionPacketId: IdSchema,
  model: PrintModelBindingSchema.extend({ artifactRef: RefSchema }).strict(),
  configuration: PrintConfigurationBindingSchema,
  modelQa: PrintValidationGateSchema,
  plateSlicerQa: PrintValidationGateSchema,
  gcodeValidation: GcodeValidationSchema,
  liveActionsLocked: z.array(z.enum(['printer.upload', 'printer.start', 'printer.control'])).length(3),
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: z.array(z.string().trim().min(1).max(512)).max(100),
}).strict().superRefine((payload, context) => {
  const expectedModelBinding = {
    modelId: payload.model.modelId,
    modelVersion: payload.model.modelVersion,
    modelChecksum: payload.model.modelChecksum,
  }
  const gates = [
    ['modelQa', payload.modelQa],
    ['plateSlicerQa', payload.plateSlicerQa],
    ['gcodeValidation', payload.gcodeValidation],
  ] as const
  for (const [gateName, gate] of gates) {
    if (bindingKey(gate.modelBinding) !== bindingKey(expectedModelBinding)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [gateName, 'modelBinding'], message: `${gateName} must bind the exact model ID, version and checksum.` })
    }
    if (bindingKey(gate.configurationBinding) !== bindingKey(payload.configuration)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [gateName, 'configurationBinding'], message: `${gateName} must bind the exact printer, material, nozzle and profiles.` })
    }
  }
  if (new Set(payload.liveActionsLocked).size !== payload.liveActionsLocked.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['liveActionsLocked'], message: 'Printer locks must be unique.' })
  }

  const expectedBlocks = gates
    .filter(([, gate]) => gate.status !== 'passed')
    .map(([gateName]) => gateName)
    .sort()
  const declared = [...new Set(payload.hardBlocks)].sort()
  if (expectedBlocks.join('\n') !== declared.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hardBlocks'], message: `hardBlocks must exactly match derived print blockers: ${expectedBlocks.join(', ') || 'none'}.` })
  }
  const expectedReadiness = expectedBlocks.length === 0 ? 'ready' : 'blocked'
  if (payload.readiness !== expectedReadiness) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness'], message: `Print readiness must be ${expectedReadiness}.` })
  }
})

export type PrintModelBinding = z.infer<typeof PrintModelBindingSchema>
export type PrintConfigurationBinding = z.infer<typeof PrintConfigurationBindingSchema>
export type PrintReadyPayload = z.infer<typeof PrintReadyPayloadSchema>
