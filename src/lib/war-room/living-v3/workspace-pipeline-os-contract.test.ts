import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_PIPELINE_OS_ACTIVE_SURFACES,
  WORKSPACE_PIPELINE_OS_REQUIRED_SECTIONS,
  WORKSPACE_PIPELINE_OS_SCHEMA_VERSION,
  workspacePipelineOsSectionsComplete,
  workspacePipelineSurfaceIds,
} from './workspace-pipeline-os-contract'

describe('workspace Pipeline OS contract', () => {
  it('defines the shared teachable pipeline schema', () => {
    expect(WORKSPACE_PIPELINE_OS_SCHEMA_VERSION).toBe('workspace-pipeline-os-v1')
    expect(WORKSPACE_PIPELINE_OS_REQUIRED_SECTIONS).toEqual([
      'activeArtifact',
      'steps',
      'inputMedia',
      'outputMedia',
      'filters',
      'actions',
      'locks',
      'readback',
    ])
  })

  it('covers every active room surface without preset count buttons or live side effects', () => {
    expect(workspacePipelineSurfaceIds()).toEqual([
      'etsy-product-prep',
      'terra-model-to-print',
      'oracle-product-signal',
      'atlantis-vault-pipeline',
      'gateway-external-action-gate',
      'council-decision-room',
    ])

    for (const surface of WORKSPACE_PIPELINE_OS_ACTIVE_SURFACES) {
      expect(workspacePipelineOsSectionsComplete(surface), surface.id).toBe(true)
      expect(surface.liveSideEffectsAllowed, surface.id).toBe(false)
      expect(surface.presetCountButtonsAllowed, surface.id).toBe(false)
      expect(surface.inputMedia.length, `${surface.id} inputs`).toBeGreaterThan(0)
      expect(surface.outputMedia.length, `${surface.id} outputs`).toBeGreaterThan(0)
      expect(surface.approvalLocks.length, `${surface.id} locks`).toBeGreaterThan(0)
    }
  })
})
