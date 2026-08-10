import { topLevelModelForRef } from './orchestration-hermes-sync'
import type {
  ReasoningEffort,
  SubscriptionCatalog,
} from './subscription-model-catalog'

export interface OperationsModelSelection {
  routeRef: string
  reasoningEffort?: string
  maxOutputTokens?: number
}

export function operationsModelSelectionPatch(
  selection: OperationsModelSelection,
  currentConfig: Record<string, unknown>,
  catalog: SubscriptionCatalog,
): Record<string, unknown> {
  const routeRef = selection.routeRef.trim()
  const route = catalog.models.find((entry) => entry.id === routeRef)
  if (!route || !route.selectable) {
    throw new Error(
      `${routeRef || 'Empty model'} is not an assignable subscription route`,
    )
  }

  const effort = selection.reasoningEffort?.trim() || 'provider_default'
  const supportedEfforts = route.capabilities?.reasoningEfforts ?? [
    'provider_default',
  ]
  if (!supportedEfforts.includes(effort as ReasoningEffort)) {
    throw new Error(`Unsupported reasoning effort for ${routeRef}: ${effort}`)
  }

  const maxOutputTokens = selection.maxOutputTokens
  if (maxOutputTokens !== undefined) {
    if (!route.capabilities?.supportsOutputTokenLimit) {
      throw new Error(
        `${routeRef} does not consume a configurable output-token cap`,
      )
    }
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
      throw new Error('Maximum output tokens must be a positive integer')
    }
    const modelMaximum = route.capabilities.maxOutputTokens
    if (modelMaximum === null) {
      throw new Error(`Maximum output tokens are not published for ${routeRef}`)
    }
    if (maxOutputTokens > modelMaximum) {
      throw new Error(
        `Maximum output tokens ${maxOutputTokens} exceeds the model maximum ${modelMaximum}`,
      )
    }
  }

  return {
    model: {
      ...topLevelModelForRef(routeRef, currentConfig),
      ...(maxOutputTokens === undefined ? {} : { max_tokens: maxOutputTokens }),
    },
    ...(effort === 'provider_default'
      ? {}
      : { agent: { reasoning_effort: effort } }),
    workspace: { route_ref: routeRef },
  }
}
