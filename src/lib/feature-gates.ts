import { getCapabilities } from '../server/gateway-capabilities'

export type EnhancedFeature = 'sessions' | 'skills' | 'memory' | 'config' | 'jobs'

const FEATURE_LABELS: Record<EnhancedFeature, string> = {
  sessions: 'Sessions',
  skills: 'Skills',
  memory: 'Memory',
  config: 'Configuration',
  jobs: 'Jobs',
}

function normalizeFeature(feature: EnhancedFeature | string): EnhancedFeature | null {
  const normalized = feature.trim().toLowerCase()
  if (
    normalized === 'sessions' ||
    normalized === 'skills' ||
    normalized === 'memory' ||
    normalized === 'config' ||
    normalized === 'jobs'
  ) {
    return normalized
  }

  return null
}

export function isFeatureAvailable(
  feature: EnhancedFeature,
): boolean {
  const caps = getCapabilities()
  return caps[feature] === true
}

export function getFeatureLabel(feature: EnhancedFeature | string): string {
  const normalized = normalizeFeature(feature)
  if (!normalized) return feature
  return FEATURE_LABELS[normalized]
}

export function getUnavailableReason(feature: EnhancedFeature | string): string {
  return `${getFeatureLabel(feature)} requires a Hermes gateway with enhanced API support.`
}

export function createCapabilityUnavailablePayload(
  feature: EnhancedFeature,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ok: false,
    code: 'capability_unavailable',
    capability: feature,
    source: 'portable',
    message: getUnavailableReason(feature),
    ...extra,
  }
}
