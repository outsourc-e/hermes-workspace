import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { writeFileAtomicWithBackup } from './hermes-config-store'
import { getStateDir } from './workspace-state-dir'
import type { SubscriptionCatalog } from './subscription-model-catalog'

const ModelRef = z.string().trim().max(300)
const NamedWorkerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  modelRef: ModelRef,
  role: z.enum(['leaf', 'orchestrator']).default('leaf'),
  description: z.string().trim().max(500).default(''),
})

const PolicySchema = z.object({
  orchestratorModelRef: ModelRef.default(''),
  defaultSubagentModelRef: ModelRef.default(''),
  routingMode: z.enum(['explicit', 'automatic', 'hybrid']).default('explicit'),
  limits: z.object({
    preset: z
      .enum(['conservative', 'balanced', 'high_parallelism', 'custom'])
      .default('balanced'),
    maxConcurrentChildren: z.number().int().min(1).max(64).default(3),
    maxConcurrentPerAccount: z.number().int().min(1).max(16).default(1),
    maxSpawnDepth: z.number().int().min(1).max(12).default(2),
    maxTotalAgents: z.number().int().min(1).max(256).default(8),
  }),
  quota: z.object({
    interactive: z
      .enum([
        'offer_alternative',
        'subscription_fallback',
        'stop_notify',
        'wait_reset',
      ])
      .default('offer_alternative'),
    unattended: z
      .enum(['subscription_fallback', 'stop_notify', 'wait_reset'])
      .default('subscription_fallback'),
    fallbackModelRefs: z.array(ModelRef).max(32).default([]),
  }),
  billing: z.object({
    allowApiBilledModels: z.boolean().default(false),
    showNousModels: z.boolean().default(false),
  }),
  memory: z.object({
    childAccess: z
      .enum(['shared_read_write', 'shared_read_only', 'context_only'])
      .default('shared_read_write'),
    childWriteReview: z
      .enum(['parent_queue', 'normal_policy', 'automatic'])
      .default('parent_queue'),
  }),
  context: z.object({
    preferred: z
      .enum(['full', 'summary_recent', 'focused', 'explicit_only'])
      .default('full'),
    overflow: z
      .enum([
        'auto_compact_notify',
        'ask',
        'larger_model',
        'recent_window',
        'cancel',
      ])
      .default('auto_compact_notify'),
    recentMessages: z.number().int().min(1).max(1000).default(24),
    maxInputPercent: z.number().int().min(30).max(90).default(75),
  }),
  namedWorkers: z.array(NamedWorkerSchema).max(64).default([]),
})

export type OrchestrationPolicy = z.infer<typeof PolicySchema>
export type OrchestrationPolicyPatch = Partial<{
  [K in keyof OrchestrationPolicy]: OrchestrationPolicy[K] extends Array<unknown>
    ? OrchestrationPolicy[K]
    : OrchestrationPolicy[K] extends object
      ? Partial<OrchestrationPolicy[K]>
      : OrchestrationPolicy[K]
}>

export interface OrchestrationPolicySaveOptions {
  confirmApiBilling?: boolean
  catalog?: SubscriptionCatalog
}

export const DEFAULT_ORCHESTRATION_POLICY: OrchestrationPolicy =
  PolicySchema.parse({
    orchestratorModelRef: '',
    defaultSubagentModelRef: '',
    routingMode: 'explicit',
    limits: {
      preset: 'balanced',
      maxConcurrentChildren: 3,
      maxConcurrentPerAccount: 1,
      maxSpawnDepth: 2,
      maxTotalAgents: 8,
    },
    quota: {
      interactive: 'offer_alternative',
      unattended: 'subscription_fallback',
      fallbackModelRefs: [],
    },
    billing: { allowApiBilledModels: false, showNousModels: false },
    memory: {
      childAccess: 'shared_read_write',
      childWriteReview: 'parent_queue',
    },
    context: {
      preferred: 'full',
      overflow: 'auto_compact_notify',
      recentMessages: 24,
      maxInputPercent: 75,
    },
    namedWorkers: [],
  })

function modelAssignments(
  policy: OrchestrationPolicy,
): Array<{ path: string; ref: string }> {
  return [
    { path: 'orchestratorModelRef', ref: policy.orchestratorModelRef },
    { path: 'defaultSubagentModelRef', ref: policy.defaultSubagentModelRef },
    ...policy.quota.fallbackModelRefs.map((ref, index) => ({
      path: `quota.fallbackModelRefs[${index}]`,
      ref,
    })),
    ...policy.namedWorkers.map((worker, index) => ({
      path: `namedWorkers[${index}].modelRef`,
      ref: worker.modelRef,
    })),
  ].filter((assignment) => Boolean(assignment.ref))
}

export function isOpenRouterModelRef(modelRef: string): boolean {
  return /^openrouter(?:\/|$)/i.test(modelRef.trim())
}

