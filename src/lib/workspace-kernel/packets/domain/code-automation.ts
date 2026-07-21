import { z } from 'zod'

const IdSchema = z.string().trim().min(1).max(256)
const TextSchema = z.string().trim().min(1).max(10_000)
const RefSchema = z.string().trim().min(1).max(2_048)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

function isCanonicalRepositoryRelativePath(value: string) {
  if (
    value.startsWith('/')
    || value.includes('\\')
    || value.includes('%')
    || /^[A-Za-z]:/.test(value)
  ) return false

  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

const RelativePathSchema = z.string().trim().min(1).max(1_024).refine(
  isCanonicalRepositoryRelativePath,
  'CodeAutomation paths must be canonical repository-relative paths without encoding, empty segments, dot segments or traversal.',
)

export const CodeAutomationTestSchema = z.object({
  testId: IdSchema,
  command: z.string().trim().min(1).max(2_048),
  required: z.boolean(),
  status: z.enum(['passed', 'failed', 'not_run']),
  evidenceRefs: z.array(RefSchema).max(50),
}).strict().superRefine((test, context) => {
  if (test.status === 'passed' && test.evidenceRefs.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'Passed tests require evidence.' })
  }
})

function pathMatchesScope(path: string, scopePath: string) {
  return path === scopePath || path.startsWith(`${scopePath.replace(/\/$/, '')}/`)
}

export const CodeAutomationPayloadSchema = z.object({
  contractVersion: z.literal('code-automation-v1'),
  executionPlanPacketId: IdSchema,
  stepId: IdSchema,
  changeSetId: IdSchema,
  objective: TextSchema,
  scope: z.object({
    includedPaths: z.array(RelativePathSchema).min(1).max(500),
    excludedPaths: z.array(RelativePathSchema).max(500),
    changedPaths: z.array(RelativePathSchema).min(1).max(500),
  }).strict(),
  diff: z.object({
    artifactRef: RefSchema,
    checksum: Sha256Schema,
  }).strict(),
  tests: z.array(CodeAutomationTestSchema).min(1).max(100),
  checkpoint: z.object({
    manifestRef: RefSchema,
    manifestChecksum: Sha256Schema,
  }).strict(),
  rollback: z.object({
    procedure: TextSchema,
    evidenceRefs: z.array(RefSchema).min(1).max(50),
  }).strict(),
  liveActionsLocked: z.tuple([
    z.literal('git.commit'),
    z.literal('git.push'),
    z.literal('release.deploy'),
  ]),
  readiness: z.enum(['ready', 'blocked']),
  hardBlocks: z.array(z.string().trim().min(1).max(512)).max(100),
}).strict().superRefine((payload, context) => {
  const pathGroups = [payload.scope.includedPaths, payload.scope.excludedPaths, payload.scope.changedPaths]
  if (pathGroups.some((paths) => new Set(paths).size !== paths.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['scope'], message: 'CodeAutomation path lists must not contain duplicates.' })
  }
  payload.scope.changedPaths.forEach((changedPath, index) => {
    if (!payload.scope.includedPaths.some((includedPath) => pathMatchesScope(changedPath, includedPath))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scope', 'changedPaths', index], message: `Changed path is outside included scope: ${changedPath}.` })
    }
    if (payload.scope.excludedPaths.some((excludedPath) => pathMatchesScope(changedPath, excludedPath))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scope', 'changedPaths', index], message: `Changed path is explicitly excluded: ${changedPath}.` })
    }
  })
  const testIds = payload.tests.map((test) => test.testId)
  if (new Set(testIds).size !== testIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tests'], message: 'CodeAutomation test IDs must be unique.' })
  }
  const expectedBlocks = payload.tests
    .filter((test) => test.required && test.status !== 'passed')
    .map((test) => `tests.${test.testId}`)
    .sort()
  const declared = [...new Set(payload.hardBlocks)].sort()
  if (expectedBlocks.join('\n') !== declared.join('\n')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hardBlocks'], message: `hardBlocks must exactly match required test blockers: ${expectedBlocks.join(', ') || 'none'}.` })
  }
  const expectedReadiness = expectedBlocks.length === 0 ? 'ready' : 'blocked'
  if (payload.readiness !== expectedReadiness) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['readiness'], message: `CodeAutomation readiness must be ${expectedReadiness}.` })
  }
})

export type CodeAutomationPayload = z.infer<typeof CodeAutomationPayloadSchema>
