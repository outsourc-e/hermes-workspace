import { describe, expect, it } from 'vitest'
import { CodeAutomationPayloadSchema } from './code-automation'

export function validPayload() {
  return {
    contractVersion: 'code-automation-v1' as const,
    executionPlanPacketId: 'packet-plan-code-1',
    stepId: 'step-code-change',
    changeSetId: 'change-set-context-contract',
    objective: 'Implement one bounded Context contract.',
    scope: {
      includedPaths: ['src/lib/workspace-kernel/packets/domain/context.ts'],
      excludedPaths: ['src/lib/war-room/living-v3/living-v3-contract.ts'],
      changedPaths: ['src/lib/workspace-kernel/packets/domain/context.ts'],
    },
    diff: {
      artifactRef: 'file:///rescue/context-contract.patch',
      checksum: 'a'.repeat(64),
    },
    tests: [
      {
        testId: 'context-focused',
        command: 'pnpm vitest run src/lib/workspace-kernel/packets/domain/context.test.ts',
        required: true,
        status: 'passed' as const,
        evidenceRefs: ['file:///rescue/context-focused.log'],
      },
    ],
    checkpoint: {
      manifestRef: 'file:///rescue/pre-context/manifest.json',
      manifestChecksum: 'b'.repeat(64),
    },
    rollback: {
      procedure: 'Restore only the allowlisted Context files from the pre-task checkpoint.',
      evidenceRefs: ['file:///rescue/pre-context/manifest.json'],
    },
    liveActionsLocked: ['git.commit', 'git.push', 'release.deploy'],
    readiness: 'ready' as const,
    hardBlocks: [],
  }
}

describe('CodeAutomationPayloadSchema', () => {
  it('accepts exactly one Step and bounded change set with rollback proof', () => {
    expect(CodeAutomationPayloadSchema.parse(validPayload())).toEqual(validPayload())
    expect(CodeAutomationPayloadSchema.safeParse({ ...validPayload(), commitSha: 'abc123' }).success).toBe(false)
  })

  it('rejects changed paths outside included scope or inside excluded scope', () => {
    const payload = validPayload()
    expect(CodeAutomationPayloadSchema.safeParse({
      ...payload,
      scope: { ...payload.scope, changedPaths: ['src/other.ts'] },
    }).success).toBe(false)
    expect(CodeAutomationPayloadSchema.safeParse({
      ...payload,
      scope: { ...payload.scope, changedPaths: ['src/lib/war-room/living-v3/living-v3-contract.ts'] },
    }).success).toBe(false)
  })

  it.each([
    '%2e%2e/secret.ts',
    'src/%2Fprotected/file.ts',
    'src/lib/./context.ts',
    'src/lib//context.ts',
    'src/lib/../protected/context.ts',
    'src/lib/context.ts/',
    './src/lib/context.ts',
    'C:/src/lib/context.ts',
    'src\\lib\\context.ts',
  ])('rejects non-canonical repository path %s in every scope list', (invalidPath) => {
    const payload = validPayload()
    for (const field of ['includedPaths', 'excludedPaths', 'changedPaths'] as const) {
      expect(CodeAutomationPayloadSchema.safeParse({
        ...payload,
        scope: { ...payload.scope, [field]: [invalidPath] },
      }).success).toBe(false)
    }
  })

  it('rejects an excluded-scope bypass that would normalize into the protected tree', () => {
    const payload = validPayload()
    expect(CodeAutomationPayloadSchema.safeParse({
      ...payload,
      scope: {
        includedPaths: ['src'],
        excludedPaths: ['src/lib/war-room'],
        changedPaths: ['src/lib/safe/../war-room/living-v3/living-v3-contract.ts'],
      },
    }).success).toBe(false)
  })

  it('requires evidence for passed tests and derives blockers for required failures', () => {
    const payload = validPayload()
    expect(CodeAutomationPayloadSchema.safeParse({
      ...payload,
      tests: [{ ...payload.tests[0], evidenceRefs: [] }],
    }).success).toBe(false)
    expect(CodeAutomationPayloadSchema.safeParse({
      ...payload,
      tests: [{ ...payload.tests[0], status: 'failed' }],
      readiness: 'blocked',
      hardBlocks: ['tests.context-focused'],
    }).success).toBe(true)
  })

  it('requires commit, push and release to remain locked exactly once', () => {
    const payload = validPayload()
    expect(CodeAutomationPayloadSchema.safeParse({
      ...payload,
      liveActionsLocked: ['git.commit', 'git.push'],
    }).success).toBe(false)
  })
})
