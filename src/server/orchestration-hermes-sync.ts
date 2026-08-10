import {
  readHermesConfigFiles,
  resolveHermesConfigPaths,
  writeHermesConfigFile,
} from './hermes-config-store'
import {
  assertNoOpenRouterAssignments,
  getOrchestrationPolicy,
  restoreOrchestrationPolicySnapshot,
  saveOrchestrationPolicy,
} from './orchestration-policy'
import { resolveAntigravityRelayBaseUrl } from './subscription-model-catalog'
import type {
  OrchestrationPolicy,
  OrchestrationPolicyPatch,
  OrchestrationPolicySaveOptions,
} from './orchestration-policy'

interface HermesModelConfig {
  provider?: unknown
  base_url?: unknown
  api_key?: unknown
  api_mode?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function normalizeLoopbackRelayBaseUrl(
  value: unknown,
  fallback: string,
): string {
  const candidate = String(value || '').replace(/\/$/, '')
  try {
    const url = new URL(candidate)
    const host = url.hostname.toLowerCase()
    if (
      url.protocol === 'http:' &&
      !url.username &&
      !url.password &&
      ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)
    ) {
      return candidate
    }
  } catch {
    // Fall back to the fixed loopback relay below.
  }
  return fallback.replace(/\/$/, '')
}

function routeForModelRef(
  modelRef: string,
  currentConfig: Record<string, unknown>,
): Record<string, unknown> {
  const ref = modelRef.trim()
  if (!ref) return { provider: '', model: '' }

  if (ref.startsWith('google-antigravity/')) {
    const configuredRelay = resolveAntigravityRelayBaseUrl(
      process.env.ANTIGRAVITY_RELAY_BASE_URL,
    )
    const relayBaseUrl = configuredRelay.endsWith('/v1')
      ? configuredRelay
      : `${configuredRelay}/v1`
    return {
      provider: 'custom',
      model: ref,
      base_url: relayBaseUrl,
      api_key: process.env.ANTIGRAVITY_RELAY_API_KEY || 'local-placeholder',
      api_mode: 'chat_completions',
    }
  }

  if (ref.startsWith('claude-')) {
    const modelConfig = asRecord(currentConfig.model) as HermesModelConfig
    const configuredRelay = normalizeLoopbackRelayBaseUrl(
      modelConfig.provider === 'custom' && modelConfig.base_url
        ? modelConfig.base_url
        : process.env.CLAUDE_RELAY_BASE_URL,
      'http://127.0.0.1:8650',
    )
    const relayBaseUrl = configuredRelay.endsWith('/v1')
      ? configuredRelay
      : `${configuredRelay}/v1`
    return {
      provider: 'custom',
      model: ref,
      base_url: relayBaseUrl,
      api_key:
        modelConfig.provider === 'custom' && modelConfig.api_key
          ? modelConfig.api_key
          : process.env.CLAUDE_RELAY_API_KEY || 'local-placeholder',
      api_mode: modelConfig.api_mode || 'chat_completions',
    }
  }

  const slash = ref.indexOf('/')
  if (slash < 1) return { model: ref }
  return {
    provider: ref.slice(0, slash),
    model: ref.slice(slash + 1),
  }
}

export function topLevelModelForRef(
  modelRef: string,
  currentConfig: Record<string, unknown>,
): Record<string, unknown> {
  const route = routeForModelRef(modelRef, currentConfig)
  const { model, ...transport } = route
  return { ...transport, default: model }
}

export function policyToHermesPatch(
  policy: OrchestrationPolicy,
  currentConfig: Record<string, unknown>,
): {
  model?: Record<string, unknown>
  delegation: Record<string, any>
  fallback_providers: Array<Record<string, unknown>>
  auxiliary: Record<string, unknown>
} {
  assertNoOpenRouterAssignments(policy)
  const defaultRoute = policy.defaultSubagentModelRef
    ? routeForModelRef(policy.defaultSubagentModelRef, currentConfig)
    : { provider: '', model: '' }
  const orchestratorRoute = policy.orchestratorModelRef
    ? topLevelModelForRef(policy.orchestratorModelRef, currentConfig)
    : undefined

  return {
    ...(orchestratorRoute ? { model: orchestratorRoute } : {}),
    delegation: {
      ...defaultRoute,
      max_concurrent_children: policy.limits.maxConcurrentChildren,
      max_concurrent_per_account: policy.limits.maxConcurrentPerAccount,
      max_spawn_depth: policy.limits.maxSpawnDepth,
      max_total_agents: policy.limits.maxTotalAgents,
      orchestrator_enabled: policy.limits.maxSpawnDepth > 1,
      context_mode: policy.context.preferred,
      context_overflow: policy.context.overflow,
      context_recent_messages: policy.context.recentMessages,
      context_max_chars: 200000,
      memory_access: policy.memory.childAccess,
      child_memory_write_review: policy.memory.childWriteReview,
      named_workers: policy.namedWorkers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        model_ref: worker.modelRef,
        role: worker.role,
        ...(worker.description ? { description: worker.description } : {}),
      })),
      quota_interactive: policy.quota.interactive,
      quota_unattended: policy.quota.unattended,
      fallback_model_refs: policy.quota.fallbackModelRefs,
      allow_api_billed_models: policy.billing.allowApiBilledModels,
    },
    fallback_providers: policy.quota.fallbackModelRefs
      .filter(Boolean)
      .map((ref) => routeForModelRef(ref, currentConfig)),
    auxiliary: {
      // Prevent auxiliary/title/compression lanes from silently engaging a
      // metered OpenRouter route while the subscription-only gate is closed.
      free_only: !policy.billing.allowApiBilledModels,
    },
  }
}

export function syncGlobalOrchestrationPolicy(
  policy: OrchestrationPolicy,
): void {
  const paths = resolveHermesConfigPaths()
  const files = readHermesConfigFiles(paths)
  const patch = policyToHermesPatch(policy, files.config)
  const next: Record<string, unknown> = {
    ...files.config,
    ...(patch.model ? { model: patch.model } : {}),
    delegation: {
      ...asRecord(files.config.delegation),
      ...patch.delegation,
    },
    fallback_providers: patch.fallback_providers,
    auxiliary: {
      ...asRecord(files.config.auxiliary),
      ...patch.auxiliary,
    },
  }
  delete next.fallback_model
  writeHermesConfigFile(paths, next)
}

let orchestrationWriteTail: Promise<void> = Promise.resolve()

export function serializeOrchestrationWrite<T>(
  operation: () => T | Promise<T>,
): Promise<T> {
  const result = orchestrationWriteTail.then(operation)
  orchestrationWriteTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export function applyGlobalOrchestrationPolicyTransaction(
  patch: OrchestrationPolicyPatch,
  options: OrchestrationPolicySaveOptions,
): Promise<OrchestrationPolicy> {
  return serializeOrchestrationWrite(() => {
    const previous = getOrchestrationPolicy()
    const policy = saveOrchestrationPolicy(patch, options)
    try {
      syncGlobalOrchestrationPolicy(policy)
      return policy
    } catch (error) {
      try {
        restoreOrchestrationPolicySnapshot(previous)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Failed to synchronize orchestration policy and rollback failed',
        )
      }
      throw new Error('Failed to synchronize orchestration policy', {
        cause: error,
      })
    }
  })
}
