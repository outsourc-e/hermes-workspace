import { describe, expect, it } from 'vitest'
import { PrintReadyPayloadSchema } from './print-ready'

const modelSha = 'b'.repeat(64)
const gcodeSha = 'c'.repeat(64)

const modelBinding = {
  modelId: 'piggo-lighthouse',
  modelVersion: 'v7',
  modelChecksum: modelSha,
}

const configurationBinding = {
  printerId: 'centauri-carbon-2-192-168-1-206',
  printerModel: 'Elegoo Centauri Carbon 2',
  material: 'PLA',
  nozzleDiameterMm: 0.4,
  machineProfileId: 'centauri-carbon-2-0.4',
  processProfileId: 'quality-0.16',
  filamentProfileId: 'pla-standard',
}

function passedGate(evidenceRef: string) {
  return {
    status: 'passed' as const,
    modelBinding,
    configurationBinding,
    evidenceRefs: [evidenceRef],
  }
}

export function validPayload() {
  return {
    contractVersion: 'print-ready-v1' as const,
    assetProductionPacketId: 'packet-asset-production-1',
    model: {
      ...modelBinding,
      artifactRef: 'file:///rescue/piggo-v7.3mf',
    },
    configuration: configurationBinding,
    modelQa: passedGate('qa://model/piggo-v7'),
    plateSlicerQa: passedGate('qa://plate/piggo-v7'),
    gcodeValidation: {
      ...passedGate('qa://gcode/piggo-v7'),
      gcodeRef: 'file:///rescue/piggo-v7.gcode',
      gcodeChecksum: gcodeSha,
    },
    liveActionsLocked: ['printer.upload', 'printer.start', 'printer.control'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

describe('PrintReadyPayloadSchema', () => {
  it('accepts exact model/configuration proof while keeping printer actions locked', () => {
    expect(PrintReadyPayloadSchema.parse(validPayload())).toEqual(validPayload())
    expect(PrintReadyPayloadSchema.safeParse({ ...validPayload(), startPrint: true }).success).toBe(false)
  })

  it.each([
    ['modelQa model revision', { modelQa: { ...validPayload().modelQa, modelBinding: { ...modelBinding, modelVersion: 'v6' } } }],
    ['plate printer', { plateSlicerQa: { ...validPayload().plateSlicerQa, configurationBinding: { ...configurationBinding, printerId: 'other-printer' } } }],
    ['gcode material', { gcodeValidation: { ...validPayload().gcodeValidation, configurationBinding: { ...configurationBinding, material: 'PETG' } } }],
    ['gcode nozzle', { gcodeValidation: { ...validPayload().gcodeValidation, configurationBinding: { ...configurationBinding, nozzleDiameterMm: 0.6 } } }],
  ])('rejects mismatched exact binding: %s', (_name, change) => {
    expect(PrintReadyPayloadSchema.safeParse({ ...validPayload(), ...change }).success).toBe(false)
  })

  it('derives blocked readiness from every pending or failed QA gate', () => {
    const payload = validPayload()
    const pending = {
      ...payload,
      plateSlicerQa: { ...payload.plateSlicerQa, status: 'pending' as const, evidenceRefs: [] },
      readiness: 'blocked' as const,
      hardBlocks: ['plateSlicerQa'],
    }
    expect(PrintReadyPayloadSchema.safeParse(pending).success).toBe(true)
    expect(PrintReadyPayloadSchema.safeParse({ ...pending, readiness: 'ready', hardBlocks: [] }).success).toBe(false)
  })

  it('requires all upload/start/control locks exactly once', () => {
    const payload = validPayload()
    expect(PrintReadyPayloadSchema.safeParse({
      ...payload,
      liveActionsLocked: ['printer.upload', 'printer.start'],
    }).success).toBe(false)
    expect(PrintReadyPayloadSchema.safeParse({
      ...payload,
      liveActionsLocked: [...payload.liveActionsLocked, 'printer.start'],
    }).success).toBe(false)
  })
})