export function assertNoOpenRouterAssignments(
  policy: OrchestrationPolicy,
): void {
  const denied = modelAssignments(policy).find((assignment) =>
    isOpenRouterModelRef(assignment.ref),
  )
  if (denied) {
    throw new Error(
      `OpenRouter is not permitted in orchestration assignment ${denied.path}`,
    )
  }
}

export function validateOrchestrationPolicyModelRefs(
  policy: OrchestrationPolicy,
  catalog?: SubscriptionCatalog,
): void {
  const assignments = modelAssignments(policy)
  if (assignments.length === 0) return
  assertNoOpenRouterAssignments(policy)
  if (!catalog) {
    throw new Error(
      'A canonical catalog is required to save orchestration model assignments',
    )
  }
  const routes = new Map(catalog.models.map((model) => [model.id, model]))
  for (const assignment of assignments) {
    const route = routes.get(assignment.ref)
    if (
      !route?.selectable ||
      (route.billingClass === 'api_billed' &&
        !policy.billing.allowApiBilledModels)
    ) {
      throw new Error(
        `${assignment.path} must reference an assignable model in the canonical catalog`,
      )
    }
  }
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>,
): T {
  const result = structuredClone(base) as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key]
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else if (value !== undefined) {
      result[key] = value
    }
  }
  return result as T
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileAtomicWithBackup(path, `${JSON.stringify(value, null, 2)}\n`)
}

function policyPath(): string {
  return join(getStateDir(), 'orchestration-policy.json')
}

function sessionsPath(): string {
  return join(getStateDir(), 'orchestration-sessions.json')
}

export function getOrchestrationPolicy(): OrchestrationPolicy {
  const saved = readJson(policyPath())
  const merged =
    saved && typeof saved === 'object' && !Array.isArray(saved)
      ? deepMerge(
          DEFAULT_ORCHESTRATION_POLICY,
          saved as Record<string, unknown>,
        )
      : DEFAULT_ORCHESTRATION_POLICY
  const parsed = PolicySchema.safeParse(merged)
  return parsed.success
    ? parsed.data
    : structuredClone(DEFAULT_ORCHESTRATION_POLICY)
}

export function saveOrchestrationPolicy(
  patch: OrchestrationPolicyPatch,
  options: OrchestrationPolicySaveOptions = {},
): OrchestrationPolicy {
  if (
    patch.billing?.allowApiBilledModels === true &&
    !options.confirmApiBilling
  ) {
    throw new Error('API-billed models require explicit confirmation')
  }
  const next = PolicySchema.parse(
    deepMerge(getOrchestrationPolicy(), patch as Record<string, unknown>),
  )
  validateOrchestrationPolicyModelRefs(next, options.catalog)
  writeJson(policyPath(), next)
  return next
}

export function restoreOrchestrationPolicySnapshot(
  policy: OrchestrationPolicy,
): void {
  writeJson(policyPath(), PolicySchema.parse(policy))
}

type SessionOverrides = Record<string, OrchestrationPolicyPatch>

function readSessionOverrides(): SessionOverrides {
  const saved = readJson(sessionsPath())
  return saved && typeof saved === 'object' && !Array.isArray(saved)
    ? (saved as SessionOverrides)
    : {}
}

export function saveSessionOrchestrationPolicy(
  sessionKey: string,
  patch: OrchestrationPolicyPatch,
  options: Pick<OrchestrationPolicySaveOptions, 'catalog'> = {},
): OrchestrationPolicy {
  const key = sessionKey.trim()
  if (!key) throw new Error('sessionKey is required')
  if (patch.billing?.allowApiBilledModels === true) {
    throw new Error(
      'API billing can only be enabled globally with explicit confirmation',
    )
  }
  const sessions = readSessionOverrides()
  sessions[key] = deepMerge(
    (sessions[key] ?? {}) as Record<string, unknown>,
    patch as Record<string, unknown>,
  ) as OrchestrationPolicyPatch
  const effective = PolicySchema.parse(
    deepMerge(
      getOrchestrationPolicy(),
      sessions[key] as Record<string, unknown>,
    ),
  )
  validateOrchestrationPolicyModelRefs(effective, options.catalog)
  writeJson(sessionsPath(), sessions)
  return effective
}

export function getSessionOrchestrationPolicy(
  sessionKey: string,
): OrchestrationPolicy {
  const sessions = readSessionOverrides()
  if (!Object.hasOwn(sessions, sessionKey)) return getOrchestrationPolicy()
  const patch = sessions[sessionKey]
  const parsed = PolicySchema.safeParse(
    deepMerge(getOrchestrationPolicy(), patch as Record<string, unknown>),
  )
  return parsed.success ? parsed.data : getOrchestrationPolicy()
}

export function clearSessionOrchestrationPolicy(sessionKey: string): void {
  const sessions = readSessionOverrides()
  delete sessions[sessionKey]
  writeJson(sessionsPath(), sessions)
}
